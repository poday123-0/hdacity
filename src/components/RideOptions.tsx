import { Car, Users, Crown, ArrowLeft, Clock, Loader2, Bike, Truck, Bus } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RideOptionsProps {
  onBack: () => void;
  onConfirm: (vehicleType: any) => void;
  pickup?: { name: string } | null;
  dropoff?: { name: string } | null;
}

const iconMap: Record<string, typeof Car> = {
  car: Car,
  truck: Truck,
  premium: Crown,
  cycle: Bike,
  van: Bus,
};

const RideOptions = ({ onBack, onConfirm, pickup, dropoff }: RideOptionsProps) => {
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("vehicle_types")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      setVehicleTypes(data || []);
      if (data && data.length > 0) setSelected(data[0].id);
      setLoading(false);
    };
    fetch();
  }, []);

  const selectedType = vehicleTypes.find((v) => v.id === selected);

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-10"
    >
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-surface flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-foreground">Choose your ride</h2>
            <p className="text-xs text-muted-foreground">Select vehicle type</p>
          </div>
        </div>

        {/* Route summary */}
        {pickup && dropoff && (
          <div className="bg-surface rounded-xl p-3 flex items-center gap-3">
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <div className="w-0.5 h-5 bg-border" />
              <div className="w-2 h-2 rounded-sm bg-foreground" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-xs text-foreground font-medium">{pickup.name}</p>
              <p className="text-xs text-foreground font-medium">{dropoff.name}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {vehicleTypes.map((vt) => {
              const Icon = iconMap[vt.icon] || Car;
              return (
                <button
                  key={vt.id}
                  onClick={() => setSelected(vt.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all ${
                    selected === vt.id
                      ? "bg-primary/10 border-2 border-primary"
                      : "bg-surface border-2 border-transparent hover:bg-muted"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden ${
                    selected === vt.id ? "bg-primary" : "bg-muted"
                  }`}>
                    {vt.image_url ? (
                      <img src={vt.image_url} alt={vt.name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <Icon className={`w-6 h-6 ${selected === vt.id ? "text-primary-foreground" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-foreground">{vt.name}</p>
                      <p className="font-bold text-foreground">{vt.base_fare} MVR</p>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-muted-foreground">{vt.description}</p>
                      <p className="text-xs text-muted-foreground">{vt.capacity} seats</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={() => selectedType && onConfirm(selectedType)}
          disabled={!selectedType}
          className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base transition-transform active:scale-[0.98] hover:opacity-90 disabled:opacity-40"
        >
          {selectedType ? `Confirm ${selectedType.name} — from ${selectedType.base_fare} MVR` : "Select a ride"}
        </button>
      </div>
    </motion.div>
  );
};

export default RideOptions;
