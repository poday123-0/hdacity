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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active competitions that haven't ended
    const now = new Date().toISOString();
    const { data: competitions, error: compError } = await supabase
      .from("competitions")
      .select("*")
      .eq("is_active", true)
      .eq("status", "active")
      .gte("end_date", now);

    if (compError) throw compError;
    if (!competitions || competitions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active competitions to refresh", refreshed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalRefreshed = 0;

    for (const comp of competitions) {
      // Count completed trips per driver in the competition date range
      const { data: trips } = await supabase
        .from("trips")
        .select("driver_id")
        .eq("status", "completed")
        .gte("completed_at", comp.start_date)
        .lte("completed_at", comp.end_date)
        .not("driver_id", "is", null);

      if (!trips) continue;

      // Count per driver
      const counts = new Map<string, number>();
      trips.forEach((t: any) => {
        counts.set(t.driver_id, (counts.get(t.driver_id) || 0) + 1);
      });

      // Sort and rank
      const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

      // Delete old entries for this competition
      await supabase.from("competition_entries").delete().eq("competition_id", comp.id);

      // Insert new ranked entries
      if (sorted.length > 0) {
        const inserts = sorted.map(([driver_id, trip_count], idx) => ({
          competition_id: comp.id,
          driver_id,
          trip_count,
          rank: idx + 1,
        }));

        // Insert in batches of 500 to avoid limits
        for (let i = 0; i < inserts.length; i += 500) {
          await supabase.from("competition_entries").insert(inserts.slice(i, i + 500));
        }
      }

      totalRefreshed++;
    }

    // Also auto-complete competitions that have ended
    const { data: ended } = await supabase
      .from("competitions")
      .update({ status: "completed" })
      .eq("status", "active")
      .eq("is_active", true)
      .lt("end_date", now)
      .select("id");

    return new Response(
      JSON.stringify({
        refreshed: totalRefreshed,
        auto_completed: ended?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
