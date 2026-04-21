import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const nowIso = new Date().toISOString();

    // Find scheduled notifications whose time has come
    const { data: due, error } = await supabase
      .from("notifications")
      .select("id, title, message, target_type, image_url, target_user_id")
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso)
      .limit(50);

    if (error) throw error;
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    for (const n of due) {
      try {
        // Resolve recipients via device_tokens
        let userIds: string[] = [];
        if (n.target_user_id) {
          userIds = [n.target_user_id];
        } else {
          let q = supabase.from("device_tokens").select("user_id").eq("is_active", true);
          if (n.target_type === "drivers") q = q.eq("user_type", "driver");
          else if (n.target_type === "passengers") q = q.eq("user_type", "passenger");
          const { data: tokens } = await q;
          userIds = [...new Set((tokens || []).map((t: any) => t.user_id))];
        }

        if (userIds.length > 0) {
          await supabase.functions.invoke("send-push-notification", {
            body: { user_ids: userIds, title: n.title, body: n.message, data: n.image_url ? { image_url: n.image_url } : undefined },
          });
        }

        await supabase
          .from("notifications")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", n.id);
        processed++;
      } catch (err) {
        console.error(`Failed to send scheduled notification ${n.id}:`, err);
        await supabase.from("notifications").update({ status: "failed" }).eq("id", n.id);
      }
    }

    return new Response(JSON.stringify({ processed, total: due.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-scheduled-notifications error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
