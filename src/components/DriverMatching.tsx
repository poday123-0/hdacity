import { Phone, MessageSquare, X, Star, Landmark } from "lucide-react";
import { motion } from "framer-motion";

interface DriverInfo {
  name?: string;
  initials?: string;
  rating?: number;
  vehicle?: string;
  plate?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
}

interface DriverMatchingProps {
  onCancel: () => void;
  driver?: DriverInfo;
}

const DriverMatching = ({ onCancel, driver }: DriverMatchingProps) => {
  const driverName = driver?.name || "Ibrahim Hassan";
  const initials = driver?.initials || driverName.split(" ").map(n => n[0]).join("").slice(0, 2);
  const rating = driver?.rating || 4.9;
  const vehicle = driver?.vehicle || "Toyota Yaris";
  const plate = driver?.plate || "P-1234";

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-10"
    >
      <div className="p-5 space-y-5">
        <div className="flex justify-center">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Driver info */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-3 h-3 rounded-full bg-primary animate-pulse-dot absolute -top-1 -right-1 z-10" />
              <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center text-2xl font-bold text-foreground">
                {initials}
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">{driverName}</h3>
            <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
              <Star className="w-4 h-4 text-primary fill-primary" />
              <span>{rating}</span>
              <span>•</span>
              <span>{vehicle}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{plate}</p>
          </div>
        </div>

        {/* Bank account details */}
        {driver?.bank_name && driver?.bank_account_number && (
          <div className="bg-surface rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Landmark className="w-4 h-4 text-primary" />
              <span>Payment Details</span>
            </div>
            <div className="grid grid-cols-1 gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bank</span>
                <span className="font-medium text-foreground">{driver.bank_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account</span>
                <span className="font-medium text-foreground">{driver.bank_account_number}</span>
              </div>
              {driver.bank_account_name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium text-foreground">{driver.bank_account_name}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ETA */}
        <div className="bg-surface rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground">Estimated arrival</p>
          <p className="text-2xl font-bold text-primary">3 min</p>
          <p className="text-xs text-muted-foreground">Driver is on the way</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3.5 font-semibold transition-transform active:scale-[0.98]">
            <Phone className="w-4 h-4" />
            Call
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
          Cancel ride
        </button>
      </div>
    </motion.div>
  );
};

export default DriverMatching;
