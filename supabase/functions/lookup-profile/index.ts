import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Get all profiles for this phone number (could be both Rider and Driver)
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("phone_number", phone_number);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
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

    // Check user types
    const userTypes = profiles.map((p: any) => p.user_type);
    const isDriver = userTypes.includes("Driver");
    const isRider = userTypes.includes("Rider");

    // Use the Rider profile as primary, fallback to first profile
    const primaryProfile = profiles.find((p: any) => p.user_type === "Rider") || profiles[0];

    return new Response(JSON.stringify({
      found: true,
      profile: {
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
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
