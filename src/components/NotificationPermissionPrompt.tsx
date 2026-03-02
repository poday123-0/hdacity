import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";

const SNOOZE_UNTIL_KEY = "hda_notif_permission_snooze_until";

/**
 * Shows a prompt asking users to enable notifications on first app load.
 * Only shows if permission hasn't been granted or denied, and not previously dismissed.
 */
const NotificationPermissionPrompt = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;

    try {
      const snoozeUntilRaw = localStorage.getItem(SNOOZE_UNTIL_KEY);
      const snoozeUntil = snoozeUntilRaw ? Number(snoozeUntilRaw) : 0;
      if (snoozeUntil > Date.now()) return;
    } catch {}

    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleAllow = async () => {
    try {
      const result = await Notification.requestPermission();
      if (result === "granted") {
        console.log("Notification permission granted");
        try { localStorage.removeItem(SNOOZE_UNTIL_KEY); } catch {}
      }
    } catch (err) {
      console.warn("Permission request failed:", err);
    }
    setVisible(false);
  };

  const handleDismiss = () => {
    setVisible(false);
    // Snooze prompt for 6 hours, then ask again until granted/denied.
    try { localStorage.setItem(SNOOZE_UNTIL_KEY, String(Date.now() + 6 * 60 * 60 * 1000)); } catch {}
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
          <div className="rounded-2xl bg-card border border-border shadow-2xl p-4">
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-sm">Enable Notifications</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Get instant alerts for ride requests, trip updates, and important messages — even when the app is closed.
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleDismiss}
                className="flex-1 text-xs py-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
              >
                Not Now
              </button>
              <button
                onClick={handleAllow}
                className="flex-1 text-xs py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                Allow Notifications
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationPermissionPrompt;
