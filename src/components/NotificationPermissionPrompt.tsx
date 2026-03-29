import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, MapPin, X, Check, ChevronRight } from "lucide-react";
import { Capacitor } from "@capacitor/core";

const SNOOZE_UNTIL_KEY = "hda_permissions_snooze_until";
const PERMS_GRANTED_KEY = "hda_permissions_all_granted";

type PermissionStep = "intro" | "location" | "notification" | "done";

const isNative = Capacitor.isNativePlatform();

/**
 * Check if notification permission is already granted (works on both web and native).
 */
async function isNotifGranted(): Promise<boolean> {
  if (isNative) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const perm = await PushNotifications.checkPermissions();
      return perm.receive === "granted";
    } catch {
      return false;
    }
  }
  return "Notification" in window && Notification.permission === "granted";
}

/**
 * Check if notification permission is in "prompt" state (not yet asked).
 */
async function isNotifPromptable(): Promise<boolean> {
  if (isNative) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const perm = await PushNotifications.checkPermissions();
      return perm.receive === "prompt";
    } catch {
      return false;
    }
  }
  return "Notification" in window && Notification.permission === "default";
}

/**
 * Request notification permission (works on both web and native).
 */
async function requestNotifPermission(): Promise<boolean> {
  if (isNative) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const result = await PushNotifications.requestPermissions();
      return result.receive === "granted";
    } catch {
      return false;
    }
  }
  if (!("Notification" in window)) return false;
  try {
    const result = await Notification.requestPermission();
    if (result === "granted") {
      // Unlock audio pool in user gesture context so sounds play when minimized
      const { unlockAudioPool } = await import("@/lib/sound-manager");
      unlockAudioPool();
    }
    return result === "granted";
  } catch {
    return false;
  }
}

/**
 * Unified permission prompt — asks for both Location and Notification
 * permissions in a friendly two-step flow on first app load.
 * Works on both web (PWA) and native (Capacitor) platforms.
 */
const NotificationPermissionPrompt = () => {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<PermissionStep>("intro");
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkPermissions = async () => {
      const notifAlready = await isNotifGranted();
      
      let locGranted = false;
      if (isNative) {
        // On native, probe geolocation with a fast timeout
        try {
          await new Promise<void>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(() => resolve(), () => reject(), { timeout: 2000 });
          });
          locGranted = true;
        } catch {
          locGranted = false;
        }
      } else {
        try {
          if (navigator.permissions) {
            const result = await navigator.permissions.query({ name: "geolocation" as PermissionName });
            locGranted = result.state === "granted";
          }
        } catch {}
      }

      if (notifAlready && locGranted) return; // All good

      // Check snooze
      try {
        const snoozeUntilRaw = localStorage.getItem(SNOOZE_UNTIL_KEY);
        const snoozeUntil = snoozeUntilRaw ? Number(snoozeUntilRaw) : 0;
        if (snoozeUntil > Date.now()) return;
      } catch {}

      // Show after a short delay
      setTimeout(() => {
        if (cancelled) return;
        setLocationGranted(locGranted);
        setNotifGranted(notifAlready);
        setVisible(true);
      }, 1500);
    };

    checkPermissions();
    return () => { cancelled = true; };
  }, []);

  const handleRequestNotification = useCallback(async () => {
    try {
      const granted = await requestNotifPermission();
      setNotifGranted(granted);
      if (granted) {
        try { localStorage.removeItem(SNOOZE_UNTIL_KEY); } catch {}
      }
    } catch {
      setNotifGranted(false);
    }
    setStep("done");
    setTimeout(() => setVisible(false), 1800);
  }, []);

  const advanceAfterLocation = useCallback(async () => {
    const canPrompt = await isNotifPromptable();
    if (canPrompt) {
      setStep("notification");
    } else {
      const alreadyGranted = await isNotifGranted();
      setNotifGranted(alreadyGranted);
      setStep("done");
      setTimeout(() => setVisible(false), 1800);
    }
  }, []);

  const handleStart = useCallback(() => {
    if (!locationGranted) {
      setStep("location");
      navigator.geolocation.getCurrentPosition(
        () => {
          setLocationGranted(true);
          advanceAfterLocation();
        },
        () => {
          setLocationGranted(false);
          advanceAfterLocation();
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      advanceAfterLocation();
    }
  }, [locationGranted, advanceAfterLocation]);

  const handleDismiss = () => {
    setVisible(false);
    try { localStorage.setItem(SNOOZE_UNTIL_KEY, String(Date.now() + 3 * 60 * 60 * 1000)); } catch {}
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-20 left-4 right-4 z-[9999] mx-auto max-w-sm"
        >
          <div className="rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-primary/5 px-4 pt-4 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {step === "done" ? (
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Check className="w-4 h-4 text-emerald-600" />
                  </div>
                ) : (
                  <div className="flex -space-x-1.5">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                      locationGranted ? "bg-emerald-500/10" : "bg-primary/10"
                    }`}>
                      <MapPin className={`w-3.5 h-3.5 ${locationGranted ? "text-emerald-600" : "text-primary"}`} />
                    </div>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                      notifGranted ? "bg-emerald-500/10" : "bg-primary/10"
                    }`}>
                      <Bell className={`w-3.5 h-3.5 ${notifGranted ? "text-emerald-600" : "text-primary"}`} />
                    </div>
                  </div>
                )}
                <span className="text-sm font-semibold text-foreground">
                  {step === "done" ? "All Set!" : "Permissions Needed"}
                </span>
              </div>
              <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-3">
              <AnimatePresence mode="wait">
                {step === "intro" && (
                  <motion.div
                    key="intro"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-3"
                  >
                    <p className="text-xs text-muted-foreground">
                      For the best experience, we need two permissions:
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          locationGranted ? "bg-emerald-500/10" : "bg-blue-500/10"
                        }`}>
                          {locationGranted ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <MapPin className="w-4 h-4 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground">Location</p>
                          <p className="text-[10px] text-muted-foreground">Find nearby drivers & navigate</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          notifGranted ? "bg-emerald-500/10" : "bg-amber-500/10"
                        }`}>
                          {notifGranted ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Bell className="w-4 h-4 text-amber-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground">Notifications</p>
                          <p className="text-[10px] text-muted-foreground">Ride alerts & trip updates</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleDismiss}
                        className="flex-1 text-xs py-2.5 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
                      >
                        Later
                      </button>
                      <button
                        onClick={handleStart}
                        className="flex-1 text-xs py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
                      >
                        Enable <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === "location" && (
                  <motion.div
                    key="location"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="py-2 text-center"
                  >
                    <div className="w-12 h-12 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center mb-2">
                      <MapPin className="w-6 h-6 text-blue-600 animate-pulse" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Please allow location access…
                    </p>
                  </motion.div>
                )}

                {step === "notification" && (
                  <motion.div
                    key="notification"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                        <Bell className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">Allow Notifications</p>
                        <p className="text-[10px] text-muted-foreground">
                          Get instant ride requests, trip updates & messages
                        </p>
                      </div>
                    </div>
                    {locationGranted && (
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                        <Check className="w-3 h-3" />
                        <span>Location enabled</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setStep("done"); setTimeout(() => setVisible(false), 1500); }}
                        className="flex-1 text-xs py-2.5 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
                      >
                        Skip
                      </button>
                      <button
                        onClick={handleRequestNotification}
                        className="flex-1 text-xs py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                      >
                        Allow
                      </button>
                    </div>
                  </motion.div>
                )}

                {step === "done" && (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-3 text-center"
                  >
                    <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                      <Check className="w-6 h-6 text-emerald-600" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">You're all set!</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {locationGranted && notifGranted
                        ? "Location & notifications are enabled"
                        : locationGranted
                        ? "Location enabled. You can enable notifications in settings."
                        : notifGranted
                        ? "Notifications enabled. Enable location in settings for GPS."
                        : "You can enable permissions later in settings."}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationPermissionPrompt;
