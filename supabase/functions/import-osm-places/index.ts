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
    const { service_location_id, import_all } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get service locations
    let serviceLocations: any[] = [];
    if (import_all) {
      const { data } = await supabase.from("service_locations").select("*").eq("is_active", true);
      serviceLocations = data || [];
    } else if (service_location_id) {
      const { data } = await supabase.from("service_locations").select("*").eq("id", service_location_id).single();
      if (!data) {
        return new Response(JSON.stringify({ error: "Service location not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      serviceLocations = [data];
    } else {
      return new Response(JSON.stringify({ error: "Provide service_location_id or import_all=true" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing named locations
    const { data: existing } = await supabase.from("named_locations").select("name, lat, lng");
    const existingKeys = new Set(
      (existing || []).map((e: any) => `${e.name.toLowerCase()}_${Number(e.lat).toFixed(4)}_${Number(e.lng).toFixed(4)}`)
    );

    let totalImported = 0;
    let totalFound = 0;
    let totalSkipped = 0;
    const areaResults: any[] = [];

    for (const loc of serviceLocations) {
      const centerLat = Number(loc.lat);
      const centerLng = Number(loc.lng);
      const polygon = loc.polygon as { lat: number; lng: number }[] | null;

      // Calculate bbox
      let south: number, west: number, north: number, east: number;
      if (polygon && Array.isArray(polygon) && polygon.length >= 3) {
        const lats = polygon.map((p: any) => p.lat || p[0]);
        const lngs = polygon.map((p: any) => p.lng || p[1]);
        south = Math.min(...lats) - 0.001;
        north = Math.max(...lats) + 0.001;
        west = Math.min(...lngs) - 0.001;
        east = Math.max(...lngs) + 0.001;
      } else {
        const radiusDeg = 0.027; // ~3km
        south = centerLat - radiusDeg;
        north = centerLat + radiusDeg;
        west = centerLng - radiusDeg;
        east = centerLng + radiusDeg;
      }

      console.log(`Fetching OSM data for ${loc.name}: bbox ${south},${west},${north},${east}`);

      // Query Overpass API - comprehensive query for all named features
      const overpassQuery = `
[out:json][timeout:60];
(
  node["name"](${south},${west},${north},${east});
  way["name"](${south},${west},${north},${east});
  node["addr:housename"](${south},${west},${north},${east});
  way["addr:housename"](${south},${west},${north},${east});
  relation["name"]["building"](${south},${west},${north},${east});
);
out center;
`;

      const overpassRes = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: `data=${encodeURIComponent(overpassQuery)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      if (!overpassRes.ok) {
        console.error(`Overpass error for ${loc.name}:`, await overpassRes.text());
        areaResults.push({ area: loc.name, error: "Overpass API error" });
        continue;
      }

      const osmData = await overpassRes.json();
      const elements = osmData.elements || [];
      console.log(`${loc.name}: ${elements.length} raw OSM elements`);

      // Parse elements
      const seenNames = new Set<string>();
      const places: any[] = [];

      for (const el of elements) {
        const tags = el.tags || {};
        const name = tags.name || tags["addr:housename"] || tags["name:en"] || "";
        if (!name || name.length < 2) continue;

        // Skip roads/highways - we only want buildings/places
        if (tags.highway && !tags.building && !tags.amenity && !tags.shop) continue;

        let lat = el.lat;
        let lng = el.lon;
        if (!lat && el.center) { lat = el.center.lat; lng = el.center.lon; }
        if (!lat || !lng) continue;

        // Filter by polygon if available
        if (polygon && polygon.length >= 3 && !pointInPolygon(lat, lng, polygon)) continue;

        const key = `${name.toLowerCase()}_${lat.toFixed(4)}_${lng.toFixed(4)}`;
        if (seenNames.has(key)) continue;
        seenNames.add(key);

        // Skip if already in DB
        if (existingKeys.has(key)) { totalSkipped++; continue; }
        existingKeys.add(key); // prevent cross-area duplicates

        // Determine group
        let group = "";
        if (tags.building === "apartments" || tags.building === "residential" || /flat|apartment/i.test(name)) {
          group = "Residential";
        } else if (tags.amenity === "restaurant" || tags.amenity === "cafe" || tags.amenity === "fast_food") {
          group = "Food & Dining";
        } else if (tags.shop) {
          group = "Shopping";
        } else if (tags.amenity === "school" || tags.amenity === "university" || tags.amenity === "college") {
          group = "Education";
        } else if (tags.amenity === "hospital" || tags.amenity === "clinic" || tags.amenity === "pharmacy" || tags.healthcare) {
          group = "Healthcare";
        } else if (tags.tourism) {
          group = "Tourism";
        } else if (tags.office) {
          group = "Office";
        } else if (tags.amenity === "place_of_worship") {
          group = "Religious";
        } else if (tags.leisure) {
          group = "Leisure";
        } else if (tags.building) {
          group = "Building";
        } else {
          group = "Other";
        }

        places.push({
          name,
          lat,
          lng,
          address: [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ") || "",
          description: [tags.amenity, tags.shop, tags.tourism, tags.office, tags.leisure, tags.healthcare].filter(Boolean).join(", "),
          group_name: group,
          road_name: tags["addr:street"] || "",
          status: "approved",
          is_active: true,
          suggested_by_type: "osm_import",
        });
      }

      totalFound += places.length + totalSkipped;

      // Batch insert
      let areaImported = 0;
      for (let i = 0; i < places.length; i += 50) {
        const batch = places.slice(i, i + 50);
        const { error } = await supabase.from("named_locations").insert(batch);
        if (error) console.error("Insert error:", error);
        else areaImported += batch.length;
      }

      totalImported += areaImported;
      areaResults.push({ area: loc.name, found: places.length, imported: areaImported });

      // Small delay between areas to be nice to Overpass API
      if (serviceLocations.length > 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_found: totalFound,
      total_imported: totalImported,
      total_skipped: totalSkipped,
      areas: areaResults,
      message: `Imported ${totalImported} places from OpenStreetMap (${totalSkipped} duplicates skipped)`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("OSM import error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function pointInPolygon(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
