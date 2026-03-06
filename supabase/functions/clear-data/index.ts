import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { tables } = await req.json();
    if (!tables || !Array.isArray(tables) || tables.length === 0) {
      throw new Error("tables array is required");
    }

    const results: Record<string, string> = {};

    for (const table of tables) {
      switch (table) {
        case "trips": {
          // Delete dependent data first
          await supabase.from("trip_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          await supabase.from("trip_stops").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          await supabase.from("trip_declines").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          await supabase.from("lost_item_reports").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          // Update wallet_transactions to remove trip references
          await supabase.from("wallet_transactions").update({ trip_id: null }).not("trip_id", "is", null);
          const { error } = await supabase.from("trips").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          results.trips = error ? `Error: ${error.message}` : "Cleared";
          break;
        }
        case "wallets": {
          await supabase.from("wallet_transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          await supabase.from("wallet_withdrawals").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          const { error } = await supabase.from("wallets").update({ balance: 0 }).neq("id", "00000000-0000-0000-0000-000000000000");
          results.wallets = error ? `Error: ${error.message}` : "Reset to 0";
          break;
        }
        case "sos_alerts": {
          const { error } = await supabase.from("sos_alerts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          results.sos_alerts = error ? `Error: ${error.message}` : "Cleared";
          break;
        }
        case "notifications": {
          const { error } = await supabase.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          results.notifications = error ? `Error: ${error.message}` : "Cleared";
          break;
        }
        case "driver_payments": {
          const { error } = await supabase.from("driver_payments").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          results.driver_payments = error ? `Error: ${error.message}` : "Cleared";
          break;
        }
        default:
          results[table] = "Unknown table";
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
