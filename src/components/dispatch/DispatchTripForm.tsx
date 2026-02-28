import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notifyTripRequested, notifyTripAccepted } from "@/lib/push-notifications";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, MapPin, Users, Luggage, Plus, Minus, X, Search,
  Loader2, Navigation, Send, Trash2, DollarSign
} from "lucide-react";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
}

interface StopLocation {
  address: string;
  lat: number;
  lng: number;
}

interface OnlineDriver {
  driver_id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  vehicle_name: string;
  plate_number: string;
  lat: number;
  lng: number;
}

interface DispatchTripFormProps {
  formIndex: number;
  dispatcherProfile: any;
  vehicleTypes: any[];
  onlineDrivers: OnlineDriver[];
  onTripCreated: () => void;
}

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const DispatchTripForm = ({ formIndex, dispatcherProfile, vehicleTypes, onlineDrivers, onTripCreated }: DispatchTripFormProps) => {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickup, setPickup] = useState<StopLocation | null>(null);
  const [dropoff, setDropoff] = useState<StopLocation | null>(null);
  const [stops, setStops] = useState<StopLocation[]>([]);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [selecting, setSelecting] = useState<"pickup" | "dropoff" | number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [osmResults, setOsmResults] = useState<NominatimResult[]>([]);
  const [osmSearching, setOsmSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [selectedVehicleType, setSelectedVehicleType] = useState<string>("");
  const [dispatchMethod, setDispatchMethod] = useState<"broadcast" | "specific">("broadcast");
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Fare calculation state
  const [fareZones, setFareZones] = useState<any[]>([]);
  const [surcharges, setSurcharges] = useState<any[]>([]);
  const [serviceLocations, setServiceLocations] = useState<any[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [segmentDistances, setSegmentDistances] = useState<number[]>([]);
  const [estimatedFare, setEstimatedFare] = useState<number | null>(null);

  // Load fare data
  useEffect(() => {
    const load = async () => {
      const [fzRes, scRes, slRes] = await Promise.all([
        supabase.from("fare_zones").select("*").eq("is_active", true),
        supabase.from("fare_surcharges").select("*").eq("is_active", true),
        supabase.from("service_locations").select("id, name, lat, lng").eq("is_active", true),
      ]);
      setFareZones(fzRes.data || []);
      setSurcharges(scRes.data || []);
      setServiceLocations(slRes.data || []);
    };
    load();
  }, []);

  // Calculate OSRM distance
  useEffect(() => {
    const allPoints: { lat: number; lng: number }[] = [];
    if (pickup) allPoints.push({ lat: pickup.lat, lng: pickup.lng });
    for (const s of stops) {
      if (s.lat && s.address) allPoints.push({ lat: s.lat, lng: s.lng });
    }
    if (dropoff) allPoints.push({ lat: dropoff.lat, lng: dropoff.lng });

    if (allPoints.length < 2) {
      setDistanceKm(null);
      setSegmentDistances([]);
      return;
    }

    let straightTotal = 0;
    const straightSegments: number[] = [];
    for (let i = 0; i < allPoints.length - 1; i++) {
      const d = haversineKm(allPoints[i].lat, allPoints[i].lng, allPoints[i + 1].lat, allPoints[i + 1].lng);
      straightTotal += d;
      straightSegments.push(d * 1.3);
    }

    const coords = allPoints.map(p => `${p.lng},${p.lat}`).join(";");
    fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&steps=false&annotations=false`)
      .then(r => r.json())
      .then(data => {
        if (data.routes?.[0]) {
          setDistanceKm(data.routes[0].distance / 1000);
          const legs = data.routes[0].legs;
          setSegmentDistances(legs?.length > 0 ? legs.map((l: any) => l.distance / 1000) : [data.routes[0].distance / 1000]);
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

  // Fare calculation (mirrors passenger RideOptions logic)
  useEffect(() => {
    if (!pickup || !dropoff || !selectedVehicleType) {
      setEstimatedFare(null);
      return;
    }
    const vt = vehicleTypes.find(v => v.id === selectedVehicleType);
    if (!vt) { setEstimatedFare(null); return; }

    const findServiceArea = (lat: number, lng: number) => {
      let best: any = null;
      let bestDist = Infinity;
      for (const sl of serviceLocations) {
        const d = haversineKm(lat, lng, sl.lat, sl.lng);
        if (d < bestDist) { bestDist = d; best = sl; }
      }
      return best;
    };

    const waypoints = [pickup, ...stops.filter(s => s.lat && s.address), dropoff];
    let totalFare = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const fromArea = findServiceArea(from.lat, from.lng);
      const toArea = findServiceArea(to.lat, to.lng);

      const zone = fareZones.find((fz: any) => {
        if (fz.vehicle_type_id !== vt.id) return false;
        const fromNames = [from.address, fromArea?.name, fromArea?.id].filter(Boolean);
        const toNames = [to.address, toArea?.name, toArea?.id].filter(Boolean);
        return (
          (fromNames.includes(fz.from_area) && toNames.includes(fz.to_area)) ||
          (toNames.includes(fz.from_area) && fromNames.includes(fz.to_area))
        );
      });

      if (zone) {
        totalFare += Number(zone.fixed_fare);
      } else {
        const segDist = segmentDistances[i] ?? (distanceKm != null ? distanceKm / Math.max(waypoints.length - 1, 1) : 0);
        totalFare += Number(vt.base_fare) + Number(vt.per_km_rate) * segDist;
      }
    }

    for (const sc of surcharges) {
      if (sc.surcharge_type === "luggage" && sc.luggage_threshold != null) {
        const extra = Math.max(0, luggageCount - sc.luggage_threshold);
        if (extra > 0) totalFare += Number(sc.amount) * extra;
      }
      if (sc.surcharge_type === "time_based" && sc.start_time && sc.end_time) {
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = sc.start_time.split(":").map(Number);
        const [eh, em] = sc.end_time.split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        if (startMin < endMin ? nowMin >= startMin && nowMin < endMin : nowMin >= startMin || nowMin < endMin) {
          totalFare += Number(sc.amount);
        }
      }
    }

    totalFare += totalFare * (Number(vt.passenger_tax_pct) / 100);
    setEstimatedFare(Math.max(Math.round(totalFare), Number(vt.minimum_fare)));
  }, [pickup, dropoff, stops, selectedVehicleType, vehicleTypes, fareZones, surcharges, serviceLocations, distanceKm, segmentDistances, luggageCount]);

  // Nominatim search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) { setOsmResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setOsmSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=mv&limit=5&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        setOsmResults(await res.json());
      } catch { setOsmResults([]); }
      setOsmSearching(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const selectLocation = (result: NominatimResult) => {
    const loc: StopLocation = {
      address: result.name || result.display_name.split(",").slice(0, 2).join(", "),
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    };
    if (selecting === "pickup") setPickup(loc);
    else if (selecting === "dropoff") setDropoff(loc);
    else if (typeof selecting === "number") {
      const newStops = [...stops];
      newStops[selecting] = loc;
      setStops(newStops);
    }
    setSelecting(null);
    setSearchQuery("");
    setOsmResults([]);
  };

  const addStop = () => setStops([...stops, { address: "", lat: 0, lng: 0 }]);
  const removeStop = (i: number) => setStops(stops.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!pickup || !dropoff) {
      toast({ title: "Select pickup and dropoff", variant: "destructive" });
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      toast({ title: "Enter customer name and phone", variant: "destructive" });
      return;
    }
    if (dispatchMethod === "specific" && !selectedDriverId) {
      toast({ title: "Select a driver", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const tripPayload: any = {
        pickup_address: pickup.address,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_address: dropoff.address,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        passenger_count: passengerCount,
        luggage_count: luggageCount,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        created_by: dispatcherProfile?.id || null,
        dispatch_type: "operator",
        vehicle_type_id: selectedVehicleType || null,
        status: dispatchMethod === "specific" ? "accepted" : "requested",
        driver_id: dispatchMethod === "specific" ? selectedDriverId : null,
        accepted_at: dispatchMethod === "specific" ? new Date().toISOString() : null,
        fare_type: "distance",
        estimated_fare: estimatedFare || null,
      };

      const { data: trip, error } = await supabase.from("trips").insert(tripPayload).select().single();
      if (error) throw error;

      if (stops.length > 0) {
        const validStops = stops.filter(s => s.lat !== 0 && s.address);
        if (validStops.length > 0) {
          await supabase.from("trip_stops").insert(
            validStops.map((s, i) => ({ trip_id: trip.id, stop_order: i + 1, address: s.address, lat: s.lat, lng: s.lng }))
          );
        }
      }

      toast({ title: `Trip ${formIndex + 1} created!`, description: dispatchMethod === "specific" ? "Assigned to driver" : "Broadcasting to nearby drivers" });

      try {
        if (dispatchMethod === "specific" && selectedDriverId) {
          await notifyTripAccepted(selectedDriverId, "Dispatch", trip.id);
        } else {
          const { data: drivers } = await supabase.from("driver_locations").select("driver_id").eq("is_online", true).eq("is_on_trip", false);
          if (drivers && drivers.length > 0) {
            await notifyTripRequested(drivers.map((d: any) => d.driver_id), trip.id, tripPayload.pickup_address);
          }
        }
      } catch (pushErr) {
        console.warn("Push notification failed:", pushErr);
      }

      // Reset form
      setCustomerName("");
      setCustomerPhone("");
      setPickup(null);
      setDropoff(null);
      setStops([]);
      setPassengerCount(1);
      setLuggageCount(0);
      setSelectedDriverId("");
      setEstimatedFare(null);
      onTripCreated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const formLabels = ["Trip 1", "Trip 2", "Trip 3"];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
      {/* Form header */}
      <div className="bg-primary/5 border-b border-border px-4 py-2.5 flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">{formLabels[formIndex]}</h3>
        {estimatedFare != null && (
          <span className="flex items-center gap-1 text-sm font-bold text-primary">
            <DollarSign className="w-3.5 h-3.5" />
            {estimatedFare} MVR
          </span>
        )}
      </div>

      <div className="p-3 space-y-3 overflow-y-auto flex-1">
        {/* Customer */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Phone className="w-3 h-3" /> Customer</p>
          <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Name *" className="w-full px-2.5 py-2 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-semibold">+960</span>
            <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="7XXXXXX" className="w-full pl-10 pr-2.5 py-2 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>

        {/* Locations */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><MapPin className="w-3 h-3" /> Route</p>
          <button onClick={() => { setSelecting("pickup"); setSearchQuery(""); setOsmResults([]); }} className={`w-full px-2.5 py-2 rounded-lg text-left text-xs transition-all ${pickup ? "bg-surface border border-border text-foreground" : "bg-surface border-2 border-dashed border-border text-muted-foreground"}`}>
            {pickup ? pickup.address : "Pickup *"}
          </button>
          {stops.map((stop, i) => (
            <div key={i} className="flex items-center gap-1">
              <button onClick={() => { setSelecting(i); setSearchQuery(""); setOsmResults([]); }} className={`flex-1 px-2.5 py-2 rounded-lg text-left text-xs ${stop.address ? "bg-surface border border-border text-foreground" : "bg-surface border-2 border-dashed border-border text-muted-foreground"}`}>
                {stop.address || `Stop ${i + 1}`}
              </button>
              <button onClick={() => removeStop(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button onClick={addStop} className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline">
            <Plus className="w-3 h-3" /> Add Stop
          </button>
          <button onClick={() => { setSelecting("dropoff"); setSearchQuery(""); setOsmResults([]); }} className={`w-full px-2.5 py-2 rounded-lg text-left text-xs transition-all ${dropoff ? "bg-surface border border-border text-foreground" : "bg-surface border-2 border-dashed border-border text-muted-foreground"}`}>
            {dropoff ? dropoff.address : "Dropoff *"}
          </button>
          {distanceKm != null && (
            <p className="text-[10px] text-muted-foreground">Distance: <span className="font-semibold text-foreground">{distanceKm.toFixed(1)} km</span></p>
          )}
        </div>

        {/* Pax & Luggage */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Pax</p>
            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => setPassengerCount(Math.max(1, passengerCount - 1))} className="w-7 h-7 rounded-md bg-surface flex items-center justify-center" disabled={passengerCount <= 1}><Minus className="w-3 h-3" /></button>
              <span className="text-sm font-bold text-foreground w-4 text-center">{passengerCount}</span>
              <button onClick={() => setPassengerCount(Math.min(20, passengerCount + 1))} className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center"><Plus className="w-3 h-3 text-primary" /></button>
            </div>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Luggage className="w-3 h-3" /> Bags</p>
            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => setLuggageCount(Math.max(0, luggageCount - 1))} className="w-7 h-7 rounded-md bg-surface flex items-center justify-center" disabled={luggageCount <= 0}><Minus className="w-3 h-3" /></button>
              <span className="text-sm font-bold text-foreground w-4 text-center">{luggageCount}</span>
              <button onClick={() => setLuggageCount(Math.min(30, luggageCount + 1))} className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center"><Plus className="w-3 h-3 text-primary" /></button>
            </div>
          </div>
        </div>

        {/* Vehicle type */}
        <div className="space-y-2">
          <select value={selectedVehicleType} onChange={e => setSelectedVehicleType(e.target.value)} className="w-full px-2.5 py-2 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Any vehicle</option>
            {vehicleTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name} {estimatedFare != null && selectedVehicleType === vt.id ? "" : ""}</option>)}
          </select>
        </div>

        {/* Dispatch method */}
        <div className="space-y-2">
          <select value={dispatchMethod} onChange={e => setDispatchMethod(e.target.value as any)} className="w-full px-2.5 py-2 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="broadcast">Broadcast</option>
            <option value="specific">Assign driver</option>
          </select>

          {dispatchMethod === "specific" && (
            <div className="max-h-32 overflow-y-auto space-y-1">
              {onlineDrivers.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">No drivers online</p>
              ) : (
                onlineDrivers.map(d => (
                  <button key={d.driver_id} onClick={() => setSelectedDriverId(d.driver_id)} className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-xs transition-all ${selectedDriverId === d.driver_id ? "bg-primary/10 ring-1 ring-primary" : "bg-surface hover:bg-muted"}`}>
                    <div>
                      <p className="font-medium text-foreground">{d.first_name} {d.last_name}</p>
                      <p className="text-[10px] text-muted-foreground">{d.vehicle_name} • {d.plate_number}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Fare display */}
        {estimatedFare != null && (
          <div className="bg-primary/5 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Estimated Fare</span>
            <span className="text-base font-bold text-primary">{estimatedFare} MVR</span>
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="p-3 pt-0">
        <button onClick={handleSubmit} disabled={submitting || !pickup || !dropoff || !customerName || !customerPhone} className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 text-sm">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Send</>}
        </button>
      </div>

      {/* Location selector modal */}
      <AnimatePresence>
        {selecting !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-start justify-center pt-20 p-4" onClick={() => { setSelecting(null); setSearchQuery(""); setOsmResults([]); }}>
            <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} className="bg-card border border-border rounded-xl p-5 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
              <h4 className="font-semibold text-foreground">
                {selecting === "pickup" ? "Select Pickup" : selecting === "dropoff" ? "Select Dropoff" : `Select Stop ${(selecting as number) + 1}`}
              </h4>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="Search places in Maldives..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                {osmSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {osmResults.map(r => (
                  <button key={r.place_id} onClick={() => selectLocation(r)} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-surface text-left transition-colors">
                    <Navigation className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.name || r.display_name.split(",")[0]}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.display_name.split(",").slice(0, 3).join(",")}</p>
                    </div>
                  </button>
                ))}
                {osmResults.length === 0 && searchQuery.length >= 3 && !osmSearching && (
                  <p className="text-sm text-muted-foreground text-center py-4">No places found</p>
                )}
                {searchQuery.length < 3 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Type at least 3 characters</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DispatchTripForm;
