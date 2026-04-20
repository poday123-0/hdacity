import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface BroadcastCountdownProps {
  /** Trip created_at ISO string */
  startedAt: string;
  /** Total seconds before timeout */
  timeoutSeconds: number;
  /** Compact = pill + slim bar */
  variant?: "pill";
  className?: string;
}

/**
 * Live countdown pill with slim progress bar for dispatch broadcasts.
 * Shows seconds remaining; turns warning then destructive as time runs out.
 */
const BroadcastCountdown = ({ startedAt, timeoutSeconds, className = "" }: BroadcastCountdownProps) => {
  const compute = () => {
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    return Math.max(0, timeoutSeconds - elapsed);
  };
  const [remaining, setRemaining] = useState(compute);

  useEffect(() => {
    setRemaining(compute());
    const id = setInterval(() => setRemaining(compute()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, timeoutSeconds]);

  const pct = Math.max(0, Math.min(100, (remaining / timeoutSeconds) * 100));
  const isLow = pct <= 30;
  const isCritical = pct <= 15;

  const tone = isCritical
    ? "bg-destructive/15 text-destructive border-destructive/30"
    : isLow
      ? "bg-warning/15 text-warning border-warning/30"
      : "bg-primary/10 text-primary border-primary/20";
  const barTone = isCritical ? "bg-destructive" : isLow ? "bg-warning" : "bg-primary";

  const mm = Math.floor(remaining / 60).toString().padStart(2, "0");
  const ss = (remaining % 60).toString().padStart(2, "0");

  return (
    <div className={`inline-flex flex-col gap-0.5 shrink-0 ${className}`}>
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold tabular-nums leading-none ${tone} ${isCritical ? "animate-pulse" : ""}`}>
        <Clock className="w-2.5 h-2.5" />
        {mm}:{ss}
      </span>
      <div className="h-0.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${barTone} transition-[width] duration-1000 ease-linear`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export default BroadcastCountdown;
