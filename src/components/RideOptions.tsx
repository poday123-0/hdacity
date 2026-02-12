import { Car, Users, Crown, ArrowLeft, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

interface RideOptionsProps {
  onBack: () => void;
  onConfirm: () => void;
}

const rides = [
  {
    id: "economy",
    name: "Economy",
    description: "Affordable everyday rides",
    price: "50 MVR",
    eta: "3 min",
    icon: Car,
    capacity: "4",
  },
  {
    id: "comfort",
    name: "Comfort",
    description: "More space, newer car",
    price: "80 MVR",
    eta: "5 min",
    icon: Users,
    capacity: "4",
  },
  {
    id: "premium",
    name: "Premium",
    description: "Luxury vehicle",
    price: "130 MVR",
    eta: "7 min",
    icon: Crown,
    capacity: "3",
  },
];

const RideOptions = ({ onBack, onConfirm }: RideOptionsProps) => {
  const [selected, setSelected] = useState("economy");

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-10"
    >
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-surface flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-foreground">Choose your ride</h2>
            <p className="text-xs text-muted-foreground">Malé City → Velana Airport</p>
          </div>
        </div>

        {/* Ride options */}
        <div className="space-y-2">
          {rides.map((ride) => (
            <button
              key={ride.id}
              onClick={() => setSelected(ride.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all ${
                selected === ride.id
                  ? "bg-primary/10 border-2 border-primary"
                  : "bg-surface border-2 border-transparent hover:bg-muted"
              }`}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  selected === ride.id ? "bg-primary" : "bg-muted"
                }`}
              >
                <ride.icon className={`w-6 h-6 ${selected === ride.id ? "text-primary-foreground" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-foreground">{ride.name}</p>
                  <p className="font-bold text-foreground">{ride.price}</p>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-muted-foreground">{ride.description}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {ride.eta}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Confirm button */}
        <button
          onClick={onConfirm}
          className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base transition-transform active:scale-[0.98] hover:opacity-90"
        >
          Confirm {rides.find((r) => r.id === selected)?.name} — {rides.find((r) => r.id === selected)?.price}
        </button>
      </div>
    </motion.div>
  );
};

export default RideOptions;
