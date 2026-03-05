import { useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { registerDeviceToken } from "@/lib/push-notifications";
import { playSound, playFallbackBeep } from "@/lib/sound-utils";

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
          swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
          console.log("Firebase SW registered:", swRegistration.scope);

          // Check for updates every 60 seconds — forces new SW to install
          setInterval(() => {
            swRegistration?.update().catch(() => {});
          }, 60_000);

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

        // Play admin-configured sound, fallback to beep
        if (soundUrl) {
          playSound(soundUrl);
        } else {
          // Use different beep tones for different event types
          const freq = notifType === "trip_requested" ? 1000 :
                       notifType === "sos_alert" ? 1200 :
                       notifType === "message_received" ? 800 : 880;
          playFallbackBeep(freq, notifType === "trip_requested" ? 0.3 : 0.15);
        }

        // Show browser notification (silent since we play our own sound)
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(msgTitle, {
            body: msgBody,
            icon: "/pwa-192x192.png",
            silent: true, // Always silent — we handle sound ourselves
          });
        }
      });

      // Listen for SW messages (background → foreground sound bridge)
      if ("serviceWorker" in navigator && !swListenerRef.current) {
        swListenerRef.current = true;
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "PLAY_NOTIFICATION_SOUND" && event.data?.sound_url) {
            console.log("SW sound bridge: playing", event.data.sound_category);
            playSound(event.data.sound_url);
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
                playSound(soundUrl);
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

      return () => clearInterval(interval);
    }
  }, [userId, userType, setupWeb]);
};
