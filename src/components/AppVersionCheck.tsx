import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Download, AlertTriangle, X } from "lucide-react";

interface VersionConfig {
  latest_version: string;
  min_version: string;
  force_update: boolean;
  play_store_url: string;
  app_store_url: string;
  update_message: string;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// Build-time version fallback — set VITE_APP_VERSION in .env or build command
const BUILD_VERSION = import.meta.env.VITE_APP_VERSION || "";

async function getAppVersion(): Promise<string | null> {
  // 1. Check localStorage (set by native bridge or previous detection)
  const cached = localStorage.getItem("native_app_version");
  if (cached) return cached;

  // 2. Check meta tag
  const meta = document.querySelector('meta[name="app-version"]');
  if (meta?.getAttribute("content")) return meta.getAttribute("content");

  // 3. Try Capacitor App plugin (dynamically imported)
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    if (info?.version) {
      localStorage.setItem("native_app_version", info.version);
      return info.version;
    }
  } catch {}

  // 4. Build-time fallback
  if (BUILD_VERSION) return BUILD_VERSION;

  return null;
}

function getPlatform(): "android" | "ios" | "web" {
  const ua = navigator.userAgent.toLowerCase();
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    return ua.includes("android") ? "android" : "ios";
  }
  return "web";
}

const AppVersionCheck = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [config, setConfig] = useState<VersionConfig | null>(null);
  const [isForced, setIsForced] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = async () => {
      const platform = getPlatform();
      if (platform === "web") return; // Only check for native apps

      const appVersion = getAppVersion();
      if (!appVersion) return;

      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "app_version_control")
        .single();

      if (!data?.value) return;

      const vc = data.value as unknown as VersionConfig;
      setConfig(vc);

      // Check if current version is below minimum
      if (compareVersions(appVersion, vc.min_version) < 0) {
        setIsForced(true);
        setShowPrompt(true);
      }
      // Check if there's a newer version available
      else if (compareVersions(appVersion, vc.latest_version) < 0) {
        setIsForced(vc.force_update);
        setShowPrompt(true);
      }
    };

    check();
  }, []);

  const handleUpdate = () => {
    if (!config) return;
    const platform = getPlatform();
    const url = platform === "ios" ? config.app_store_url : config.play_store_url;
    if (url) window.open(url, "_blank");
  };

  if (!showPrompt || !config || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-border"
        >
          <div className="bg-primary/10 px-6 pt-6 pb-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-3">
              {isForced ? (
                <AlertTriangle className="w-7 h-7 text-primary" />
              ) : (
                <Download className="w-7 h-7 text-primary" />
              )}
            </div>
            <h3 className="text-lg font-bold text-foreground">
              {isForced ? "Update Required" : "Update Available"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {config.update_message || (isForced
                ? "Please update the app to continue using it."
                : "A new version is available with improvements and fixes.")}
            </p>
            {config.latest_version && (
              <p className="text-xs text-muted-foreground mt-2">
                Version {config.latest_version}
              </p>
            )}
          </div>

          <div className="px-6 py-4 space-y-2">
            <button
              onClick={handleUpdate}
              className="w-full py-3 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Update Now
            </button>
            {!isForced && (
              <button
                onClick={() => setDismissed(true)}
                className="w-full py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
              >
                Later
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AppVersionCheck;
