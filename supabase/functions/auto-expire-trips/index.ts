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

    // 1. Cancel all requested trips older than 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: expired, error: expireError } = await supabase
      .from("trips")
      .update({
        status: "cancelled",
        cancel_reason: "Auto-expired: no driver found",
        cancelled_at: new Date().toISOString(),
        target_driver_id: null,
      })
      .eq("status", "requested")
      .lt("requested_at", fiveMinAgo)
      .select("id");

    if (expireError) throw expireError;

    // 2. Dispatch scheduled trips whose scheduled_at time has arrived
    const now = new Date().toISOString();

    const { data: scheduledTrips, error: schedError } = await supabase
      .from("trips")
      .update({
        status: "requested",
        requested_at: now,
      })
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .select("id, pickup_address, vehicle_type_id");

    if (schedError) throw schedError;

    // Send push notifications to online drivers for each dispatched scheduled trip
    if (scheduledTrips && scheduledTrips.length > 0) {
      const { data: onlineDrivers } = await supabase
        .from("driver_locations")
        .select("driver_id")
        .eq("is_online", true)
        .eq("is_on_trip", false);

      if (onlineDrivers && onlineDrivers.length > 0) {
        const driverIds = onlineDrivers.map((d: any) => d.driver_id);

        // Get device tokens for online drivers
        const { data: tokens } = await supabase
          .from("device_tokens")
          .select("token")
          .in("user_id", driverIds)
          .eq("is_active", true);

        if (tokens && tokens.length > 0) {
          const fcmKey = Deno.env.get("FCM_SERVER_KEY");
          if (fcmKey) {
            for (const trip of scheduledTrips) {
              for (const t of tokens) {
                try {
                  await fetch("https://fcm.googleapis.com/fcm/send", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `key=${fcmKey}`,
                    },
                    body: JSON.stringify({
                      to: t.token,
                      notification: {
                        title: "🚗 Scheduled Ride Ready!",
                        body: `Pickup: ${trip.pickup_address}`,
                      },
                      data: { trip_id: trip.id, type: "trip_request" },
                    }),
                  });
                } catch {}
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        expired: expired?.length || 0,
        dispatched_scheduled: scheduledTrips?.length || 0,
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
