import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@6";

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

    const config = setting?.value
      ? (typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value)
      : { emails: [], phones: [] };
    const emails: string[] = config.emails || [];
    const phones: string[] = config.phones || [];

    const adminMessage = `Vehicle update from ${driver_name} (+960 ${phone_number}): ${update_type} for plate ${plate_number || "N/A"}. Please review in admin panel.`;

    // Send SMS to configured admin phones
    const MSGOWL_API_KEY = Deno.env.get("MSGOWL_API_KEY");
    if (MSGOWL_API_KEY && phones.length > 0) {
      for (const phone of phones) {
        try {
          const res = await fetch("https://api.msgowl.com/api/sms", {
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
      const subject = `🚕 Vehicle Update: ${update_type} — ${driver_name}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #40A3DB; color: white; padding: 16px 24px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0; font-size: 18px;">Vehicle / Driver Update</h2>
          </div>
          <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="margin: 0 0 12px; font-size: 15px; color: #111;">${adminMessage}</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Driver</td><td style="padding: 8px 0; font-weight: bold; font-size: 14px;">${driver_name}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Phone</td><td style="padding: 8px 0; font-weight: bold; font-size: 14px;">+960 ${phone_number}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Update</td><td style="padding: 8px 0; font-weight: bold; font-size: 14px;">${update_type}</td></tr>
              ${plate_number ? `<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Plate</td><td style="padding: 8px 0; font-weight: bold; font-size: 14px;">${plate_number}</td></tr>` : ""}
            </table>
            <p style="margin: 20px 0 0; font-size: 13px; color: #9ca3af;">Please review in the admin panel.</p>
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
      title: "Vehicle / Driver Update",
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
