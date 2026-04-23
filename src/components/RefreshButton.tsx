import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface RefreshButtonProps {
  className?: string;
  size?: "sm" | "md";
}

/**
 * Shared refresh icon button. Forces a SW update + hard reload to
 * pick up the latest build, replacing the old pull-to-refresh gesture.
 */
const RefreshButton = ({ className = "", size = "md" }: RefreshButtonProps) => {
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update().catch(() => {});
      }
    } catch {}
    // Small delay so the spin animation is visible before reload
    setTimeout(() => window.location.reload(), 250);
  };

  const sizeClass = size === "sm" ? "w-8 h-8 sm:w-9 sm:h-9" : "w-10 h-10";
  const iconClass = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <button
      onClick={handleRefresh}
      title="Refresh"
      aria-label="Refresh"
      className={`${sizeClass} rounded-full bg-card/90 backdrop-blur-sm shadow-md flex items-center justify-center active:scale-95 transition-transform border border-border/30 ${className}`}
    >
      <RefreshCw className={`${iconClass} text-foreground ${spinning ? "animate-spin" : ""}`} />
    </button>
  );
};

export default RefreshButton;
