import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Smartphone, Star, ExternalLink, Apple, Play } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const DISMISS_KEY = "hda_native_app_promo_dismiss";
const SHOW_DELAY_MS = 5000;
const REPROMPT_DAYS = 7; // re-show after this many days when user clicks "Not now"
const HDA_LANDING = "https://hda.taxi";

type Platform = "android" | "ios" | "other";

const detectPlatform = (): Platform => {
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/i.test(ua) && !(window as any).MSStream) return "ios";
  return "other";
};

const NativeAppPromoPrompt = () => {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [playStoreUrl, setPlayStoreUrl] = useState<string>("");
  const [appStoreUrl, setAppStoreUrl] = useState<string>("");
  const [appIconUrl, setAppIconUrl] = useState<string | null>(null);
  const [appName, setAppName] = useState("HDA TAXI");
  const platform = detectPlatform();

  // Don't show in native app — they already have it installed
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isNative) return;

    // Respect dismiss
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const ageMs = Date.now() - Number(dismissedAt);
      if (Number.isFinite(ageMs) && ageMs < REPROMPT_DAYS * 24 * 3600 * 1000) {
        setDismissed(true);
        return;
      }
    }

    // Load store URLs + branding
    supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["app_version_control", "pwa_app_icon_url", "system_app_name"])
      .then(({ data }) => {
        let resolvedPlay = "";
        let resolvedApp = "";
        data?.forEach((row: any) => {
          if (row.key === "app_version_control" && row.value && typeof row.value === "object") {
            resolvedPlay = row.value.play_store_url || "";
            resolvedApp = row.value.app_store_url || "";
          }
          if (row.key === "pwa_app_icon_url" && typeof row.value === "string") setAppIconUrl(row.value);
          if (row.key === "system_app_name" && typeof row.value === "string") setAppName(row.value);
        });
        setPlayStoreUrl(resolvedPlay);
        setAppStoreUrl(resolvedApp);
      });
  }, [isNative]);

  useEffect(() => {
    if (isNative || dismissed) return;
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [isNative, dismissed]);

  if (isNative || dismissed || !visible) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleOpenStore = (url: string) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
    handleDismiss();
  };

  const handleOpenLanding = () => {
    window.open(HDA_LANDING, "_blank", "noopener,noreferrer");
    handleDismiss();
  };

  return (
    <AnimatePresence>
      <motion.div
        key="native-promo-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
        onClick={handleDismiss}
      />

      <motion.div
        key="native-promo-card"
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 300, delay: 0.1 }}
        className="fixed bottom-0 left-0 right-0 z-[9999]"
      >
        <div
          className="bg-card rounded-t-3xl shadow-[0_-8px_50px_rgba(0,0,0,0.3)] overflow-hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          <div className="px-5 pb-5 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-4">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", delay: 0.2, stiffness: 400, damping: 20 }}
                className="w-16 h-16 rounded-[18px] bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 border border-border shadow-lg"
              >
                {appIconUrl ? (
                  <img src={appIconUrl} alt={appName} className="w-full h-full object-cover" />
                ) : (
                  <Smartphone className="w-7 h-7 text-primary" />
                )}
              </motion.div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-foreground leading-tight truncate">
                      Get the {appName} app
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Smoother rides, faster bookings, full features
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className="w-3 h-3 fill-warning text-warning" />
                      ))}
                      <span className="text-[10px] text-muted-foreground ml-1">Free download</span>
                    </div>
                  </div>
                  <button
                    onClick={handleDismiss}
                    className="p-1.5 rounded-full bg-muted/60 hover:bg-muted transition-colors shrink-0 -mt-0.5"
                    aria-label="Close"
                  >
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>

            {/* Benefits */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex gap-3"
            >
              {[
                { icon: "🔔", label: "Push alerts" },
                { icon: "📍", label: "Live tracking" },
                { icon: "⚡", label: "Faster" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex-1 bg-surface rounded-xl py-2.5 px-2 flex flex-col items-center gap-1 border border-border/50"
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground text-center">{item.label}</span>
                </div>
              ))}
            </motion.div>

            {/* Action buttons */}
            <div className="space-y-2">
              {platform === "android" && playStoreUrl && (
                <button
                  onClick={() => handleOpenStore(playStoreUrl)}
                  className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-2xl text-sm transition-all active:scale-[0.98] hover:opacity-90 flex items-center justify-center gap-2 shadow-lg"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Get on Google Play
                </button>
              )}

              {platform === "ios" && appStoreUrl && (
                <button
                  onClick={() => handleOpenStore(appStoreUrl)}
                  className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-2xl text-sm transition-all active:scale-[0.98] hover:opacity-90 flex items-center justify-center gap-2 shadow-lg"
                >
                  <Apple className="w-4 h-4 fill-current" />
                  Download on App Store
                </button>
              )}

              {/* Desktop / unknown platform → both store buttons if available */}
              {platform === "other" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {playStoreUrl && (
                    <button
                      onClick={() => handleOpenStore(playStoreUrl)}
                      className="bg-primary text-primary-foreground font-bold py-3 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.98]"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Google Play
                    </button>
                  )}
                  {appStoreUrl && (
                    <button
                      onClick={() => handleOpenStore(appStoreUrl)}
                      className="bg-foreground text-background font-bold py-3 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.98]"
                    >
                      <Apple className="w-4 h-4 fill-current" />
                      App Store
                    </button>
                  )}
                </div>
              )}

              {/* Always show hda.taxi as a fallback / landing link */}
              <button
                onClick={handleOpenLanding}
                className="w-full bg-surface border border-border text-foreground font-semibold py-2.5 rounded-2xl text-xs flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Visit hda.taxi
              </button>

              <button
                onClick={handleDismiss}
                className="w-full text-xs text-muted-foreground font-medium py-2 active:opacity-70"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NativeAppPromoPrompt;
