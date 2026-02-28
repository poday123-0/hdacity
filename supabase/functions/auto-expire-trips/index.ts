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
      .is("booking_type", null) // Only expire "now" trips, not scheduled ones waiting for drivers
      .lt("requested_at", fiveMinAgo)
      .select("id");

    // Also expire requested trips with booking_type = 'now'
    const { data: expired2 } = await supabase
      .from("trips")
      .update({
        status: "cancelled",
        cancel_reason: "Auto-expired: no driver found",
        cancelled_at: new Date().toISOString(),
        target_driver_id: null,
      })
      .eq("status", "requested")
      .eq("booking_type", "now")
      .lt("requested_at", fiveMinAgo)
      .select("id");

    if (expireError) throw expireError;

    // 2. Cancel scheduled trips that no driver accepted and are past their scheduled time by 10 min
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: expiredScheduled } = await supabase
      .from("trips")
      .update({
        status: "cancelled",
        cancel_reason: "Auto-expired: no driver accepted scheduled ride",
        cancelled_at: new Date().toISOString(),
      })
      .eq("status", "scheduled")
      .lte("scheduled_at", tenMinAgo)
      .select("id");

    // 3. Lock drivers 10 minutes before scheduled accepted trips
    // Find accepted scheduled trips where scheduled_at is within next 10 minutes
    const now = new Date();
    const tenMinFromNow = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const nowISO = now.toISOString();

    const { data: upcomingTrips } = await supabase
      .from("trips")
      .select("id, driver_id, pickup_address, scheduled_at, vehicle_type_id")
      .eq("status", "accepted")
      .eq("booking_type", "scheduled")
      .not("driver_id", "is", null)
      .lte("scheduled_at", tenMinFromNow)
      .gte("scheduled_at", nowISO);

    let lockedDrivers = 0;
    if (upcomingTrips && upcomingTrips.length > 0) {
      for (const trip of upcomingTrips) {
        // Check if driver is currently on another trip
        const { data: driverLoc } = await supabase
          .from("driver_locations")
          .select("is_on_trip, is_online")
          .eq("driver_id", trip.driver_id)
          .single();

        if (driverLoc && !driverLoc.is_on_trip && driverLoc.is_online) {
          // Lock the driver — set is_on_trip = true
          await supabase.from("driver_locations").update({
            is_on_trip: true,
          }).eq("driver_id", trip.driver_id);

          // Change trip status to "requested" so the navigating UI picks up
          await supabase.from("trips").update({
            status: "requested",
            requested_at: nowISO,
          }).eq("id", trip.id);

          lockedDrivers++;

          // Notify the driver about the upcoming scheduled ride
          const fcmKey = Deno.env.get("FCM_SERVER_KEY");
          if (fcmKey) {
            const { data: tokens } = await supabase
              .from("device_tokens")
              .select("token")
              .eq("user_id", trip.driver_id)
              .eq("is_active", true);

            if (tokens) {
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
                        title: "⏰ Scheduled Ride Starting Soon!",
                        body: `Pickup in ~10 min: ${trip.pickup_address}`,
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

    // 4. Dispatch unaccepted scheduled trips whose time has arrived (no driver accepted yet)
    const { data: scheduledTrips, error: schedError } = await supabase
      .from("trips")
      .update({
        status: "requested",
        requested_at: nowISO,
      })
      .eq("status", "scheduled")
      .is("driver_id", null)
      .lte("scheduled_at", nowISO)
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
        expired: (expired?.length || 0) + (expired2?.length || 0),
        expired_scheduled: expiredScheduled?.length || 0,
        locked_drivers: lockedDrivers,
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
