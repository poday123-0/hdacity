import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { service_location_id } = await req.json();
    if (!service_location_id) {
      return new Response(JSON.stringify({ error: "Missing service_location_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!googleKey) {
      return new Response(JSON.stringify({ error: "Google Maps API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the service location
    const { data: loc, error: locErr } = await supabase
      .from("service_locations")
      .select("id, name, lat, lng, polygon")
      .eq("id", service_location_id)
      .single();

    if (locErr || !loc) {
      return new Response(JSON.stringify({ error: "Service location not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const centerLat = Number(loc.lat);
    const centerLng = Number(loc.lng);
    const polygon = loc.polygon as { lat: number; lng: number }[] | null;

    // Calculate radius from polygon bounds, default 2km
    let radiusMeters = 2000;
    if (polygon && polygon.length >= 3) {
      let maxDist = 0;
      for (const p of polygon) {
        const d = haversineMeters(centerLat, centerLng, p.lat, p.lng);
        if (d > maxDist) maxDist = d;
      }
      radiusMeters = Math.min(Math.ceil(maxDist * 1.2), 50000);
    }

    // Fetch places using Google Nearby Search with multiple page tokens
    const allPlaces: any[] = [];
    let nextPageToken: string | null = null;
    let pageCount = 0;
    const maxPages = 5; // up to ~100 results

    do {
      const url = nextPageToken
        ? `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${nextPageToken}&key=${googleKey}`
        : `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${centerLat},${centerLng}&radius=${radiusMeters}&key=${googleKey}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.results) {
        allPlaces.push(...data.results);
      }

      nextPageToken = data.next_page_token || null;
      pageCount++;

      // Google requires a short delay before using next_page_token
      if (nextPageToken && pageCount < maxPages) {
        await new Promise(r => setTimeout(r, 2000));
      }
    } while (nextPageToken && pageCount < maxPages);

    // Also do text search for common categories to get more coverage
    const categories = ["restaurant", "hotel", "shop", "school", "hospital", "mosque", "pharmacy", "bank", "cafe", "supermarket"];
    for (const cat of categories) {
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${cat}&location=${centerLat},${centerLng}&radius=${radiusMeters}&key=${googleKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.results) {
        allPlaces.push(...data.results);
      }
    }

    // Deduplicate by place_id
    const seen = new Set<string>();
    const uniquePlaces: any[] = [];
    for (const p of allPlaces) {
      if (p.place_id && !seen.has(p.place_id)) {
        seen.add(p.place_id);
        uniquePlaces.push(p);
      }
    }

    // Filter places within polygon if available
    const filteredPlaces = polygon && polygon.length >= 3
      ? uniquePlaces.filter(p => {
          const lat = p.geometry?.location?.lat;
          const lng = p.geometry?.location?.lng;
          return lat != null && lng != null && pointInPolygon(lat, lng, polygon);
        })
      : uniquePlaces;

    // Get existing named locations to avoid duplicates (match by proximity)
    const { data: existing } = await supabase
      .from("named_locations")
      .select("id, lat, lng, name")
      .eq("is_active", true);

    const existingLocs = existing || [];

    // Prepare inserts — skip if too close to an existing named location
    const toInsert: any[] = [];
    for (const place of filteredPlaces) {
      const pLat = place.geometry?.location?.lat;
      const pLng = place.geometry?.location?.lng;
      if (!pLat || !pLng || !place.name) continue;

      // Skip if within 20m of existing named location with same name
      const isDup = existingLocs.some(ex =>
        ex.name?.toLowerCase() === place.name.toLowerCase() &&
        haversineMeters(Number(ex.lat), Number(ex.lng), pLat, pLng) < 20
      );
      if (isDup) continue;

      toInsert.push({
        name: place.name,
        address: place.formatted_address || place.vicinity || "",
        lat: pLat,
        lng: pLng,
        status: "approved",
        is_active: true,
        suggested_by_type: "google_sync",
        description: (place.types || []).slice(0, 3).join(", "),
      });
    }

    // Batch insert
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 500) {
      const batch = toInsert.slice(i, i + 500);
      const { error: insErr } = await supabase.from("named_locations").insert(batch);
      if (!insErr) inserted += batch.length;
    }

    return new Response(JSON.stringify({
      total_found: uniquePlaces.length,
      in_area: filteredPlaces.length,
      duplicates_skipped: filteredPlaces.length - toInsert.length,
      inserted,
      service_area: loc.name,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("fetch-area-places error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
