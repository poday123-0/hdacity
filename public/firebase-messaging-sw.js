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

// Vibration patterns per notification type
const VIBRATE_PATTERNS = {
  trip_requested: [300, 100, 300, 100, 300, 100, 300, 100, 300],
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
  const isSOS = type === "sos_alert";

  const notificationOptions = {
    body,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag: `${type}-${Date.now()}`,
    data: { ...(payload.data || {}), sound_url: soundUrl, sound_category: soundCategory },
    // Don't set silent — let the OS play the default notification sound
    // Our custom sound plays via the client bridge below
    silent: false,
    vibrate: vibratePattern,
    requireInteraction: isTripRequest || isSOS,
    renotify: true,
    actions: isTripRequest
      ? [{ action: "open", title: "Open App" }]
      : [],
  };

  // Show the notification
  self.registration.showNotification(title, notificationOptions);

  // Auto-focus the app window for important trip events (brings PWA to foreground)
  const autoFocusTypes = ["trip_requested", "sos_alert", "trip_accepted", "driver_arrived", "trip_started", "trip_completed", "trip_cancelled"];
  if (autoFocusTypes.includes(type)) {
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus().catch(() => {});
          // Also post a message so the app can show an in-app alert
          client.postMessage({
            type: "TRIP_REQUEST_FOCUS",
            notification_type: type,
            data: payload.data || {},
          });
          break;
        }
      }
    });
  }

  // Try to play custom sound via open client windows
  if (soundUrl) {
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      console.log(`[SW] Found ${clientList.length} client window(s) for sound playback`);
      for (const client of clientList) {
        client.postMessage({
          type: "PLAY_NOTIFICATION_SOUND",
          sound_url: soundUrl,
          notification_type: type,
          sound_category: soundCategory,
        });
      }
    });
  }
});

// Handle notification click — open/focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = "/";

  if (data.type === "trip_requested" || data.type === "trip_accepted") {
    targetUrl = "/driver";
  } else if (data.type === "sos_alert") {
    targetUrl = "/admin";
  } else if (data.type === "message_received") {
    targetUrl = data.trip_id ? "/driver" : "/";
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
