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
  const { error } = await supabase
    .from("device_tokens")
    .upsert(
      {
        user_id: userId,
        token,
        user_type: userType,
        device_type: deviceType,
        is_active: true,
        updated_at: new Date().toISOString(),
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
 * Trip event notification helpers
 */
export const notifyTripRequested = async (driverIds: string[], tripId: string, pickupAddress: string) => {
  await sendPushNotification(
    driverIds,
    "🚗 New Ride Request!",
    `Pickup: ${pickupAddress}`,
    { trip_id: tripId, type: "trip_requested" }
  );
};

export const notifyTripAccepted = async (passengerId: string, driverName: string, tripId: string) => {
  await sendPushNotification(
    [passengerId],
    "✅ Driver Accepted!",
    `${driverName} is on the way to pick you up`,
    { trip_id: tripId, type: "trip_accepted" }
  );
};

export const notifyDriverArrived = async (passengerId: string, driverName: string, tripId: string) => {
  await sendPushNotification(
    [passengerId],
    "📍 Driver Has Arrived!",
    `${driverName} is waiting at the pickup point`,
    { trip_id: tripId, type: "driver_arrived" }
  );
};

export const notifyTripStarted = async (passengerId: string, tripId: string) => {
  await sendPushNotification(
    [passengerId],
    "🚀 Trip Started",
    "Your trip is now in progress",
    { trip_id: tripId, type: "trip_started" }
  );
};

export const notifyTripCompleted = async (passengerId: string, fare: string, tripId: string) => {
  await sendPushNotification(
    [passengerId],
    "🏁 Trip Completed!",
    `Your fare: ${fare} MVR. Thank you for riding!`,
    { trip_id: tripId, type: "trip_completed" }
  );
};

export const notifyTripCancelled = async (userIds: string[], cancelledBy: string, tripId: string) => {
  await sendPushNotification(
    userIds,
    "❌ Trip Cancelled",
    `The trip was cancelled by ${cancelledBy}`,
    { trip_id: tripId, type: "trip_cancelled" }
  );
};

export const notifyMessageReceived = async (userId: string, senderName: string, message: string, tripId: string) => {
  await sendPushNotification(
    [userId],
    `💬 ${senderName}`,
    message.length > 80 ? message.slice(0, 77) + "..." : message,
    { trip_id: tripId, type: "message_received" }
  );
};

export const notifySOSAlert = async (adminIds: string[], userName: string, alertId: string) => {
  await sendPushNotification(
    adminIds,
    "🆘 SOS Alert!",
    `Emergency alert from ${userName}`,
    { alert_id: alertId, type: "sos_alert" }
  );
};
