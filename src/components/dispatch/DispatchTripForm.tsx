import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notifyTripRequested, notifyTripAccepted } from "@/lib/push-notifications";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, MapPin, Users, Luggage, Plus, Minus, X, Search,
  Loader2, Navigation, Send, Trash2, DollarSign, CheckCircle2, Car, Clock,
  ChevronUp, ChevronDown, RotateCcw
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
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickupQuery, setPickupQuery] = useState("");
  const [pickup, setPickup] = useState<StopLocation | null>(null);
  const [dropoff, setDropoff] = useState<StopLocation | null>(null);
  const [stops, setStops] = useState<StopLocation[]>([]);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [centerCode, setCenterCode] = useState("");
  const [centerCodeResults, setCenterCodeResults] = useState<{
    code: string;
    color: string | null;
    plate_number: string;
    vehicle_type: string | null;
    vehicle_type_id: string | null;
    driver_name: string | null;
    driver_phone: string | null;
    last_trip_date: string | null;
    driver_id: string | null;
    today_trips: number;
  }[]>([]);
  const [selectedCenterCode, setSelectedCenterCode] = useState<string | null>(null);
  const [centerCodeLoading, setCenterCodeLoading] = useState(false);

  const [selecting, setSelecting] = useState<"pickup" | "dropoff" | number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [osmResults, setOsmResults] = useState<NominatimResult[]>([]);
  const [osmSearching, setOsmSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [selectedVehicleType, setSelectedVehicleType] = useState<string>("");
  const [dispatchMethod, setDispatchMethod] = useState<"broadcast" | "specific">("broadcast");
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Post-submit tracking state
  const [createdTrip, setCreatedTrip] = useState<any>(null);
  const [tripDriver, setTripDriver] = useState<any>(null);
  const [tripVehicle, setTripVehicle] = useState<any>(null);

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

  // Default vehicle type to "Car"
  useEffect(() => {
    if (!selectedVehicleType && vehicleTypes.length > 0) {
      const carType = vehicleTypes.find(vt => vt.name.toLowerCase() === "car");
      if (carType) setSelectedVehicleType(carType.id);
      else setSelectedVehicleType(vehicleTypes[0].id);
    }
  }, [vehicleTypes]);

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

  // Fare calculation
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

  // Realtime subscription for created trip
  useEffect(() => {
    if (!createdTrip?.id) return;
    const channel = supabase
      .channel(`dispatch-trip-${createdTrip.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${createdTrip.id}` }, async (payload) => {
        const updated = payload.new as any;
        setCreatedTrip(updated);
        if (updated.driver_id && !tripDriver) {
          const [{ data: driver }, { data: vehicle }, { data: driverLoc }] = await Promise.all([
            supabase.from("profiles").select("first_name, last_name, phone_number").eq("id", updated.driver_id).single(),
            updated.vehicle_id
              ? supabase.from("vehicles").select("plate_number, make, model, color").eq("id", updated.vehicle_id).single()
              : Promise.resolve({ data: null }),
            supabase.from("driver_locations").select("vehicle_id").eq("driver_id", updated.driver_id).single(),
          ]);
          setTripDriver(driver);
          if (vehicle) {
            setTripVehicle(vehicle);
          } else if (driverLoc?.vehicle_id) {
            const { data: v } = await supabase.from("vehicles").select("plate_number, make, model, color").eq("id", driverLoc.vehicle_id).single();
            setTripVehicle(v);
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [createdTrip?.id]);

  const dismissTrip = () => {
    setCreatedTrip(null);
    setTripDriver(null);
    setTripVehicle(null);
  };

  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) { setOsmResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setOsmSearching(true);
      try {
        // First, search admin-added service locations
        const q = searchQuery.toLowerCase();
        const adminMatches: NominatimResult[] = serviceLocations
          .filter((sl: any) => sl.name.toLowerCase().includes(q))
          .map((sl: any) => ({
            place_id: Date.now() + Math.random(),
            display_name: sl.name,
            lat: String(sl.lat),
            lon: String(sl.lng),
            name: sl.name,
          }));

        // Then fetch from Nominatim
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=mv&limit=5&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        const osmData = await res.json();

        // Combine: admin locations first, then OSM results (deduplicated)
        const adminNames = new Set(adminMatches.map(m => m.name?.toLowerCase()));
        const filtered = osmData.filter((r: any) => !adminNames.has((r.name || "").toLowerCase()));
        setOsmResults([...adminMatches, ...filtered]);
      } catch { setOsmResults([]); }
      setOsmSearching(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, serviceLocations]);

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

  const selectServiceAreaAsDropoff = (sl: any) => {
    setDropoff({ address: sl.name, lat: sl.lat, lng: sl.lng });
  };

  const addStop = () => setStops([...stops, { address: "", lat: 0, lng: 0 }]);
  const removeStop = (i: number) => setStops(stops.filter((_, idx) => idx !== i));

  const clearForm = () => {
    setCustomerPhone("");
    setPickup(null);
    setPickupQuery("");
    setDropoff(null);
    setStops([]);
    setPassengerCount(1);
    setLuggageCount(0);
    setCenterCode("");
    setCenterCodeResults([]);
    setSelectedCenterCode(null);
    setSelectedVehicleType("");
    setDispatchMethod("broadcast");
    setSelectedDriverId("");
    setEstimatedFare(null);
    setCreatedTrip(null);
    setTripDriver(null);
    setTripVehicle(null);
  };

  const handleSubmit = async () => {
    if (!pickup || !dropoff) {
      toast({ title: "Select pickup and dropoff", variant: "destructive" });
      return;
    }
    if (!customerPhone.trim()) {
      toast({ title: "Enter customer phone", variant: "destructive" });
      return;
    }

    // Determine assigned driver: from center code selection or specific driver dropdown
    const assignedEntry = selectedCenterCode ? centerCodeResults.find(r => r.code === selectedCenterCode) : null;
    const assignedDriverId = assignedEntry?.driver_id || (dispatchMethod === "specific" ? selectedDriverId : null);
    const isAssigned = !!assignedDriverId;

    if (dispatchMethod === "specific" && !isAssigned) {
      toast({ title: "Select a driver", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const customerName = "Dispatch";

      const tripPayload: any = {
        pickup_address: pickup.address,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_address: dropoff.address,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        passenger_count: passengerCount,
        luggage_count: luggageCount,
        customer_name: customerName,
        customer_phone: customerPhone.trim(),
        created_by: dispatcherProfile?.id || null,
        dispatch_type: "operator",
        vehicle_type_id: selectedVehicleType || null,
        status: isAssigned ? "accepted" : "requested",
        driver_id: assignedDriverId || null,
        accepted_at: isAssigned ? new Date().toISOString() : null,
        fare_type: "distance",
        estimated_fare: estimatedFare || null,
        booking_notes: centerCodeResults.length > 0 ? `Center: ${centerCodeResults.map(r => r.code).join(", ")}` : null,
      };

      const { data: trip, error } = await supabase.from("trips").insert(tripPayload).select("*").single();
      if (error) throw error;

      if (isAssigned && assignedDriverId) {
        setCreatedTrip(trip);
        if (assignedEntry) {
          setTripDriver({ first_name: assignedEntry.driver_name || "", last_name: "", phone_number: assignedEntry.driver_phone || "" });
          setTripVehicle({ plate_number: assignedEntry.plate_number, make: assignedEntry.vehicle_type || "" });
        } else {
          const driverLoc = onlineDrivers.find(d => d.driver_id === assignedDriverId);
          if (driverLoc) {
            setTripDriver({ first_name: driverLoc.first_name, last_name: driverLoc.last_name, phone_number: driverLoc.phone_number });
            setTripVehicle({ plate_number: driverLoc.plate_number, make: driverLoc.vehicle_name });
          }
        }
      } else {
        setCreatedTrip(trip);
      }

      if (stops.length > 0) {
        const validStops = stops.filter(s => s.lat !== 0 && s.address);
        if (validStops.length > 0) {
          await supabase.from("trip_stops").insert(
            validStops.map((s, i) => ({ trip_id: trip.id, stop_order: i + 1, address: s.address, lat: s.lat, lng: s.lng }))
          );
        }
      }

      toast({ title: `Bid ${formIndex + 1} sent!`, description: isAssigned ? "Assigned to driver" : "Broadcasting to nearby drivers" });

      try {
        if (isAssigned && assignedDriverId) {
          await notifyTripAccepted(assignedDriverId, "Dispatch", trip.id);
        } else {
          const { data: drivers } = await supabase.from("driver_locations").select("driver_id").eq("is_online", true).eq("is_on_trip", false);
          if (drivers && drivers.length > 0) {
            await notifyTripRequested(drivers.map((d: any) => d.driver_id), trip.id, tripPayload.pickup_address);
          }
        }
      } catch (pushErr) {
        console.warn("Push notification failed:", pushErr);
      }

      // Reset form after send
      setCustomerPhone("");
      setPickup(null);
      setPickupQuery("");
      setDropoff(null);
      setStops([]);
      setPassengerCount(1);
      setLuggageCount(0);
      setCenterCode("");
      setCenterCodeResults([]);
      setSelectedCenterCode(null);
      setSelectedDriverId("");
      setEstimatedFare(null);
      onTripCreated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const formLabels = ["Bid 1", "Bid 2", "Bid 3"];

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
      {/* Form header */}
      <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">{formLabels[formIndex]}</h3>
          {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
        <div className="flex items-center gap-3">
          {estimatedFare != null && (
            <span className="flex items-center gap-1 text-sm font-bold text-primary">
              <DollarSign className="w-3.5 h-3.5" />
              {estimatedFare} MVR
            </span>
          )}
          <button onClick={clearForm} className="text-xs text-muted-foreground hover:text-foreground font-medium">Clear Form</button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3 overflow-y-auto flex-1">
          {/* Pax & Luggage - compact */}
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

          {/* Vehicle type - buttons instead of select */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {[...vehicleTypes].sort((a, b) => {
                const order = ["car", "van", "mini pickup", "big pickup", "hda wav"];
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                const aIdx = order.findIndex(o => aName.includes(o));
                const bIdx = order.findIndex(o => bName.includes(o));
                const aOrder = aIdx >= 0 ? aIdx : (aName.includes("cyc") ? 100 + order.length : 50);
                const bOrder = bIdx >= 0 ? bIdx : (bName.includes("cyc") ? 100 + order.length : 50);
                return aOrder - bOrder;
              }).map(vt => (
                <button
                  key={vt.id}
                  onClick={() => setSelectedVehicleType(vt.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${
                    selectedVehicleType === vt.id ? "bg-primary text-primary-foreground border-primary" : "bg-surface border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {vt.name}
                </button>
              ))}
            </div>
          </div>

          {/* FROM - Pickup */}
          <div className="space-y-1.5 relative">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">From*</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={selecting === "pickup" ? searchQuery : (pickup?.address || pickupQuery)}
                onChange={e => { setSelecting("pickup"); setSearchQuery(e.target.value); setPickupQuery(e.target.value); }}
                onFocus={() => { setSelecting("pickup"); setSearchQuery(pickupQuery); }}
                placeholder="Type location (e.g., Male, Airport, Sifco...)"
                className="w-full pl-8 pr-8 py-2.5 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {pickup && (
                <button onClick={() => { setPickup(null); setPickupQuery(""); setSearchQuery(""); setSelecting("pickup"); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
              {osmSearching && selecting === "pickup" && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
            {selecting === "pickup" && osmResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {osmResults.map(r => (
                  <button key={r.place_id} onClick={() => selectLocation(r)} className="flex items-center gap-2 w-full px-3 py-2 hover:bg-surface text-left transition-colors border-b border-border last:border-0">
                    <Navigation className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{r.name || r.display_name.split(",")[0]}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{r.display_name.split(",").slice(0, 3).join(",")}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* TO - Service area buttons */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">To*</p>
            {serviceLocations.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {serviceLocations.map(sl => (
                  <button
                    key={sl.id}
                    onClick={() => selectServiceAreaAsDropoff(sl)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                      dropoff?.address === sl.name
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-surface border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {sl.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={selecting === "dropoff" ? searchQuery : (dropoff?.address || "")}
                  onChange={e => { setSelecting("dropoff"); setSearchQuery(e.target.value); }}
                  onFocus={() => { setSelecting("dropoff"); setSearchQuery(""); }}
                  placeholder="Search destination..."
                  className="w-full pl-8 pr-8 py-2.5 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {dropoff && (
                  <button onClick={() => { setDropoff(null); setSearchQuery(""); setSelecting("dropoff"); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
                {selecting === "dropoff" && osmResults.length > 0 && (
                  <div className="absolute left-0 right-0 z-20 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {osmResults.map(r => (
                      <button key={r.place_id} onClick={() => selectLocation(r)} className="flex items-center gap-2 w-full px-3 py-2 hover:bg-surface text-left transition-colors border-b border-border last:border-0">
                        <Navigation className="w-3.5 h-3.5 text-primary shrink-0" />
                        <p className="text-xs text-foreground truncate">{r.name || r.display_name.split(",")[0]}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {distanceKm != null && (
              <p className="text-[10px] text-muted-foreground">Distance: <span className="font-semibold text-foreground">{distanceKm.toFixed(1)} km</span></p>
            )}
          </div>

          {/* Stops */}
          {stops.length > 0 && (
            <div className="space-y-1.5">
              {stops.map((stop, i) => (
                <div key={i} className="relative">
                  <div className="flex items-center gap-1">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <input
                        type="text"
                        value={selecting === i ? searchQuery : (stop.address || "")}
                        onChange={e => { setSelecting(i); setSearchQuery(e.target.value); }}
                        onFocus={() => { setSelecting(i); setSearchQuery(""); }}
                        placeholder={`Stop ${i + 1}`}
                        className="w-full pl-7 pr-2.5 py-2 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <button onClick={() => removeStop(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  {selecting === i && osmResults.length > 0 && (
                    <div className="absolute left-0 right-6 z-20 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {osmResults.map(r => (
                        <button key={r.place_id} onClick={() => selectLocation(r)} className="flex items-center gap-2 w-full px-3 py-2 hover:bg-surface text-left transition-colors border-b border-border last:border-0">
                          <Navigation className="w-3 h-3 text-primary shrink-0" />
                          <p className="text-xs text-foreground truncate">{r.name || r.display_name.split(",")[0]}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <button onClick={addStop} className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline">
            <Plus className="w-3 h-3" /> Add Stop
          </button>

          {/* Contact */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Contact</p>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-semibold">+960</span>
              <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="Customer phone" className="w-full pl-10 pr-2.5 py-2.5 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          {/* Center Code */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Center Code*</p>
            <input
              value={centerCode}
              onChange={e => {
                setCenterCode(e.target.value.toUpperCase());
              }}
              placeholder="Type code & press Enter (multiple allowed)"
              className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={async e => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                  const code = centerCode.trim();
                  if (!code) return;
                  // Don't add duplicates
                  if (centerCodeResults.some(r => r.code === code)) {
                    toast({ title: "Already added", description: `Code "${code}" is already in the list` });
                    setCenterCode("");
                    return;
                  }
                  setCenterCodeLoading(true);
                  try {
                    const { data: vehicle } = await supabase
                      .from("vehicles")
                      .select("plate_number, color, vehicle_type_id, driver_id, vehicle_types:vehicle_type_id(name)")
                      .eq("center_code", code)
                      .eq("is_active", true)
                      .limit(1)
                      .single();
                    if (!vehicle) {
                      toast({ title: "No vehicle found", description: `Center code "${code}" not found`, variant: "destructive" });
                      setCenterCodeLoading(false);
                      return;
                    }
                    let driverName: string | null = null;
                    let driverPhone: string | null = null;
                    let lastTripDate: string | null = null;
                    let todayTrips = 0;

                    if (vehicle.driver_id) {
                      const todayStart = new Date();
                      todayStart.setHours(0, 0, 0, 0);
                      const [{ data: profile }, { data: lastTrip }, { count: todayCount }] = await Promise.all([
                        supabase.from("profiles").select("first_name, last_name, phone_number").eq("id", vehicle.driver_id).single(),
                        supabase.from("trips").select("completed_at").eq("driver_id", vehicle.driver_id).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
                        supabase.from("trips").select("id", { count: "exact", head: true }).eq("driver_id", vehicle.driver_id).gte("created_at", todayStart.toISOString()).in("status", ["requested", "accepted", "started", "completed"]),
                      ]);
                      if (profile) {
                        driverName = `${profile.first_name} ${profile.last_name}`.trim();
                        driverPhone = profile.phone_number;
                      }
                      if (lastTrip?.completed_at) {
                        lastTripDate = lastTrip.completed_at;
                      }
                      todayTrips = todayCount || 0;
                    }

                    const newEntry = {
                      code,
                      color: vehicle.color,
                      plate_number: vehicle.plate_number,
                      vehicle_type: (vehicle.vehicle_types as any)?.name || null,
                      vehicle_type_id: vehicle.vehicle_type_id,
                      driver_name: driverName,
                      driver_phone: driverPhone,
                      last_trip_date: lastTripDate,
                      driver_id: vehicle.driver_id,
                      today_trips: todayTrips,
                    };

                    // Sort: least recent trip first (driver who hasn't had a trip recently comes up)
                    const updated = [...centerCodeResults, newEntry].sort((a, b) => {
                      if (!a.last_trip_date && !b.last_trip_date) return 0;
                      if (!a.last_trip_date) return -1;
                      if (!b.last_trip_date) return 1;
                      return new Date(a.last_trip_date).getTime() - new Date(b.last_trip_date).getTime();
                    });
                    setCenterCodeResults(updated);

                    // Auto-select vehicle type from first (most recent) result
                    const topResult = updated[0];
                    if (topResult?.vehicle_type_id) {
                      setSelectedVehicleType(topResult.vehicle_type_id);
                    }

                    setCenterCode("");
                  } catch {
                    toast({ title: "Lookup failed", variant: "destructive" });
                  }
                  setCenterCodeLoading(false);
                }
              }}
            />
            {centerCodeLoading && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Looking up...
              </div>
            )}
            {centerCodeResults.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {centerCodeResults.map((info) => (
                  <div
                    key={info.code}
                    onClick={() => {
                      if (!info.driver_id) return;
                      setSelectedCenterCode(selectedCenterCode === info.code ? null : info.code);
                      if (info.vehicle_type_id) setSelectedVehicleType(info.vehicle_type_id);
                      setDispatchMethod("specific");
                      setSelectedDriverId(info.driver_id);
                    }}
                    className={`border rounded-lg px-2.5 py-1.5 text-xs cursor-pointer transition-all ${
                      selectedCenterCode === info.code
                        ? "bg-primary/10 border-primary ring-1 ring-primary/30"
                        : "bg-surface border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-foreground">
                        {selectedCenterCode === info.code && <CheckCircle2 className="w-3 h-3 inline mr-1 text-primary" />}
                        <span className="font-bold">{info.code}</span>
                        {" "}<span className="font-semibold">{info.plate_number}</span>
                        {info.vehicle_type && <span className="text-muted-foreground"> • {info.vehicle_type}</span>}
                        {info.today_trips > 0 && <span className="text-primary font-semibold"> • {info.today_trips} today</span>}
                      </span>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        const updated = centerCodeResults.filter(r => r.code !== info.code);
                        setCenterCodeResults(updated);
                        if (selectedCenterCode === info.code) setSelectedCenterCode(null);
                        if (updated.length > 0 && updated[0].vehicle_type_id) {
                          setSelectedVehicleType(updated[0].vehicle_type_id);
                        }
                      }} className="text-muted-foreground hover:text-destructive ml-2">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-muted-foreground text-[10px]">
                      {info.last_trip_date && <>Last: {new Date(info.last_trip_date).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "2-digit" }).toUpperCase()} {new Date(info.last_trip_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>}
                      {!info.last_trip_date && <span>No trips yet</span>}
                      {info.driver_phone && <> • Driver: {info.driver_phone}</>}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>




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

          {/* Trip status tracker */}
          {createdTrip && (
            <div className="space-y-2">
              <div className={`rounded-xl p-3 space-y-2 ${createdTrip.status === "accepted" || createdTrip.status === "arrived" || createdTrip.status === "in_progress" ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" : createdTrip.status === "cancelled" ? "bg-destructive/5 border border-destructive/20" : "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {createdTrip.status === "requested" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-yellow-600" />
                    ) : createdTrip.status === "cancelled" ? (
                      <X className="w-4 h-4 text-destructive" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    )}
                    <span className="text-xs font-bold text-foreground capitalize">{createdTrip.status === "requested" ? "Waiting for driver..." : createdTrip.status}</span>
                  </div>
                  <button onClick={dismissTrip} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <p className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {createdTrip.pickup_address} → {createdTrip.dropoff_address}</p>
                  <p className="flex items-center gap-1"><Phone className="w-3 h-3" /> {createdTrip.customer_name} • {createdTrip.customer_phone}</p>
                  {createdTrip.estimated_fare && <p className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {createdTrip.estimated_fare}{(createdTrip as any).passenger_bonus > 0 ? ` (+${(createdTrip as any).passenger_bonus} boost)` : ""} MVR</p>}
                </div>

                {tripDriver && (
                  <div className="bg-card rounded-lg p-2.5 space-y-1 border border-border">
                    <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Driver Assigned</p>
                    <p className="text-sm font-bold text-foreground">{tripDriver.first_name} {tripDriver.last_name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {tripDriver.phone_number}</p>
                    {tripVehicle && (
                      <div className="flex items-center gap-1.5 pt-1 border-t border-border mt-1">
                        <Car className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-bold text-foreground">{tripVehicle.plate_number}</span>
                        <span className="text-[10px] text-muted-foreground">{tripVehicle.make} {tripVehicle.model} {tripVehicle.color ? `• ${tripVehicle.color}` : ""}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      {!collapsed && (
        <div className="p-3 pt-0">
          <button onClick={handleSubmit} disabled={submitting || !pickup || !dropoff || !customerPhone} className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 text-sm">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Send</>}
          </button>
        </div>
      )}

    </div>
  );
};

export default DispatchTripForm;
