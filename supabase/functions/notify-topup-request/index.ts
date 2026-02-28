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

    const { passenger_name, phone_number, amount } = await req.json();

    const message = `💰 Wallet Top-Up Request: ${passenger_name} (+960 ${phone_number}) has requested a top-up of ${amount} MVR. Please review in admin panel.`;

    // Get notification recipients from system settings
    const { data: setting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "topup_notify")
      .single();

    let emails: string[] = [];
    let phones: string[] = [];

    if (setting?.value) {
      const config = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
      emails = config.emails || [];
      phones = config.phones || [];
    }

    // Fallback: try driver_registration_notify setting if no topup-specific one
    if (emails.length === 0 && phones.length === 0) {
      const { data: fallback } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", "driver_registration_notify")
        .single();
      if (fallback?.value) {
        const config = typeof fallback.value === "string" ? JSON.parse(fallback.value) : fallback.value;
        emails = config.emails || [];
        phones = config.phones || [];
      }
    }

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
              message,
            }),
          });
        } catch (e) {
          console.error("SMS send failed for", phone, e);
        }
      }
    }

    // Create admin notification (in-app)
    await supabaseAdmin.from("notifications").insert({
      title: "💰 Wallet Top-Up Request",
      message: `${passenger_name} requested ${amount} MVR top-up. Review in Wallets → Top-ups.${emails.length > 0 ? `\n\nNotify emails: ${emails.join(", ")}` : ""}`,
      target_type: "admin",
    });

    // Send push notifications to admin device tokens
    const { data: adminTokens } = await supabaseAdmin
      .from("device_tokens")
      .select("user_id")
      .eq("user_type", "admin")
      .eq("is_active", true);

    if (adminTokens && adminTokens.length > 0) {
      const adminIds = [...new Set(adminTokens.map(t => t.user_id))];
      try {
        await supabaseAdmin.functions.invoke("send-push-notification", {
          body: {
            user_ids: adminIds,
            title: "💰 Wallet Top-Up Request",
            body: `${passenger_name} requested ${amount} MVR top-up`,
            data: { type: "topup_request" },
          },
        });
      } catch (e) {
        console.error("Push notification failed:", e);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("notify-topup-request error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
