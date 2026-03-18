import { useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { registerDeviceToken } from "@/lib/push-notifications";
import { playFallbackBeep } from "@/lib/sound-utils";
import { playTrackedSound } from "@/lib/sound-manager";

/**
 * Hook to register push notification token for the current user.
 * Works on both web (Firebase) and native (Capacitor).
 * Handles foreground sound playback for all notification types.
 */
export const usePushNotifications = (
  userId: string | undefined,
  userType: "driver" | "passenger" | "admin" | "dispatcher"
) => {
  const registeredRef = useRef(false);
  const swListenerRef = useRef(false);
  const swUpdateTimerRef = useRef<number | null>(null);

  const setupWeb = useCallback(async () => {
    if (!userId || registeredRef.current) return;

    if (!("Notification" in window) || Notification.permission !== "granted") return;

    try {
      const { initializeApp, getApps } = await import("firebase/app");
      const { getMessaging, getToken, onMessage } = await import("firebase/messaging");

      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["firebase_config", "firebase_vapid_key"]);

      const configSetting = data?.find((s: any) => s.key === "firebase_config");
      if (!configSetting?.value) {
        console.warn("Firebase config not found in system_settings. Web push disabled.");
        return;
      }

      const firebaseConfig = typeof configSetting.value === "string"
        ? JSON.parse(configSetting.value)
        : configSetting.value;

      let swRegistration: ServiceWorkerRegistration | undefined;
      if ("serviceWorker" in navigator) {
        try {
          // Keep Firebase messaging SW isolated so it doesn't take over app SW scope
          swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
            scope: "/firebase-cloud-messaging-push-scope",
          });
          console.log("Firebase SW registered:", swRegistration.scope);

          // Check for Firebase SW updates periodically (create only once)
          if (swUpdateTimerRef.current === null) {
            swUpdateTimerRef.current = window.setInterval(() => {
              swRegistration?.update().catch(() => {});
            }, 60_000);
          }

          const sw = swRegistration.installing || swRegistration.waiting || swRegistration.active;
          if (sw) {
            const waitForActive = () =>
              new Promise<void>((resolve) => {
                if (sw.state === "activated") return resolve();
                sw.addEventListener("statechange", () => {
                  if (sw.state === "activated") resolve();
                });
              });
            await waitForActive();
          }
        } catch (swErr) {
          console.warn("Firebase SW registration failed:", swErr);
        }
      }

      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      const messaging = getMessaging(app);

      const vapidSetting = data?.find((s: any) => s.key === "firebase_vapid_key");
      const vapidKey = vapidSetting?.value
        ? (typeof vapidSetting.value === "string" ? vapidSetting.value : String(vapidSetting.value))
        : undefined;

      const token = await getToken(messaging, {
        vapidKey: vapidKey || undefined,
        serviceWorkerRegistration: swRegistration,
      });
      if (token) {
        console.log("FCM Token (web):", token);
        await registerDeviceToken(userId, token, userType, "web");
        registeredRef.current = true;
      }

      // Foreground message handler — play the correct sound
      onMessage(messaging, (payload) => {
        console.log("Foreground message:", payload);
        const msgTitle = payload.notification?.title || payload.data?.title || "Notification";
        const msgBody = payload.notification?.body || payload.data?.body || "";
        const soundUrl = payload.data?.sound_url;
        const notifType = payload.data?.type || "default";

        // Skip sound for types already handled by DriverApp's own realtime listeners
        const driverHandledTypes = ["trip_requested", "message_received", "trip_cancelled"];
        if (!driverHandledTypes.includes(notifType)) {
          if (soundUrl) {
            playTrackedSound(soundUrl);
          } else {
            const freq = notifType === "sos_alert" ? 1200 :
                         notifType === "message_received" ? 800 : 880;
            playFallbackBeep(freq, 0.15);
          }
        }

        // Show drop-down browser notification (clickable to open app)
        if ("Notification" in window && Notification.permission === "granted") {
          // For trip requests: always show with sound so the driver sees the drop-down
          const isCritical = ["trip_requested", "sos_alert"].includes(notifType);
          const shouldBeSilent = isCritical ? false : !document.hidden;
          const notif = new Notification(msgTitle, {
            body: msgBody,
            icon: "/pwa-192x192.png",
            tag: isCritical ? `${notifType}-${Date.now()}` : notifType,
            requireInteraction: isCritical,
            silent: shouldBeSilent,
          });
          // Click to focus/open the app
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        }
      });

      // Listen for SW messages (background → foreground sound bridge)
      if ("serviceWorker" in navigator && !swListenerRef.current) {
        swListenerRef.current = true;
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "PLAY_NOTIFICATION_SOUND" && event.data?.sound_url) {
            const notifType = event.data.notification_type || event.data.sound_category || "";
            // For trip_requested: only play via SW bridge when page is hidden/minimized
            // (when visible, DriverApp.handleNewTrip handles it via realtime)
            if (notifType === "trip_requested") {
              if (!document.hidden) {
                console.log("SW sound bridge: skipping trip_requested (page visible, realtime handles it)");
                return;
              }
              console.log("SW sound bridge: playing trip_requested (page hidden/minimized)");
              playTrackedSound(event.data.sound_url, true);
              return;
            }
            const shouldLoop = notifType === "sos_alert";
            console.log("SW sound bridge: playing", event.data.sound_category, shouldLoop ? "(looping)" : "");
            playTrackedSound(event.data.sound_url, shouldLoop);
          }
        });

        // iOS fix: when PWA comes back to foreground, check for sounds
        // that were queued while the app was suspended
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden && navigator.serviceWorker.controller) {
            const channel = new MessageChannel();
            channel.port1.onmessage = (msgEvent) => {
              const sounds = msgEvent.data?.sounds || [];
              if (sounds.length > 0) {
                const fiveMinAgo = Date.now() - 5 * 60 * 1000;
                // Play the most recent relevant sound
                const recent = sounds.filter((s: any) => s.timestamp > fiveMinAgo);
                if (recent.length > 0) {
                  const latest = recent[recent.length - 1];
                  console.log("Replaying pending sound from SW:", latest.notification_type);
                  const shouldLoop = latest.notification_type === "trip_requested" || latest.notification_type === "sos_alert";
                  playTrackedSound(latest.sound_url, shouldLoop);
                }
              }
            };
            navigator.serviceWorker.controller.postMessage(
              { type: "GET_PENDING_SOUNDS" },
              [channel.port2]
            );
          }
        });
      }
    } catch (err) {
      console.error("Web push setup failed:", err);
    }
  }, [userId, userType]);

  useEffect(() => {
    if (!userId) return;
    registeredRef.current = false;

    if (Capacitor.isNativePlatform()) {
      // Native: use Capacitor Push Notifications
      const setupNative = async () => {
        try {
          const { PushNotifications } = await import("@capacitor/push-notifications");

          let permResult;
          try {
            permResult = await PushNotifications.checkPermissions();
          } catch {
            console.warn("Push permission check failed");
            return;
          }

          // If not yet determined, request
          if (permResult.receive === "prompt") {
            try {
              permResult = await PushNotifications.requestPermissions();
            } catch {
              console.warn("Push permission request failed");
              return;
            }
          }

          if (permResult.receive !== "granted") {
            console.warn("Push notification permission denied");
            return;
          }

          // Ensure Android channels exist for reliable background sound/alerts
          try {
            await PushNotifications.createChannel({
              id: "trip_requests_v2",
              name: "Trip Requests",
              description: "Incoming trip requests",
              importance: 5,
              visibility: 1,
              sound: "default",
              vibration: true,
            });
            await PushNotifications.createChannel({
              id: "sos_alerts_v2",
              name: "SOS Alerts",
              description: "Emergency alerts",
              importance: 5,
              visibility: 1,
              sound: "default",
              vibration: true,
            });
            await PushNotifications.createChannel({
              id: "general_v2",
              name: "General Notifications",
              description: "General app notifications",
              importance: 4,
              visibility: 1,
              sound: "default",
              vibration: true,
            });
          } catch {
            // iOS or unsupported platform
          }

          await PushNotifications.register();

          PushNotifications.addListener("registration", async (token) => {
            try {
              console.log("FCM Token (native):", token.value);
              const deviceType = Capacitor.getPlatform() === "ios" ? "ios" : "android";
              await registerDeviceToken(userId, token.value, userType, deviceType);
            } catch (err) {
              console.error("Failed to register device token:", err);
            }
          });

          PushNotifications.addListener("registrationError", (error) => {
            console.error("Push registration error:", error);
          });

          // Native foreground: play custom sound
          PushNotifications.addListener("pushNotificationReceived", (notification) => {
            try {
              console.log("Push received (foreground):", notification);
              const soundUrl = notification.data?.sound_url;
              if (soundUrl) {
                playTrackedSound(soundUrl);
              } else {
                playFallbackBeep();
              }
            } catch (err) {
              console.error("Foreground notification handler error:", err);
            }
          });

          PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
            console.log("Push action:", action);
          });
        } catch (err) {
          console.error("Native push setup failed:", err);
        }
      };
      setupNative();
    } else {
      // Web: try immediately, and also listen for permission changes
      setupWeb();

      const interval = setInterval(() => {
        if (registeredRef.current) {
          clearInterval(interval);
          return;
        }
        if ("Notification" in window && Notification.permission === "granted") {
          setupWeb();
        }
      }, 2000);

      return () => {
        clearInterval(interval);
        if (swUpdateTimerRef.current !== null) {
          clearInterval(swUpdateTimerRef.current);
          swUpdateTimerRef.current = null;
        }
      };
    }
  }, [userId, userType, setupWeb]);
};
