package com.hdataxi.passenger.plugins;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.hdataxi.passenger.R;

@CapacitorPlugin(name = "FloatingBubble")
public class FloatingBubblePlugin extends Plugin {
    private static FloatingBubblePlugin instance;

    // Pending action queued by the native side (notification action or overlay
    // button press) when the WebView isn't alive yet. JS calls getPendingAction()
    // on boot to drain it.
    private static volatile String pendingAction;   // "accept" | "decline" | "open"
    private static volatile String pendingTripId;

    public static FloatingBubblePlugin getInstance() {
        return instance;
    }

    public static void queuePendingAction(String action, String tripId) {
        pendingAction = action;
        pendingTripId = tripId == null ? "" : tripId;
    }

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void getPendingAction(PluginCall call) {
        JSObject data = new JSObject();
        data.put("action", pendingAction == null ? "" : pendingAction);
        data.put("tripId", pendingTripId == null ? "" : pendingTripId);
        // Drain after read
        pendingAction = null;
        pendingTripId = null;
        call.resolve(data);
    }

    @PluginMethod
    public void show(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.reject("No context");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
            call.reject("OVERLAY_PERMISSION_REQUIRED");
            return;
        }

        String tripId = call.getString("tripId", "");
        String pickup = call.getString("pickupAddress", "Pickup");
        String dropoff = call.getString("dropoffAddress", "Dropoff");
        String vehicleType = call.getString("vehicleType", "");
        double fare = call.getDouble("estimatedFare", 0d);

        Intent intent = new Intent(ctx, FloatingBubbleService.class);
        intent.setAction(FloatingBubbleService.ACTION_SHOW);
        intent.putExtra("tripId", tripId);
        intent.putExtra("pickup", pickup);
        intent.putExtra("dropoff", dropoff);
        intent.putExtra("vehicleType", vehicleType);
        intent.putExtra("fare", fare);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }

        call.resolve();
    }

    /**
     * Show an idle/persistent bubble (no trip card) — Messenger chat-head style.
     * Stays visible while the app is minimized so the driver always sees the
     * app is active. Tap to return to the app.
     */
    @PluginMethod
    public void showIdle(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.reject("No context");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
            call.reject("OVERLAY_PERMISSION_REQUIRED");
            return;
        }

        Intent intent = new Intent(ctx, FloatingBubbleService.class);
        intent.setAction(FloatingBubbleService.ACTION_SHOW_IDLE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }

        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.reject("No context");
            return;
        }

        Intent intent = new Intent(ctx, FloatingBubbleService.class);
        intent.setAction(FloatingBubbleService.ACTION_HIDE);
        ctx.startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext());
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            call.resolve();
            return;
        }

        android.app.Activity activity = getActivity();
        Context ctx = getContext();

        try {
            if (activity != null) {
                Intent genericIntent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                activity.startActivity(genericIntent);
                call.resolve();
                return;
            }
        } catch (Exception ignored) {}

        try {
            if (activity != null) {
                Intent packageIntent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + activity.getPackageName())
                );
                activity.startActivity(packageIntent);
                call.resolve();
                return;
            }
        } catch (Exception ignored) {}

        try {
            if (ctx != null) {
                Intent appDetailsIntent = new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + ctx.getPackageName())
                );
                appDetailsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(appDetailsIntent);
            }
        } catch (Exception ignored) {}

        call.resolve();
    }

    public void notifyBubbleTapped(String tripId) {
        JSObject data = new JSObject();
        data.put("tripId", tripId);
        notifyListeners("bubbleTapped", data);
    }

    public void notifyBubbleAccepted(String tripId) {
        JSObject data = new JSObject();
        data.put("tripId", tripId);
        notifyListeners("bubbleAccepted", data);
    }

    public void notifyBubbleDeclined(String tripId) {
        JSObject data = new JSObject();
        data.put("tripId", tripId);
        notifyListeners("bubbleDeclined", data);
    }

    public void notifyBubbleDismissed() {
        notifyListeners("bubbleDismissed", new JSObject());
    }

    // ───────────────────────────────────────────────────────────────
    //  Heads-up incoming-trip notification with Accept / Decline
    //  action buttons. Works WITHOUT overlay permission and shows on
    //  the lock screen / over other apps.
    // ───────────────────────────────────────────────────────────────
    private static final String HEADS_UP_CHANNEL = "trip_requests_v2";
    private static final int HEADS_UP_NOTIFICATION_ID = 10001;

    @PluginMethod
    public void showHeadsUp(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.reject("No context");
            return;
        }

        String tripId = call.getString("tripId", "");
        String pickup = call.getString("pickupAddress", "Pickup");
        String dropoff = call.getString("dropoffAddress", "Dropoff");
        String vehicleType = call.getString("vehicleType", "");
        double fare = call.getDouble("estimatedFare", 0d);

        // Ensure the channel exists (MainActivity also creates it, but be safe)
        ensureChannel(ctx);

        // Tap (content) intent → opens the app
        Intent contentIntent = ctx.getPackageManager()
            .getLaunchIntentForPackage(ctx.getPackageName());
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

        // Accept action
        Intent acceptIntent = new Intent(ctx, TripActionReceiver.class);
        acceptIntent.setAction(TripActionReceiver.ACTION_ACCEPT);
        acceptIntent.putExtra(TripActionReceiver.EXTRA_TRIP_ID, tripId);
        acceptIntent.putExtra(TripActionReceiver.EXTRA_NOTIFICATION_ID, HEADS_UP_NOTIFICATION_ID);
        PendingIntent acceptPi = PendingIntent.getBroadcast(
            ctx, 2001, acceptIntent, piFlags);

        // Decline action
        Intent declineIntent = new Intent(ctx, TripActionReceiver.class);
        declineIntent.setAction(TripActionReceiver.ACTION_DECLINE);
        declineIntent.putExtra(TripActionReceiver.EXTRA_TRIP_ID, tripId);
        declineIntent.putExtra(TripActionReceiver.EXTRA_NOTIFICATION_ID, HEADS_UP_NOTIFICATION_ID);
        PendingIntent declinePi = PendingIntent.getBroadcast(
            ctx, 2002, declineIntent, piFlags);

        StringBuilder body = new StringBuilder();
        body.append("📍 ").append(pickup).append("\n");
        body.append("🏁 ").append(dropoff);
        if (fare > 0) body.append("\n💰 ").append((int) fare).append(" MVR");
        if (vehicleType != null && !vehicleType.isEmpty()) {
            body.append("   •  ").append(vehicleType);
        }

        int smallIcon = R.mipmap.ic_launcher;
        try {
            int stat = ctx.getResources().getIdentifier(
                "ic_stat_notification", "mipmap", ctx.getPackageName());
            if (stat != 0) smallIcon = stat;
        } catch (Exception ignored) {}

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, HEADS_UP_CHANNEL)
            .setSmallIcon(smallIcon)
            .setContentTitle("🚗 New Trip Request")
            .setContentText(pickup + " → " + dropoff)
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
            // Full-screen intent wakes the screen / shows over lock screen
            builder.setFullScreenIntent(contentPi, true);
        }

        try {
            NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(HEADS_UP_NOTIFICATION_ID, builder.build());
            }
        } catch (Exception e) {
            call.reject("Failed to post notification: " + e.getMessage());
            return;
        }

        call.resolve();
    }

    @PluginMethod
    public void hideHeadsUp(PluginCall call) {
        Context ctx = getContext();
        if (ctx != null) {
            try {
                NotificationManager nm =
                    (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) nm.cancel(HEADS_UP_NOTIFICATION_ID);
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    private void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (nm.getNotificationChannel(HEADS_UP_CHANNEL) != null) return;

            Uri soundUri = Uri.parse("android.resource://" + ctx.getPackageName() + "/raw/trip_request");
            AudioAttributes audioAttr = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();

            android.app.NotificationChannel ch = new android.app.NotificationChannel(
                HEADS_UP_CHANNEL,
                "Trip Requests",
                NotificationManager.IMPORTANCE_MAX);
            ch.setDescription("Incoming trip request alerts");
            ch.enableVibration(true);
            ch.setShowBadge(true);
            ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            try { ch.setSound(soundUri, audioAttr); } catch (Exception ignored) {}
            nm.createNotificationChannel(ch);
        } catch (Exception ignored) {}
    }
}
