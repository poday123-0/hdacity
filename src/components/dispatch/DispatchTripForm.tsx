import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notifyTripRequested } from "@/lib/push-notifications";
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
  tag?: string;
  road?: string;
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

type CenterCodeIndexEntry = {
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
  has_loss?: boolean;
};

interface DispatchTripFormProps {
  formIndex: number;
  dispatcherProfile: any;
  vehicleTypes: any[];
  onlineDrivers: OnlineDriver[];
  centerCodeIndex: Record<string, CenterCodeIndexEntry>;
  onTripCreated: () => void;
}

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Local cache for locations data shared across form instances
let _locationsCache: { serviceLocations: any[]; namedLocations: any[]; fareZones: any[]; surcharges: any[] } | null = null;
let _locationsCacheTs = 0;
const LOC_CACHE_TTL = 120_000; // 2 min

const DispatchTripForm = ({
  formIndex,
  dispatcherProfile,
  vehicleTypes,
  onlineDrivers,
  centerCodeIndex,
  onTripCreated,
}: DispatchTripFormProps) => {
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickupQuery, setPickupQuery] = useState("");
  const [pickup, setPickup] = useState<StopLocation | null>(null);
  const [dropoff, setDropoff] = useState<StopLocation | null>(null);
  const [stops, setStops] = useState<StopLocation[]>([]);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [centerCode, setCenterCode] = useState("");
  const centerCodeInputRef = useRef<HTMLInputElement | null>(null);
  const [centerCodeResults, setCenterCodeResults] = useState<CenterCodeIndexEntry[]>([]);
  const [selectedCenterCode, setSelectedCenterCode] = useState<string | null>(null);

  const [selecting, setSelecting] = useState<"pickup" | "dropoff" | number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [osmResults, setOsmResults] = useState<NominatimResult[]>([]);
  const [osmSearching, setOsmSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [selectedVehicleType, setSelectedVehicleType] = useState<string>("");
  const [dispatchMethod, setDispatchMethod] = useState<"broadcast" | "specific">("specific");
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Refs for keyboard navigation
  const pickupInputRef = useRef<HTMLInputElement | null>(null);
  const dropoffInputRef = useRef<HTMLInputElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const vehicleTypeButtonsRef = useRef<HTMLDivElement | null>(null);
  const toButtonsRef = useRef<HTMLDivElement | null>(null);
  const [vehicleTypeFocusIndex, setVehicleTypeFocusIndex] = useState(0);
  const [toButtonFocusIndex, setToButtonFocusIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  // Post-submit tracking state (kept for realtime subscription)
  const [createdTrip, setCreatedTrip] = useState<any>(null);
  const [tripDriver, setTripDriver] = useState<any>(null);
  const [tripVehicle, setTripVehicle] = useState<any>(null);

  // Fare calculation state
  const [fareZones, setFareZones] = useState<any[]>([]);
  const [surcharges, setSurcharges] = useState<any[]>([]);
  const [serviceLocations, setServiceLocations] = useState<any[]>([]);
  const [namedLocations, setNamedLocations] = useState<any[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [segmentDistances, setSegmentDistances] = useState<number[]>([]);
  const [estimatedFare, setEstimatedFare] = useState<number | null>(null);

  // Load fare data with shared cache
  useEffect(() => {
    const load = async () => {
      const now = Date.now();
      if (_locationsCache && now - _locationsCacheTs < LOC_CACHE_TTL) {
        setFareZones(_locationsCache.fareZones);
        setSurcharges(_locationsCache.surcharges);
        setServiceLocations(_locationsCache.serviceLocations);
        setNamedLocations(_locationsCache.namedLocations);
        return;
      }
      const [fzRes, scRes, slRes, nlRes] = await Promise.all([
        supabase.from("fare_zones").select("*").eq("is_active", true),
        supabase.from("fare_surcharges").select("*").eq("is_active", true),
        supabase.from("service_locations").select("id, name, lat, lng").eq("is_active", true),
        supabase.from("named_locations").select("id, name, address, lat, lng, suggested_by_type").eq("is_active", true).eq("status", "approved"),
      ]);
      const cache = {
        fareZones: fzRes.data || [],
        surcharges: scRes.data || [],
        serviceLocations: slRes.data || [],
        namedLocations: nlRes.data || [],
      };
      _locationsCache = cache;
      _locationsCacheTs = Date.now();
      setFareZones(cache.fareZones);
      setSurcharges(cache.surcharges);
      setServiceLocations(cache.serviceLocations);
      setNamedLocations(cache.namedLocations);
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

      const matchesZone = (fz: any) => {
        if (fz.vehicle_type_id && fz.vehicle_type_id !== vt.id) return false;
        const fromNames = [from.address, fromArea?.name, fromArea?.id].filter(Boolean);
        const toNames = [to.address, toArea?.name, toArea?.id].filter(Boolean);
        return (
          (fromNames.includes(fz.from_area) && toNames.includes(fz.to_area)) ||
          (toNames.includes(fz.from_area) && fromNames.includes(fz.to_area))
        );
      };
      const exactZone = fareZones.find((fz: any) => fz.vehicle_type_id === vt.id && matchesZone(fz));
      const genericZone = fareZones.find((fz: any) => !fz.vehicle_type_id && matchesZone(fz));
      const zone = exactZone || genericZone;

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

  // Helper: find nearest service area name for a lat/lng
  const findNearestServiceAreaName = useCallback((lat: number, lng: number): string => {
    let best: string = "Location";
    let bestDist = Infinity;
    for (const sl of serviceLocations) {
      const d = haversineKm(lat, lng, Number(sl.lat), Number(sl.lng));
      if (d < bestDist) { bestDist = d; best = sl.name; }
    }
    return best;
  }, [serviceLocations]);

  // Google Maps API key fetch (shared)
  const mapsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const cached = localStorage.getItem("hda_maps_key_cache");
    if (cached) {
      try { mapsKeyRef.current = JSON.parse(cached).key; } catch {}
    }
    if (!mapsKeyRef.current) {
      supabase.functions.invoke("get-maps-key").then(({ data }) => {
        if (data?.key) mapsKeyRef.current = data.key;
      });
    }
  }, []);

  // Check if a coordinate falls within any admin service area (10km radius)
  const isWithinServiceArea = useCallback((lat: number, lng: number): boolean => {
    for (const sl of serviceLocations) {
      if (haversineKm(lat, lng, Number(sl.lat), Number(sl.lng)) <= 10) return true;
    }
    return false;
  }, [serviceLocations]);

  const nominatimAbortRef = useRef<AbortController | null>(null);
  const googleAbortRef = useRef<AbortController | null>(null);

  // Search: local DB + Google Places (filtered to service areas only)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 1) { setOsmResults([]); return; }
    const q = searchQuery.toLowerCase();

    // 1. Instant local matches from DB
    const localMatches: NominatimResult[] = [
      ...serviceLocations
        .filter((sl: any) => sl.name.toLowerCase().includes(q) || (sl.address || "").toLowerCase().includes(q))
        .map((sl: any, i: number) => ({
          place_id: 900000 + i,
          display_name: sl.name,
          lat: String(sl.lat),
          lon: String(sl.lng),
          name: sl.name,
          tag: sl.name,
        })),
      ...namedLocations
        .filter((nl: any) => nl.name.toLowerCase().includes(q) || (nl.address || "").toLowerCase().includes(q))
        .map((nl: any, i: number) => {
          const areaName = findNearestServiceAreaName(Number(nl.lat), Number(nl.lng));
          return {
            place_id: 800000 + i,
            display_name: `${nl.name} — ${areaName}`,
            lat: String(nl.lat),
            lon: String(nl.lng),
            name: nl.name,
            tag: areaName,
          };
        }),
    ];
    setOsmResults(localMatches);

    // Cancel previous external requests
    if (nominatimAbortRef.current) nominatimAbortRef.current.abort();
    if (googleAbortRef.current) googleAbortRef.current.abort();
    const googleAbort = new AbortController();
    googleAbortRef.current = googleAbort;

    if (searchQuery.length < 2) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const mergeResults = (newResults: NominatimResult[]) => {
        if (newResults.length > 0) {
          setOsmResults(prev => {
            const existingCoords = new Set(prev.map(r => `${parseFloat(r.lat).toFixed(4)},${parseFloat(r.lon).toFixed(4)}`));
            const filtered = newResults.filter(nr => !existingCoords.has(`${parseFloat(nr.lat).toFixed(4)},${parseFloat(nr.lon).toFixed(4)}`));
            return [...prev, ...filtered];
          });
        }
      };

      // Google Places — only show results WITHIN admin service areas
      if (mapsKeyRef.current) {
        supabase.functions.invoke("google-places-search", {
          body: { query: searchQuery, key: mapsKeyRef.current },
        }).then(({ data }) => {
          if (googleAbort.signal.aborted) return;
          if (!data?.results?.length) return;
          const googleResults: NominatimResult[] = data.results
            .filter((p: any) => p.geometry?.location)
            .map((p: any, i: number) => {
              const lat = p.geometry.location.lat;
              const lng = p.geometry.location.lng;
              // ONLY include places within admin service areas
              if (!isWithinServiceArea(lat, lng)) return null;
              const areaName = findNearestServiceAreaName(lat, lng);
              const isDup = localMatches.some(lm => haversineKm(parseFloat(lm.lat), parseFloat(lm.lon), lat, lng) < 0.05);
              if (isDup) return null;
              return {
                place_id: 700000 + i,
                display_name: `${p.name} — ${areaName}`,
                lat: String(lat),
                lon: String(lng),
                name: p.name,
                tag: areaName,
                road: p.formatted_address?.split(",")[0] || null,
              };
            })
            .filter(Boolean) as NominatimResult[];
          mergeResults(googleResults);
        }).catch(() => {});
      }
    }, 300);

    return () => { googleAbort.abort(); };
  }, [searchQuery, serviceLocations, namedLocations, findNearestServiceAreaName, isWithinServiceArea]);

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
        // "specific" (Assign) = operator dispatch, "broadcast" (Send to App) = treated like passenger request
        dispatch_type: dispatchMethod === "specific" ? "operator" : "passenger",
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

      // If the assigned driver had a loss trip, clear it
      if (assignedDriverId) {
        supabase.from("trips")
          .update({ is_loss: false })
          .eq("driver_id", assignedDriverId)
          .eq("is_loss", true)
          .eq("dispatch_type", "operator")
          .then(() => { onTripCreated(); });
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
          await notifyTripRequested([assignedDriverId], trip.id, tripPayload.pickup_address);
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

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formLabels = ["Bid 1", "Bid 2", "Bid 3"];

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col min-w-[260px] max-w-[320px]">
      {/* Form header */}
      <div className="border-b border-border px-2.5 py-1.5 flex items-center justify-between gap-2">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1.5 shrink-0">
          <h3 className="text-xs font-bold text-foreground">{formLabels[formIndex]}</h3>
          {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
        <div className="flex rounded overflow-hidden border border-border">
          <button
            onClick={() => setDispatchMethod("specific")}
            className={`px-2 py-1 text-[10px] font-medium transition-colors ${dispatchMethod === "specific" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"}`}
          >
            Assign
          </button>
          <button
            onClick={() => setDispatchMethod("broadcast")}
            className={`px-2 py-1 text-[10px] font-medium transition-colors ${dispatchMethod === "broadcast" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"}`}
          >
            Send to App
          </button>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {/* Timer display */}
          {timerTripId && timerSecondsLeft > 0 && (
            <span className={`flex items-center gap-1 text-xs font-bold ${timerSecondsLeft <= 60 ? "text-destructive" : "text-primary"}`}>
              <Timer className="w-3.5 h-3.5" />
              {formatTimer(timerSecondsLeft)}
            </span>
          )}
          {estimatedFare != null && (
            <span className="flex items-center gap-1 text-sm font-bold text-primary">
              <DollarSign className="w-3.5 h-3.5" />
              {estimatedFare} MVR
            </span>
          )}
          <button onClick={clearForm} className="text-[10px] text-muted-foreground hover:text-foreground font-medium">Clear</button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-2 space-y-2 overflow-y-auto flex-1">
          {/* Pax & Luggage - compact */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Pax</p>
              <div className="flex items-center gap-2 mt-1">
                <button onClick={() => setPassengerCount(Math.max(1, passengerCount - 1))} className="w-6 h-6 rounded bg-surface flex items-center justify-center" disabled={passengerCount <= 1}><Minus className="w-2.5 h-2.5" /></button>
                <span className="text-xs font-bold text-foreground w-4 text-center">{passengerCount}</span>
                <button onClick={() => setPassengerCount(Math.min(20, passengerCount + 1))} className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center"><Plus className="w-2.5 h-2.5 text-primary" /></button>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Luggage className="w-3 h-3" /> Bags</p>
              <div className="flex items-center gap-2 mt-1">
                <button onClick={() => setLuggageCount(Math.max(0, luggageCount - 1))} className="w-6 h-6 rounded bg-surface flex items-center justify-center" disabled={luggageCount <= 0}><Minus className="w-2.5 h-2.5" /></button>
                <span className="text-xs font-bold text-foreground w-4 text-center">{luggageCount}</span>
                <button onClick={() => setLuggageCount(Math.min(30, luggageCount + 1))} className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center"><Plus className="w-2.5 h-2.5 text-primary" /></button>
              </div>
            </div>
          </div>

          {/* Vehicle type - buttons with keyboard navigation */}
          <div className="space-y-1">
            <div
              ref={vehicleTypeButtonsRef}
              className="flex flex-wrap gap-1 outline-none"
              tabIndex={0}
              onKeyDown={(e) => {
                const filtered = [...vehicleTypes].filter(vt => {
                  const n = vt.name.toLowerCase();
                  return !n.includes("hda wav") && !n.includes("ladies cyc") && !n.includes("hda cyc");
                });
                const count = filtered.length;
                if (!count) return;
                if (["ArrowRight", "ArrowDown"].includes(e.key)) {
                  e.preventDefault();
                  setVehicleTypeFocusIndex(prev => (prev + 1) % count);
                } else if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
                  e.preventDefault();
                  setVehicleTypeFocusIndex(prev => (prev - 1 + count) % count);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  setSelectedVehicleType(filtered[vehicleTypeFocusIndex]?.id);
                  pickupInputRef.current?.focus();
                }
              }}
            >
              {[...vehicleTypes]
                .filter(vt => {
                  const n = vt.name.toLowerCase();
                  return !n.includes("hda wav") && !n.includes("ladies cyc") && !n.includes("hda cyc");
                })
                .sort((a, b) => {
                const order = ["car", "van", "mini pickup", "big pickup"];
                const aName = a.name.toLowerCase();
                const bName = b.name.toLowerCase();
                const aIdx = order.findIndex(o => aName.includes(o));
                const bIdx = order.findIndex(o => bName.includes(o));
                const aOrder = aIdx >= 0 ? aIdx : 50;
                const bOrder = bIdx >= 0 ? bIdx : 50;
                return aOrder - bOrder;
              }).map((vt, i) => (
                <button
                  key={vt.id}
                  tabIndex={-1}
                  onClick={() => setSelectedVehicleType(vt.id)}
                  className={`px-2 py-1 rounded text-[9px] font-medium transition-all border ${
                    selectedVehicleType === vt.id ? "bg-primary text-primary-foreground border-primary" : i === vehicleTypeFocusIndex ? "bg-muted border-primary/50" : "bg-surface border-border text-foreground hover:bg-muted"
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
                ref={pickupInputRef}
                type="text"
                value={selecting === "pickup" ? searchQuery : (pickup?.address || pickupQuery)}
                onChange={e => { setSelecting("pickup"); setSearchQuery(e.target.value); setPickupQuery(e.target.value); }}
                onFocus={() => { setSelecting("pickup"); setSearchQuery(pickupQuery); }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (osmResults.length > 0 && !pickup) {
                      selectLocation(osmResults[0]);
                    }
                    setTimeout(() => toButtonsRef.current?.focus(), 50);
                  }
                }}
               placeholder="Type location (e.g., Male, Airport, Sifco...)"
                className="w-full pl-8 pr-8 py-1.5 bg-surface border border-border rounded text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {pickup && (
                <button tabIndex={-1} onClick={() => { setPickup(null); setPickupQuery(""); setSearchQuery(""); setSelecting("pickup"); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            {selecting === "pickup" && osmResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {osmResults.map(r => (
                  <button key={r.place_id} onClick={() => { selectLocation(r); setTimeout(() => toButtonsRef.current?.focus(), 50); }} className="flex items-center gap-2 w-full px-3 py-2 hover:bg-surface text-left transition-colors border-b border-border last:border-0">
                    <Navigation className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{r.name || r.display_name.split(",")[0]}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{r.road ? `${r.road} • ${r.tag || r.display_name.split("—").slice(1).join("—").trim()}` : (r.tag || r.display_name.split("—").slice(1).join("—").trim())}</p>
                    </div>
                    {r.tag && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-primary/15 text-primary">{r.tag}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* TO - Service area buttons with keyboard navigation */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">To*</p>
            {serviceLocations.length > 0 ? (
              <div
                ref={toButtonsRef}
                className="flex flex-wrap gap-1.5 outline-none"
                tabIndex={0}
                onKeyDown={(e) => {
                  const count = serviceLocations.length;
                  if (!count) return;
                  if (["ArrowRight", "ArrowDown"].includes(e.key)) {
                    e.preventDefault();
                    setToButtonFocusIndex(prev => (prev + 1) % count);
                  } else if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
                    e.preventDefault();
                    setToButtonFocusIndex(prev => (prev - 1 + count) % count);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    selectServiceAreaAsDropoff(serviceLocations[toButtonFocusIndex]);
                    setTimeout(() => phoneInputRef.current?.focus(), 50);
                  }
                }}
              >
                {serviceLocations.map((sl, i) => (
                  <button
                    key={sl.id}
                    tabIndex={-1}
                    onClick={() => { selectServiceAreaAsDropoff(sl); setTimeout(() => phoneInputRef.current?.focus(), 50); }}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-all border ${
                      dropoff?.address === sl.name
                        ? "bg-primary text-primary-foreground border-primary"
                        : i === toButtonFocusIndex ? "bg-muted border-primary/50 ring-1 ring-primary/30"
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
                  ref={dropoffInputRef}
                  type="text"
                  value={selecting === "dropoff" ? searchQuery : (dropoff?.address || "")}
                  onChange={e => { setSelecting("dropoff"); setSearchQuery(e.target.value); }}
                  onFocus={() => { setSelecting("dropoff"); setSearchQuery(""); }}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (osmResults.length > 0 && !dropoff) selectLocation(osmResults[0]);
                      setTimeout(() => phoneInputRef.current?.focus(), 50);
                    }
                  }}
                  placeholder="Search destination..."
                  className="w-full pl-8 pr-8 py-2.5 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {dropoff && (
                  <button tabIndex={-1} onClick={() => { setDropoff(null); setSearchQuery(""); setSelecting("dropoff"); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
                {selecting === "dropoff" && osmResults.length > 0 && (
                  <div className="absolute left-0 right-0 z-20 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {osmResults.map(r => (
                      <button key={r.place_id} onClick={() => { selectLocation(r); setTimeout(() => phoneInputRef.current?.focus(), 50); }} className="flex items-center gap-2 w-full px-3 py-2 hover:bg-surface text-left transition-colors border-b border-border last:border-0">
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
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (osmResults.length > 0 && !stop.address) selectLocation(osmResults[0]);
                            setTimeout(() => phoneInputRef.current?.focus(), 50);
                          }
                        }}
                        placeholder={`Stop ${i + 1}`}
                        className="w-full pl-7 pr-2.5 py-2 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <button tabIndex={-1} onClick={() => removeStop(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
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
          <button tabIndex={-1} onClick={addStop} className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline">
            <Plus className="w-3 h-3" /> Add Stop
          </button>

          {/* Contact */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Contact</p>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-semibold">+960</span>
              <input
                ref={phoneInputRef}
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 7))}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); centerCodeInputRef.current?.focus(); }
                }}
                placeholder="Customer phone"
                className="w-full pl-10 pr-2.5 py-1.5 bg-surface border border-border rounded text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Center Code */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Center Code*</p>
            <input
              ref={centerCodeInputRef}
              value={centerCode}
              onChange={(e) => {
                setCenterCode(e.target.value.toUpperCase());
              }}
              placeholder="Type code & press Enter (multiple allowed)"
              className="w-full px-2.5 py-1.5 bg-surface border border-border rounded text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={async (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();

                const code = centerCode.trim().toUpperCase();
                if (!code) return;

                // Clear field immediately for next entry
                setCenterCode("");
                requestAnimationFrame(() => centerCodeInputRef.current?.focus());

                if (centerCodeResults.some((r) => r.code === code)) {
                  toast({ title: "Already added", description: `Code "${code}" is already in the list` });
                  return;
                }

                const addEntry = (entry: CenterCodeIndexEntry) => {
                  const updated = [...centerCodeResults, entry].sort((a, b) => {
                    // Loss drivers first
                    if (a.has_loss && !b.has_loss) return -1;
                    if (!a.has_loss && b.has_loss) return 1;
                    // Then least recent trip first
                    if (!a.last_trip_date && !b.last_trip_date) return 0;
                    if (!a.last_trip_date) return -1;
                    if (!b.last_trip_date) return 1;
                    return new Date(a.last_trip_date).getTime() - new Date(b.last_trip_date).getTime();
                  });

                  setCenterCodeResults(updated);

                  const topResult = updated[0];
                  if (topResult?.vehicle_type_id) {
                    setSelectedVehicleType(topResult.vehicle_type_id);
                  }
                };

                // 1) Instant path: use preloaded index
                const cached = centerCodeIndex?.[code];
                if (cached) {
                  addEntry({ ...cached, code });
                  return;
                }

                // 2) Silent fallback: direct lookup
                try {
                  const { data: vehicle } = await supabase
                    .from("vehicles")
                    .select("plate_number, color, vehicle_type_id, driver_id, vehicle_types:vehicle_type_id(name)")
                    .eq("center_code", code)
                    .eq("is_active", true)
                    .limit(1)
                    .maybeSingle();

                  if (!vehicle) {
                    toast({
                      title: "No vehicle found",
                      description: `Center code "${code}" not found`,
                      variant: "destructive",
                    });
                    return;
                  }

                  let driverName: string | null = null;
                  let driverPhone: string | null = null;
                  let lastTripDate: string | null = null;
                  let todayTrips = 0;
                  let hasLoss = false;

                  if (vehicle.driver_id) {
                    const todayStart = new Date();
                    todayStart.setHours(0, 0, 0, 0);

                    const [{ data: profile }, { data: lastTrip }, { count: todayCount }, { count: lossCount }] = await Promise.all([
                      supabase
                        .from("profiles")
                        .select("first_name, last_name, phone_number")
                        .eq("id", vehicle.driver_id)
                        .maybeSingle(),
                      supabase
                        .from("trips")
                        .select("completed_at")
                        .eq("driver_id", vehicle.driver_id)
                        .eq("status", "completed")
                        .order("completed_at", { ascending: false })
                        .limit(1)
                        .maybeSingle(),
                      supabase
                        .from("trips")
                        .select("id", { count: "exact", head: true })
                        .eq("driver_id", vehicle.driver_id)
                        .gte("created_at", todayStart.toISOString())
                        .in("status", ["requested", "accepted", "started", "completed"]),
                      supabase
                        .from("trips")
                        .select("id", { count: "exact", head: true })
                        .eq("driver_id", vehicle.driver_id)
                        .eq("is_loss", true)
                        .eq("dispatch_type", "operator"),
                    ]);

                    if (profile) {
                      driverName = `${profile.first_name} ${profile.last_name}`.trim();
                      driverPhone = profile.phone_number;
                    }
                    if (lastTrip?.completed_at) {
                      lastTripDate = lastTrip.completed_at;
                    }
                    todayTrips = todayCount || 0;
                    hasLoss = (lossCount || 0) > 0;
                  }

                  addEntry({
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
                    has_loss: hasLoss,
                  });
                } catch {
                  toast({ title: "Lookup failed", variant: "destructive" });
                }
              }}
            />
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
                        : info.has_loss
                        ? "bg-destructive/5 border-destructive/30 hover:border-destructive/50"
                        : "bg-surface border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-foreground">
                        {selectedCenterCode === info.code && <CheckCircle2 className="w-3 h-3 inline mr-1 text-primary" />}
                        {info.has_loss && <span className="text-[9px] font-bold text-destructive mr-1">LOSS</span>}
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

          {dispatchMethod === "specific" && selectedDriverId && selectedCenterCode && (() => {
            const entry = centerCodeResults.find(r => r.code === selectedCenterCode);
            const isOnline = onlineDrivers.some(d => d.driver_id === selectedDriverId);
            if (entry && !isOnline) {
              return (
                <div className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-xs bg-primary/10 ring-1 ring-primary">
                  <div>
                    <p className="font-medium text-foreground">{entry.driver_name || "Driver"} <span className="text-muted-foreground">(from {entry.code})</span></p>
                    <p className="text-[10px] text-muted-foreground">{entry.vehicle_type} • {entry.plate_number}</p>
                  </div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                </div>
              );
            }
            return null;
          })()}


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
