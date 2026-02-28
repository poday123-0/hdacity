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

    const { driver_name, phone_number, country_code, plate_number, update_type, rejection_reason, notify_driver, message } = await req.json();

    // Get notification recipients from system settings
    const { data: setting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "driver_registration_notify")
      .single();

    const adminMessage = `Vehicle update from ${driver_name} (+960 ${phone_number}): ${update_type} for plate ${plate_number || "N/A"}. Please review in admin panel.`;

    // Send SMS to configured admin phones
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
              message: adminMessage,
            }),
          });
        } catch (e) {
          console.error("SMS send failed for", phone, e);
        }
      }
    }

    // Send SMS to the driver when vehicle is approved/rejected or profile status changed
    if (notify_driver && phone_number && MSGOWL_API_KEY) {
      let driverMessage = message || "";
      if (!driverMessage) {
        if (update_type === "approved") {
          driverMessage = `Hi ${driver_name}, your vehicle (${plate_number || "N/A"}) has been approved! You can now start accepting trips. - HDA Taxi`;
        } else if (update_type === "rejected") {
          driverMessage = `Hi ${driver_name}, your vehicle (${plate_number || "N/A"}) was not approved. Reason: ${rejection_reason || "Documents not acceptable"}. Please update your documents in the app. - HDA Taxi`;
        }
      }
      if (driverMessage) {
        try {
          const cc = country_code || "960";
          const driverPhone = phone_number.startsWith("+") ? phone_number : `+${cc}${phone_number}`;
          await fetch("https://api.msgowl.com/api/sms", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${MSGOWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ to: driverPhone, message: driverMessage }),
          });
          console.log("SMS sent to driver:", driverPhone);
        } catch (e) {
          console.error("Driver SMS failed:", e);
        }
      }
    }

    // Create admin notification
    await supabaseAdmin.from("notifications").insert({
      title: "Vehicle Document Updated",
      message: adminMessage,
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
