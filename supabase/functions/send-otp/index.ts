import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateCode(length = 6): string {
  const digits = "0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MSGOWL_API_KEY = Deno.env.get("MSGOWL_API_KEY");
    if (!MSGOWL_API_KEY) throw new Error("MSGOWL_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { phone_number } = await req.json();
    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: "phone_number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fullNumber = phone_number.startsWith("960") ? phone_number : `960${phone_number}`;
    const code = generateCode();

    // Store the OTP code in database
    const { error: dbError } = await supabase.from("otp_codes").insert({
      phone_number: fullNumber,
      code,
    });

    if (dbError) {
      console.error("DB insert error:", dbError);
      throw new Error("Failed to store OTP code");
    }

    // Send SMS via MSG Owl REST API
    const response = await fetch("https://rest.msgowl.com/messages", {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${MSGOWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipients: fullNumber,
        sender_id: "HDA",
        body: `Your HDA Taxi verification code is: ${code}`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("MSG Owl send error:", data);
      return new Response(
        JSON.stringify({ error: "Failed to send SMS", details: data }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send OTP error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
