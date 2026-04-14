package com.hdataxi.passenger.plugins

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "FloatingBubble")
class FloatingBubblePlugin : Plugin() {

    companion object {
        var instance: FloatingBubblePlugin? = null
    }

    override fun load() {
        instance = this
    }

    @PluginMethod
    fun show(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("No context")
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
            call.reject("OVERLAY_PERMISSION_REQUIRED")
            return
        }

        val tripId = call.getString("tripId") ?: ""
        val pickup = call.getString("pickupAddress") ?: "Pickup"
        val dropoff = call.getString("dropoffAddress") ?: "Dropoff"
        val vehicleType = call.getString("vehicleType") ?: ""
        val fare = call.getDouble("estimatedFare") ?: 0.0

        val intent = Intent(ctx, FloatingBubbleService::class.java).apply {
            action = FloatingBubbleService.ACTION_SHOW
            putExtra("tripId", tripId)
            putExtra("pickup", pickup)
            putExtra("dropoff", dropoff)
            putExtra("vehicleType", vehicleType)
            putExtra("fare", fare)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent)
        } else {
            ctx.startService(intent)
        }

        call.resolve()
    }

    @PluginMethod
    fun hide(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("No context")
            return
        }

        val intent = Intent(ctx, FloatingBubbleService::class.java).apply {
            action = FloatingBubbleService.ACTION_HIDE
        }
        ctx.startService(intent)
        call.resolve()
    }

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }
        val result = JSObject()
        result.put("granted", granted)
        call.resolve(result)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}")
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }
        call.resolve()
    }

    /** Called from the Service when user taps the bubble */
    fun notifyBubbleTapped(tripId: String) {
        val data = JSObject()
        data.put("tripId", tripId)
        notifyListeners("bubbleTapped", data)
    }

    /** Called from the Service when user dismisses the bubble */
    fun notifyBubbleDismissed() {
        notifyListeners("bubbleDismissed", null)
    }
}
