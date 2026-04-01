import { Car, Users, Crown, ArrowLeft, Loader2, Bike, Truck, Bus, Luggage, Plus, Minus, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LocationData {
  name: string;
  id: string;
  lat?: number;
  lng?: number;
  address?: string;
}

interface RideOptionsProps {
  onBack: () => void;
  onConfirm: (vehicleType: any, estimatedFare: number, passengerBonus: number, fareZoneId?: string | null) => void;
  pickup?: LocationData | null;
  dropoff?: LocationData | null;
  passengerCount: number;
  luggageCount: number;
  stops?: LocationData[];
  bookingType?: "now" | "scheduled" | "hourly";
  scheduledAt?: string;
}

const iconMap: Record<string, typeof Car> = {
  car: Car,
  truck: Truck,
  premium: Crown,
  cycle: Bike,
  van: Bus,
};

/** Haversine distance in km */
const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const RideOptions = ({ onBack, onConfirm, pickup, dropoff, passengerCount, luggageCount, stops = [], bookingType = "now", scheduledAt }: RideOptionsProps) => {
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [fareZones, setFareZones] = useState<any[]>([]);
  const [surcharges, setSurcharges] = useState<any[]>([]);
  const [serviceLocations, setServiceLocations] = useState<any[]>([]);
  const [onlineVehicleTypeIds, setOnlineVehicleTypeIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [passengerBonus, setPassengerBonus] = useState(0);
  const [maxBoost, setMaxBoost] = useState(0); // 0 = unlimited
  const [boostStep, setBoostStep] = useState(5);
  const [selectedDisposalType, setSelectedDisposalType] = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      const [vtRes, fzRes, scRes, dlRes, slRes, boostRes, dvtRes] = await Promise.all([
        supabase.from("vehicle_types").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("fare_zones").select("*").eq("is_active", true),
        supabase.from("fare_surcharges").select("*").eq("is_active", true),
        supabase.from("driver_locations").select("driver_id, vehicle_type_id").eq("is_online", true).eq("is_on_trip", false),
        supabase.from("service_locations").select("id, name, lat, lng, polygon").eq("is_active", true),
        supabase.from("system_settings").select("key, value").in("key", ["max_passenger_boost", "boost_step_amount"]),
        supabase.from("driver_vehicle_types").select("driver_id, vehicle_type_id").eq("status", "approved"),
      ]);
      setVehicleTypes(vtRes.data || []);
      setFareZones(fzRes.data || []);
      setSurcharges(scRes.data || []);
      setServiceLocations(slRes.data || []);
      // Build set of available vehicle types: from driver_locations directly + from driver_vehicle_types for online drivers
      const onlineDriverIds = new Set<string>((dlRes.data || []).map((d: any) => d.driver_id).filter(Boolean));
      const onlineIds = new Set<string>((dlRes.data || []).map((d: any) => d.vehicle_type_id).filter(Boolean));
      // Add all ride types that online drivers are eligible for
      (dvtRes.data || []).forEach((row: any) => {
        if (onlineDriverIds.has(row.driver_id)) {
          onlineIds.add(row.vehicle_type_id);
        }
      });
      setOnlineVehicleTypeIds(onlineIds);
      // Parse boost settings
      const boostSettings: Record<string, any> = {};
      (boostRes.data || []).forEach((s: any) => { boostSettings[s.key] = s.value; });
      const mb = Number(boostSettings["max_passenger_boost"]) || 0;
      setMaxBoost(mb);
      const bs = Number(boostSettings["boost_step_amount"]) || 5;
      setBoostStep(bs > 0 ? bs : 5);
      setLoading(false);
    };
    fetchAll();
  }, []);

  // Calculate driving distance via OSRM for the full route (pickup → stops → dropoff)
  // Also calculate per-segment distances for segment-based fare
  const [segmentDistances, setSegmentDistances] = useState<number[]>([]);

  useEffect(() => {
    const allPoints: { lat: number; lng: number }[] = [];
    if (pickup?.lat && pickup?.lng) allPoints.push({ lat: pickup.lat, lng: pickup.lng });
    for (const s of stops) {
      if (s.lat && s.lng) allPoints.push({ lat: s.lat, lng: s.lng });
    }
    if (dropoff?.lat && dropoff?.lng) allPoints.push({ lat: dropoff.lat, lng: dropoff.lng });

    if (allPoints.length < 2) {
      setDistanceKm(null);
      setSegmentDistances([]);
      return;
    }

    // Haversine total for fallback
    let straightTotal = 0;
    const straightSegments: number[] = [];
    for (let i = 0; i < allPoints.length - 1; i++) {
      const d = haversineKm(allPoints[i].lat, allPoints[i].lng, allPoints[i + 1].lat, allPoints[i + 1].lng);
      straightTotal += d;
      straightSegments.push(d * 1.3); // rough road factor
    }

    // OSRM waypoints
    const coords = allPoints.map(p => `${p.lng},${p.lat}`).join(";");
    fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&steps=false&annotations=false`)
      .then((r) => r.json())
      .then((data) => {
        if (data.routes?.[0]) {
          const totalDist = data.routes[0].distance / 1000;
          setDistanceKm(totalDist);
          // Extract per-leg distances
          const legs = data.routes[0].legs;
          if (legs && legs.length > 0) {
            setSegmentDistances(legs.map((leg: any) => leg.distance / 1000));
          } else {
            setSegmentDistances([totalDist]);
          }
        } else {
          setDistanceKm(straightTotal * 1.3);
          setSegmentDistances(straightSegments);
        }
      })
      .catch(() => {
        setDistanceKm(straightTotal * 1.3);
        setSegmentDistances(straightSegments);
      });
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, stops]);

  // Point-in-polygon (ray casting algorithm)
  const pointInPolygon = (lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean => {
    if (!polygon || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lat, yi = polygon[i].lng;
      const xj = polygon[j].lat, yj = polygon[j].lng;
      if ((yi > lng) !== (yj > lng) && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };

  // Calculate rough polygon area (Shoelace formula) — used to pick smallest overlapping polygon
  const calcPolygonArea = (polygon: { lat: number; lng: number }[]): number => {
    if (!polygon || polygon.length < 3) return Infinity;
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      area += (polygon[j].lat + polygon[i].lat) * (polygon[j].lng - polygon[i].lng);
    }
    return Math.abs(area / 2);
  };

  // Resolve which service area a location belongs to
  // When polygons overlap, prefer the smallest (most specific) polygon
  const findServiceArea = (loc: LocationData | null | undefined) => {
    if (!loc) return null;
    // 1. Direct name match
    const direct = serviceLocations.find((sl: any) => 
      sl.name?.toLowerCase().trim() === loc.name?.toLowerCase().trim() || sl.id === loc.id
    );
    if (direct) return direct;
    // 2. Point-in-polygon match — pick smallest polygon when overlapping
    if (loc.lat && loc.lng) {
      let bestMatch: any = null;
      let smallestArea = Infinity;
      for (const sl of serviceLocations) {
        if (sl.polygon && pointInPolygon(loc.lat, loc.lng, sl.polygon)) {
          const area = calcPolygonArea(sl.polygon);
          if (area < smallestArea) {
            smallestArea = area;
            bestMatch = sl;
          }
        }
      }
      if (bestMatch) return bestMatch;
    }
    // 3. Fallback to nearest center point
    if (loc.lat && loc.lng && serviceLocations.length > 0) {
      let best: any = null;
      let bestDist = Infinity;
      for (const sl of serviceLocations) {
        const d = haversineKm(loc.lat, loc.lng, sl.lat, sl.lng);
        if (d < bestDist) { bestDist = d; best = sl; }
      }
      return best;
    }
    return null;
  };

  const calcFare = (vt: any): { fare: number; zoneId: string | null; fixedSurcharges?: any[] } => {
    // Hourly booking: show per_hour_rate as estimate (1 hour minimum)
    if (bookingType === "hourly") {
      let fare = Number(vt.per_hour_rate) || Number(vt.base_fare);
      fare += fare * (Number(vt.passenger_tax_pct) / 100);
      return { fare: Math.max(Math.round(fare), Number(vt.minimum_fare)), zoneId: null };
    }

    const waypoints: (LocationData | null | undefined)[] = [pickup, ...stops, dropoff];

    // Check if dropoff is in a fixed surcharge destination area
    const lastWp = waypoints[waypoints.length - 1];
    if (lastWp) {
      const dropArea = findServiceArea(lastWp);
      if (dropArea) {
        const fixedMatches = surcharges.filter((sc: any) =>
          sc.surcharge_type === "fixed" && sc.destination_area_id === dropArea.id &&
          (!sc.vehicle_type_id || sc.vehicle_type_id === vt.id)
        );
        if (fixedMatches.length > 0) {
          const selectedSc = selectedDisposalType
            ? fixedMatches.find((sc: any) => sc.id === selectedDisposalType) || fixedMatches[0]
            : fixedMatches[0];
          let totalFare = Number(selectedSc.amount);
          totalFare += totalFare * (Number(vt.passenger_tax_pct) / 100);
          return { fare: Math.max(Math.round(totalFare), Number(vt.minimum_fare)), zoneId: null, fixedSurcharges: fixedMatches };
        }
      }
    }

    let totalFare = 0;
    let matchedZoneId: string | null = null;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      if (!from || !to) continue;

      const fromArea = findServiceArea(from);
      const toArea = findServiceArea(to);

      const matchesZone = (fz: any) => {
        if (fz.vehicle_type_id && fz.vehicle_type_id !== vt.id) return false;
        const normalize = (s: string) => s.trim().toLowerCase();
        const fromNames = [from?.name, from?.id, fromArea?.name, fromArea?.id].filter(Boolean).map((n: string) => normalize(n));
        const toNames = [to?.name, to?.id, toArea?.name, toArea?.id].filter(Boolean).map((n: string) => normalize(n));
        const fzFrom = normalize(fz.from_area);
        const fzTo = normalize(fz.to_area);
        return (
          (fromNames.includes(fzFrom) && toNames.includes(fzTo)) ||
          (toNames.includes(fzFrom) && fromNames.includes(fzTo))
        );
      };

      const exactZone = fareZones.find((fz: any) => fz.vehicle_type_id === vt.id && matchesZone(fz));
      const genericZone = fareZones.find((fz: any) => !fz.vehicle_type_id && matchesZone(fz));
      const zone = exactZone || genericZone;

      if (zone) {
        totalFare += Number(zone.fixed_fare);
        if (!matchedZoneId) matchedZoneId = zone.id;
      } else {
        const segDist = segmentDistances[i] ?? (distanceKm != null ? distanceKm / Math.max(waypoints.length - 1, 1) : 0);
        if (segDist > 0) {
          totalFare += Number(vt.base_fare) + Number(vt.per_km_rate) * segDist;
        } else {
          totalFare += Number(vt.base_fare);
        }
      }
    }

    // Apply surcharges (luggage + time only, fixed already handled above)
    for (const sc of surcharges) {
      if (sc.surcharge_type === "luggage" && sc.luggage_threshold != null) {
        const extraBags = Math.max(0, luggageCount - sc.luggage_threshold);
        if (extraBags > 0) {
          totalFare += Number(sc.amount) * extraBags;
        }
      }
      if (sc.surcharge_type === "time_based" && sc.start_time && sc.end_time) {
        const checkTime = (bookingType === "scheduled" && scheduledAt) ? new Date(scheduledAt) : new Date();
        const nowMin = checkTime.getHours() * 60 + checkTime.getMinutes();
        const [sh, sm] = sc.start_time.split(":").map(Number);
        const [eh, em] = sc.end_time.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        if (startMin < endMin ? nowMin >= startMin && nowMin < endMin : nowMin >= startMin || nowMin < endMin) {
          totalFare += Number(sc.amount);
        }
      }
    }

    if (bookingType === "scheduled") {
      totalFare += Number(vt.pre_booking_fee) || 0;
    }

    totalFare += totalFare * (Number(vt.passenger_tax_pct) / 100);

    return { fare: Math.max(Math.round(totalFare), Number(vt.minimum_fare)), zoneId: matchedZoneId };
  };

  // Sort: "Car" always first, then online first, then by capacity fit
  const sortedTypes = [...vehicleTypes].sort((a, b) => {
    const aIsCar = a.name.toLowerCase() === "car" ? 0 : 1;
    const bIsCar = b.name.toLowerCase() === "car" ? 0 : 1;
    if (aIsCar !== bIsCar) return aIsCar - bIsCar;
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
  const selectedResult = selectedType ? calcFare(selectedType) : { fare: 0, zoneId: null, fixedSurcharges: undefined };
  const selectedFare = typeof selectedResult === 'number' ? selectedResult : selectedResult.fare;
  const selectedZoneId = typeof selectedResult === 'number' ? null : selectedResult.zoneId;
  const selectedFixedSurcharges = typeof selectedResult === 'object' ? selectedResult.fixedSurcharges : undefined;
  const selectedIsOnline = selectedType ? onlineVehicleTypeIds.has(selectedType.id) : false;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[1.75rem] shadow-[0_-8px_40px_rgba(0,0,0,0.15)] z-10
                 lg:static lg:rounded-2xl lg:shadow-2xl lg:m-4 lg:border lg:border-border/40"
    >
      <div className="px-4 pt-2.5 pb-6 space-y-3">
        {/* Handle */}
        <div className="flex justify-center">
          <div className="w-10 h-1 rounded-full bg-border/60" />
        </div>

        {/* Header + route summary */}
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
              {stops.length > 0 && (
                <span className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">{stops.length}</span> stops</span>
              )}
              {distanceKm != null && (
                <span className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">{distanceKm.toFixed(1)}</span> km</span>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pt-2 pb-1 -mx-1 px-1 snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
            {sortedTypes.map((vt, index) => {
              const Icon = iconMap[vt.icon] || Car;
              const fareResult = calcFare(vt);
              const fare = fareResult.fare;
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
                  className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all snap-start shrink-0 w-[5.5rem] ${
                    !isOnline
                       ? "bg-surface/30 border-border/50 opacity-40 cursor-not-allowed"
                       : isSelected
                         ? "bg-primary/10 border-primary ring-1 ring-primary shadow-sm"
                         : fits
                           ? "bg-surface border-border active:bg-muted hover:border-primary/30"
                           : "bg-surface/50 border-border/50 opacity-60"
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
                  <div className="w-12 h-10 flex items-center justify-center">
                    {vt.image_url ? (
                      <img src={vt.image_url} alt={vt.name} className="w-full h-full object-contain" />
                    ) : (
                      <Icon className={`w-6 h-6 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <p className="font-semibold text-[11px] text-foreground truncate w-full text-center leading-tight">{vt.name}</p>
                  <p className="text-sm font-bold text-primary leading-none">{fare}<span className="text-[9px] font-medium text-muted-foreground ml-px">{bookingType === "hourly" ? "MVR/hr" : "MVR"}</span></p>
                  <p className="text-[9px] text-muted-foreground leading-none">{vt.capacity} seats</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected vehicle detail strip + fare adjuster */}
        {selectedType && (
          <div className="space-y-2">
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
              <div>
                <p className="text-base font-bold text-primary shrink-0">{selectedFare + passengerBonus} <span className="text-[10px] font-semibold text-muted-foreground">{bookingType === "hourly" ? "MVR/hr" : "MVR"}</span></p>
                {bookingType === "scheduled" && Number(selectedType.pre_booking_fee) > 0 && (
                  <p className="text-[9px] text-muted-foreground text-right">incl. {selectedType.pre_booking_fee} MVR booking fee</p>
                )}
              </div>
            </div>

            {/* Fixed surcharge / disposal type selector */}
            {selectedFixedSurcharges && selectedFixedSurcharges.length > 0 && (
              <div className="bg-accent/30 rounded-xl px-3 py-2.5 border border-accent/50">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Service Type</p>
                {selectedFixedSurcharges.length === 1 ? (
                  <p className="text-xs font-medium text-foreground">{selectedFixedSurcharges[0].name} — <span className="text-primary font-bold">{selectedFixedSurcharges[0].amount} MVR</span></p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {selectedFixedSurcharges.map((sc: any) => (
                      <button
                        key={sc.id}
                        onClick={() => setSelectedDisposalType(sc.id)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                          (selectedDisposalType === sc.id || (!selectedDisposalType && sc === selectedFixedSurcharges[0]))
                            ? "bg-primary/10 border-primary text-foreground font-semibold"
                            : "bg-surface border-border text-muted-foreground hover:border-primary/30"
                        }`}
                      >
                        <span>{sc.name}</span>
                        <span className="font-bold text-primary">{sc.amount} MVR</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={`rounded-xl px-3 py-3 border transition-all ${passengerBonus > 0 ? "bg-primary/5 border-primary/30 shadow-sm shadow-primary/10" : "bg-accent/40 border-accent/50"}`}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-md bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
                      <Zap className="w-3 h-3 text-primary-foreground" fill="currentColor" />
                    </div>
                    <p className="text-xs font-bold text-foreground">Boost Fare</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Add extra to attract drivers faster{maxBoost > 0 ? ` (max ${maxBoost} MVR)` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPassengerBonus(Math.max(0, passengerBonus - boostStep))}
                    disabled={passengerBonus <= 0}
                    className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center active:scale-90 transition-all disabled:opacity-30"
                  >
                    <Minus className="w-3.5 h-3.5 text-foreground" />
                  </button>
                  <span className={`text-base font-extrabold tabular-nums min-w-[3rem] text-center ${passengerBonus > 0 ? "text-primary" : "text-muted-foreground"}`}>
                    +{passengerBonus}
                  </span>
                  <button
                    onClick={() => setPassengerBonus(passengerBonus + boostStep)}
                    disabled={maxBoost > 0 && passengerBonus >= maxBoost}
                    className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center active:scale-90 transition-all disabled:opacity-30"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {passengerBonus > 0 && (
                <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>Base: {selectedFare} MVR</span>
                  <span>+</span>
                  <span className="text-primary font-semibold">Boost: {passengerBonus} MVR</span>
                  <span>=</span>
                  <span className="text-foreground font-bold">{selectedFare + passengerBonus} MVR</span>
                </div>
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => selectedType && selectedIsOnline && onConfirm(selectedType, selectedFare, passengerBonus, selectedZoneId)}
          disabled={!selectedType || !selectedIsOnline}
          className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40"
        >
          {!selectedType ? "Select a ride" : !selectedIsOnline ? "No drivers available" : bookingType === "hourly" ? `Confirm ${selectedType.name} — ${selectedFare + passengerBonus} MVR/hr` : `Confirm ${selectedType.name} — ${selectedFare + passengerBonus} MVR`}
        </button>
      </div>
    </motion.div>
  );
};

export default RideOptions;
