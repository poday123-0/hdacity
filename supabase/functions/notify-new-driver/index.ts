import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@3";

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
          const res = await fetch("https://rest.msgowl.com/messages", {
            method: "POST",
            headers: {
              Authorization: `AccessKey ${MSGOWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              recipients: phone.startsWith("+") ? phone.replace("+", "") : `960${phone}`,
              sender_id: "HDA TAXI",
              body: message,
            }),
          });
          console.log(`SMS to ${phone}: status=${res.status}`);
        } catch (e) {
          console.error("SMS send failed for", phone, e);
        }
      }
    }

    // Send email via Resend to each email recipient
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY && emails.length > 0) {
      const resend = new Resend(RESEND_API_KEY);
      const subject = `🚕 New Driver Registration: ${driver_name}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #40A3DB; color: white; padding: 16px 24px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0; font-size: 18px;">New Driver Registration</h2>
          </div>
          <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="margin: 0 0 12px; font-size: 15px; color: #111;">A new driver has registered and needs review:</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Name</td><td style="padding: 8px 0; font-weight: bold; font-size: 14px;">${driver_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Phone</td><td style="padding: 8px 0; font-weight: bold; font-size: 14px;">+960 ${phone_number}</td></tr>
              ${company_name ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Company</td><td style="padding: 8px 0; font-weight: bold; font-size: 14px;">${company_name}</td></tr>` : ""}
            </table>
            <p style="margin: 20px 0 0; font-size: 13px; color: #9ca3af;">Please review this registration in the admin panel.</p>
          </div>
        </div>
      `;

      for (const email of emails) {
        try {
          const { error } = await resend.emails.send({
            from: "HDA Taxi <onboarding@resend.dev>",
            to: email,
            subject,
            html,
          });
          if (error) console.error(`Email to ${email} failed:`, error);
          else console.log(`Email sent to ${email}`);
        } catch (e) {
          console.error("Email send failed for", email, e);
        }
      }
    }

    // Create admin notification
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
