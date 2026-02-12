import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Car } from "lucide-react";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [phase, setPhase] = useState<"logo" | "exit">("logo");

  useEffect(() => {
    const timer = setTimeout(() => setPhase("exit"), 2200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase === "exit") {
      const timer = setTimeout(onComplete, 600);
      return () => clearTimeout(timer);
    }
  }, [phase, onComplete]);

  return (
    <AnimatePresence>
      {phase !== "exit" ? null : null}
      <motion.div
        key="splash"
        initial={{ opacity: 1 }}
        animate={phase === "exit" ? { opacity: 0, scale: 1.1 } : { opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-primary"
      >
        {/* Animated car icon */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.2 }}
          className="mb-6"
        >
          <div className="w-24 h-24 rounded-3xl bg-primary-foreground/20 flex items-center justify-center backdrop-blur-sm">
            <Car className="w-14 h-14 text-primary-foreground" />
          </div>
        </motion.div>

        {/* Logo text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="text-center"
        >
          <h1 className="text-4xl font-extrabold text-primary-foreground tracking-tight">
            HDA <span className="opacity-80">TAXI</span>
          </h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="text-primary-foreground/70 text-sm mt-2 font-medium"
          >
            Votre course, notre priorité
          </motion.p>
        </motion.div>

        {/* Loading dots */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="flex gap-1.5 mt-10"
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              className="w-2 h-2 rounded-full bg-primary-foreground/60"
            />
          ))}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SplashScreen;
