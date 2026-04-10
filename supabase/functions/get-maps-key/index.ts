import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Try to read from system_settings first (admin-managed)
  let key: string | null = null;
  let mapId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["google_maps_api_key", "google_maps_map_id"]);

    if (data) {
      for (const row of data) {
        if (row.key === "google_maps_api_key" && row.value) {
          const val = typeof row.value === "string" ? row.value : (row.value as any)?.key || null;
          if (val) key = val;
        }
        if (row.key === "google_maps_map_id" && row.value) {
          const val = typeof row.value === "string" ? row.value : (row.value as any)?.id || null;
          if (val) mapId = val;
        }
      }
    }
  } catch (e) {
    console.error("Error reading system_settings:", e);
  }

  // Fall back to environment variables
  if (!key) key = Deno.env.get("GOOGLE_MAPS_API_KEY") || null;
  if (!mapId) mapId = Deno.env.get("GOOGLE_MAPS_MAP_ID") || "";

  if (!key) {
    return new Response(JSON.stringify({ error: "Google Maps API key not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ key, mapId: mapId || "" }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
