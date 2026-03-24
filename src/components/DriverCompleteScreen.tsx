import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Star, Wallet, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import TripInvoice from "@/components/TripInvoice";

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
  const [companyName, setCompanyName] = useState("HDA TAXI");
  const [showInvoice, setShowInvoice] = useState(false);

  useEffect(() => {
    const fetchCompany = async () => {
      // Try driver's own company first
      if (userProfile?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_name, company_id")
          .eq("id", userProfile.id)
          .maybeSingle();
        if (profile?.company_name) {
          setCompanyName(profile.company_name);
          return;
        }
      }
      // Fall back to system default company setting
      const { data: setting } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "default_company_name")
        .maybeSingle();
      if (setting?.value && typeof setting.value === "string") {
        setCompanyName(setting.value);
      }
    };
    fetchCompany();
  }, [userProfile?.id]);

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

  const isWalletPayment = confirmedPaymentMethod === "wallet";

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
          {(currentTrip as any)?.passenger_bonus > 0 && (
            <p className="text-xs text-primary/80 font-medium mt-0.5">
              Includes +{(currentTrip as any).passenger_bonus} MVR boost from passenger
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Paid via <span className="font-semibold capitalize">{confirmedPaymentMethod}</span>
          </p>
        </div>

        {/* Wallet payment info for driver */}
        {isWalletPayment && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-left"
          >
            <div className="flex items-start gap-2">
              <Wallet className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Wallet Payment</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  The fare has been added to your wallet. You can withdraw this amount from {companyName}.
                </p>
              </div>
            </div>
          </motion.div>
        )}

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
