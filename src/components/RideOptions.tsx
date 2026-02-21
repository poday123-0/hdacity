import { Car, Users, Crown, ArrowLeft, Loader2, Bike, Truck, Bus, Luggage } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RideOptionsProps {
  onBack: () => void;
  onConfirm: (vehicleType: any, estimatedFare: number) => void;
  pickup?: { name: string; id: string } | null;
  dropoff?: { name: string; id: string } | null;
  passengerCount: number;
  luggageCount: number;
}

const iconMap: Record<string, typeof Car> = {
  car: Car,
  truck: Truck,
  premium: Crown,
  cycle: Bike,
  van: Bus,
};

const RideOptions = ({ onBack, onConfirm, pickup, dropoff, passengerCount, luggageCount }: RideOptionsProps) => {
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [fareZones, setFareZones] = useState<any[]>([]);
  const [surcharges, setSurcharges] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      const [vtRes, fzRes, scRes] = await Promise.all([
        supabase.from("vehicle_types").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("fare_zones").select("*").eq("is_active", true),
        supabase.from("fare_surcharges").select("*").eq("is_active", true),
      ]);
      setVehicleTypes(vtRes.data || []);
      setFareZones(fzRes.data || []);
      setSurcharges(scRes.data || []);
      if (vtRes.data && vtRes.data.length > 0) setSelected(vtRes.data[0].id);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const calcFare = (vt: any): number => {
    // Check for zone-based fare first
    const zone = fareZones.find(
      (fz) =>
        fz.vehicle_type_id === vt.id &&
        ((fz.from_area === pickup?.name && fz.to_area === dropoff?.name) ||
          (fz.from_area === dropoff?.name && fz.to_area === pickup?.name))
    );
    let fare = zone ? Number(zone.fixed_fare) : Number(vt.base_fare);

    // Add luggage surcharge
    for (const sc of surcharges) {
      if (sc.surcharge_type === "luggage" && sc.luggage_threshold != null && luggageCount >= sc.luggage_threshold) {
        fare += Number(sc.amount);
      }
      // Time-based surcharges
      if (sc.surcharge_type === "time_based" && sc.start_time && sc.end_time) {
        const now = new Date();
        const h = now.getHours();
        const m = now.getMinutes();
        const nowMin = h * 60 + m;
        const [sh, sm] = sc.start_time.split(":").map(Number);
        const [eh, em] = sc.end_time.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        if (startMin < endMin ? nowMin >= startMin && nowMin < endMin : nowMin >= startMin || nowMin < endMin) {
          fare += Number(sc.amount);
        }
      }
    }

    // Add passenger tax
    fare += fare * (Number(vt.passenger_tax_pct) / 100);

    return Math.max(fare, Number(vt.minimum_fare));
  };

  const selectedType = vehicleTypes.find((v) => v.id === selected);
  const selectedFare = selectedType ? calcFare(selectedType) : 0;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] z-10"
    >
      <div className="p-4 pb-6 space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-foreground">Choose your ride</h2>
            <p className="text-xs text-muted-foreground">Select vehicle type</p>
          </div>
        </div>

        {/* Route + passenger info summary */}
        <div className="bg-surface rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <div className="w-0.5 h-4 bg-border" />
              <div className="w-2 h-2 rounded-sm bg-foreground" />
            </div>
            <div className="flex-1 space-y-0.5 min-w-0">
              <p className="text-xs text-foreground font-medium truncate">{pickup?.name}</p>
              <p className="text-xs text-foreground font-medium truncate">{dropoff?.name}</p>
            </div>
          </div>
          <div className="flex gap-3 pt-1 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5 text-primary" />
              <span className="font-semibold text-foreground">{passengerCount}</span> passenger{passengerCount > 1 ? "s" : ""}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Luggage className="w-3.5 h-3.5 text-primary" />
              <span className="font-semibold text-foreground">{luggageCount}</span> luggage
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto">
            {vehicleTypes.map((vt) => {
              const Icon = iconMap[vt.icon] || Car;
              const fare = calcFare(vt);
              return (
                <button
                  key={vt.id}
                  onClick={() => setSelected(vt.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                    selected === vt.id
                      ? "bg-primary/10 border-2 border-primary"
                      : "bg-surface border-2 border-transparent hover:bg-muted"
                  }`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden shrink-0 ${
                    selected === vt.id ? "bg-primary" : "bg-muted"
                  }`}>
                    {vt.image_url ? (
                      <img src={vt.image_url} alt={vt.name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <Icon className={`w-5 h-5 ${selected === vt.id ? "text-primary-foreground" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-sm text-foreground">{vt.name}</p>
                      <p className="font-bold text-foreground">{fare.toFixed(0)} MVR</p>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">{vt.description}</p>
                      <p className="text-xs text-muted-foreground">{vt.capacity} seats</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <button
          onClick={() => selectedType && onConfirm(selectedType, selectedFare)}
          disabled={!selectedType}
          className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl text-base transition-transform active:scale-[0.98] hover:opacity-90 disabled:opacity-40"
        >
          {selectedType ? `Confirm ${selectedType.name} — ${selectedFare.toFixed(0)} MVR` : "Select a ride"}
        </button>
      </div>
    </motion.div>
  );
};

export default RideOptions;
