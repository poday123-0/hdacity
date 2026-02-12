import { Phone, MessageSquare, X, Star } from "lucide-react";
import { motion } from "framer-motion";

interface DriverMatchingProps {
  onCancel: () => void;
}

const DriverMatching = ({ onCancel }: DriverMatchingProps) => {
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-10"
    >
      <div className="p-5 space-y-5">
        {/* Handle */}
        <div className="flex justify-center">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Status */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-3 h-3 rounded-full bg-primary animate-pulse-dot absolute -top-1 -right-1 z-10" />
              <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center text-2xl font-bold text-foreground">
                AK
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Ahmed Khalil</h3>
            <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
              <Star className="w-4 h-4 text-primary fill-primary" />
              <span>4.9</span>
              <span>•</span>
              <span>Toyota Corolla</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">12345-A-67</p>
          </div>
        </div>

        {/* ETA */}
        <div className="bg-surface rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Arrivée estimée</p>
          <p className="text-2xl font-bold text-primary">3 min</p>
          <p className="text-xs text-muted-foreground">Le chauffeur est en route</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3.5 font-semibold transition-transform active:scale-[0.98]">
            <Phone className="w-4 h-4" />
            Appeler
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 bg-surface text-foreground rounded-xl py-3.5 font-semibold transition-transform active:scale-[0.98]">
            <MessageSquare className="w-4 h-4" />
            Message
          </button>
        </div>

        {/* Cancel */}
        <button
          onClick={onCancel}
          className="w-full flex items-center justify-center gap-2 text-destructive text-sm font-medium py-2"
        >
          <X className="w-4 h-4" />
          Annuler la course
        </button>
      </div>
    </motion.div>
  );
};

export default DriverMatching;
