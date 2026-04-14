import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();
    const { data: competitions, error: compError } = await supabase
      .from("competitions")
      .select("*")
      .eq("is_active", true)
      .eq("status", "active")
      .gte("end_date", now);

    if (compError) throw compError;
    if (!competitions || competitions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active competitions to refresh", refreshed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pre-fetch service locations with polygons for area filtering
    const { data: serviceLocations } = await supabase
      .from("service_locations")
      .select("id, polygon")
      .eq("is_active", true);

    const locationPolygons = new Map<string, any[]>();
    if (serviceLocations) {
      for (const sl of serviceLocations) {
        if (sl.polygon && Array.isArray(sl.polygon)) {
          locationPolygons.set(sl.id, sl.polygon as any[]);
        }
      }
    }

    // Fetch excluded center phone numbers and get their profile IDs
    const EXCLUDED_PHONES = ["7320207"];
    const { data: excludedProfiles } = await supabase
      .from("profiles")
      .select("id")
      .in("phone_number", EXCLUDED_PHONES);
    const excludedIds = new Set((excludedProfiles || []).map((p: any) => p.id));

    let totalRefreshed = 0;

    for (const comp of competitions) {
      // Build trip query filtered by competition start_date and end_date
      let tripQuery = supabase
        .from("trips")
        .select("driver_id, pickup_lat, pickup_lng, dispatch_type")
        .eq("status", "completed")
        .gte("completed_at", comp.start_date)
        .lte("completed_at", comp.end_date)
        .not("driver_id", "is", null);

      // If competition has a vehicle_type_id filter, apply it
      if (comp.vehicle_type_id) {
        tripQuery = tripQuery.eq("vehicle_type_id", comp.vehicle_type_id);
      }

      // Filter by trip source
      const tripSource = comp.trip_source || "all";
      if (tripSource === "passenger_only") {
        tripQuery = tripQuery.eq("dispatch_type", "passenger");
      } else if (tripSource === "send_to_app") {
        tripQuery = tripQuery.eq("dispatch_type", "dispatch_broadcast");
      } else if (tripSource === "assign_only") {
        tripQuery = tripQuery.eq("dispatch_type", "operator");
      } else if (tripSource === "app_trips") {
        tripQuery = tripQuery.in("dispatch_type", ["passenger", "dispatch_broadcast"]);
      } else if (tripSource === "dispatch_all") {
        tripQuery = tripQuery.in("dispatch_type", ["operator", "dispatch_broadcast"]);
      }

      const { data: trips } = await tripQuery;
      if (!trips) continue;

      // If competition has a service_location_id, filter trips by polygon
      let filteredTrips = trips;
      if (comp.service_location_id) {
        const polygon = locationPolygons.get(comp.service_location_id);
        if (polygon && polygon.length >= 3) {
          filteredTrips = trips.filter((t: any) => {
            if (t.pickup_lat == null || t.pickup_lng == null) return false;
            return pointInPolygon(Number(t.pickup_lat), Number(t.pickup_lng), polygon);
          });
        }
      }

      // Count per driver (excluding center numbers)
      const counts = new Map<string, number>();
      filteredTrips.forEach((t: any) => {
        if (excludedIds.has(t.driver_id)) return;
        counts.set(t.driver_id, (counts.get(t.driver_id) || 0) + 1);
      });

      // Sort and rank
      const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

      // Delete old entries for this competition
      await supabase.from("competition_entries").delete().eq("competition_id", comp.id);

      // Insert new ranked entries
      if (sorted.length > 0) {
        const inserts = sorted.map(([driver_id, trip_count], idx) => ({
          competition_id: comp.id,
          driver_id,
          trip_count,
          rank: idx + 1,
        }));

        for (let i = 0; i < inserts.length; i += 500) {
          await supabase.from("competition_entries").insert(inserts.slice(i, i + 500));
        }
      }

      totalRefreshed++;
    }

    // Auto-complete competitions that have ended
    const { data: ended } = await supabase
      .from("competitions")
      .update({ status: "completed" })
      .eq("status", "active")
      .eq("is_active", true)
      .lt("end_date", now)
      .select("id");

    return new Response(
      JSON.stringify({ refreshed: totalRefreshed, auto_completed: ended?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/** Ray-casting point-in-polygon test */
function pointInPolygon(lat: number, lng: number, polygon: any[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat ?? polygon[i][0];
    const yi = polygon[i].lng ?? polygon[i][1];
    const xj = polygon[j].lat ?? polygon[j][0];
    const yj = polygon[j].lng ?? polygon[j][1];

    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
