import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/hooks/use-branding";
import SystemLogo from "@/components/SystemLogo";

const ONBOARDING_KEY = "hda_onboarding_seen";

interface OnboardingScreensProps {
  onComplete: () => void;
}

interface Slide {
  imageUrl: string;
}

const OnboardingScreens = ({ onComplete }: OnboardingScreensProps) => {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState(1);
  const { appName } = useBranding();
  const displayName = appName || "HDA APP";

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["onboarding_slide_1", "onboarding_slide_2", "onboarding_slide_3", "onboarding_slide_4"]);
      const loaded: Slide[] = [];
      [1, 2, 3, 4].forEach((i) => {
        const row = data?.find((d: any) => d.key === `onboarding_slide_${i}`);
        if (row && typeof row.value === "string" && row.value.startsWith("http")) {
          loaded.push({ imageUrl: row.value });
        }
      });
      setSlides(loaded);
      setLoading(false);
      if (loaded.length === 0) {
        markSeen();
        onComplete();
      }
    })();
  }, []);

  const markSeen = useCallback(() => {
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
  }, []);

  const handleSkip = () => { markSeen(); onComplete(); };
  const handleNext = () => {
    if (current < slides.length - 1) {
      setDirection(1);
      setCurrent((p) => p + 1);
    } else {
      markSeen();
      onComplete();
    }
  };
  const handlePrev = () => {
    if (current > 0) {
      setDirection(-1);
      setCurrent((p) => p - 1);
    }
  };

  if (loading || slides.length === 0) return null;

  const isLast = current === slides.length - 1;

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Image area */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence custom={direction} mode="popLayout">
          <motion.div
            key={current}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute inset-0"
          >
            <img
              src={slides[current].imageUrl}
              alt={`Welcome ${current + 1}`}
              className="w-full h-full object-cover"
            />
          </motion.div>
        </AnimatePresence>

        {/* Skip button */}
        {!isLast && (
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 z-10 px-4 py-2 rounded-full bg-background/70 backdrop-blur-sm text-foreground text-sm font-medium hover:bg-background/90 transition-all"
          >
            Skip
          </button>
        )}

        {/* App name overlay at bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/80 to-transparent pt-16 pb-4 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center mb-2">
            <SystemLogo className="w-8 h-8 object-contain" alt={displayName} />
          </div>
          <p className="text-sm font-semibold text-foreground">{displayName}</p>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="bg-background px-6 py-5 flex items-center justify-between shrink-0">
        {/* Left - prev button */}
        <div className="w-20">
          {current > 0 && (
            <button
              onClick={handlePrev}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
        </div>

        {/* Dots */}
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === current ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        {/* Right - next/get started */}
        <div className="w-20 flex justify-end">
          <button
            onClick={handleNext}
            className={`flex items-center gap-1 text-sm font-semibold transition-colors ${
              isLast
                ? "px-4 py-2 rounded-full bg-primary text-primary-foreground"
                : "text-primary hover:text-primary/80"
            }`}
          >
            {isLast ? "Start" : "Next"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingScreens;
export { ONBOARDING_KEY };
