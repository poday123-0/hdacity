import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { vehicles } = await req.json();
    if (!vehicles || !Array.isArray(vehicles)) {
      return new Response(JSON.stringify({ error: "vehicles array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get vehicle type mapping (Car as default)
    const { data: vtData } = await supabase.from("vehicle_types").select("id, name");
    const vtMap: Record<string, string> = {};
    vtData?.forEach((vt: any) => { vtMap[vt.name.toLowerCase()] = vt.id; });
    const carTypeId = vtMap["car"] || null;
    const vanTypeId = vtMap["van"] || null;

    let inserted = 0;
    let skipped = 0;
    const notFound: number[] = [];

    for (const v of vehicles) {
      // Look up driver by legacy_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("legacy_id", v.user_id)
        .single();

      if (!profile) {
        notFound.push(v.user_id);
        skipped++;
        continue;
      }

      // Determine vehicle type from vehicle_type string
      const vType = (v.vehicle_type || "").toLowerCase();
      let typeId = carTypeId;
      if (vType.includes("van")) typeId = vanTypeId || carTypeId;

      // Parse vehicle_name into make + model
      const nameParts = (v.vehicle_name || "").split(" ");
      const make = nameParts[0] || "";
      const model = nameParts.slice(1).join(" ") || "";

      // Check if vehicle already exists for this driver with same plate
      const { data: existing } = await supabase
        .from("vehicles")
        .select("id")
        .eq("driver_id", profile.id)
        .eq("plate_number", v.vehicle_number)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const { error } = await supabase.from("vehicles").insert({
        driver_id: profile.id,
        plate_number: v.vehicle_number || "",
        make,
        model,
        color: v.color || "",
        year: parseInt(v.year) || null,
        vehicle_type_id: typeId,
        is_active: v.is_active === 1 || v.is_active === true || v.status === "Active",
      });

      if (error) {
        console.error("Insert error:", error.message);
        skipped++;
      } else {
        inserted++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total: vehicles.length,
      inserted,
      skipped,
      drivers_not_found: notFound,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Import error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
