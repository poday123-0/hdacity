import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { phone_number } = await req.json();

    if (!phone_number) {
      return new Response(JSON.stringify({ error: "phone_number required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Retry DB query for transient SSL errors
    let profiles: any[] | null = null;
    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("phone_number", phone_number);

      if (!error) {
        profiles = data;
        lastError = null;
        break;
      }
      lastError = error;
      console.error(`Profile lookup attempt ${attempt + 1} failed:`, error.message?.length > 200 ? "SSL/connection error" : error.message);
      if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }

    if (lastError) {
      return new Response(JSON.stringify({ error: "Database connection error. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ 
        found: false,
        profile: null,
        is_driver: false,
        is_rider: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userTypes = profiles.map((p: any) => p.user_type);
    const isDriver = userTypes.includes("Driver");
    const isRider = userTypes.includes("Rider");

    const primaryProfile = profiles.find((p: any) => p.user_type === "Rider") || profiles[0];

    return new Response(JSON.stringify({
      found: true,
      profile: {
        id: primaryProfile.id,
        first_name: primaryProfile.first_name,
        last_name: primaryProfile.last_name,
        email: primaryProfile.email,
        phone_number: primaryProfile.phone_number,
        gender: primaryProfile.gender,
        status: primaryProfile.status,
      },
      is_driver: isDriver,
      is_rider: isRider,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Lookup profile error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
