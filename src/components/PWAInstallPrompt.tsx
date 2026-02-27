import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share, Plus } from "lucide-react";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { supabase } from "@/integrations/supabase/client";

const DISMISS_KEY = "hda_pwa_dismiss";

const PWAInstallPrompt = () => {
  const { canInstall, isIOS, promptInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(() => {
    const d = localStorage.getItem(DISMISS_KEY);
    if (!d) return false;
    // Allow re-show after 7 days
    return Date.now() - parseInt(d) < 7 * 24 * 60 * 60 * 1000;
  });
  const [appIconUrl, setAppIconUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "pwa_app_icon_url")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value && typeof data.value === "string") {
          setAppIconUrl(data.value);
        }
      });
  }, []);

  if (!canInstall || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (isIOS) return; // iOS shows instructions instead
    await promptInstall();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto z-[9999]"
      >
        <div className="bg-card border border-border rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.25)] p-4 space-y-3">
          <div className="flex items-start gap-3">
            {/* App Icon */}
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 border border-border">
              {appIconUrl ? (
                <img src={appIconUrl} alt="HDA TAXI" className="w-full h-full object-cover rounded-xl" />
              ) : (
                <Download className="w-6 h-6 text-primary" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Install HDA TAXI</h3>
                <button
                  onClick={handleDismiss}
                  className="p-1 rounded-lg hover:bg-muted transition-colors -mr-1 -mt-1"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isIOS
                  ? "Install the app for a better experience"
                  : "Get quick access from your home screen"}
              </p>
            </div>
          </div>

          {isIOS ? (
            <div className="bg-surface rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-foreground">How to install:</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Share className="w-4 h-4 text-primary shrink-0" />
                <span>Tap the <strong>Share</strong> button in Safari</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Plus className="w-4 h-4 text-primary shrink-0" />
                <span>Then tap <strong>Add to Home Screen</strong></span>
              </div>
            </div>
          ) : (
            <button
              onClick={handleInstall}
              className="w-full bg-primary text-primary-foreground font-bold py-2.5 rounded-xl text-sm transition-all active:scale-[0.98] hover:opacity-90 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Install App
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PWAInstallPrompt;
