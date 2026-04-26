import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Deactivate the profile
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({ status: "Deleted", first_name: "Deleted", last_name: "User", email: null })
      .eq("id", user_id);

    if (profileErr) throw profileErr;

    // Deactivate emergency contacts
    await supabaseAdmin
      .from("emergency_contacts")
      .update({ is_active: false })
      .eq("user_id", user_id);

    // Deactivate device tokens
    await supabaseAdmin
      .from("device_tokens")
      .update({ is_active: false })
      .eq("user_id", user_id);

    // Deactivate driver location if exists
    await supabaseAdmin
      .from("driver_locations")
      .update({ is_online: false })
      .eq("driver_id", user_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
