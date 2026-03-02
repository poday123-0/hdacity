import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Download, Share2, Smartphone, Car, Users, ChevronRight, Copy, Check, ExternalLink, Apple, Chrome, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import SystemLogo from "@/components/SystemLogo";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";
import ThemeToggle from "@/components/ThemeToggle";

const PASSENGER_URL = "https://app.hda.taxi";
const DRIVER_URL = "https://app.hda.taxi/driver";

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
  const currentLabel = activeTab === "passenger" ? "Passenger App" : "Driver App";
  const currentIcon = activeTab === "passenger" ? passengerIconUrl : driverIconUrl;

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(url);
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
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-surface flex items-center justify-center active:scale-95 transition-transform">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <SystemLogo className="w-8 h-8 object-contain" alt="HDA Taxi" />
            <span className="text-lg font-extrabold tracking-tight text-foreground">HDA</span>
            <span className="text-lg font-extrabold tracking-tight text-primary">TAXI</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-3"
        >
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto overflow-hidden border-2 border-primary/20 shadow-lg">
            {currentIcon ? (
              <img src={currentIcon} alt={currentLabel} className="w-full h-full object-cover rounded-2xl" />
            ) : (
              <SystemLogo className="w-12 h-12 object-contain" alt="HDA TAXI" />
            )}
          </div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Install {currentLabel}</h1>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">Get the app on your phone for the best experience. Works offline, loads instantly.</p>

          {isInstalled && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <Check className="w-3.5 h-3.5" /> App is installed
            </div>
          )}
        </motion.div>

        {/* App Tabs */}
        <div className="flex gap-2 bg-surface rounded-2xl p-1.5">
          {[
            { key: "passenger" as const, label: "Passenger App", icon: Users },
            { key: "driver" as const, label: "Driver App", icon: Car },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === key
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* QR Code */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="bg-card border border-border rounded-2xl p-6 space-y-4"
        >
          <div className="text-center space-y-1">
            <h2 className="text-base font-bold text-foreground">Scan to open {currentLabel}</h2>
            <p className="text-xs text-muted-foreground">Point your phone's camera at the QR code</p>
          </div>

          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-2xl shadow-inner">
              <QRCodeSVG
                value={currentUrl}
                size={180}
                level="H"
                includeMargin={false}
                imageSettings={currentIcon ? {
                  src: currentIcon,
                  height: 36,
                  width: 36,
                  excavate: true,
                } : undefined}
              />
            </div>
          </div>

          {/* URL + Copy */}
          <div className="flex items-center gap-2 bg-surface rounded-xl px-3 py-2.5">
            <span className="flex-1 text-xs text-muted-foreground truncate font-mono">{currentUrl}</span>
            <button
              onClick={() => handleCopy(currentUrl)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-card border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors shrink-0"
            >
              {copied === currentUrl ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === currentUrl ? "Copied" : "Copy"}
            </button>
          </div>

          {/* Share Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleShare(currentUrl, currentLabel)}
              className="flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-3 rounded-xl text-sm transition-all active:scale-[0.98] hover:opacity-90"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-surface text-foreground font-bold py-3 rounded-xl text-sm transition-all active:scale-[0.98] hover:bg-muted border border-border"
            >
              <ExternalLink className="w-4 h-4" />
              Open
            </a>
          </div>
        </motion.div>

        {/* Install Button (if available) */}
        {canInstall && !isInstalled && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {isIOS ? null : (
              <button
                onClick={handleInstall}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-4 rounded-2xl text-base transition-all active:scale-[0.98] hover:opacity-90 shadow-lg shadow-primary/20"
              >
                <Download className="w-5 h-5" />
                Install App Now
              </button>
            )}
          </motion.div>
        )}


        {/* Share Both Apps Section */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">Share with Others</h2>
          <div className="grid grid-cols-1 gap-3">
            {[
              { label: "Passenger App", desc: "For riders looking for a taxi", url: PASSENGER_URL, icon: Users, iconUrl: passengerIconUrl },
              { label: "Driver App", desc: "For drivers to accept trips", url: DRIVER_URL, icon: Car, iconUrl: driverIconUrl },
            ].map(({ label, desc, url, icon: Icon, iconUrl }) => (
              <div key={label} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {iconUrl ? (
                    <img src={iconUrl} alt={label} className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <Icon className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => handleCopy(url)}
                    className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform border border-border"
                  >
                    {copied === url ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  <button
                    onClick={() => handleShare(url, label)}
                    className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <Share2 className="w-4 h-4 text-primary-foreground" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-4 space-y-1">
          <p className="text-xs text-muted-foreground">HDA TAXI · On Time . Every Time</p>
          <p className="text-[10px] text-muted-foreground/60">© {new Date().getFullYear()} HDA Taxi. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
};

export default Install;
