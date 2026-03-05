import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-reload when a new service worker takes control (force-update mechanism)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    console.log("[App] New service worker activated — reloading for update");
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
