import { supabase } from "@/integrations/supabase/client";

/**
 * Register a device token for push notifications.
 * Call this after the user logs in / app loads.
 */
export const registerDeviceToken = async (
  userId: string,
  token: string,
  userType: "driver" | "passenger" | "admin" | "dispatcher",
  deviceType: "web" | "android" | "ios" = "web"
) => {
  const now = new Date().toISOString();

  // Allow the same device token to be active for multiple accounts of
  // DIFFERENT user types (e.g. a passenger and a driver sharing one phone).
  // Only deactivate rows where the SAME user_type re-registered on a
  // different account — that is the true "device handoff" case.
  await supabase
    .from("device_tokens")
    .update({ is_active: false, updated_at: now })
    .eq("token", token)
    .eq("user_type", userType)
    .neq("user_id", userId);

  const { error } = await supabase
    .from("device_tokens")
    .upsert(
      {
        user_id: userId,
        token,
        user_type: userType,
        device_type: deviceType,
        is_active: true,
        updated_at: now,
      },
      { onConflict: "user_id,token" }
    );

  if (error) console.error("Failed to register device token:", error);
  return !error;
};

/**
 * Remove a device token (e.g., on logout).
 */
export const removeDeviceToken = async (userId: string, token: string) => {
  await supabase
    .from("device_tokens")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("token", token);
};

/**
 * Send push notification to specific users via the edge function.
 * The edge function resolves the correct sound per recipient user type.
 */
export const sendPushNotification = async (
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>
) => {
  try {
    const { error } = await supabase.functions.invoke("send-push-notification", {
      body: { user_ids: userIds, title, body, data },
    });
    if (error) console.error("Push notification error:", error);
  } catch (err) {
    console.error("Failed to send push notification:", err);
  }
};

/**
 * Send push to a topic (e.g., "all_drivers", "all_admins").
 */
export const sendTopicNotification = async (
  topic: string,
  title: string,
  body: string,
  data?: Record<string, string>
) => {
  try {
    const { error } = await supabase.functions.invoke("send-push-notification", {
      body: { topic, title, body, data },
    });
    if (error) console.error("Topic push error:", error);
  } catch (err) {
    console.error("Failed to send topic notification:", err);
  }
};

/**
 * Trip event notification helpers.
 * Each passes a `type` field used by the edge function to resolve
 * the correct sound category per recipient (driver vs passenger).
 */

/** Notify driver(s) of a new ride request.
 *  `pickupAddress` is kept in the data payload (legacy) but the visible
 *  notification body now shows the fare amount instead. */
export const notifyTripRequested = async (
  driverIds: string[],
  tripId: string,
  pickupAddress: string,
  vehicleTypeId?: string,
  estimatedFare?: number | null,
) => {
  const fareNum = typeof estimatedFare === "number" && !isNaN(estimatedFare) ? estimatedFare : null;
  const body = fareNum != null && fareNum > 0
    ? `Fare: ${Math.round(fareNum)} MVR`
    : "Tap to view";
  await sendPushNotification(
    driverIds,
    "New Ride Request",
    body,
    {
      trip_id: tripId,
      type: "trip_requested",
      ...(vehicleTypeId ? { vehicle_type_id: vehicleTypeId } : {}),
      ...(fareNum != null ? { estimated_fare: String(fareNum) } : {}),
    }
  );
};

/** Notify a single driver that a dispatcher has DIRECTLY assigned a trip to them.
 *  Uses a different type than `trip_requested` so the receiver shows it as
 *  "Dispatch Trip Assigned" — not as a regular "New Ride Request" popup. */
export const notifyTripAssigned = async (driverId: string, tripId: string, pickupAddress: string) => {
  await sendPushNotification(
    [driverId],
    "📋 Dispatch Trip Assigned",
    `Pickup: ${pickupAddress}`,
    { trip_id: tripId, type: "trip_assigned" }
  );
};

/** Notify passenger that a driver accepted */
export const notifyTripAccepted = async (passengerId: string, driverName: string, tripId: string) => {
  await sendPushNotification(
    [passengerId],
    "✅ Driver Accepted!",
    `${driverName} is on the way to pick you up`,
    { trip_id: tripId, type: "trip_accepted" }
  );
};

/** Notify passenger that driver has arrived at pickup */
export const notifyDriverArrived = async (passengerId: string, driverName: string, tripId: string) => {
  await sendPushNotification(
    [passengerId],
    "📍 Driver Has Arrived!",
    `${driverName} is waiting at the pickup point`,
    { trip_id: tripId, type: "driver_arrived" }
  );
};

/** Notify passenger that trip has started */
export const notifyTripStarted = async (passengerId: string, tripId: string) => {
  await sendPushNotification(
    [passengerId],
    "🚀 Trip Started",
    "Your trip is now in progress",
    { trip_id: tripId, type: "trip_started" }
  );
};

/** Notify passenger that trip is completed */
export const notifyTripCompleted = async (passengerId: string, fare: string, tripId: string) => {
  await sendPushNotification(
    [passengerId],
    "🏁 Trip Completed!",
    `Your fare: ${fare} MVR. Thank you for riding!`,
    { trip_id: tripId, type: "trip_completed" }
  );
};

/** Notify user(s) that trip was cancelled */
export const notifyTripCancelled = async (userIds: string[], cancelledBy: string, tripId: string) => {
  await sendPushNotification(
    userIds,
    "❌ Trip Cancelled",
    `The trip was cancelled by ${cancelledBy}`,
    { trip_id: tripId, type: "trip_cancelled" }
  );
};

/** Notify user of a new chat message */
export const notifyMessageReceived = async (userId: string, senderName: string, message: string, tripId: string) => {
  await sendPushNotification(
    [userId],
    `💬 ${senderName}`,
    message.length > 80 ? message.slice(0, 77) + "..." : message,
    { trip_id: tripId, type: "message_received" }
  );
};

/** Notify admins of an SOS alert */
export const notifySOSAlert = async (adminIds: string[], userName: string, alertId: string) => {
  await sendPushNotification(
    adminIds,
    "🆘 SOS Alert!",
    `Emergency alert from ${userName}`,
    { alert_id: alertId, type: "sos_alert" }
  );
};

/** Notify other drivers that a trip was taken by another driver */
export const notifyTripTaken = async (driverIds: string[], tripId: string) => {
  if (driverIds.length === 0) return;
  await sendPushNotification(
    driverIds,
    "🚫 Trip Taken",
    "Another driver accepted this trip",
    { trip_id: tripId, type: "trip_taken" }
  );
};
