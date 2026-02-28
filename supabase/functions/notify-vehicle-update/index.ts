import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { driver_name, phone_number, plate_number, update_type } = await req.json();

    // Get notification recipients from system settings
    const { data: setting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "driver_registration_notify")
      .single();

    const message = `Vehicle update from ${driver_name} (+960 ${phone_number}): ${update_type} for plate ${plate_number || "N/A"}. Please review in admin panel.`;

    // Send SMS to configured phones
    const MSGOWL_API_KEY = Deno.env.get("MSGOWL_API_KEY");
    if (MSGOWL_API_KEY && setting?.value) {
      const config = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
      const phones: string[] = config.phones || [];
      for (const phone of phones) {
        try {
          await fetch("https://api.msgowl.com/api/sms", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${MSGOWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: phone.startsWith("+") ? phone : `+960${phone}`,
              message,
            }),
          });
        } catch (e) {
          console.error("SMS send failed for", phone, e);
        }
      }
    }

    // Create admin notification
    await supabaseAdmin.from("notifications").insert({
      title: "Vehicle Document Updated",
      message,
      target_type: "admin",
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("notify-vehicle-update error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
