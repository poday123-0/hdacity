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

    const cleaned = String(phone_number).trim().replace(/[^\d]/g, "");
    const fullNumber = cleaned.startsWith("960") ? cleaned : `960${cleaned}`;

    // Demo/test credential bypass for app store review — skip SMS
    if (fullNumber === "9607000000") {
      return new Response(
        JSON.stringify({ success: true, message: "Demo mode: use code 123456" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin/dispatcher bypass OTP — skip SMS if a fixed code is set for this number
    const localNumber = fullNumber.startsWith("960") ? fullNumber.slice(3) : fullNumber;
    const { data: bypassProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone_number", localNumber);
    if (bypassProfiles && bypassProfiles.length > 0) {
      const ids = bypassProfiles.map((p: any) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("bypass_otp, role")
        .in("user_id", ids)
        .in("role", ["admin", "dispatcher"]);
      const hasBypass = (roles || []).some((r: any) => r.bypass_otp && String(r.bypass_otp).length > 0);
      if (hasBypass) {
        return new Response(
          JSON.stringify({ success: true, bypass: true, message: "Use your assigned admin code" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const code = generateCode();

    // Store the OTP code in database (with retry for transient SSL errors)
    let dbError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from("otp_codes").insert({
        phone_number: fullNumber,
        code,
      });
      if (!error) { dbError = null; break; }
      dbError = error;
      console.error(`DB insert attempt ${attempt + 1} failed:`, typeof error.message === "string" && error.message.length > 200 ? "SSL/connection error" : error.message);
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }

    if (dbError) {
      throw new Error("Failed to store OTP code. Please try again.");
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
        sender_id: "HDA TAXI",
        body: `Your HDA Taxi verification code is: ${code}\n\n@app.hda.taxi #${code}`,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("MSG Owl send error:", response.status, data);

      // Handle insufficient balance (402) with a clear, user-actionable message
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "SMS service balance is exhausted. Please top up the SMS account to send verification codes.",
            code: "SMS_BALANCE_EXHAUSTED",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to send SMS", details: data }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
