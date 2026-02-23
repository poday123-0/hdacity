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
  const [onlineVehicleTypeIds, setOnlineVehicleTypeIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      const [vtRes, fzRes, scRes, dlRes] = await Promise.all([
        supabase.from("vehicle_types").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("fare_zones").select("*").eq("is_active", true),
        supabase.from("fare_surcharges").select("*").eq("is_active", true),
        supabase.from("driver_locations").select("vehicle_type_id").eq("is_online", true).eq("is_on_trip", false),
      ]);
      const types = vtRes.data || [];
      setVehicleTypes(types);
      setFareZones(fzRes.data || []);
      setSurcharges(scRes.data || []);
      const onlineIds = new Set<string>((dlRes.data || []).map((d: any) => d.vehicle_type_id).filter(Boolean));
      setOnlineVehicleTypeIds(onlineIds);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const calcFare = (vt: any): number => {
    const zone = fareZones.find(
      (fz) =>
        fz.vehicle_type_id === vt.id &&
        ((fz.from_area === pickup?.name && fz.to_area === dropoff?.name) ||
          (fz.from_area === dropoff?.name && fz.to_area === pickup?.name))
    );
    let fare = zone ? Number(zone.fixed_fare) : Number(vt.base_fare);

    for (const sc of surcharges) {
      if (sc.surcharge_type === "luggage" && sc.luggage_threshold != null && luggageCount >= sc.luggage_threshold) {
        fare += Number(sc.amount);
      }
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

    fare += fare * (Number(vt.passenger_tax_pct) / 100);
    return Math.max(fare, Number(vt.minimum_fare));
  };

  // Sort: online vehicles first, then by capacity fit
  const sortedTypes = [...vehicleTypes].sort((a, b) => {
    const aOnline = onlineVehicleTypeIds.has(a.id) ? 0 : 1;
    const bOnline = onlineVehicleTypeIds.has(b.id) ? 0 : 1;
    if (aOnline !== bOnline) return aOnline - bOnline;
    const aFits = a.capacity >= passengerCount ? 0 : 1;
    const bFits = b.capacity >= passengerCount ? 0 : 1;
    if (aFits !== bFits) return aFits - bFits;
    return Math.abs(a.capacity - passengerCount) - Math.abs(b.capacity - passengerCount);
  });

  // Auto-select first online + fitting vehicle
  useEffect(() => {
    if (sortedTypes.length > 0 && !selected) {
      const firstOnline = sortedTypes.find(vt => onlineVehicleTypeIds.has(vt.id));
      setSelected(firstOnline?.id || sortedTypes[0].id);
    }
  }, [sortedTypes.length, selected, onlineVehicleTypeIds.size]);

  const selectedType = vehicleTypes.find((v) => v.id === selected);
  const selectedFare = selectedType ? calcFare(selectedType) : 0;
  const selectedIsOnline = selectedType ? onlineVehicleTypeIds.has(selectedType.id) : false;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[1.75rem] shadow-[0_-8px_40px_rgba(0,0,0,0.15)] z-10"
    >
      <div className="px-4 pt-2.5 pb-6 space-y-3">
        {/* Handle */}
        <div className="flex justify-center">
          <div className="w-10 h-1 rounded-full bg-border/60" />
        </div>

        {/* Header + route summary inline */}
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform shrink-0">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <p className="text-xs text-foreground font-medium truncate max-w-[5.5rem]">{pickup?.name}</p>
              </div>
              <span className="text-muted-foreground text-xs">→</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-foreground" />
                <p className="text-xs text-foreground font-medium truncate max-w-[5.5rem]">{dropoff?.name}</p>
              </div>
            </div>
            <div className="flex gap-3 mt-0.5">
              <span className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">{passengerCount}</span> pax</span>
              <span className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">{luggageCount}</span> bags</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
            {sortedTypes.map((vt, index) => {
              const Icon = iconMap[vt.icon] || Car;
              const fare = calcFare(vt);
              const isSelected = selected === vt.id;
              const isOnline = onlineVehicleTypeIds.has(vt.id);
              const fits = vt.capacity >= passengerCount;
              const firstOnlineIdx = sortedTypes.findIndex(v => onlineVehicleTypeIds.has(v.id));
              const isBestMatch = index === firstOnlineIdx;
              return (
                <button
                  key={vt.id}
                  onClick={() => isOnline ? setSelected(vt.id) : null}
                  disabled={!isOnline}
                  className={`relative flex flex-col items-center gap-1 p-2.5 pb-3 rounded-xl transition-all snap-start shrink-0 w-[5.5rem] ${
                    !isOnline
                      ? "bg-surface/30 opacity-40 cursor-not-allowed"
                      : isSelected
                        ? "bg-primary/10 ring-2 ring-primary shadow-sm"
                        : fits
                          ? "bg-surface active:bg-muted"
                          : "bg-surface/50 opacity-60"
                  }`}
                >
                  {isBestMatch && isOnline && (
                    <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[8px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-1.5 py-px rounded-full whitespace-nowrap leading-tight">
                      Best
                    </span>
                  )}
                  {!isOnline && (
                    <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[7px] font-bold uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-px rounded-full whitespace-nowrap leading-tight">
                      Offline
                    </span>
                  )}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden ${
                    isSelected ? "bg-primary" : "bg-muted"
                  }`}>
                    {vt.image_url ? (
                      <img src={vt.image_url} alt={vt.name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <Icon className={`w-5 h-5 ${isSelected ? "text-primary-foreground" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <p className="font-semibold text-[11px] text-foreground truncate w-full text-center leading-tight">{vt.name}</p>
                  <p className="text-sm font-bold text-primary leading-none">{fare.toFixed(0)}<span className="text-[9px] font-medium text-muted-foreground ml-px">MVR</span></p>
                  <p className="text-[9px] text-muted-foreground leading-none">{vt.capacity} seats</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected vehicle detail strip */}
        {selectedType && (
          <div className="bg-surface rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center overflow-hidden shrink-0">
              {selectedType.image_url ? (
                <img src={selectedType.image_url} alt={selectedType.name} className="w-full h-full object-contain p-0.5" />
              ) : (
                <Car className="w-4.5 h-4.5 text-primary-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-xs text-foreground">{selectedType.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{selectedType.description || `${selectedType.capacity} seats`}</p>
            </div>
            <p className="text-base font-bold text-primary shrink-0">{selectedFare.toFixed(0)} <span className="text-[10px] font-semibold text-muted-foreground">MVR</span></p>
          </div>
        )}

        <button
          onClick={() => selectedType && selectedIsOnline && onConfirm(selectedType, selectedFare)}
          disabled={!selectedType || !selectedIsOnline}
          className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40"
        >
          {!selectedType ? "Select a ride" : !selectedIsOnline ? "No drivers available" : `Confirm ${selectedType.name} — ${selectedFare.toFixed(0)} MVR`}
        </button>
      </div>
    </motion.div>
  );
};

export default RideOptions;
