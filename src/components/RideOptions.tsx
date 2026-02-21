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
      const types = vtRes.data || [];
      setVehicleTypes(types);
      setFareZones(fzRes.data || []);
      setSurcharges(scRes.data || []);
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

  // Sort: vehicles that fit passengers first (nearest capacity match)
  const sortedTypes = [...vehicleTypes].sort((a, b) => {
    const aFits = a.capacity >= passengerCount ? 0 : 1;
    const bFits = b.capacity >= passengerCount ? 0 : 1;
    if (aFits !== bFits) return aFits - bFits;
    // Among fitting, sort by closest capacity match
    return Math.abs(a.capacity - passengerCount) - Math.abs(b.capacity - passengerCount);
  });

  // Auto-select nearest fitting vehicle
  useEffect(() => {
    if (sortedTypes.length > 0 && !selected) {
      setSelected(sortedTypes[0].id);
    }
  }, [sortedTypes.length, selected]);

  const selectedType = vehicleTypes.find((v) => v.id === selected);
  const selectedFare = selectedType ? calcFare(selectedType) : 0;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[1.75rem] shadow-[0_-8px_40px_rgba(0,0,0,0.15)] z-10"
    >
      <div className="px-5 pt-3 pb-8 space-y-4">
        {/* Handle */}
        <div className="flex justify-center">
          <div className="w-12 h-1.5 rounded-full bg-border/60" />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={onBack} className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center active:scale-90 transition-transform">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight">Choose your ride</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Select vehicle type</p>
          </div>
        </div>

        {/* Route + passenger info summary */}
        <div className="bg-surface rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              <div className="w-0.5 h-4 bg-gradient-to-b from-primary/40 to-foreground/30" />
              <div className="w-2.5 h-2.5 rounded-sm bg-foreground" />
            </div>
            <div className="flex-1 space-y-1 min-w-0">
              <p className="text-xs text-foreground font-medium truncate">{pickup?.name}</p>
              <p className="text-xs text-foreground font-medium truncate">{dropoff?.name}</p>
            </div>
          </div>
          <div className="flex gap-4 pt-2 border-t border-border/50">
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
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scrollbar-hide">
            {sortedTypes.map((vt, index) => {
              const Icon = iconMap[vt.icon] || Car;
              const fare = calcFare(vt);
              const isSelected = selected === vt.id;
              const fits = vt.capacity >= passengerCount;
              const isBestMatch = index === 0;
              return (
                <button
                  key={vt.id}
                  onClick={() => setSelected(vt.id)}
                  className={`relative flex flex-col items-center gap-2 p-3.5 rounded-2xl transition-all snap-start shrink-0 w-[7.5rem] ${
                    isSelected
                      ? "bg-primary/10 ring-2 ring-primary shadow-md scale-[1.02]"
                      : fits
                        ? "bg-surface hover:bg-muted"
                        : "bg-surface/50 opacity-60"
                  }`}
                >
                  {isBestMatch && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-0.5 rounded-full whitespace-nowrap">
                      Best match
                    </span>
                  )}
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden ${
                    isSelected ? "bg-primary" : "bg-muted"
                  }`}>
                    {vt.image_url ? (
                      <img src={vt.image_url} alt={vt.name} className="w-full h-full object-contain p-1.5" />
                    ) : (
                      <Icon className={`w-6 h-6 ${isSelected ? "text-primary-foreground" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <div className="text-center w-full">
                    <p className="font-bold text-xs text-foreground truncate">{vt.name}</p>
                    <p className="text-lg font-bold text-primary mt-0.5">{fare.toFixed(0)}<span className="text-[10px] font-semibold text-muted-foreground ml-0.5">MVR</span></p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{vt.capacity} seats</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected vehicle details */}
        {selectedType && (
          <div className="bg-surface rounded-2xl p-3.5 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center overflow-hidden shrink-0">
              {selectedType.image_url ? (
                <img src={selectedType.image_url} alt={selectedType.name} className="w-full h-full object-contain p-1.5" />
              ) : (
                <Car className="w-6 h-6 text-primary-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-foreground">{selectedType.name}</p>
              <p className="text-xs text-muted-foreground truncate">{selectedType.description || `${selectedType.capacity} seats available`}</p>
            </div>
            <p className="text-xl font-bold text-primary shrink-0">{selectedFare.toFixed(0)} <span className="text-xs font-semibold text-muted-foreground">MVR</span></p>
          </div>
        )}

        <button
          onClick={() => selectedType && onConfirm(selectedType, selectedFare)}
          disabled={!selectedType}
          className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl text-base transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 shadow-[0_4px_12px_rgba(var(--primary),0.2)]"
        >
          {selectedType ? `Confirm ${selectedType.name} — ${selectedFare.toFixed(0)} MVR` : "Select a ride"}
        </button>
      </div>
    </motion.div>
  );
};

export default RideOptions;
