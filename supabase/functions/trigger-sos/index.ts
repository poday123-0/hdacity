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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { user_id, user_type, user_name, user_phone, trip_id, lat, lng, emergency_contacts } = await req.json();

    if (!user_id || !user_type) {
      return new Response(JSON.stringify({ error: "user_id and user_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create SOS alert record
    const { data: alert, error: insertErr } = await supabaseAdmin
      .from("sos_alerts")
      .insert({
        user_id,
        user_type,
        user_name: user_name || "",
        user_phone: user_phone || "",
        trip_id: trip_id || null,
        lat: lat || null,
        lng: lng || null,
        status: "active",
      })
      .select()
      .single();

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const locationUrl = lat && lng
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : "Location unavailable";

    const smsBody = `🚨 SOS EMERGENCY from ${user_type === "driver" ? "Driver" : "Passenger"}: ${user_name || "Unknown"} (${user_phone || "N/A"}). Location: ${locationUrl}`;

    const smsRecipients: string[] = [];

    // Get admin SMS phone from system_settings
    const { data: adminSetting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "admin_sms_phone")
      .single();

    if (adminSetting?.value) {
      const adminPhone = String(adminSetting.value).replace(/\D/g, "");
      if (adminPhone.length >= 7) {
        smsRecipients.push(adminPhone.startsWith("960") ? adminPhone : `960${adminPhone}`);
      }
    }

    // For passengers, also send to their emergency contacts
    if (user_type === "passenger" && emergency_contacts && Array.isArray(emergency_contacts)) {
      for (const contact of emergency_contacts) {
        const phone = String(contact.phone_number || "").replace(/\D/g, "");
        if (phone.length >= 7) {
          smsRecipients.push(phone.startsWith("960") ? phone : `960${phone}`);
        }
      }
    }

    // Send SMS to all recipients
    const smsResults: any[] = [];
    if (MSGOWL_API_KEY && smsRecipients.length > 0) {
      for (const recipient of smsRecipients) {
        try {
          const res = await fetch("https://rest.msgowl.com/messages", {
            method: "POST",
            headers: {
              Authorization: `AccessKey ${MSGOWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              recipients: recipient,
              sender_id: "HDA SOS",
              body: smsBody,
            }),
          });
          const data = await res.json();
          smsResults.push({ recipient, success: res.ok, data });
        } catch (err: any) {
          smsResults.push({ recipient, success: false, error: err.message });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, alert, sms_results: smsResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
