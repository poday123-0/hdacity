import { motion } from "framer-motion";
import { Car, MapPin } from "lucide-react";
import { useEffect } from "react";

interface SearchingDriverProps {
  onDriverFound: () => void;
}

const SearchingDriver = ({ onDriverFound }: SearchingDriverProps) => {
  useEffect(() => {
    const timer = setTimeout(onDriverFound, 4000);
    return () => clearTimeout(timer);
  }, [onDriverFound]);

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-10"
    >
      <div className="p-6 space-y-6">
        <div className="flex justify-center">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Searching animation */}
        <div className="flex flex-col items-center py-4">
          <div className="relative w-28 h-28">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border-2 border-primary"
              />
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 rounded-full bg-primary flex items-center justify-center"
              >
                <Car className="w-8 h-8 text-primary-foreground" />
              </motion.div>
            </div>
          </div>

          <motion.h3
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-lg font-bold text-foreground mt-6"
          >
            Finding your driver...
          </motion.h3>
          <p className="text-sm text-muted-foreground mt-1">This will only take a moment</p>
        </div>

        {/* Route info */}
        <div className="bg-surface rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Pickup</p>
              <p className="text-sm font-medium text-foreground">Malé City Centre</p>
            </div>
          </div>
          <div className="ml-1.5 w-0.5 h-4 bg-border" />
          <div className="flex items-center gap-3">
            <MapPin className="w-3 h-3 text-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Destination</p>
              <p className="text-sm font-medium text-foreground">Velana International Airport</p>
            </div>
          </div>
        </div>

        <button
          onClick={onDriverFound}
          className="w-full py-3 text-sm font-medium text-destructive hover:bg-destructive/5 rounded-xl transition-colors"
        >
          Cancel search
        </button>
      </div>
    </motion.div>
  );
};

export default SearchingDriver;
