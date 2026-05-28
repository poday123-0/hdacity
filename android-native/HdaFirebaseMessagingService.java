package com.hdataxi.passenger.plugins;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.ProcessLifecycleOwner;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.hdataxi.passenger.R;

import java.util.Map;

/**
 * Intercepts incoming FCM data messages BEFORE Capacitor's JS layer is reached
 * so that trip-request pushes always surface as a heads-up notification with
 * Accept / Decline action buttons — even when the app is fully killed or in
 * the background and the WebView is not running.
 *
 * Behavior:
 *  - type = "trip_requested" | "trip_assigned":
 *       Build a max-priority heads-up notification natively. If the JS layer
 *       is alive (app foregrounded) we also forward to Capacitor so the
 *       in-app trip card / sound manager can react.
 *  - All other types: delegate to Capacitor's MessagingService (super).
 *
 * Token refresh is delegated to super so existing FCM token registration in
 * use-push-notifications.ts keeps working unchanged.
 */
public class HdaFirebaseMessagingService extends MessagingService {
    private static final String HEADS_UP_CHANNEL = "trip_requests_v2";
    private static final int HEADS_UP_NOTIFICATION_ID = 10001;

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data != null ? data.get("type") : null;
        boolean isTripRequest = "trip_requested".equals(type) || "trip_assigned".equals(type);

        if (isTripRequest) {
            try {
                buildHeadsUp(data);
            } catch (Exception ignored) {}
            if (isAppInForeground()) {
                // App is alive — let JS also react (in-app trip card, sounds).
                try { super.onMessageReceived(remoteMessage); } catch (Exception ignored) {}
            }
            // When backgrounded / killed: the queued Accept/Decline action will be
            // drained by JS on next launch via FloatingBubblePlugin.getPendingAction().
            return;
        }

        // Default: forward everything else to Capacitor's MessagingService.
        super.onMessageReceived(remoteMessage);
    }

    private boolean isAppInForeground() {
        try {
            return ProcessLifecycleOwner.get()
                .getLifecycle()
                .getCurrentState()
                .isAtLeast(Lifecycle.State.STARTED);
        } catch (Throwable t) {
            return false;
        }
    }

    private void buildHeadsUp(Map<String, String> data) {
        Context ctx = getApplicationContext();
        if (ctx == null || data == null) return;

        String tripId = orEmpty(data.get("trip_id"));
        String pickup = firstNonEmpty(data.get("pickup_address"), data.get("pickup"));
        String dropoff = firstNonEmpty(data.get("dropoff_address"), data.get("dropoff"));
        String vehicleType = firstNonEmpty(data.get("vehicle_type"), data.get("vehicle_type_name"));
        double fare = 0;
        String fareStr = data.get("estimated_fare");
        if (fareStr != null && !fareStr.isEmpty()) {
            try { fare = Double.parseDouble(fareStr); } catch (Exception ignored) {}
        }

        ensureChannel(ctx);

        // Tap action — open the app on the driver screen.
        Intent contentIntent = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (contentIntent != null) {
            contentIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            contentIntent.putExtra("tripId", tripId);
            contentIntent.setAction("TRIP_OPEN");
        }
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent contentPi = contentIntent != null
            ? PendingIntent.getActivity(ctx, 1001, contentIntent, piFlags)
            : null;

        // Accept button
        Intent acceptIntent = new Intent(ctx, TripActionReceiver.class);
        acceptIntent.setAction(TripActionReceiver.ACTION_ACCEPT);
        acceptIntent.putExtra(TripActionReceiver.EXTRA_TRIP_ID, tripId);
        acceptIntent.putExtra(TripActionReceiver.EXTRA_NOTIFICATION_ID, HEADS_UP_NOTIFICATION_ID);
        PendingIntent acceptPi = PendingIntent.getBroadcast(ctx, 2001, acceptIntent, piFlags);

        // Decline button
        Intent declineIntent = new Intent(ctx, TripActionReceiver.class);
        declineIntent.setAction(TripActionReceiver.ACTION_DECLINE);
        declineIntent.putExtra(TripActionReceiver.EXTRA_TRIP_ID, tripId);
        declineIntent.putExtra(TripActionReceiver.EXTRA_NOTIFICATION_ID, HEADS_UP_NOTIFICATION_ID);
        PendingIntent declinePi = PendingIntent.getBroadcast(ctx, 2002, declineIntent, piFlags);

        StringBuilder body = new StringBuilder();
        if (!pickup.isEmpty()) body.append("📍 ").append(pickup);
        if (!dropoff.isEmpty()) {
            if (body.length() > 0) body.append("\n");
            body.append("🏁 ").append(dropoff);
        }
        if (fare > 0) body.append("\n💰 ").append((int) fare).append(" MVR");
        if (!vehicleType.isEmpty()) body.append("   •  ").append(vehicleType);

        int smallIcon = R.mipmap.ic_launcher;
        try {
            int stat = ctx.getResources().getIdentifier(
                "ic_stat_notification", "mipmap", ctx.getPackageName());
            if (stat != 0) smallIcon = stat;
        } catch (Exception ignored) {}

        String contentText = pickup.isEmpty() ? "Tap to view details" : pickup + (dropoff.isEmpty() ? "" : " → " + dropoff);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, HEADS_UP_CHANNEL)
            .setSmallIcon(smallIcon)
            .setContentTitle("🚗 New Trip Request")
            .setContentText(contentText)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body.toString()))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(false)
            .setDefaults(NotificationCompat.DEFAULT_VIBRATE | NotificationCompat.DEFAULT_LIGHTS)
            .addAction(0, "✓ Accept", acceptPi)
            .addAction(0, "✕ Decline", declinePi);

        if (contentPi != null) {
            builder.setContentIntent(contentPi);
            // Wake screen / show over lock screen.
            builder.setFullScreenIntent(contentPi, true);
        }

        try {
            NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(HEADS_UP_NOTIFICATION_ID, builder.build());
            }
        } catch (Exception ignored) {}
    }

    private void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (nm.getNotificationChannel(HEADS_UP_CHANNEL) != null) return;

            Uri soundUri = Uri.parse(
                "android.resource://" + ctx.getPackageName() + "/raw/trip_request");
            AudioAttributes audioAttr = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();

            android.app.NotificationChannel ch = new android.app.NotificationChannel(
                HEADS_UP_CHANNEL, "Trip Requests", NotificationManager.IMPORTANCE_MAX);
            ch.setDescription("Incoming trip request alerts");
            ch.enableVibration(true);
            ch.setShowBadge(true);
            ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            try { ch.setSound(soundUri, audioAttr); } catch (Exception ignored) {}
            nm.createNotificationChannel(ch);
        } catch (Exception ignored) {}
    }

    private static String orEmpty(String s) { return s == null ? "" : s; }
    private static String firstNonEmpty(String a, String b) {
        if (a != null && !a.isEmpty()) return a;
        if (b != null && !b.isEmpty()) return b;
        return "";
    }
}
