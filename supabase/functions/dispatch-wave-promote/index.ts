// Wave-broadcast dispatch promoter
// Runs every 5s via pg_cron. Finds expired waves whose trips are still
// requested+unassigned, then creates the next wave.
//
// Wave progression (per user requirement):
//   Wave 1 = nearest drivers from default company (HDA Taxi) — done by dispatch-wave-init
//   Wave 2 = nearest drivers from all OTHER companies, excluding wave-1 drivers
//   Wave 3 = ALL remaining eligible drivers (final broadcast)
//
// All waves filter by each driver's personal trip_radius_km. Pushes are sent
// from this function so out-of-wave drivers never get a notification ping.

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
  return data.value as T;
};

const pushTripRequested = async (driverIds: string[], trip: any) => {
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
    console.warn("[wave-promote] push send failed:", (e as any)?.message || e);
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const mode = await getSetting<string>("dispatch_mode", "broadcast");
    if (mode !== "wave_broadcast") {
      return new Response(JSON.stringify({ skipped: true, mode }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const waveSize = await getSetting<number>("wave_size", 5);
    const waveTimeout = await getSetting<number>("wave_timeout_seconds", 15);
    // Final broadcast happens at wave 3 (wave 1 = HDA, wave 2 = others, wave 3 = all)
    const finalWaveNumber = 3;
    const defaultRadius = Number(await getSetting<any>("default_trip_radius_km", 10));
    const defaultCompanyId = await getSetting<string>("default_company_id", "");

    const nowIso = new Date().toISOString();
    const { data: expired, error: expErr } = await supabase
      .from("trip_dispatch_waves")
      .select("id, trip_id, wave_number, driver_ids, is_final_broadcast")
      .lte("expires_at", nowIso)
      .is("promoted_at", null)
      .order("created_at", { ascending: true })
      .limit(50);

    if (expErr) {
      return new Response(JSON.stringify({ error: expErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const wave of expired || []) {
      // Mark this wave promoted no matter what so we don't re-process it
      await supabase
        .from("trip_dispatch_waves")
        .update({ promoted_at: nowIso })
        .eq("id", wave.id);

      if (wave.is_final_broadcast) {
        results.push({ trip_id: wave.trip_id, action: "final_already_sent" });
        continue;
      }

      const { data: trip } = await supabase
        .from("trips")
        .select("id, status, driver_id, pickup_lat, pickup_lng, pickup_address, vehicle_type_id")
        .eq("id", wave.trip_id)
        .single();
      if (!trip || trip.driver_id || (trip.status !== "requested" && trip.status !== "scheduled")) {
        results.push({ trip_id: wave.trip_id, action: "skipped_done" });
        continue;
      }

      // Drivers already offered across all prior waves
      const { data: allWaves } = await supabase
        .from("trip_dispatch_waves")
        .select("driver_ids")
        .eq("trip_id", wave.trip_id);
      const tried = new Set<string>();
      (allWaves || []).forEach((w: any) => (w.driver_ids || []).forEach((d: string) => tried.add(d)));

      // Eligible online + idle + vehicle-type matched drivers
      const { data: locs } = await supabase
        .from("driver_locations")
        .select("driver_id, lat, lng, vehicle_type_id")
        .eq("is_online", true)
        .eq("is_on_trip", false);

      let typeMatched = (locs || []) as any[];
      if (trip.vehicle_type_id && typeMatched.length > 0) {
        const driverIds = typeMatched.map((d: any) => d.driver_id);
        const { data: approved } = await supabase
          .from("driver_vehicle_types")
          .select("driver_id")
          .eq("vehicle_type_id", trip.vehicle_type_id)
          .eq("status", "approved")
          .in("driver_id", driverIds);
        const approvedSet = new Set((approved || []).map((r: any) => r.driver_id));
        typeMatched = typeMatched.filter(
          (d: any) => d.vehicle_type_id === trip.vehicle_type_id || approvedSet.has(d.driver_id)
        );
      }

      // Profiles → company + personal radius
      const allIds = typeMatched.map((d: any) => d.driver_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, company_id, trip_radius_km")
        .in("id", allIds);
      const radiusByDriver = new Map<string, number>();
      const companyByDriver = new Map<string, string | null>();
      (profiles || []).forEach((p: any) => {
        const r = p.trip_radius_km;
        radiusByDriver.set(p.id, r == null ? defaultRadius : Number(r));
        companyByDriver.set(p.id, p.company_id || null);
      });

      const pLat = Number(trip.pickup_lat || 0);
      const pLng = Number(trip.pickup_lng || 0);

      // Apply personal radius and skip already-tried drivers
      const inRadiusUntried = typeMatched
        .filter((d: any) => !tried.has(d.driver_id))
        .map((d: any) => ({
          driver_id: d.driver_id,
          dist: haversineKm(pLat, pLng, Number(d.lat), Number(d.lng)),
          company_id: companyByDriver.get(d.driver_id) || null,
        }))
        .filter((d) => {
          const r = radiusByDriver.get(d.driver_id) ?? defaultRadius;
          return d.dist <= r;
        })
        .sort((a, b) => a.dist - b.dist);

      const nextWaveNumber = wave.wave_number + 1;
      let nextIds: string[] = [];

      if (nextWaveNumber === 2) {
        // Wave 2 = nearest from all OTHER companies (not the default HDA)
        const others = inRadiusUntried.filter(
          (d) => !defaultCompanyId || d.company_id !== defaultCompanyId
        );
        nextIds = others.slice(0, waveSize).map((d) => d.driver_id);
      } else {
        // Wave 3+ = all remaining (final broadcast)
        nextIds = inRadiusUntried.map((d) => d.driver_id);
      }

      const isFinal = nextWaveNumber >= finalWaveNumber;
      const expiresAt = new Date(Date.now() + waveTimeout * 1000).toISOString();
      const { error: insErr } = await supabase.from("trip_dispatch_waves").insert({
        trip_id: wave.trip_id,
        wave_number: nextWaveNumber,
        driver_ids: nextIds,
        is_final_broadcast: isFinal,
        expires_at: expiresAt,
      });
      if (insErr) {
        results.push({ trip_id: wave.trip_id, error: insErr.message });
        continue;
      }

      // Send push only to this wave's drivers
      await pushTripRequested(nextIds, trip);

      results.push({
        trip_id: wave.trip_id,
        action: "promoted",
        wave: nextWaveNumber,
        drivers: nextIds.length,
        is_final: isFinal,
      });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
