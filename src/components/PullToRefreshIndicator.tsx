import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  refreshing: boolean;
  progress: number;
}

const PullToRefreshIndicator = ({ pullDistance, refreshing, progress }: PullToRefreshIndicatorProps) => {
  if (pullDistance <= 0 && !refreshing) return null;

  return (
    <motion.div
      className="absolute top-0 left-0 right-0 z-[9998] flex items-center justify-center pointer-events-none"
      style={{ height: pullDistance }}
      initial={false}
      animate={{ opacity: pullDistance > 10 || refreshing ? 1 : 0 }}
    >
      <motion.div
        className="w-9 h-9 rounded-full bg-card shadow-lg border border-border flex items-center justify-center"
        animate={refreshing ? { rotate: 360 } : { rotate: progress * 360 }}
        transition={refreshing ? { duration: 0.8, repeat: Infinity, ease: "linear" } : { duration: 0 }}
      >
        <RefreshCw
          className={`w-4 h-4 ${progress >= 1 || refreshing ? "text-primary" : "text-muted-foreground"}`}
        />
      </motion.div>
    </motion.div>
  );
};

export default PullToRefreshIndicator;
