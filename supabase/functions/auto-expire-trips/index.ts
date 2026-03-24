import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendSMS(phone: string, message: string) {
  const MSGOWL_API_KEY = Deno.env.get("MSGOWL_API_KEY");
  if (!MSGOWL_API_KEY || !phone) return;
  try {
    const cleanPhone = phone.replace(/\+/g, "");
    await fetch("https://rest.msgowl.com/messages", {
      method: "POST",
      headers: {
        Authorization: `AccessKey ${MSGOWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipients: cleanPhone, body: message }),
    });
    console.log(`SMS sent to ${cleanPhone}`);
  } catch (err) {
    console.error("SMS send error:", err);
  }
}

async function sendPushToDrivers(supabase: any, driverIds: string[], title: string, body: string, data: Record<string, string>) {
  const fcmKey = Deno.env.get("FCM_SERVER_KEY");
  if (!fcmKey || driverIds.length === 0) return;

  const { data: tokens } = await supabase
    .from("device_tokens")
    .select("token")
    .in("user_id", driverIds)
    .eq("is_active", true);

  if (!tokens || tokens.length === 0) return;

  for (const t of tokens) {
    try {
      await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `key=${fcmKey}` },
        body: JSON.stringify({ to: t.token, notification: { title, body }, data }),
      });
    } catch {}
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = new Date();
    const nowISO = now.toISOString();

    // ========== 1. Cancel "now" requested trips older than 5 minutes ==========
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    const { data: expired } = await supabase
      .from("trips")
      .update({ status: "cancelled", cancel_reason: "Auto-expired: no driver found", cancelled_at: nowISO, target_driver_id: null })
      .eq("status", "requested")
      .is("booking_type", null)
      .lt("requested_at", fiveMinAgo)
      .select("id");

    const { data: expired2 } = await supabase
      .from("trips")
      .update({ status: "cancelled", cancel_reason: "Auto-expired: no driver found", cancelled_at: nowISO, target_driver_id: null })
      .eq("status", "requested")
      .eq("booking_type", "now")
      .lt("requested_at", fiveMinAgo)
      .select("id");

    // ========== 2. Cancel scheduled trips with no driver 15 min before pickup ==========
    const fifteenMinFromNow = new Date(now.getTime() + 15 * 60 * 1000).toISOString();

    const { data: expiredScheduled } = await supabase
      .from("trips")
      .update({ status: "cancelled", cancel_reason: "Auto-expired: no driver accepted scheduled ride", cancelled_at: nowISO })
      .eq("status", "scheduled")
      .is("driver_id", null)
      .lte("scheduled_at", fifteenMinFromNow)
      .select("id, passenger_id, customer_phone, pickup_address, dropoff_address, scheduled_at");

    // Send SMS to passengers of cancelled scheduled trips
    if (expiredScheduled && expiredScheduled.length > 0) {
      for (const trip of expiredScheduled) {
        let phone = trip.customer_phone;
        if (!phone && trip.passenger_id) {
          const { data: prof } = await supabase.from("profiles").select("phone_number, country_code").eq("id", trip.passenger_id).single();
          if (prof) phone = `${prof.country_code}${prof.phone_number}`;
        }
        if (phone) {
          const scheduledTime = trip.scheduled_at
            ? new Date(trip.scheduled_at).toLocaleString("en-US", { timeZone: "Indian/Maldives", dateStyle: "medium", timeStyle: "short" })
            : "your scheduled time";
          await sendSMS(phone, `Sorry, no drivers are available for your scheduled ride (${trip.pickup_address} → ${trip.dropoff_address} at ${scheduledTime}). The request has been cancelled. - HDA Taxi`);
        }
      }
    }

    // ========== 3. Re-dispatch unaccepted scheduled trips every 15 minutes ==========
    // Find scheduled trips that haven't been dispatched in the last 15 minutes
    // and whose scheduled_at is still more than 15 minutes away
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

    const { data: tripsToPing } = await supabase
      .from("trips")
      .select("id, pickup_address, vehicle_type_id, scheduled_at")
      .eq("status", "scheduled")
      .is("driver_id", null)
      .gt("scheduled_at", fifteenMinFromNow) // still more than 15 min away
      .lte("updated_at", fifteenMinAgo); // not pinged in last 15 min

    let pingedCount = 0;
    if (tripsToPing && tripsToPing.length > 0) {
      // Get online available drivers
      const { data: onlineDrivers } = await supabase
        .from("driver_locations")
        .select("driver_id")
        .eq("is_online", true)
        .eq("is_on_trip", false);

      if (onlineDrivers && onlineDrivers.length > 0) {
        const driverIds = onlineDrivers.map((d: any) => d.driver_id);

        for (const trip of tripsToPing) {
          // Touch updated_at to mark as pinged
          await supabase.from("trips").update({ updated_at: nowISO }).eq("id", trip.id);

          const scheduledTime = trip.scheduled_at
            ? new Date(trip.scheduled_at).toLocaleString("en-US", { timeZone: "Indian/Maldives", dateStyle: "medium", timeStyle: "short" })
            : "";

          await sendPushToDrivers(supabase, driverIds,
            "🚗 Scheduled Ride Available!",
            `Pickup: ${trip.pickup_address} at ${scheduledTime}`,
            { trip_id: trip.id, type: "trip_request" }
          );
          pingedCount++;
        }
      }
    }

    // ========== 4. Lock drivers 10 min before accepted scheduled trips ==========
    const tenMinFromNow = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

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
        const { data: driverLoc } = await supabase
          .from("driver_locations")
          .select("is_on_trip, is_online")
          .eq("driver_id", trip.driver_id)
          .single();

        if (driverLoc && !driverLoc.is_on_trip && driverLoc.is_online) {
          await supabase.from("driver_locations").update({ is_on_trip: true }).eq("driver_id", trip.driver_id);
          await supabase.from("trips").update({ status: "requested", requested_at: nowISO }).eq("id", trip.id);
          lockedDrivers++;

          await sendPushToDrivers(supabase, [trip.driver_id],
            "⏰ Scheduled Ride Starting Soon!",
            `Pickup in ~10 min: ${trip.pickup_address}`,
            { trip_id: trip.id, type: "trip_request" }
          );
        }
      }
    }

    // ========== 5. Auto-complete assigned trips after 30 minutes ==========
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    const { data: autoCompleted } = await supabase
      .from("trips")
      .update({ status: "completed", completed_at: nowISO })
      .in("status", ["accepted", "started"])
      .eq("dispatch_type", "operator")
      .lt("created_at", oneHourAgo)
      .select("id, driver_id");

    // Free up drivers from auto-completed trips
    if (autoCompleted && autoCompleted.length > 0) {
      const driverIdsToFree = autoCompleted.map((t: any) => t.driver_id).filter(Boolean);
      if (driverIdsToFree.length > 0) {
        await supabase
          .from("driver_locations")
          .update({ is_on_trip: false })
          .in("driver_id", driverIdsToFree);
      }
    }

    return new Response(
      JSON.stringify({
        expired: (expired?.length || 0) + (expired2?.length || 0),
        expired_scheduled: expiredScheduled?.length || 0,
        pinged_scheduled: pingedCount,
        locked_drivers: lockedDrivers,
        auto_completed: autoCompleted?.length || 0,
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
