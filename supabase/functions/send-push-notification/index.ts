import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY");
    if (!FCM_SERVER_KEY) {
      throw new Error("FCM_SERVER_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { user_ids, title, body, data, topic } = await req.json();

    // If topic is provided, send to topic (e.g., "all_drivers", "all_admins")
    if (topic) {
      const response = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          Authorization: `key=${FCM_SERVER_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: `/topics/${topic}`,
          notification: { title, body, sound: "default" },
          data: data || {},
          priority: "high",
        }),
      });

      const result = await response.json();
      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Otherwise send to specific user_ids
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      throw new Error("user_ids array is required");
    }

    // Fetch device tokens for the users
    const { data: tokens, error: tokenError } = await supabase
      .from("device_tokens")
      .select("token, user_id")
      .in("user_id", user_ids)
      .eq("is_active", true);

    if (tokenError) throw tokenError;
    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No active tokens found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fcmTokens = tokens.map((t: any) => t.token);

    // Send to multiple tokens using FCM
    const batchSize = 1000; // FCM limit per request
    let totalSent = 0;
    const failedTokens: string[] = [];

    for (let i = 0; i < fcmTokens.length; i += batchSize) {
      const batch = fcmTokens.slice(i, i + batchSize);

      const response = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          Authorization: `key=${FCM_SERVER_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registration_ids: batch,
          notification: {
            title,
            body,
            sound: "default",
            click_action: "FLUTTER_NOTIFICATION_CLICK",
          },
          data: data || {},
          priority: "high",
        }),
      });

      const result = await response.json();
      totalSent += result.success || 0;

      // Track failed tokens for cleanup
      if (result.results) {
        result.results.forEach((r: any, idx: number) => {
          if (r.error === "NotRegistered" || r.error === "InvalidRegistration") {
            failedTokens.push(batch[idx]);
          }
        });
      }
    }

    // Deactivate invalid tokens
    if (failedTokens.length > 0) {
      await supabase
        .from("device_tokens")
        .update({ is_active: false })
        .in("token", failedTokens);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: totalSent,
        failed: failedTokens.length,
        total_tokens: fcmTokens.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Push notification error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
