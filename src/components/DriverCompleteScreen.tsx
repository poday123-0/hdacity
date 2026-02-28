import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface DriverCompleteScreenProps {
  completionFare: number;
  currentTrip: any;
  confirmedPaymentMethod: string;
  passengerProfile: { first_name: string; last_name: string; avatar_url?: string | null } | null;
  userProfile: { first_name?: string; id?: string } | null | undefined;
  onContinue: () => void;
}

const DriverCompleteScreen = ({
  completionFare,
  currentTrip,
  confirmedPaymentMethod,
  passengerProfile,
  userProfile,
  onContinue,
}: DriverCompleteScreenProps) => {
  const [driverRating, setDriverRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);

  const handleContinue = async () => {
    if (driverRating > 0 && currentTrip?.id) {
      setSubmittingRating(true);
      await supabase
        .from("trips")
        .update({ driver_rating: driverRating } as any)
        .eq("id", currentTrip.id);
      setSubmittingRating(false);
    }
    onContinue();
  };

  const passengerName = passengerProfile
    ? `${passengerProfile.first_name} ${passengerProfile.last_name}`
    : currentTrip?.customer_name || "Passenger";

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="absolute inset-0 z-[500] flex items-center justify-center bg-foreground/50 backdrop-blur-sm complete-overlay"
    >
      <motion.div
        initial={{ y: 30 }}
        animate={{ y: 0 }}
        className="bg-card rounded-2xl shadow-2xl mx-6 w-full max-w-sm p-6 text-center space-y-5"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.2 }}
          className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto"
        >
          <CheckCircle className="w-10 h-10 text-primary" />
        </motion.div>

        <div>
          <h3 className="text-xl font-bold text-foreground">Ride complete!</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Well done, {userProfile?.first_name || "Driver"}
          </p>
        </div>

        <div className="bg-surface rounded-xl p-4">
          <p className="text-3xl font-bold text-primary">
            {completionFare || currentTrip?.estimated_fare || "—"} MVR
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Paid via <span className="font-semibold capitalize">{confirmedPaymentMethod}</span>
          </p>
        </div>

        {/* Rate Passenger */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">
            Rate {passengerName}
          </p>
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setDriverRating(star)}
                className="active:scale-110 transition-transform p-0.5"
              >
                <Star
                  className={`w-9 h-9 transition-colors ${
                    star <= driverRating
                      ? "text-primary fill-primary"
                      : "text-border"
                  }`}
                />
              </button>
            ))}
          </div>
          {driverRating > 0 && (
            <p className="text-xs text-muted-foreground">
              {driverRating === 5
                ? "Excellent!"
                : driverRating === 4
                ? "Good rider"
                : driverRating === 3
                ? "Average"
                : driverRating === 2
                ? "Below average"
                : "Poor experience"}
            </p>
          )}
        </div>

        <button
          onClick={handleContinue}
          disabled={submittingRating}
          className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {submittingRating ? "Saving..." : "Continue"}
        </button>
      </motion.div>
    </motion.div>
  );
};

export default DriverCompleteScreen;
