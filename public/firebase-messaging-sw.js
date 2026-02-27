/* eslint-disable no-undef */
// Firebase Messaging Service Worker
// This runs in the background and handles push notifications when the app is closed or unfocused.

importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

// Firebase config will be passed via the main app through a message
let firebaseConfig = null;

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FIREBASE_CONFIG") {
    firebaseConfig = event.data.config;
    initFirebase();
  }
});

function initFirebase() {
  if (!firebaseConfig || firebase.apps.length > 0) return;

  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log("[SW] Background message received:", payload);

    const notificationTitle = payload.notification?.title || "New Notification";
    const notificationOptions = {
      body: payload.notification?.body || "",
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: payload.data?.type || "default",
      data: payload.data || {},
      // Play default sound
      silent: false,
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: true,
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

// Handle notification click — open/focus the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = "/";

  // Route based on notification type
  if (data.type === "trip_requested" || data.type === "trip_accepted") {
    targetUrl = "/driver";
  } else if (data.type === "sos_alert") {
    targetUrl = "/admin";
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return clients.openWindow(targetUrl);
    })
  );
});
