import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Show update banner when a new SW version is detected (one-time only)
if ("serviceWorker" in navigator) {
  let bannerShown = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (bannerShown) return;
    // Only show banner if the page has been loaded for at least 5 seconds
    // (avoids triggering on initial SW registration)
    if (performance.now() < 5000) return;
    bannerShown = true;

    const existing = document.getElementById("sw-update-banner");
    if (existing) return;

    const banner = document.createElement("div");
    banner.id = "sw-update-banner";
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
      background: linear-gradient(135deg, #1e40af, #3b82f6);
      color: white; padding: 12px 16px;
      display: flex; align-items: center; justify-content: space-between;
      font-family: system-ui, sans-serif; font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideDown 0.3s ease-out;
    `;
    banner.innerHTML = `
      <span>🔄 A new version is available!</span>
      <button id="sw-update-btn" style="
        background: white; color: #1e40af; border: none; border-radius: 6px;
        padding: 6px 16px; font-weight: 600; cursor: pointer; font-size: 13px;
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
