import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Share2, Car, Users, Check, ArrowLeft, Smartphone } from "lucide-react";
import { motion } from "framer-motion";
import SystemLogo from "@/components/SystemLogo";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";
import ThemeToggle from "@/components/ThemeToggle";
import { toast } from "@/hooks/use-toast";

const APP_URL = "https://hdacity.lovable.app";

interface InstallProps {
  defaultTab?: "passenger" | "driver";
}

const Install = ({ defaultTab }: InstallProps) => {
  const navigate = useNavigate();
  useTheme();
  const { canInstall, isIOS, isInstalled, promptInstall } = usePWAInstall();
  const [appIconUrl, setAppIconUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadIcon = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .eq("key", "pwa_app_icon_url")
        .maybeSingle();
      if (data && typeof data.value === "string") setAppIconUrl(data.value);
    };
    loadIcon();
  }, []);

  const handleInstall = async () => {
    if (!isIOS && canInstall) await promptInstall();
  };

  const handleShare = async () => {
    const shareData = { title: "HDA TAXI", text: "Download HDA TAXI – Your ride, on time!", url: APP_URL };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      await navigator.clipboard.writeText(APP_URL);
      toast({ title: "Copied!", description: "App link copied to clipboard" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-br from-primary to-primary-dark pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-primary-foreground/15 flex items-center justify-center active:scale-95 transition-transform">
            <ArrowLeft className="w-4 h-4 text-primary-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary-foreground shadow-md flex items-center justify-center overflow-hidden ring-1 ring-primary-foreground/30">
              <SystemLogo className="w-6 h-6 object-contain" alt="HDA" />
            </div>
            <span className="text-sm font-black text-primary-foreground tracking-widest uppercase" style={{ fontFamily: "'Inter', system-ui, sans-serif", letterSpacing: "0.15em" }}>HDA TAXI</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full px-6 py-10">
        {/* App Icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="w-24 h-24 rounded-[28px] bg-primary/10 flex items-center justify-center overflow-hidden border-2 border-primary/20 shadow-lg shadow-primary/10 mb-5"
        >
          {appIconUrl ? (
            <img src={appIconUrl} alt="HDA TAXI" className="w-full h-full object-cover rounded-[28px]" />
          ) : (
            <SystemLogo className="w-14 h-14 object-contain" alt="HDA" />
          )}
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-8"
        >
          <h1 className="text-xl font-extrabold text-foreground">HDA Taxi</h1>
          <p className="text-sm text-muted-foreground mt-1">On Time · Every Time</p>
        </motion.div>

        {/* Status / Actions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full space-y-3"
        >
          {isInstalled ? (
            <>
              {/* Installed state */}
              <div className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary/10 border border-primary/20">
                <Check className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold text-primary">App Installed</span>
              </div>

              {/* Share button */}
              <button
                onClick={handleShare}
                className="w-full flex items-center justify-center gap-2.5 bg-primary text-primary-foreground font-bold py-4 rounded-2xl text-sm transition-all active:scale-[0.98] shadow-lg shadow-primary/25"
              >
                <Share2 className="w-5 h-5" />
                Share with Others
              </button>
            </>
          ) : (
            <>
              {/* Install button */}
              {canInstall && !isIOS && (
                <button
                  onClick={handleInstall}
                  className="w-full flex items-center justify-center gap-2.5 bg-primary text-primary-foreground font-bold py-4 rounded-2xl text-sm transition-all active:scale-[0.98] shadow-lg shadow-primary/25"
                >
                  <Download className="w-5 h-5" />
                  Install App
                </button>
              )}

              {/* iOS instructions */}
              {isIOS && (
                <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-primary" />
                    <span className="text-sm font-bold text-foreground">Install on iPhone</span>
                  </div>
                  <ol className="space-y-2 text-xs text-muted-foreground pl-1">
                    <li className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
                      <span>Tap the <strong className="text-foreground">Share</strong> button in Safari</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
                      <span>Scroll down and tap <strong className="text-foreground">Add to Home Screen</strong></span>
                    </li>
                    <li className="flex gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 text-[10px]">3</span>
                      <span>Tap <strong className="text-foreground">Add</strong> to confirm</span>
                    </li>
                  </ol>
                </div>
              )}

              {/* Fallback: no install prompt available (desktop browser etc.) */}
              {!canInstall && !isIOS && (
                <div className="bg-card border border-border rounded-2xl p-4 text-center space-y-2">
                  <Smartphone className="w-6 h-6 text-primary mx-auto" />
                  <p className="text-xs text-muted-foreground">Open this page on your phone to install the app</p>
                </div>
              )}

              {/* Share button (secondary) */}
              <button
                onClick={handleShare}
                className="w-full flex items-center justify-center gap-2.5 bg-surface text-foreground font-semibold py-3.5 rounded-2xl text-sm transition-all active:scale-[0.98] border border-border"
              >
                <Share2 className="w-4 h-4 text-primary" />
                Share App Link
              </button>
            </>
          )}
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="mt-10 grid grid-cols-2 gap-3 w-full"
        >
          {[
            { icon: Users, label: "Easy Booking", desc: "Book a ride in seconds" },
            { icon: Car, label: "Track Live", desc: "See your driver in real-time" },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-3 text-center">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xs font-bold text-foreground">{label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
            </div>
          ))}
        </motion.div>
      </main>

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-[10px] text-muted-foreground/60">HDA TAXI · On Time · Every Time</p>
      </div>
    </div>
  );
};

export default Install;
