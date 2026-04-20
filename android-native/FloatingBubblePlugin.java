package com.hdataxi.passenger.plugins;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FloatingBubble")
public class FloatingBubblePlugin extends Plugin {
    private static FloatingBubblePlugin instance;

    public static FloatingBubblePlugin getInstance() {
        return instance;
    }

    @Override
    public void load() {
        instance = this;
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

    public void notifyBubbleDismissed() {
        notifyListeners("bubbleDismissed", new JSObject());
    }
}
