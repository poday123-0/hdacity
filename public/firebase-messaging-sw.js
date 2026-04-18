/* eslint-disable no-undef */
// Firebase Messaging Service Worker
// Handles push notifications when the app is closed, minimized, or unfocused.

importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

// Hardcoded Firebase config (publishable keys — safe to embed)
const firebaseConfig = {
  apiKey: "AIzaSyBl3KbZvcTEm-i3b6pyMWZmoCD33lR1ihY",
  authDomain: "hda-taxi.firebaseapp.com",
  databaseURL: "https://hda-taxi-default-rtdb.firebaseio.com",
  projectId: "hda-taxi",
  storageBucket: "hda-taxi.appspot.com",
  messagingSenderId: "271359759161",
  appId: "1:271359759161:web:cd53167a2f0e5a9e914ee8",
  measurementId: "G-V167TVMRDT",
};

// Force activate new service worker immediately (skip waiting)
self.addEventListener("install", (event) => {
  console.log("[SW] Installing new service worker version");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activating new service worker version");
  event.waitUntil(self.clients.claim());
});

// Initialize Firebase immediately so background messages always work
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ---- Pending sounds queue (for iOS where clients may be suspended) ----
// When no client windows are available to play sound, store the request here.
// The client will poll for pending sounds on visibilitychange.
let pendingSounds = [];

// Listen for clients asking for pending sounds
self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_PENDING_SOUNDS") {
    const sounds = [...pendingSounds];
    pendingSounds = [];
    event.ports?.[0]?.postMessage({ sounds });
  }
  // Allow clients to clear pending sounds
  if (event.data?.type === "CLEAR_PENDING_SOUNDS") {
    pendingSounds = [];
  }
});

// Vibration patterns per notification type
const VIBRATE_PATTERNS = {
  trip_requested: [300, 100, 300, 100, 300, 100, 300, 100, 300],
  trip_assigned: [300, 100, 300, 100, 300],
  trip_accepted: [200, 100, 200],
  trip_started: [200, 100, 200],
  trip_completed: [100, 50, 100, 50, 200],
  trip_cancelled: [500, 200, 500],
  sos_alert: [500, 100, 500, 100, 500, 100, 500],
  driver_arrived: [200, 100, 200, 100, 200],
  message_received: [150, 80, 150],
  default: [200, 100, 200, 100, 200],
};

messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Background message received:", payload);

  const title = payload.data?.title || payload.notification?.title || "New Notification";
  const body = payload.data?.body || payload.notification?.body || "";
  const type = payload.data?.type || "default";
  const soundUrl = payload.data?.sound_url || "";
  const soundCategory = payload.data?.sound_category || type;

  const vibratePattern = VIBRATE_PATTERNS[type] || VIBRATE_PATTERNS.default;
  const isTripRequest = type === "trip_requested";
  const isTripAssigned = type === "trip_assigned";
  const isSOS = type === "sos_alert";

  const notificationOptions = {
    body,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag: `${type}-${Date.now()}`,
    data: { ...(payload.data || {}), sound_url: soundUrl, sound_category: soundCategory },
    silent: false,
    vibrate: vibratePattern,
    requireInteraction: isTripRequest || isSOS || isTripAssigned,
    renotify: true,
    actions: (isTripRequest || isTripAssigned)
      ? [{ action: "open", title: "Open App" }]
      : [],
  };

  // Show the notification (this is the ONLY notification — no duplicate)
  self.registration.showNotification(title, notificationOptions);

  // Try to play custom admin sound + auto-focus via open client windows
  self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
    console.log(`[SW] Found ${clientList.length} client window(s)`);

    // If no clients available (iOS backgrounded), queue the sound for later
    if (clientList.length === 0 && soundUrl) {
      console.log("[SW] No clients available — queuing sound for replay");
      pendingSounds.push({
        sound_url: soundUrl,
        notification_type: type,
        sound_category: soundCategory,
        timestamp: Date.now(),
      });
      // Keep max 5 pending sounds, discard old ones
      if (pendingSounds.length > 5) {
        pendingSounds = pendingSounds.slice(-5);
      }
      return;
    }

    for (const client of clientList) {
      // Play custom sound via client
      if (soundUrl) {
        client.postMessage({
          type: "PLAY_NOTIFICATION_SOUND",
          sound_url: soundUrl,
          notification_type: type,
          sound_category: soundCategory,
        });
      }

      // Auto-focus for important events
      const autoFocusTypes = ["trip_requested", "trip_assigned", "sos_alert", "trip_accepted", "driver_arrived", "trip_started", "trip_completed", "trip_cancelled"];
      if (autoFocusTypes.includes(type) && "focus" in client) {
        client.focus().catch(() => {});
        client.postMessage({
          type: "TRIP_REQUEST_FOCUS",
          notification_type: type,
          data: payload.data || {},
        });
      }
    }
  });
});

// Handle notification click — open/focus the PWA
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const type = data.type || "";
  let targetUrl = "/";

  if (type === "trip_requested" || type === "trip_accepted" || type === "trip_assigned") {
    targetUrl = "/driver";
  } else if (type === "sos_alert") {
    targetUrl = "/admin";
  } else if (type === "message_received") {
    targetUrl = data.trip_id ? "/driver" : "/";
  }

  // Try to play custom sound when user clicks the notification
  const soundUrl = data.sound_url;
  if (soundUrl) {
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      if (clientList.length === 0) {
        // Queue for when client opens
        pendingSounds.push({
          sound_url: soundUrl,
          notification_type: data.type || "default",
          sound_category: data.sound_category || data.type || "default",
          timestamp: Date.now(),
        });
      }
      for (const client of clientList) {
        client.postMessage({
          type: "PLAY_NOTIFICATION_SOUND",
          sound_url: soundUrl,
          notification_type: data.type || "default",
          sound_category: data.sound_category || data.type || "default",
        });
      }
    });
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
