import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, X } from "lucide-react";
import SystemLogo from "./SystemLogo";

interface FloatingTripBubbleProps {
  tripId: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType?: string;
  estimatedFare?: number | null;
  onTap: () => void;
  onDismiss: () => void;
}

/**
 * Floating in-app bubble that appears at the top of the screen when a trip
 * request comes in. Tapping it navigates to the trip request screen.
 * Works on all platforms (native + web).
 */
const FloatingTripBubble = ({
  tripId,
  pickupAddress,
  dropoffAddress,
  vehicleType,
  estimatedFare,
  onTap,
  onDismiss,
}: FloatingTripBubbleProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const pulseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (tripId) {
      setIsVisible(true);
      pulseRef.current = setInterval(() => setPulse(p => !p), 1000);
    } else {
      setIsVisible(false);
    }
    return () => {
      if (pulseRef.current) clearInterval(pulseRef.current);
    };
  }, [tripId]);

  if (!isVisible || !tripId) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0, scale: 0.8 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: -100, opacity: 0, scale: 0.8 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="fixed top-2 left-3 right-3 z-[9999] pointer-events-auto capacitor-safe-top"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
      >
        <motion.div
          animate={{ 
            boxShadow: pulse 
              ? "0 0 20px hsl(var(--primary) / 0.6), 0 4px 20px hsl(var(--primary) / 0.3)" 
              : "0 0 10px hsl(var(--primary) / 0.3), 0 4px 12px rgba(0,0,0,0.15)"
          }}
          transition={{ duration: 0.5 }}
          onClick={onTap}
          className="bg-card border-2 border-primary rounded-2xl p-3 flex items-center gap-3 cursor-pointer active:scale-[0.97] transition-transform relative overflow-hidden"
        >
          {/* Animated gradient background */}
          <motion.div
            animate={{ opacity: pulse ? 0.15 : 0.05 }}
            className="absolute inset-0 bg-gradient-to-r from-primary to-primary/50 rounded-2xl"
          />

          {/* App Logo */}
          <div className="relative w-11 h-11 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
            <motion.div
              animate={{ scale: pulse ? 1.15 : 1 }}
              transition={{ duration: 0.5 }}
            >
              <SystemLogo className="w-7 h-7 object-contain" />
            </motion.div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 relative">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold text-primary uppercase tracking-wide">
                New Trip Request
              </p>
              {vehicleType && (
                <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                  {vehicleType}
                </span>
              )}
            </div>
            <p className="text-xs text-foreground truncate mt-0.5 font-medium">
              <MapPin className="w-3 h-3 inline mr-0.5 text-chart-2" />
              {pickupAddress || "Pickup"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              → {dropoffAddress || "Dropoff"}
            </p>
          </div>

          {/* Fare badge */}
          {estimatedFare != null && estimatedFare > 0 && (
            <div className="relative bg-primary/15 px-2.5 py-1.5 rounded-xl shrink-0">
              <p className="text-xs font-bold text-primary">{estimatedFare} MVR</p>
            </div>
          )}

          {/* Dismiss button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="relative w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center shrink-0 hover:bg-muted active:scale-90 transition-all"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default FloatingTripBubble;
