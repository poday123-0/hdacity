import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MSGOWL_API_KEY = Deno.env.get("MSGOWL_API_KEY");
    if (!MSGOWL_API_KEY) throw new Error("MSGOWL_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { trip_id } = await req.json();
    if (!trip_id) {
      return new Response(JSON.stringify({ error: "trip_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch trip details
    const { data: trip, error: tripErr } = await supabaseAdmin
      .from("trips")
      .select("id, customer_phone, pickup_address, dropoff_address, driver_id, vehicle_id, estimated_fare, dispatch_type")
      .eq("id", trip_id)
      .single();

    if (tripErr || !trip) {
      return new Response(JSON.stringify({ error: "Trip not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only send for dispatch_broadcast trips with a customer phone
    if (!trip.customer_phone || trip.dispatch_type !== "dispatch_broadcast") {
      return new Response(JSON.stringify({ skipped: true, reason: "No customer phone or not broadcast" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch driver info
    let driverName = "Your driver";
    if (trip.driver_id) {
      const { data: driver } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", trip.driver_id)
        .single();
      if (driver) driverName = `${driver.first_name} ${driver.last_name}`.trim();
    }

    // Fetch vehicle info
    let vehicleInfo = "";
    let vehicleId = trip.vehicle_id;
    if (!vehicleId && trip.driver_id) {
      const { data: loc } = await supabaseAdmin
        .from("driver_locations")
        .select("vehicle_id")
        .eq("driver_id", trip.driver_id)
        .single();
      vehicleId = loc?.vehicle_id;
    }
    if (vehicleId) {
      const { data: vehicle } = await supabaseAdmin
        .from("vehicles")
        .select("plate_number, make, model, color")
        .eq("id", vehicleId)
        .single();
      if (vehicle) {
        vehicleInfo = `${vehicle.color || ""} ${vehicle.make || ""} ${vehicle.model || ""} (${vehicle.plate_number})`.trim();
      }
    }

    // Fetch app name from system settings
    let appName = "HDA";
    const { data: appNameSetting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "app_name")
      .single();
    if (appNameSetting?.value) {
      appName = typeof appNameSetting.value === "string" ? appNameSetting.value : String(appNameSetting.value);
    }

    // Fetch published URL from system settings or use default
    let baseUrl = "https://hdacity.lovable.app";
    const { data: urlSetting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "app_base_url")
      .single();
    if (urlSetting?.value) {
      baseUrl = typeof urlSetting.value === "string" ? urlSetting.value : String(urlSetting.value);
    }

    const trackingUrl = `${baseUrl}/track/${trip.id}`;

    // Build SMS message
    const fareText = trip.estimated_fare ? ` Fare: ~${trip.estimated_fare} MVR.` : "";
    const smsBody = `${appName}: Your ride is confirmed! Driver: ${driverName}. Vehicle: ${vehicleInfo}.${fareText} Track: ${trackingUrl}`;

    // Send SMS via MsgOwl
    const phone = trip.customer_phone.replace(/\D/g, "");
    const recipient = phone.startsWith("960") ? phone : `960${phone}`;

    const smsRes = await fetch("https://rest.msgowl.com/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `AccessKey ${MSGOWL_API_KEY}`,
      },
      body: JSON.stringify({
        recipients: [recipient],
        body: smsBody,
      }),
    });

    const smsData = await smsRes.json();

    return new Response(JSON.stringify({ success: true, sms: smsData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("SMS tracking error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
