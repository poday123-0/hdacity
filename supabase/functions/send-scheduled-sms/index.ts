import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone, driver_name, pickup, dropoff, scheduled_at } = await req.json();

    if (!phone) {
      return new Response(JSON.stringify({ error: "No phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const MSGOWL_API_KEY = Deno.env.get("MSGOWL_API_KEY");
    if (!MSGOWL_API_KEY) {
      return new Response(JSON.stringify({ error: "SMS not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scheduledTime = scheduled_at
      ? new Date(scheduled_at).toLocaleString("en-US", { timeZone: "Indian/Maldives", dateStyle: "medium", timeStyle: "short" })
      : "your scheduled time";

    const message = `Your scheduled ride has been accepted by ${driver_name}! Pickup: ${pickup} → ${dropoff} at ${scheduledTime}. - HDA Taxi`;

    const res = await fetch("https://rest.msgowl.com/messages", {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${MSGOWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipients: phone,
        body: message,
      }),
    });

    const result = await res.text();
    console.log(`SMS sent to ${phone}: ${res.status} - ${result}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error sending scheduled SMS:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
