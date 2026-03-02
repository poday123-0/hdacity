import { useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { registerDeviceToken } from "@/lib/push-notifications";

/**
 * Hook to register push notification token for the current user.
 * Works on both web (Firebase) and native (Capacitor).
 * Re-attempts registration when notification permission is granted.
 */
export const usePushNotifications = (
  userId: string | undefined,
  userType: "driver" | "passenger" | "admin" | "dispatcher"
) => {
  const registeredRef = useRef(false);

  const setupWeb = useCallback(async () => {
    if (!userId || registeredRef.current) return;

    // Check permission first — if not granted yet, wait for it
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

      onMessage(messaging, (payload) => {
        console.log("Foreground message:", payload);
        const msgTitle = payload.notification?.title || payload.data?.title || "Notification";
        const msgBody = payload.notification?.body || payload.data?.body || "";
        const soundUrl = payload.data?.sound_url;

        if (soundUrl) {
          try {
            const audio = new Audio(soundUrl);
            audio.play().catch(() => {});
          } catch {}
        }

        new Notification(msgTitle, {
          body: msgBody,
          icon: "/pwa-192x192.png",
          silent: !!soundUrl,
        });
      });

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "PLAY_NOTIFICATION_SOUND" && event.data?.sound_url) {
            try {
              const audio = new Audio(event.data.sound_url);
              audio.play().catch(() => {});
            } catch {}
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

          const permResult = await PushNotifications.requestPermissions();
          if (permResult.receive !== "granted") {
            console.warn("Push notification permission denied");
            return;
          }

          await PushNotifications.register();

          PushNotifications.addListener("registration", async (token) => {
            console.log("FCM Token (native):", token.value);
            const deviceType = Capacitor.getPlatform() === "ios" ? "ios" : "android";
            await registerDeviceToken(userId, token.value, userType, deviceType);
          });

          PushNotifications.addListener("registrationError", (error) => {
            console.error("Push registration error:", error);
          });

          PushNotifications.addListener("pushNotificationReceived", (notification) => {
            console.log("Push received (foreground):", notification);
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

      // Poll for permission changes (covers the case where user grants via our prompt)
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
