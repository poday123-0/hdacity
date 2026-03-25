import { motion, AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";

interface AnimatedTimerProps {
  seconds: number;
  label?: string;
  variant?: "default" | "compact" | "badge";
  showIcon?: boolean;
  className?: string;
}

/** Single digit with slide-up animation */
const FlipDigit = ({ digit, id }: { digit: string; id: string }) => (
  <div className="relative w-[1.1em] h-[1.4em] overflow-hidden">
    <AnimatePresence mode="popLayout">
      <motion.span
        key={`${id}-${digit}`}
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "-100%", opacity: 0 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className="absolute inset-0 flex items-center justify-center font-mono font-bold tabular-nums"
      >
        {digit}
      </motion.span>
    </AnimatePresence>
  </div>
);

const AnimatedTimer = ({ seconds, label, variant = "default", showIcon = true, className = "" }: AnimatedTimerProps) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  const hh = String(hrs).padStart(2, "0");

  const showHours = hrs > 0;

  if (variant === "badge") {
    return (
       <span className={`inline-flex items-center gap-1.5 font-mono text-xs bg-surface text-surface-foreground px-2.5 py-1 rounded-full ${className}`}>
        {/* Badge variant text inherits from parent or uses surface-foreground */}
        {showIcon && <Clock className="w-3 h-3 text-primary" />}
        {label && <span className="text-muted-foreground text-[10px]">{label}</span>}
        <span className="flex items-center font-bold text-black dark:text-white">
          {showHours && (
            <>
              <FlipDigit digit={hh[0]} id="h0" />
              <FlipDigit digit={hh[1]} id="h1" />
              <span className="opacity-40 mx-px">:</span>
            </>
          )}
          <FlipDigit digit={mm[0]} id="m0" />
          <FlipDigit digit={mm[1]} id="m1" />
          <span className="opacity-40 mx-px">:</span>
          <FlipDigit digit={ss[0]} id="s0" />
          <FlipDigit digit={ss[1]} id="s1" />
        </span>
      </span>
    );
  }

  if (variant === "compact") {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        {showIcon && <Clock className="w-3.5 h-3.5 text-primary" />}
        {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
        <div className="flex items-center text-sm font-bold">
          {showHours && (
            <>
              <FlipDigit digit={hh[0]} id="h0" />
              <FlipDigit digit={hh[1]} id="h1" />
              <span className="opacity-40 mx-0.5">:</span>
            </>
          )}
          <FlipDigit digit={mm[0]} id="m0" />
          <FlipDigit digit={mm[1]} id="m1" />
          <span className="opacity-40 mx-0.5">:</span>
          <FlipDigit digit={ss[0]} id="s0" />
          <FlipDigit digit={ss[1]} id="s1" />
        </div>
      </div>
    );
  }

  // Default — larger display
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      {label && (
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
          {showIcon && <Clock className="w-3 h-3 text-primary" />}
          {label}
        </span>
      )}
      <div className="flex items-center text-xl font-bold text-surface-foreground bg-surface rounded-xl px-3 py-1.5">
        {showHours && (
          <>
            <FlipDigit digit={hh[0]} id="h0" />
            <FlipDigit digit={hh[1]} id="h1" />
            <span className="opacity-30 mx-0.5">:</span>
          </>
        )}
        <FlipDigit digit={mm[0]} id="m0" />
        <FlipDigit digit={mm[1]} id="m1" />
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="mx-0.5"
        >:</motion.span>
        <FlipDigit digit={ss[0]} id="s0" />
        <FlipDigit digit={ss[1]} id="s1" />
      </div>
    </div>
  );
};

export default AnimatedTimer;
