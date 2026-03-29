import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

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
  const [promptEventResolved, setPromptEventResolved] = useState(false);

  useEffect(() => {
    // Detect installed state — multiple methods for cross-browser support
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || window.matchMedia("(display-mode: fullscreen)").matches
      || window.matchMedia("(display-mode: minimal-ui)").matches
      || (navigator as any).standalone === true  // iOS Safari
      || document.referrer.startsWith("android-app://") // TWA
      || window.matchMedia("(display-mode: window-controls-overlay)").matches;

    setIsInstalled(isStandalone);

    // If installed via our prompt previously
    if (!isStandalone && localStorage.getItem("hda_pwa_installed") === "1") {
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
      setPromptEventResolved(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Give browsers time to fire beforeinstallprompt before showing manual fallback
    // Chrome/Edge typically fire it within ~1s of page load
    const timer = setTimeout(() => {
      setPromptEventResolved(true);
    }, 2500);

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
      clearTimeout(timer);
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

  // canInstall: false on native apps, otherwise true when NOT already installed
  const canInstall = Capacitor.isNativePlatform() ? false : !isInstalled;

  // hasNativePrompt: true when the browser supports beforeinstallprompt
  const hasNativePrompt = !!deferredPrompt;

  return { canInstall, isInstalled, isIOS, browser, promptInstall, deferredPrompt, hasNativePrompt, promptEventResolved };
}
