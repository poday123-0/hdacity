import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Download, AlertTriangle } from "lucide-react";

interface VersionConfig {
  android_latest_version: string;
  android_min_version: string;
  ios_latest_version: string;
  ios_min_version: string;
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

const BUILD_VERSION = import.meta.env.VITE_APP_VERSION || "";

function isNativePlatform(): boolean {
  try {
    // Check Capacitor bridge
    if ((window as any).Capacitor?.isNativePlatform?.()) return true;
    // Check if running inside a Capacitor WebView (even when loading remote URL)
    if ((window as any).Capacitor?.getPlatform && (window as any).Capacitor.getPlatform() !== "web") return true;
    // Check for Capacitor-injected properties
    if ((window as any)._capacitor || (window as any).Capacitor) return true;
    // Check user agent for native WebView indicators
    const ua = navigator.userAgent;
    if (ua.includes("CapacitorApp") || ua.includes("HdaApp")) return true;
    // Check if standalone display mode (installed PWA or WebView)
    if (window.matchMedia("(display-mode: standalone)").matches && /android|iphone|ipad/i.test(ua)) return true;
    // Check localStorage flag set by native app
    if (localStorage.getItem("native_app_platform")) return true;
  } catch {}
  return false;
}

function getPlatform(): "android" | "ios" | "web" {
  // Check Capacitor bridge first
  try {
    const cap = (window as any).Capacitor;
    if (cap?.getPlatform) {
      const p = cap.getPlatform();
      if (p === "android" || p === "ios") return p;
    }
  } catch {}

  // Check localStorage (set by previous native detection)
  const cached = localStorage.getItem("native_app_platform");
  if (cached === "android" || cached === "ios") return cached;

  // Detect from user agent
  const ua = navigator.userAgent.toLowerCase();
  if (isNativePlatform()) {
    const platform = ua.includes("android") ? "android" : "ios";
    localStorage.setItem("native_app_platform", platform);
    return platform;
  }
  return "web";
}

async function getAppVersion(): Promise<string | null> {
  // 1. Try Capacitor App plugin first (most reliable)
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    if (info?.version) {
      localStorage.setItem("native_app_version", info.version);
      console.log("[VersionCheck] Capacitor version:", info.version);
      return info.version;
    }
  } catch (e) {
    console.log("[VersionCheck] Capacitor App.getInfo failed:", e);
  }

  // 2. Check localStorage (set by native bridge or previous detection)
  const cached = localStorage.getItem("native_app_version");
  if (cached) {
    console.log("[VersionCheck] Cached version:", cached);
    return cached;
  }

  // 3. Check meta tag
  const meta = document.querySelector('meta[name="app-version"]');
  if (meta?.getAttribute("content")) {
    console.log("[VersionCheck] Meta tag version:", meta.getAttribute("content"));
    return meta.getAttribute("content");
  }

  // 4. Build-time fallback
  if (BUILD_VERSION) {
    console.log("[VersionCheck] Build version:", BUILD_VERSION);
    return BUILD_VERSION;
  }

  // 5. If we know we're native but can't get version, use a very old default
  // so the update prompt can still show
  if (isNativePlatform()) {
    console.log("[VersionCheck] Native detected but no version found, using 0.0.0");
    return "0.0.0";
  }

  console.log("[VersionCheck] No version detected");
  return null;
}

const AppVersionCheck = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [config, setConfig] = useState<VersionConfig | null>(null);
  const [isForced, setIsForced] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    const platform = getPlatform();
    console.log("[VersionCheck] Platform:", platform, "isNative:", isNativePlatform());
    if (platform === "web") return;

    const appVersion = await getAppVersion();
    if (!appVersion) {
      console.log("[VersionCheck] Could not determine app version");
      return;
    }

    console.log("[VersionCheck] Current app version:", appVersion);

    const { data, error } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "app_version_control")
      .single();

    if (error || !data?.value) {
      console.log("[VersionCheck] No version config found:", error?.message);
      return;
    }

    const vc = data.value as unknown as VersionConfig;
    console.log("[VersionCheck] Server config:", JSON.stringify(vc));
    setConfig(vc);

    // Pick platform-specific versions
    const latestVersion = platform === "ios" ? vc.ios_latest_version : vc.android_latest_version;
    const minVersion = platform === "ios" ? vc.ios_min_version : vc.android_min_version;

    if (!latestVersion || !minVersion) {
      console.log("[VersionCheck] No version config for platform:", platform);
      return;
    }

    // Check if current version is below minimum — always forced
    if (compareVersions(appVersion, minVersion) < 0) {
      console.log("[VersionCheck] Below min_version, forcing update");
      setIsForced(true);
      setShowPrompt(true);
      setDismissed(false);
    }
    // Check if there's a newer version available
    else if (compareVersions(appVersion, latestVersion) < 0) {
      console.log("[VersionCheck] Below latest_version, force_update:", vc.force_update);
      setIsForced(vc.force_update);
      setShowPrompt(true);
      if (vc.force_update) setDismissed(false);
    } else {
      console.log("[VersionCheck] App is up to date");
    }
  }, []);

  useEffect(() => {
    // Initial check with a small delay to let Capacitor bridge initialize
    const timer = setTimeout(check, 1500);

    // Re-check when app comes back to foreground
    let cleanup: (() => void) | undefined;
    
    const setupForegroundListener = async () => {
      try {
        const { App } = await import("@capacitor/app");
        const listener = await App.addListener("appStateChange", (state) => {
          if (state.isActive) {
            console.log("[VersionCheck] App resumed, re-checking...");
            check();
          }
        });
        cleanup = () => listener.remove();
      } catch {
        // Not in native — use visibilitychange as fallback
        const handler = () => {
          if (document.visibilityState === "visible") check();
        };
        document.addEventListener("visibilitychange", handler);
        cleanup = () => document.removeEventListener("visibilitychange", handler);
      }
    };

    setupForegroundListener();

    return () => {
      clearTimeout(timer);
      cleanup?.();
    };
  }, [check]);

  const handleUpdate = () => {
    if (!config) return;
    const platform = getPlatform();
    const url = platform === "ios" ? config.app_store_url : config.play_store_url;
    if (url) {
      // Use Capacitor Browser plugin or window.open
      try {
        import("@capacitor/app").then(() => {
          window.open(url, "_system");
        }).catch(() => {
          window.open(url, "_blank");
        });
      } catch {
        window.open(url, "_blank");
      }
    }
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
            {(() => {
              const p = getPlatform();
              const ver = p === "ios" ? config.ios_latest_version : config.android_latest_version;
              return ver ? <p className="text-xs text-muted-foreground mt-2">Version {ver}</p> : null;
            })()}
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
