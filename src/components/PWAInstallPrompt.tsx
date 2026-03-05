import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share, Plus, Smartphone, ArrowDown, MoreVertical, Menu } from "lucide-react";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { supabase } from "@/integrations/supabase/client";

const DISMISS_KEY = "hda_pwa_dismiss";
const SHOW_DELAY_MS = 3000;

const getBrowserInstructions = (browser: string) => {
  switch (browser) {
    case "samsung":
      return [
        { step: "1", text: <>Tap the <strong>menu icon</strong> (☰) at the bottom</>, icon: <Menu className="w-4 h-4 text-primary shrink-0" /> },
        { step: "2", text: <>Tap <strong>"Add page to"</strong> → <strong>"Home screen"</strong></>, icon: <Plus className="w-4 h-4 text-primary shrink-0" /> },
        { step: "3", text: <>Tap <strong>Add</strong> to confirm</>, icon: <ArrowDown className="w-4 h-4 text-primary shrink-0" /> },
      ];
    case "firefox":
      return [
        { step: "1", text: <>Tap the <strong>⋮ menu</strong> (3 dots) at the top right</>, icon: <MoreVertical className="w-4 h-4 text-primary shrink-0" /> },
        { step: "2", text: <>Tap <strong>"Install"</strong> or <strong>"Add to Home screen"</strong></>, icon: <Download className="w-4 h-4 text-primary shrink-0" /> },
        { step: "3", text: <>Tap <strong>Add</strong> to confirm</>, icon: <ArrowDown className="w-4 h-4 text-primary shrink-0" /> },
      ];
    case "opera":
      return [
        { step: "1", text: <>Tap the <strong>⋮ menu</strong> (3 dots)</>, icon: <MoreVertical className="w-4 h-4 text-primary shrink-0" /> },
        { step: "2", text: <>Tap <strong>"Add to Home screen"</strong></>, icon: <Plus className="w-4 h-4 text-primary shrink-0" /> },
        { step: "3", text: <>Tap <strong>Add</strong> to confirm</>, icon: <ArrowDown className="w-4 h-4 text-primary shrink-0" /> },
      ];
    default: // chrome, edge, other
      return [
        { step: "1", text: <>Tap the <strong>⋮ menu</strong> (3 dots) in your browser</>, icon: <MoreVertical className="w-4 h-4 text-primary shrink-0" /> },
        { step: "2", text: <>Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong></>, icon: <Download className="w-4 h-4 text-primary shrink-0" /> },
        { step: "3", text: <>Tap <strong>Install</strong> to confirm</>, icon: <ArrowDown className="w-4 h-4 text-primary shrink-0" /> },
      ];
  }
};

const PWAInstallPrompt = () => {
  const { canInstall, isIOS, browser, promptInstall, hasNativePrompt } = usePWAInstall();
  const [dismissed, setDismissed] = useState(() => {
    const d = localStorage.getItem(DISMISS_KEY);
    if (!d) return false;
    return Date.now() - parseInt(d) < 3 * 24 * 60 * 60 * 1000;
  });
  const [appIconUrl, setAppIconUrl] = useState<string | null>(null);
  const [appName, setAppName] = useState("HDA TAXI");
  const [visible, setVisible] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["pwa_app_icon_url", "system_app_name"])
      .then(({ data }) => {
        data?.forEach((row: any) => {
          if (row.key === "pwa_app_icon_url" && typeof row.value === "string") setAppIconUrl(row.value);
          if (row.key === "system_app_name" && typeof row.value === "string") setAppName(row.value);
        });
      });
  }, []);

  useEffect(() => {
    if (!canInstall || dismissed) return;
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [canInstall, dismissed]);

  if (!canInstall || dismissed || !visible) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (isIOS) {
      setShowSteps(true);
      return;
    }
    if (hasNativePrompt) {
      setInstalling(true);
      const accepted = await promptInstall();
      setInstalling(false);
      if (accepted) handleDismiss();
      // Don't show manual steps — native prompt was available, user just declined
    } else {
      // No native prompt (Samsung Internet, Firefox, Opera, etc.) — show manual steps
      setShowSteps(true);
    }
  };

  const instructions = isIOS
    ? [
        { step: "1", text: <>Tap the <strong>Share</strong> button below</>, icon: <Share className="w-4 h-4 text-primary shrink-0" /> },
        { step: "2", text: <>Scroll down, tap <strong>Add to Home Screen</strong></>, icon: <Plus className="w-4 h-4 text-primary shrink-0" /> },
        { step: "3", text: <>Tap <strong>Add</strong> to confirm</>, icon: <ArrowDown className="w-4 h-4 text-primary shrink-0" /> },
      ]
    : getBrowserInstructions(browser);

  const browserLabel = isIOS ? "Safari" : browser === "samsung" ? "Samsung Internet" : browser === "firefox" ? "Firefox" : browser === "opera" ? "Opera" : browser === "edge" ? "Edge" : "your browser";

  return (
    <AnimatePresence>
      <motion.div
        key="pwa-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998]"
        onClick={handleDismiss}
      />

      <motion.div
        key="pwa-card"
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 300, delay: 0.1 }}
        className="fixed bottom-0 left-0 right-0 z-[9999] px-0 pb-0"
      >
        <div className="bg-card rounded-t-3xl shadow-[0_-8px_50px_rgba(0,0,0,0.3)] overflow-hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
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
                  <div>
                    <h3 className="text-base font-bold text-foreground leading-tight">{appName}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Fast, reliable rides at your fingertips</p>
                  </div>
                  <button onClick={handleDismiss} className="p-1.5 rounded-full bg-muted/60 hover:bg-muted transition-colors shrink-0 -mt-0.5">
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>

            {/* Benefits */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex gap-3">
              {[
                { icon: "⚡", label: "Faster" },
                { icon: "📱", label: "Home Screen" },
                { icon: "🔔", label: "Notifications" },
              ].map((item) => (
                <div key={item.label} className="flex-1 bg-surface rounded-xl py-2.5 px-2 flex flex-col items-center gap-1 border border-border/50">
                  <span className="text-base">{item.icon}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </motion.div>

            {/* Install action or manual steps */}
            <AnimatePresence mode="wait">
              {showSteps ? (
                <motion.div
                  key="manual-steps"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-2.5"
                >
                  <p className="text-xs font-bold text-foreground text-center">Follow these steps in {browserLabel}:</p>
                  <div className="bg-surface rounded-2xl p-3.5 space-y-3 border border-border/50">
                    {instructions.map((inst, i) => (
                      <div key={i}>
                        {i > 0 && <div className="w-full h-px bg-border/50 mb-3" />}
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-primary">{inst.step}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-1">
                            {inst.icon}
                            <span className="text-xs text-foreground">{inst.text}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleDismiss} className="w-full text-xs text-muted-foreground font-medium py-2 active:opacity-70">
                    I'll do it later
                  </button>
                </motion.div>
              ) : (
                <motion.div key="install-btn" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                  <button
                    onClick={handleInstall}
                    disabled={installing}
                    className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-2xl text-sm transition-all active:scale-[0.98] hover:opacity-90 flex items-center justify-center gap-2 shadow-lg disabled:opacity-70"
                  >
                    {installing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        Installing...
                      </>
                    ) : (
                      <>
                        <Download className="w-4.5 h-4.5" />
                        Install App
                      </>
                    )}
                  </button>
                  <button onClick={handleDismiss} className="w-full text-xs text-muted-foreground font-medium py-2 active:opacity-70">
                    Not now
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PWAInstallPrompt;
