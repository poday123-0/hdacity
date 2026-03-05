import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type BrowserType = "chrome" | "samsung" | "firefox" | "opera" | "edge" | "safari" | "other";

function detectBrowser(): BrowserType {
  const ua = navigator.userAgent.toLowerCase();
  if (/samsungbrowser/i.test(ua)) return "samsung";
  if (/opr|opera/i.test(ua)) return "opera";
  if (/edg/i.test(ua)) return "edge";
  if (/firefox|fxios/i.test(ua)) return "firefox";
  if (/crios|chrome/i.test(ua)) return "chrome";
  if (/safari/i.test(ua)) return "safari";
  return "other";
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [browser, setBrowser] = useState<BrowserType>("other");

  useEffect(() => {
    // Detect installed state — multiple methods for cross-browser support
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || window.matchMedia("(display-mode: fullscreen)").matches
      || (navigator as any).standalone === true  // iOS Safari
      || document.referrer.startsWith("android-app://"); // TWA

    setIsInstalled(isStandalone);

    // If installed via our prompt previously
    if (!isStandalone && localStorage.getItem("hda_pwa_installed") === "1") {
      // Don't trust localStorage alone — user may have uninstalled
      // Only mark installed if also in standalone mode
      localStorage.removeItem("hda_pwa_installed");
    }

    // Detect iOS
    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isiOS);
    setBrowser(detectBrowser());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    const onInstalled = () => {
      localStorage.setItem("hda_pwa_installed", "1");
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    // Listen for display mode changes (user installs from browser menu)
    const mql = window.matchMedia("(display-mode: standalone)");
    const onDisplayChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };
    mql.addEventListener?.("change", onDisplayChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
      mql.removeEventListener?.("change", onDisplayChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      localStorage.setItem("hda_pwa_installed", "1");
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
    return outcome === "accepted";
  }, [deferredPrompt]);

  // canInstall: true when NOT already installed (running in browser)
  const canInstall = !isInstalled;

  // hasNativePrompt: true when the browser supports beforeinstallprompt
  const hasNativePrompt = !!deferredPrompt;

  return { canInstall, isInstalled, isIOS, browser, promptInstall, deferredPrompt, hasNativePrompt };
}
