// Wave-broadcast dispatch promoter
// Runs every 5s via pg_cron. Finds expired waves whose trips are still
// requested+unassigned, then creates the next wave (excluding all
// previously-attempted drivers). After max_waves, the final wave broadcasts
// to ALL nearby eligible drivers.

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
    const maxWaves = await getSetting<number>("max_waves", 2);

    // Find expired, un-promoted waves
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

      // If this was the final broadcast, no further action — trip will time out on its own
      if (wave.is_final_broadcast) {
        results.push({ trip_id: wave.trip_id, action: "final_already_sent" });
        continue;
      }

      // Check trip is still requested + unassigned
      const { data: trip } = await supabase
        .from("trips")
        .select("id, status, driver_id, pickup_lat, pickup_lng, vehicle_type_id")
        .eq("id", wave.trip_id)
        .single();
      if (!trip || trip.driver_id || (trip.status !== "requested" && trip.status !== "scheduled")) {
        results.push({ trip_id: wave.trip_id, action: "skipped_done" });
        continue;
      }

      // Collect every driver that has already been offered (across all prior waves)
      const { data: allWaves } = await supabase
        .from("trip_dispatch_waves")
        .select("driver_ids")
        .eq("trip_id", wave.trip_id);
      const tried = new Set<string>();
      (allWaves || []).forEach((w: any) => (w.driver_ids || []).forEach((d: string) => tried.add(d)));

      // Eligible = online + idle + matching vehicle type
      let q = supabase
        .from("driver_locations")
        .select("driver_id, lat, lng, vehicle_type_id")
        .eq("is_online", true)
        .eq("is_on_trip", false);
      if (trip.vehicle_type_id) q = q.eq("vehicle_type_id", trip.vehicle_type_id);
      const { data: locs } = await q;

      const remaining = (locs || []).filter((l: any) => !tried.has(l.driver_id));
      if (remaining.length === 0) {
        // Nobody left to try — final wave with the same set is pointless. Mark final and continue.
        await supabase
          .from("trip_dispatch_waves")
          .insert({
            trip_id: wave.trip_id,
            wave_number: wave.wave_number + 1,
            driver_ids: [],
            is_final_broadcast: true,
            expires_at: new Date(Date.now() + waveTimeout * 1000).toISOString(),
          });
        results.push({ trip_id: wave.trip_id, action: "no_more_drivers" });
        continue;
      }

      const pLat = Number(trip.pickup_lat || 0);
      const pLng = Number(trip.pickup_lng || 0);
      const ranked = remaining
        .map((d: any) => ({
          driver_id: d.driver_id,
          dist: haversineKm(pLat, pLng, Number(d.lat), Number(d.lng)),
        }))
        .sort((a, b) => a.dist - b.dist);

      const isFinal = wave.wave_number >= maxWaves;
      const next = isFinal ? ranked.map((d) => d.driver_id) : ranked.slice(0, waveSize).map((d) => d.driver_id);

      const expiresAt = new Date(Date.now() + waveTimeout * 1000).toISOString();
      const { error: insErr } = await supabase.from("trip_dispatch_waves").insert({
        trip_id: wave.trip_id,
        wave_number: wave.wave_number + 1,
        driver_ids: next,
        is_final_broadcast: isFinal,
        expires_at: expiresAt,
      });
      if (insErr) {
        results.push({ trip_id: wave.trip_id, error: insErr.message });
        continue;
      }
      results.push({
        trip_id: wave.trip_id,
        action: "promoted",
        wave: wave.wave_number + 1,
        drivers: next.length,
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
