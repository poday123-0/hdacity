import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Show update banner when a new APP SW version is detected (one-time only)
if ("serviceWorker" in navigator) {
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
      background: hsl(200, 55%, 55%);
      color: white; padding: 14px 20px;
      display: flex; align-items: center; justify-content: space-between;
      font-family: system-ui, -apple-system, sans-serif; font-size: 14px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      animation: slideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      backdrop-filter: blur(12px);
    `;
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:18px;">🔄</div>
        <div>
          <div style="font-weight:600;font-size:14px;">Update Available</div>
          <div style="font-size:12px;opacity:0.85;margin-top:1px;">A newer version of HDA is ready</div>
        </div>
      </div>
      <button id="sw-update-btn" style="
        background: white; color: hsl(200, 55%, 40%); border: none; border-radius: 10px;
        padding: 8px 20px; font-weight: 700; cursor: pointer; font-size: 13px;
        letter-spacing: 0.3px; transition: transform 0.15s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      ">Update Now</button>
    `;

    const style = document.createElement("style");
    style.textContent = `@keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } }`;
    document.head.appendChild(style);
    document.body.appendChild(banner);

    document.getElementById("sw-update-btn")?.addEventListener("click", () => {
      window.location.reload();
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
