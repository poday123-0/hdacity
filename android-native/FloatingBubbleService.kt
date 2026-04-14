package com.hdataxi.passenger.plugins

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.*
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.TypedValue
import android.view.*
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import com.hdataxi.passenger.MainActivity
import com.hdataxi.passenger.R

class FloatingBubbleService : Service() {

    companion object {
        const val ACTION_SHOW = "SHOW_BUBBLE"
        const val ACTION_HIDE = "HIDE_BUBBLE"
        private const val CHANNEL_ID = "floating_bubble_channel"
        private const val NOTIFICATION_ID = 9999
    }

    private var windowManager: WindowManager? = null
    private var bubbleView: View? = null
    private var expandedView: View? = null
    private var currentTripId: String = ""
    private var isExpanded = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW -> {
                // Start foreground first
                startForeground(NOTIFICATION_ID, buildForegroundNotification())

                currentTripId = intent.getStringExtra("tripId") ?: ""
                val pickup = intent.getStringExtra("pickup") ?: "Pickup"
                val dropoff = intent.getStringExtra("dropoff") ?: "Dropoff"
                val vehicleType = intent.getStringExtra("vehicleType") ?: ""
                val fare = intent.getDoubleExtra("fare", 0.0)

                showBubble()
                showExpandedCard(pickup, dropoff, vehicleType, fare)
            }
            ACTION_HIDE -> {
                removeBubble()
                removeExpanded()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        removeBubble()
        removeExpanded()
        super.onDestroy()
    }

    // ─── Collapsed Bubble ─────────────────────────────────────────

    private fun showBubble() {
        removeBubble()

        val size = dpToPx(56)
        val params = WindowManager.LayoutParams(
            size, size,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = dpToPx(12)
            y = dpToPx(80)
        }

        val imageView = ImageView(this).apply {
            setImageResource(R.mipmap.ic_launcher_round)
            scaleType = ImageView.ScaleType.CENTER_CROP
            // Add pulsing glow background
            setBackgroundResource(R.drawable.bubble_bg)
            setPadding(dpToPx(4), dpToPx(4), dpToPx(4), dpToPx(4))
        }

        // Make draggable
        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var moved = false

        imageView.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - initialTouchX).toInt()
                    val dy = (event.rawY - initialTouchY).toInt()
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) moved = true
                    params.x = initialX + dx
                    params.y = initialY + dy
                    windowManager?.updateViewLayout(bubbleView, params)
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) {
                        // Tap → open app
                        openApp()
                    }
                    true
                }
                else -> false
            }
        }

        bubbleView = imageView
        try {
            windowManager?.addView(bubbleView, params)
            // Animate entry
            bubbleView?.scaleX = 0f
            bubbleView?.scaleY = 0f
            bubbleView?.animate()
                ?.scaleX(1f)?.scaleY(1f)
                ?.setDuration(300)
                ?.setInterpolator(AccelerateDecelerateInterpolator())
                ?.start()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    // ─── Expanded Card ────────────────────────────────────────────

    private fun showExpandedCard(pickup: String, dropoff: String, vehicleType: String, fare: Double) {
        removeExpanded()

        val density = resources.displayMetrics.density
        val screenWidth = resources.displayMetrics.widthPixels

        val cardWidth = (screenWidth * 0.85).toInt()
        val params = WindowManager.LayoutParams(
            cardWidth,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = dpToPx(150)
        }

        val card = buildExpandedLayout(pickup, dropoff, vehicleType, fare)
        expandedView = card
        isExpanded = true

        try {
            windowManager?.addView(expandedView, params)
            expandedView?.alpha = 0f
            expandedView?.translationY = -dpToPx(30).toFloat()
            expandedView?.animate()
                ?.alpha(1f)?.translationY(0f)
                ?.setDuration(350)
                ?.setInterpolator(AccelerateDecelerateInterpolator())
                ?.start()
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // Auto-collapse after 8 seconds
        expandedView?.postDelayed({
            removeExpanded()
        }, 8000)
    }

    private fun buildExpandedLayout(pickup: String, dropoff: String, vehicleType: String, fare: Double): View {
        val density = resources.displayMetrics.density

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dpToPx(16), dpToPx(14), dpToPx(16), dpToPx(14))

            // Rounded card background
            val bg = android.graphics.drawable.GradientDrawable().apply {
                setColor(Color.parseColor("#1E293B"))
                cornerRadius = dpToPx(16).toFloat()
            }
            background = bg
            elevation = dpToPx(8).toFloat()
        }

        // Header: "New Trip Request" + vehicle type badge
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val title = TextView(this).apply {
            text = "🚗  New Trip Request"
            setTextColor(Color.parseColor("#38BDF8"))
            textSize = 14f
            setTypeface(null, Typeface.BOLD)
        }
        header.addView(title)

        if (vehicleType.isNotEmpty()) {
            val badge = TextView(this).apply {
                text = vehicleType
                setTextColor(Color.parseColor("#38BDF8"))
                textSize = 10f
                setPadding(dpToPx(8), dpToPx(2), dpToPx(8), dpToPx(2))
                val bg = android.graphics.drawable.GradientDrawable().apply {
                    setColor(Color.parseColor("#1E3A5F"))
                    cornerRadius = dpToPx(10).toFloat()
                }
                background = bg
            }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginStart = dpToPx(8) }
            header.addView(badge, lp)
        }
        container.addView(header)

        // Pickup line
        val pickupText = TextView(this).apply {
            text = "📍 $pickup"
            setTextColor(Color.WHITE)
            textSize = 13f
            maxLines = 1
            setSingleLine(true)
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        val pickupLp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dpToPx(8) }
        container.addView(pickupText, pickupLp)

        // Dropoff line
        val dropoffText = TextView(this).apply {
            text = "→ $dropoff"
            setTextColor(Color.parseColor("#94A3B8"))
            textSize = 12f
            maxLines = 1
            setSingleLine(true)
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        val dropoffLp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dpToPx(3) }
        container.addView(dropoffText, dropoffLp)

        // Fare + Tap to view row
        if (fare > 0) {
            val fareRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }

            val fareText = TextView(this).apply {
                text = "${fare.toInt()} MVR"
                setTextColor(Color.parseColor("#38BDF8"))
                textSize = 15f
                setTypeface(null, Typeface.BOLD)
            }
            fareRow.addView(fareText)

            val tapHint = TextView(this).apply {
                text = "Tap to view →"
                setTextColor(Color.parseColor("#64748B"))
                textSize = 11f
            }
            val hintLp = LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
            ).apply { marginStart = dpToPx(12) }
            fareRow.addView(tapHint, hintLp)

            val fareLp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dpToPx(10) }
            container.addView(fareRow, fareLp)
        }

        // Tap handler
        container.setOnClickListener {
            openApp()
        }

        return container
    }

    // ─── Helpers ──────────────────────────────────────────────────

    private fun openApp() {
        // Bring the app to front
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("tripId", currentTripId)
            action = "BUBBLE_TAP"
        }
        startActivity(intent)

        // Notify web layer
        FloatingBubblePlugin.instance?.notifyBubbleTapped(currentTripId)

        // Remove overlay
        removeExpanded()
        removeBubble()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun removeBubble() {
        bubbleView?.let {
            try { windowManager?.removeView(it) } catch (_: Exception) {}
        }
        bubbleView = null
    }

    private fun removeExpanded() {
        expandedView?.let {
            try { windowManager?.removeView(it) } catch (_: Exception) {}
        }
        expandedView = null
        isExpanded = false
    }

    private fun dpToPx(dp: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Floating Bubble",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the trip bubble overlay active"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildForegroundNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Trip Request")
            .setContentText("You have a pending trip request")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }
}
