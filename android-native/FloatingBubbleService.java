package com.hdataxi.passenger.plugins;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

import com.hdataxi.passenger.MainActivity;
import com.hdataxi.passenger.R;

public class FloatingBubbleService extends Service {
    public static final String ACTION_SHOW = "SHOW_BUBBLE";
    public static final String ACTION_HIDE = "HIDE_BUBBLE";
    private static final String CHANNEL_ID = "floating_bubble_channel";
    private static final int NOTIFICATION_ID = 9999;

    private WindowManager windowManager;
    private View bubbleView;
    private View expandedView;
    private String currentTripId = "";
    private Handler mainHandler;
    private Runnable expandedDismissRunnable;
    private boolean isDestroyed = false;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        mainHandler = new Handler(Looper.getMainLooper());
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_SHOW.equals(intent.getAction())) {
            try {
                startForeground(NOTIFICATION_ID, buildForegroundNotification());
            } catch (Exception e) {
                // Foreground service start failed — stop gracefully
                stopSelf();
                return START_NOT_STICKY;
            }

            currentTripId = intent.getStringExtra("tripId");
            if (currentTripId == null) currentTripId = "";
            String pickup = intent.getStringExtra("pickup");
            String dropoff = intent.getStringExtra("dropoff");
            String vehicleType = intent.getStringExtra("vehicleType");
            double fare = intent.getDoubleExtra("fare", 0d);

            showBubble();
            showExpandedCard(
                pickup != null ? pickup : "Pickup",
                dropoff != null ? dropoff : "Dropoff",
                vehicleType != null ? vehicleType : "",
                fare
            );
        } else if (ACTION_HIDE.equals(intent.getAction())) {
            cleanupAndStop();
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        isDestroyed = true;
        if (mainHandler != null && expandedDismissRunnable != null) {
            mainHandler.removeCallbacks(expandedDismissRunnable);
        }
        removeExpanded();
        removeBubble();
        super.onDestroy();
    }

    private void cleanupAndStop() {
        if (mainHandler != null && expandedDismissRunnable != null) {
            mainHandler.removeCallbacks(expandedDismissRunnable);
        }
        removeExpanded();
        removeBubble();
        try {
            stopForeground(true);
        } catch (Exception ignored) {}
        stopSelf();
    }

    private void showBubble() {
        if (isDestroyed) return;
        removeBubble();

        int size = dpToPx(56);
        int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            size,
            size,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = dpToPx(12);
        params.y = dpToPx(80);

        ImageView imageView = new ImageView(this);
        imageView.setImageResource(R.mipmap.ic_launcher);
        imageView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        imageView.setBackgroundResource(R.drawable.bubble_bg);
        imageView.setPadding(dpToPx(6), dpToPx(6), dpToPx(6), dpToPx(6));

        imageView.setOnTouchListener(new View.OnTouchListener() {
            int initialX;
            int initialY;
            float initialTouchX;
            float initialTouchY;
            boolean moved;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = params.x;
                        initialY = params.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (event.getRawX() - initialTouchX);
                        int dy = (int) (event.getRawY() - initialTouchY);
                        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                            moved = true;
                        }
                        params.x = initialX + dx;
                        params.y = initialY + dy;
                        if (bubbleView != null && bubbleView.isAttachedToWindow() && windowManager != null) {
                            try {
                                windowManager.updateViewLayout(bubbleView, params);
                            } catch (Exception ignored) {}
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moved) {
                            openApp();
                        }
                        return true;
                    default:
                        return false;
                }
            }
        });

        bubbleView = imageView;

        try {
            windowManager.addView(bubbleView, params);
            bubbleView.setScaleX(0f);
            bubbleView.setScaleY(0f);
            bubbleView.animate()
                .scaleX(1f)
                .scaleY(1f)
                .setDuration(300)
                .setInterpolator(new AccelerateDecelerateInterpolator())
                .start();
        } catch (Exception e) {
            bubbleView = null;
        }
    }

    private void showExpandedCard(String pickup, String dropoff, String vehicleType, double fare) {
        if (isDestroyed) return;
        removeExpanded();

        int screenWidth = getResources().getDisplayMetrics().widthPixels;
        int cardWidth = (int) (screenWidth * 0.85f);
        int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            cardWidth,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        params.y = dpToPx(150);

        expandedView = buildExpandedLayout(pickup, dropoff, vehicleType, fare);

        try {
            windowManager.addView(expandedView, params);
            expandedView.setAlpha(0f);
            expandedView.setTranslationY(-dpToPx(30));
            expandedView.animate()
                .alpha(1f)
                .translationY(0f)
                .setDuration(350)
                .setInterpolator(new AccelerateDecelerateInterpolator())
                .start();
        } catch (Exception e) {
            expandedView = null;
            return;
        }

        // Cancel any previous dismiss runnable
        if (expandedDismissRunnable != null) {
            mainHandler.removeCallbacks(expandedDismissRunnable);
        }
        expandedDismissRunnable = () -> {
            if (!isDestroyed) {
                removeExpanded();
            }
        };
        mainHandler.postDelayed(expandedDismissRunnable, 8000);
    }

    private View buildExpandedLayout(String pickup, String dropoff, String vehicleType, double fare) {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(dpToPx(16), dpToPx(14), dpToPx(16), dpToPx(14));

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#1E293B"));
        cardBg.setCornerRadius(dpToPx(16));
        container.setBackground(cardBg);
        container.setElevation(dpToPx(8));

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        TextView title = new TextView(this);
        title.setText("🚗  New Trip Request");
        title.setTextColor(Color.parseColor("#38BDF8"));
        title.setTextSize(14f);
        title.setTypeface(null, Typeface.BOLD);
        header.addView(title);

        if (!vehicleType.isEmpty()) {
            TextView badge = new TextView(this);
            badge.setText(vehicleType);
            badge.setTextColor(Color.parseColor("#38BDF8"));
            badge.setTextSize(10f);
            badge.setPadding(dpToPx(8), dpToPx(2), dpToPx(8), dpToPx(2));

            GradientDrawable badgeBg = new GradientDrawable();
            badgeBg.setColor(Color.parseColor("#1E3A5F"));
            badgeBg.setCornerRadius(dpToPx(10));
            badge.setBackground(badgeBg);

            LinearLayout.LayoutParams badgeParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            );
            badgeParams.setMarginStart(dpToPx(8));
            header.addView(badge, badgeParams);
        }

        container.addView(header);

        TextView pickupText = new TextView(this);
        pickupText.setText("📍 " + pickup);
        pickupText.setTextColor(Color.WHITE);
        pickupText.setTextSize(13f);
        pickupText.setMaxLines(1);
        pickupText.setSingleLine(true);
        pickupText.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams pickupParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        pickupParams.topMargin = dpToPx(8);
        container.addView(pickupText, pickupParams);

        TextView dropoffText = new TextView(this);
        dropoffText.setText("→ " + dropoff);
        dropoffText.setTextColor(Color.parseColor("#94A3B8"));
        dropoffText.setTextSize(12f);
        dropoffText.setMaxLines(1);
        dropoffText.setSingleLine(true);
        dropoffText.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams dropoffParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        dropoffParams.topMargin = dpToPx(3);
        container.addView(dropoffText, dropoffParams);

        if (fare > 0) {
            LinearLayout fareRow = new LinearLayout(this);
            fareRow.setOrientation(LinearLayout.HORIZONTAL);
            fareRow.setGravity(Gravity.CENTER_VERTICAL);

            TextView fareText = new TextView(this);
            fareText.setText(((int) fare) + " MVR");
            fareText.setTextColor(Color.parseColor("#38BDF8"));
            fareText.setTextSize(15f);
            fareText.setTypeface(null, Typeface.BOLD);
            fareRow.addView(fareText);

            TextView tapHint = new TextView(this);
            tapHint.setText("Tap to view →");
            tapHint.setTextColor(Color.parseColor("#64748B"));
            tapHint.setTextSize(11f);
            LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(
                0,
                LinearLayout.LayoutParams.WRAP_CONTENT,
                1f
            );
            hintParams.setMarginStart(dpToPx(12));
            fareRow.addView(tapHint, hintParams);

            LinearLayout.LayoutParams fareRowParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            );
            fareRowParams.topMargin = dpToPx(10);
            container.addView(fareRow, fareRowParams);
        }

        container.setOnClickListener(v -> openApp());
        return container;
    }

    private void openApp() {
        try {
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            intent.putExtra("tripId", currentTripId);
            intent.setAction("BUBBLE_TAP");
            startActivity(intent);
        } catch (Exception ignored) {}

        FloatingBubblePlugin plugin = FloatingBubblePlugin.getInstance();
        if (plugin != null) {
            try {
                plugin.notifyBubbleTapped(currentTripId);
            } catch (Exception ignored) {}
        }

        cleanupAndStop();
    }

    private void removeBubble() {
        if (bubbleView != null && windowManager != null) {
            try {
                if (bubbleView.isAttachedToWindow()) {
                    windowManager.removeView(bubbleView);
                }
            } catch (Exception ignored) {
            }
        }
        bubbleView = null;
    }

    private void removeExpanded() {
        if (expandedView != null && windowManager != null) {
            try {
                if (expandedView.isAttachedToWindow()) {
                    windowManager.removeView(expandedView);
                }
            } catch (Exception ignored) {
            }
        }
        expandedView = null;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Floating Bubble",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps the trip bubble overlay active");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildForegroundNotification() {
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            new Intent(this, MainActivity.class),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Trip Request")
            .setContentText("You have a pending trip request")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build();
    }

    private int dpToPx(int dp) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp,
            getResources().getDisplayMetrics()
        );
    }
}
