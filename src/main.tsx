import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { checkOTAUpdate } from "@/lib/ota-update";

// Run OTA update check for native apps (before rendering to redirect early if needed)
checkOTAUpdate();

// Show update banner when a new APP SW version is detected (one-time only)
// Skip entirely on native Capacitor — no service workers needed
const isNative = typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor?.isNativePlatform?.();
if ("serviceWorker" in navigator && !isNative) {
  let bannerShown = false;
  const hadControllerAtLoad = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (bannerShown) return;

    // Ignore controller changes during first-load SW bootstrap
    if (!hadControllerAtLoad) return;

    // Only show banner if the page has been loaded for at least 5 seconds
    // (avoids triggering on initial SW registration)
    if (performance.now() < 5000) return;

    const activeControllerUrl = navigator.serviceWorker.controller?.scriptURL || "";

    // Ignore Firebase Messaging SW controller changes
    if (activeControllerUrl.includes("firebase-messaging-sw.js")) return;

    bannerShown = true;

    const existing = document.getElementById("sw-update-banner");
    if (existing) return;

    const banner = document.createElement("div");
    banner.id = "sw-update-banner";
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
      padding: 12px 12px 12px 12px;
      padding-top: max(12px, env(safe-area-inset-top, 0px));
      font-family: system-ui, -apple-system, sans-serif;
      animation: swSlideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    banner.innerHTML = `
      <div style="
        background: rgba(255,255,255,0.92);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
        border: 1px solid rgba(0,0,0,0.06);
        display: flex; align-items: center; gap: 12px;
        padding: 14px 16px;
      ">
        <div style="
          width: 40px; height: 40px; border-radius: 12px;
          background: linear-gradient(135deg, hsl(200, 55%, 50%), hsl(200, 55%, 60%));
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        ">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;color:#1a1a1a;">Update Available</div>
          <div style="font-size:11px;color:#666;margin-top:2px;">A new version is ready</div>
        </div>
        <button id="sw-update-btn" style="
          background: linear-gradient(135deg, hsl(200, 55%, 50%), hsl(200, 55%, 60%));
          color: white; border: none; border-radius: 12px;
          padding: 8px 18px; font-weight: 700; cursor: pointer; font-size: 12px;
          letter-spacing: 0.2px; transition: transform 0.15s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          flex-shrink: 0;
        ">Update Now</button>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      @keyframes swSlideDown { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @media (prefers-color-scheme: dark) {
        #sw-update-banner > div { background: rgba(30,30,30,0.92) !important; border-color: rgba(255,255,255,0.08) !important; }
        #sw-update-banner > div > div:nth-child(2) > div:first-child { color: #f0f0f0 !important; }
        #sw-update-banner > div > div:nth-child(2) > div:last-child { color: #999 !important; }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(banner);

    document.getElementById("sw-update-btn")?.addEventListener("click", () => {
      window.location.reload();
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
