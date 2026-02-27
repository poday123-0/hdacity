import { useState, useRef } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { ChevronRight, Check } from "lucide-react";

interface SlideToConfirmProps {
  onConfirm: () => void;
  label?: string;
  disabled?: boolean;
}

const SlideToConfirm = ({ onConfirm, label = "Slide to Complete", disabled = false }: SlideToConfirmProps) => {
  const [completed, setCompleted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  const getMaxDrag = () => {
    if (!containerRef.current) return 200;
    return containerRef.current.offsetWidth - 56; // thumb width
  };

  const bgOpacity = useTransform(x, [0, 200], [0.15, 1]);
  const textOpacity = useTransform(x, [0, 100], [1, 0]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    const max = getMaxDrag();
    if (info.offset.x >= max * 0.75) {
      setCompleted(true);
      onConfirm();
    }
  };

  if (disabled) return null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[52px] rounded-xl overflow-hidden bg-primary/15 select-none"
    >
      {/* Sliding fill */}
      <motion.div
        className="absolute inset-y-0 left-0 bg-primary rounded-xl"
        style={{ width: useTransform(x, (v) => v + 56), opacity: bgOpacity }}
      />

      {/* Label */}
      <motion.span
        className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-primary pointer-events-none"
        style={{ opacity: textOpacity }}
      >
        {label}
      </motion.span>

      {/* Thumb */}
      {!completed ? (
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: getMaxDrag() }}
          dragElastic={0}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          style={{ x }}
          className="absolute top-1 left-1 w-[48px] h-[44px] rounded-lg bg-primary shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing z-10"
          whileTap={{ scale: 0.95 }}
        >
          <ChevronRight className="w-5 h-5 text-primary-foreground" />
          <ChevronRight className="w-5 h-5 text-primary-foreground -ml-3 opacity-50" />
        </motion.div>
      ) : (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute inset-0 bg-primary rounded-xl flex items-center justify-center"
        >
          <Check className="w-6 h-6 text-primary-foreground" />
        </motion.div>
      )}
    </div>
  );
};

export default SlideToConfirm;
