// Wave-broadcast dispatch initializer
// Called when a trip is created in dispatch_mode=wave_broadcast.
// Wave 1 = nearest drivers from the DEFAULT COMPANY only (e.g. HDA Taxi),
// filtered by each driver's personal trip_radius_km, capped at wave_size.
// Subsequent waves are handled by dispatch-wave-promote.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const getSetting = async <T,>(key: string, fallback: T): Promise<T> => {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (!data?.value && data?.value !== 0) return fallback;
  const v = data.value as any;
  return (typeof v === "string" ? JSON.parse(JSON.stringify(v)) : v) as T;
};

/**
 * Returns the subset of driver IDs whose pickup distance is within their
 * personal trip_radius_km. Drivers without a saved radius use defaultRadius.
 */
const filterByRadius = (
  drivers: { driver_id: string; lat: number; lng: number }[],
  pickupLat: number,
  pickupLng: number,
  radiusByDriver: Map<string, number>,
  defaultRadius: number
): { driver_id: string; dist: number }[] => {
  return drivers
    .map((d) => ({
      driver_id: d.driver_id,
      dist: haversineKm(pickupLat, pickupLng, Number(d.lat), Number(d.lng)),
    }))
    .filter((d) => {
      const r = radiusByDriver.get(d.driver_id) ?? defaultRadius;
      return d.dist <= r;
    })
    .sort((a, b) => a.dist - b.dist);
};

/** Send "trip requested" FCM push to a list of driver IDs */
const pushTripRequested = async (
  driverIds: string[],
  trip: any
) => {
  if (driverIds.length === 0) return;
  try {
    await supabase.functions.invoke("send-push-notification", {
      body: {
        userIds: driverIds,
        title: "🚖 New Trip Request",
        body: trip.pickup_address || "New ride request",
        data: {
          type: "trip_requested",
          trip_id: trip.id,
          vehicle_type_id: trip.vehicle_type_id || "",
          pickup_lat: String(trip.pickup_lat || ""),
          pickup_lng: String(trip.pickup_lng || ""),
        },
      },
    });
  } catch (e) {
    console.warn("[wave-init] push send failed:", (e as any)?.message || e);
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { trip_id } = await req.json();
    if (!trip_id) {
      return new Response(JSON.stringify({ error: "trip_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mode = await getSetting<string>("dispatch_mode", "broadcast");
    if (mode !== "wave_broadcast") {
      return new Response(
        JSON.stringify({ skipped: true, reason: `dispatch_mode=${mode}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const waveSize = await getSetting<number>("wave_size", 5);
    const waveTimeout = await getSetting<number>("wave_timeout_seconds", 15);
    const defaultRadius = Number(await getSetting<any>("default_trip_radius_km", 10));
    const defaultCompanyId = await getSetting<string>("default_company_id", "");

    // Idempotency: skip if wave 1 already exists
    const { data: existing } = await supabase
      .from("trip_dispatch_waves")
      .select("id")
      .eq("trip_id", trip_id)
      .eq("wave_number", 1)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ skipped: true, reason: "wave_1_exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("id, status, pickup_lat, pickup_lng, pickup_address, vehicle_type_id")
      .eq("id", trip_id)
      .single();
    if (tripErr || !trip) {
      return new Response(JSON.stringify({ error: "trip not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (trip.status !== "requested" && trip.status !== "scheduled") {
      return new Response(
        JSON.stringify({ skipped: true, reason: `status=${trip.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pull online idle drivers
    const { data: locs } = await supabase
      .from("driver_locations")
      .select("driver_id, lat, lng, vehicle_type_id")
      .eq("is_online", true)
      .eq("is_on_trip", false);
    let eligible = (locs || []) as any[];

    // Vehicle-type filter (active OR approved via driver_vehicle_types)
    if (trip.vehicle_type_id && eligible.length > 0) {
      const driverIds = eligible.map((d) => d.driver_id);
      const { data: approved } = await supabase
        .from("driver_vehicle_types")
        .select("driver_id")
        .eq("vehicle_type_id", trip.vehicle_type_id)
        .eq("status", "approved")
        .in("driver_id", driverIds);
      const approvedSet = new Set((approved || []).map((r: any) => r.driver_id));
      eligible = eligible.filter(
        (d) => d.vehicle_type_id === trip.vehicle_type_id || approvedSet.has(d.driver_id)
      );
    }

    if (eligible.length === 0) {
      // Insert empty wave 1 so the promoter can advance to wave 2 quickly
      const expiresAt = new Date(Date.now() + waveTimeout * 1000).toISOString();
      await supabase.from("trip_dispatch_waves").insert({
        trip_id, wave_number: 1, driver_ids: [], is_final_broadcast: false, expires_at: expiresAt,
      });
      return new Response(JSON.stringify({ wave: 1, drivers: [], reason: "no_eligible_drivers" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load profiles to get company_id + personal trip_radius_km
    const driverIds = eligible.map((d) => d.driver_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, company_id, trip_radius_km")
      .in("id", driverIds);

    const radiusByDriver = new Map<string, number>();
    const companyByDriver = new Map<string, string | null>();
    (profiles || []).forEach((p: any) => {
      const r = p.trip_radius_km;
      radiusByDriver.set(p.id, r == null ? defaultRadius : Number(r));
      companyByDriver.set(p.id, p.company_id || null);
    });

    // Wave 1: only drivers whose company = default company (HDA Taxi)
    const hdaPool = eligible.filter(
      (d) => defaultCompanyId && companyByDriver.get(d.driver_id) === defaultCompanyId
    );

    const pLat = Number(trip.pickup_lat || 0);
    const pLng = Number(trip.pickup_lng || 0);
    const ranked = filterByRadius(hdaPool as any, pLat, pLng, radiusByDriver, defaultRadius);
    const first = ranked.slice(0, waveSize).map((d) => d.driver_id);

    const expiresAt = new Date(Date.now() + waveTimeout * 1000).toISOString();
    const { error: waveErr } = await supabase.from("trip_dispatch_waves").insert({
      trip_id,
      wave_number: 1,
      driver_ids: first,
      is_final_broadcast: false,
      expires_at: expiresAt,
    });
    if (waveErr) {
      return new Response(JSON.stringify({ error: waveErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send push only to wave-1 drivers
    await pushTripRequested(first, trip);

    return new Response(
      JSON.stringify({ ok: true, wave: 1, drivers: first, expires_at: expiresAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
