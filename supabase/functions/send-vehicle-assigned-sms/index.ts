import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_TEXT = `HDA TAXI,

Our vehicle is on the way to pick you up,

{plate} . {color} {type}

Install Hda App to view the realtime trip status.

Install- https://hda.taxi`;

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

    const { phone, vehicle_id } = await req.json();
    if (!phone) {
      return new Response(JSON.stringify({ error: "phone is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check enabled flag
    const { data: enabledSetting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "vehicle_assigned_sms_enabled")
      .maybeSingle();

    const enabledRaw = enabledSetting?.value;
    const enabled = enabledRaw === true || enabledRaw === "true";
    if (!enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: "disabled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Vehicle details
    let plate = "";
    let color = "";
    let type = "";
    if (vehicle_id) {
      const { data: veh } = await supabaseAdmin
        .from("vehicles")
        .select("plate_number, color, vehicle_type_id")
        .eq("id", vehicle_id)
        .maybeSingle();
      if (veh) {
        plate = veh.plate_number || "";
        color = veh.color || "";
        if (veh.vehicle_type_id) {
          const { data: vt } = await supabaseAdmin
            .from("vehicle_types")
            .select("name")
            .eq("id", veh.vehicle_type_id)
            .maybeSingle();
          type = vt?.name || "";
        }
      }
    }

    // Template
    let template = DEFAULT_TEXT;
    const { data: textSetting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "vehicle_assigned_sms_text")
      .maybeSingle();
    if (textSetting?.value) {
      const val = typeof textSetting.value === "string" ? textSetting.value : String(textSetting.value);
      if (val.trim()) template = val;
    }

    const smsBody = template
      .replace(/\{plate\}/g, plate)
      .replace(/\{color\}/g, color)
      .replace(/\{type\}/g, type);

    const cleanPhone = phone.replace(/\D/g, "");
    const recipient = cleanPhone.startsWith("960") ? cleanPhone : `960${cleanPhone}`;

    const smsRes = await fetch("https://rest.msgowl.com/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `AccessKey ${MSGOWL_API_KEY}`,
      },
      body: JSON.stringify({
        recipients: recipient,
        sender_id: "HDA TAXI",
        body: smsBody,
      }),
    });

    const smsData = await smsRes.json();

    if (!smsRes.ok) {
      console.error("MsgOwl error:", smsData);
      return new Response(JSON.stringify({ error: "Failed to send SMS", details: smsData }), {
        status: smsRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, sms: smsData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Vehicle-assigned SMS error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
