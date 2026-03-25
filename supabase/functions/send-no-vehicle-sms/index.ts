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

    const { phone } = await req.json();
    if (!phone) {
      return new Response(JSON.stringify({ error: "phone is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = phone.replace(/\D/g, "");
    const recipient = cleanPhone.startsWith("960") ? cleanPhone : `960${cleanPhone}`;

    // Fetch customizable SMS text from admin settings
    let smsBody = "HDA: No drivers available right now. Book directly & find available drivers at https://hda.taxi";
    const { data: setting } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "no_vehicle_sms_text")
      .single();

    if (setting?.value) {
      const val = typeof setting.value === "string" ? setting.value : String(setting.value);
      if (val.trim()) smsBody = val.trim();
    }

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
    console.error("No-vehicle SMS error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
