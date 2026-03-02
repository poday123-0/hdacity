import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Download, Share2, Smartphone, Car, Users, Copy, Check, ExternalLink, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SystemLogo from "@/components/SystemLogo";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";
import ThemeToggle from "@/components/ThemeToggle";
import { toast } from "@/hooks/use-toast";

const PASSENGER_URL = "https://hdacity.lovable.app";
const DRIVER_URL = "https://hdacity.lovable.app/driver";

interface InstallProps {
  defaultTab?: "passenger" | "driver";
}

const Install = ({ defaultTab }: InstallProps) => {
  const navigate = useNavigate();
  useTheme();
  const { canInstall, isIOS, isInstalled, promptInstall } = usePWAInstall();
  const [passengerIconUrl, setPassengerIconUrl] = useState<string | null>(null);
  const [driverIconUrl, setDriverIconUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"passenger" | "driver">(defaultTab || "passenger");

  useEffect(() => {
    const loadIcons = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["pwa_app_icon_url", "driver_app_icon_url"]);
      data?.forEach((s: any) => {
        if (s.key === "pwa_app_icon_url" && typeof s.value === "string") setPassengerIconUrl(s.value);
        if (s.key === "driver_app_icon_url" && typeof s.value === "string") setDriverIconUrl(s.value);
      });
    };
    loadIcons();
  }, []);

  const currentUrl = activeTab === "passenger" ? PASSENGER_URL : DRIVER_URL;
  const currentLabel = activeTab === "passenger" ? "Passenger" : "Driver";
  const currentIcon = activeTab === "passenger" ? passengerIconUrl : driverIconUrl;

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(url);
    toast({ title: "Copied!", description: "Link copied to clipboard" });
    setTimeout(() => setCopied(null), 2000);
  };

  const handleShare = async (url: string, title: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `HDA TAXI - ${title}`, text: `Download HDA TAXI ${title}`, url });
      } catch {}
    } else {
      handleCopy(url);
    }
  };

  const handleInstall = async () => {
    if (!isIOS && canInstall) await promptInstall();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-br from-primary to-primary-dark pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-primary-foreground/15 flex items-center justify-center active:scale-95 transition-transform">
            <ArrowLeft className="w-4 h-4 text-primary-foreground" />
          </button>
          <div className="flex items-center gap-1.5">
            <SystemLogo className="w-6 h-6 object-contain" alt="HDA" />
            <span className="text-sm font-extrabold text-primary-foreground tracking-tight">HDA TAXI</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {/* Compact Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden border border-primary/20">
            {currentIcon ? (
              <img src={currentIcon} alt={currentLabel} className="w-full h-full object-cover rounded-2xl" />
            ) : (
              <SystemLogo className="w-9 h-9 object-contain" alt="HDA" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-extrabold text-foreground leading-tight">Get HDA Taxi</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Install the app for the best experience</p>
            {isInstalled && (
              <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-primary">
                <Check className="w-3 h-3" /> Installed
              </span>
            )}
          </div>
        </motion.div>

        {/* Install CTA */}
        {canInstall && !isInstalled && !isIOS && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={handleInstall}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98] shadow-md shadow-primary/20"
          >
            <Download className="w-4 h-4" />
            Install Now
          </motion.button>
        )}

        {/* Tab Switcher */}
        <div className="flex gap-1 bg-surface rounded-xl p-1">
          {[
            { key: "passenger" as const, label: "Passenger", icon: Users },
            { key: "driver" as const, label: "Driver", icon: Car },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* QR + Actions Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="bg-card border border-border rounded-2xl overflow-hidden"
          >
            {/* QR Section */}
            <div className="flex items-center justify-center py-5 bg-gradient-to-b from-surface/50 to-transparent">
              <div className="bg-card p-3 rounded-xl shadow-sm border border-border">
                <QRCodeSVG
                  value={currentUrl}
                  size={140}
                  level="H"
                  includeMargin={false}
                  imageSettings={currentIcon ? { src: currentIcon, height: 28, width: 28, excavate: true } : undefined}
                />
              </div>
            </div>

            <div className="px-4 pb-4 space-y-3">
              {/* Scan instruction */}
              <p className="text-[11px] text-muted-foreground text-center">
                Scan QR code or share the link below
              </p>

              {/* URL Bar */}
              <div className="flex items-center gap-1.5 bg-surface rounded-lg px-2.5 py-2">
                <span className="flex-1 text-[11px] text-muted-foreground truncate font-mono">{currentUrl}</span>
                <button
                  onClick={() => handleCopy(currentUrl)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-card border border-border text-[10px] font-semibold text-foreground hover:bg-muted transition-colors shrink-0"
                >
                  {copied === currentUrl ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                  {copied === currentUrl ? "Done" : "Copy"}
                </button>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleShare(currentUrl, currentLabel)}
                  className="flex items-center justify-center gap-1.5 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl text-xs transition-all active:scale-[0.98]"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share Link
                </button>
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 bg-surface text-foreground font-semibold py-2.5 rounded-xl text-xs transition-all active:scale-[0.98] border border-border hover:bg-muted"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Link
                </a>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Share Both Apps */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Share with others</h3>
          {[
            { label: "Passenger App", desc: "For riders", url: PASSENGER_URL, icon: Users, iconUrl: passengerIconUrl },
            { label: "Driver App", desc: "For drivers", url: DRIVER_URL, icon: Car, iconUrl: driverIconUrl },
          ].map(({ label, desc, url, icon: Icon, iconUrl }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                {iconUrl ? (
                  <img src={iconUrl} alt={label} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  <Icon className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => handleCopy(url)}
                  className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform border border-border"
                >
                  {copied === url ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
                <button
                  onClick={() => handleShare(url, label)}
                  className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Share2 className="w-3.5 h-3.5 text-primary-foreground" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center pt-2 pb-4">
          <p className="text-[10px] text-muted-foreground/60">HDA TAXI · On Time · Every Time</p>
        </div>
      </main>
    </div>
  );
};

export default Install;
