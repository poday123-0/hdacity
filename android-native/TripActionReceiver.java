package com.hdataxi.passenger.plugins;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Handles taps on the Accept / Decline action buttons of the heads-up
 * incoming-trip notification. Dismisses the notification and forwards the
 * action to the JS layer through the FloatingBubblePlugin event bus.
 */
public class TripActionReceiver extends BroadcastReceiver {
    public static final String ACTION_ACCEPT = "com.hdataxi.passenger.TRIP_ACCEPT";
    public static final String ACTION_DECLINE = "com.hdataxi.passenger.TRIP_DECLINE";
    public static final String EXTRA_TRIP_ID = "tripId";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String tripId = intent.getStringExtra(EXTRA_TRIP_ID);
        if (tripId == null) tripId = "";
        int notifId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 10001);

        // Dismiss the notification immediately
        try {
            NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(notifId);
        } catch (Exception ignored) {}

        FloatingBubblePlugin plugin = FloatingBubblePlugin.getInstance();

        if (ACTION_ACCEPT.equals(intent.getAction())) {
            if (plugin != null) {
                try { plugin.notifyBubbleAccepted(tripId); } catch (Exception ignored) {}
            }
            // Bring the app to the foreground so the driver lands on the trip
            try {
                Intent launch = context.getPackageManager()
                    .getLaunchIntentForPackage(context.getPackageName());
                if (launch != null) {
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    launch.putExtra("tripId", tripId);
                    launch.setAction("TRIP_ACCEPT");
                    context.startActivity(launch);
                }
            } catch (Exception ignored) {}
        } else if (ACTION_DECLINE.equals(intent.getAction())) {
            if (plugin != null) {
                try { plugin.notifyBubbleDeclined(tripId); } catch (Exception ignored) {}
            }
        }
    }
}
