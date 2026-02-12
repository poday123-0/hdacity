import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MSGOWL_API_KEY = Deno.env.get("MSGOWL_API_KEY");
    if (!MSGOWL_API_KEY) {
      throw new Error("MSGOWL_API_KEY is not configured");
    }

    const { phone_number, code } = await req.json();
    if (!phone_number || !code) {
      return new Response(
        JSON.stringify({ error: "phone_number and code are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fullNumber = phone_number.startsWith("960") ? phone_number : `960${phone_number}`;

    const response = await fetch("https://otp.msgowl.com/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MSGOWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_number: fullNumber,
        code,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("MSG Owl verify error:", data);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid OTP code", details: data }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Verify OTP error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
