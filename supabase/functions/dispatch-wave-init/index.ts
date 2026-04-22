// Wave-broadcast dispatch initializer
// Called when a trip is created in dispatch_mode=wave_broadcast.
// Picks the first wave (N nearest eligible online drivers) and creates the wave row.
// Drivers learn about it via realtime on trip_dispatch_waves.

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

    // Read current dispatch settings
    const mode = await getSetting<string>("dispatch_mode", "broadcast");
    if (mode !== "wave_broadcast") {
      return new Response(
        JSON.stringify({ skipped: true, reason: `dispatch_mode=${mode}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const waveSize = await getSetting<number>("wave_size", 5);
    const waveTimeout = await getSetting<number>("wave_timeout_seconds", 15);

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

    // Fetch the trip
    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("id, status, pickup_lat, pickup_lng, vehicle_type_id")
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

    // Find eligible online idle drivers.
    // A driver matches the trip's vehicle type if EITHER
    //   (a) their currently active vehicle (driver_locations.vehicle_type_id) matches, OR
    //   (b) they are approved for that vehicle type in driver_vehicle_types
    // This ensures multi-type center drivers (e.g. Car + Van) receive both kinds of requests.
    const { data: locs } = await supabase
      .from("driver_locations")
      .select("driver_id, lat, lng, vehicle_type_id")
      .eq("is_online", true)
      .eq("is_on_trip", false);
    let eligible = (locs || []) as any[];

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
      return new Response(JSON.stringify({ wave: 0, reason: "no_eligible_drivers" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sort by distance from pickup
    const pLat = Number(trip.pickup_lat || 0);
    const pLng = Number(trip.pickup_lng || 0);
    const ranked = eligible
      .map((d) => ({
        driver_id: d.driver_id,
        dist: haversineKm(pLat, pLng, Number(d.lat), Number(d.lng)),
      }))
      .sort((a, b) => a.dist - b.dist);

    // First wave = N nearest
    const first = ranked.slice(0, waveSize).map((d) => d.driver_id);

    // Insert wave 1
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
