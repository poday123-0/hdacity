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

    const { driver_name, phone_number, company_name } = await req.json();

    // Get notification recipients from system settings
    const { data: setting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "driver_registration_notify")
      .single();

    if (!setting?.value) {
      return new Response(JSON.stringify({ success: true, message: "No notification recipients configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
    const emails: string[] = config.emails || [];
    const phones: string[] = config.phones || [];

    const message = `New driver registration: ${driver_name} (+960 ${phone_number})${company_name ? ` - Company: ${company_name}` : ""}. Please review in admin panel.`;

    // Send SMS to each phone number
    const MSGOWL_API_KEY = Deno.env.get("MSGOWL_API_KEY");
    if (MSGOWL_API_KEY && phones.length > 0) {
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
              message: message,
            }),
          });
        } catch (e) {
          console.error("SMS send failed for", phone, e);
        }
      }
    }

    // For email notifications, create a notification record that admins can see
    // (Full email sending would require an email service integration)
    if (emails.length > 0) {
      await supabaseAdmin.from("notifications").insert({
        title: "New Driver Registration",
        message: `${message}\n\nNotify emails: ${emails.join(", ")}`,
        target_type: "admin",
      });
    }

    // Always create an admin notification
    await supabaseAdmin.from("notifications").insert({
      title: "New Driver Registration",
      message,
      target_type: "admin",
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("notify-new-driver error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
