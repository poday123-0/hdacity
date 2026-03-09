import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Clear all is_loss flags on dispatch trips
    const { count, error } = await supabase
      .from("trips")
      .update({ is_loss: false })
      .eq("is_loss", true)
      .eq("dispatch_type", "operator")
      .select("id", { count: "exact", head: true });

    if (error) throw error;

    console.log(`Cleared loss flag on ${count || 0} trips`);

    return new Response(JSON.stringify({ success: true, cleared: count || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error clearing loss data:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
