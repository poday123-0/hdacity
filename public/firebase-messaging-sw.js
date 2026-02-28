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

// Initialize Firebase immediately so background messages always work
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Vibration patterns per notification type
const VIBRATE_PATTERNS = {
  trip_requested: [300, 100, 300, 100, 300, 100, 300, 100, 300], // urgent, long pattern
  trip_accepted: [200, 100, 200],
  trip_started: [200, 100, 200],
  trip_completed: [100, 50, 100, 50, 200],
  trip_cancelled: [500, 200, 500],
  sos_alert: [500, 100, 500, 100, 500, 100, 500], // very urgent
  driver_arrived: [200, 100, 200, 100, 200],
  default: [200, 100, 200, 100, 200],
};

messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Background message received:", payload);

  const title = payload.notification?.title || payload.data?.title || "New Notification";
  const body = payload.notification?.body || payload.data?.body || "";
  const type = payload.data?.type || "default";

  const vibratePattern = VIBRATE_PATTERNS[type] || VIBRATE_PATTERNS.default;
  const isTripRequest = type === "trip_requested";
  const isSOS = type === "sos_alert";

  const notificationOptions = {
    body,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag: type,
    data: payload.data || {},
    silent: false,
    vibrate: vibratePattern,
    // Keep trip requests and SOS on screen until user interacts
    requireInteraction: isTripRequest || isSOS,
    // Renotify even if same tag (so repeated trip requests are heard)
    renotify: true,
    // Add actions for trip requests
    actions: isTripRequest
      ? [
          { action: "open", title: "Open App" },
        ]
      : [],
  };

  self.registration.showNotification(title, notificationOptions);
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
