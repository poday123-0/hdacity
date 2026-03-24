import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notifyTripRequested } from "@/lib/push-notifications";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, MapPin, Users, Luggage, Plus, Minus, X, Search,
  Loader2, Navigation, Send, Trash2, DollarSign, CheckCircle2, Car, Clock,
  ChevronUp, ChevronDown, RotateCcw, Crosshair, Ban, ShieldOff
} from "lucide-react";
import MapPicker from "@/components/MapPicker";

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
  vehicle_id: string;
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
  
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const vehicleTypeButtonsRef = useRef<HTMLDivElement | null>(null);
  const toButtonsRef = useRef<HTMLDivElement | null>(null);
  const [vehicleTypeFocusIndex, setVehicleTypeFocusIndex] = useState(0);
  const [toButtonFocusIndex, setToButtonFocusIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState<"pickup" | "dropoff" | null>(null);

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

    const pointInPolygon = (lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean => {
      if (!polygon || polygon.length < 3) return false;
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat, yi = polygon[i].lng;
        const xj = polygon[j].lat, yj = polygon[j].lng;
        if ((yi > lng) !== (yj > lng) && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    const calcPolyArea = (polygon: { lat: number; lng: number }[]): number => {
      if (!polygon || polygon.length < 3) return Infinity;
      let area = 0;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        area += (polygon[j].lat + polygon[i].lat) * (polygon[j].lng - polygon[i].lng);
      }
      return Math.abs(area / 2);
    };
    const findServiceArea = (lat: number, lng: number) => {
      // 1. Point-in-polygon — prefer smallest polygon when overlapping
      let bestMatch: any = null;
      let smallestArea = Infinity;
      for (const sl of serviceLocations) {
        if (sl.polygon && pointInPolygon(lat, lng, sl.polygon)) {
          const area = calcPolyArea(sl.polygon);
          if (area < smallestArea) { smallestArea = area; bestMatch = sl; }
        }
      }
      if (bestMatch) return bestMatch;
      // 2. Fallback to nearest center point
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
    // Default back to Car
    const carType = vehicleTypes.find(vt => vt.name.toLowerCase() === "car");
    setSelectedVehicleType(carType?.id || vehicleTypes[0]?.id || "");
    setDispatchMethod("specific");
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
    // Phone required only for broadcast (Send to App)
    if (dispatchMethod === "broadcast" && !customerPhone.trim()) {
      toast({ title: "Phone number required for Send to App", variant: "destructive" });
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
      // Check if assigned vehicle is blocked
      if (assignedEntry) {
        const { data: veh } = await supabase
          .from("vehicles")
          .select("blocked_until")
          .eq("center_code", assignedEntry.code)
          .limit(1)
          .maybeSingle();
        if (veh?.blocked_until && new Date(veh.blocked_until as string) > new Date()) {
          const remaining = Math.ceil((new Date(veh.blocked_until as string).getTime() - Date.now()) / 60000);
          toast({ title: "Vehicle blocked", description: `${assignedEntry.code} is blocked for ${remaining} more minutes`, variant: "destructive" });
          setSubmitting(false);
          return;
        }
      }
      const customerName = "Dispatch";

      // Pre-fetch broadcast data in parallel with trip insert for zero-delay notifications
      let broadcastDriversCache: any[] | null = null;
      let broadcastTimeoutMsCache = 60_000;

      const isBroadcast = dispatchMethod === "broadcast";

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
        dispatch_type: isBroadcast ? "dispatch_broadcast" : "operator",
        vehicle_type_id: selectedVehicleType || null,
        status: isAssigned ? "accepted" : "requested",
        driver_id: assignedDriverId || null,
        vehicle_id: assignedEntry?.vehicle_id || null,
        accepted_at: isAssigned ? new Date().toISOString() : null,
        fare_type: "distance",
        estimated_fare: estimatedFare || null,
        booking_notes: (centerCodeResults.length > 0 && !isBroadcast) ? `Center: ${centerCodeResults.map(r => r.code).join(", ")}` : null,
      };

      // Fire trip insert + broadcast pre-fetch in parallel
      const tripInsertPromise = supabase.from("trips").insert(tripPayload).select("*").single();

      const broadcastPreFetchPromise = isBroadcast ? Promise.all([
        supabase.from("driver_locations").select("driver_id, lat, lng").eq("is_online", true).eq("is_on_trip", false),
        Promise.resolve(supabase.from("system_settings").select("value").eq("key", "dispatch_broadcast_timeout_seconds").single()).catch(() => ({ data: null })),
      ]) : Promise.resolve(null);

      const [tripResult, broadcastData] = await Promise.all([tripInsertPromise, broadcastPreFetchPromise]);
      
      const { data: trip, error } = tripResult;
      if (error) throw error;

      if (broadcastData) {
        const [driversRes, timeoutRes] = broadcastData as any;
        broadcastDriversCache = driversRes?.data || [];
        if (timeoutRes?.data?.value) {
          const secs = typeof timeoutRes.data.value === "number" ? timeoutRes.data.value : parseInt(String(timeoutRes.data.value)) || 60;
          broadcastTimeoutMsCache = secs * 1000;
        }
      }

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

      // Fire notifications non-blocking for speed
      if (isAssigned && assignedDriverId) {
        notifyTripRequested([assignedDriverId], trip.id, tripPayload.pickup_address).catch(console.warn);
      } else if (pickup) {
        // Pre-fetched in parallel above — use cached results for zero delay
        const tripId = trip.id;

        if (!broadcastDriversCache || broadcastDriversCache.length === 0) {
          // No online drivers at all — immediately cancel
          await supabase.from("trips").update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancel_reason: "No drivers available",
          }).eq("id", tripId);
          toast({ title: "No online drivers", description: "Trip cancelled — no drivers available", variant: "destructive" });
          onTripCreated();
        } else {
          const nearbyDrivers = broadcastDriversCache
            .map((d: any) => ({ ...d, dist: haversineKm(pickup.lat, pickup.lng, d.lat, d.lng) }))
            .filter((d: any) => d.dist <= 2)
            .sort((a: any, b: any) => a.dist - b.dist)
            .slice(0, 10);

          if (nearbyDrivers.length === 0) {
            // No drivers within range — immediately cancel
            await supabase.from("trips").update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              cancel_reason: "No drivers available in area",
            }).eq("id", tripId);
            toast({ title: "No drivers within 2km", description: "Trip cancelled — no nearby drivers", variant: "destructive" });
            onTripCreated();
          } else {
            // Send push notification immediately — no awaits needed
            notifyTripRequested(nearbyDrivers.map((d: any) => d.driver_id), trip.id, tripPayload.pickup_address).catch(console.warn);
            toast({ title: `Sent to ${nearbyDrivers.length} nearby driver(s)`, description: `Auto-cancel in ${Math.round(broadcastTimeoutMsCache / 1000)}s if no one accepts` });

            // Auto-cancel after configurable timeout
            const timeoutMs = broadcastTimeoutMsCache;
            setTimeout(async () => {
              const { data: check } = await supabase.from("trips").select("status").eq("id", tripId).single();
              if (check && check.status === "requested") {
                await supabase.from("trips").update({
                  status: "cancelled",
                  cancelled_at: new Date().toISOString(),
                  cancel_reason: "No driver available - auto cancelled",
                }).eq("id", tripId);
                onTripCreated();
              }
            }, timeoutMs);
          }
        }
      }

      // Reset form but keep Car default
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
      // Default back to Car
      const carType = vehicleTypes.find(vt => vt.name.toLowerCase() === "car");
      setSelectedVehicleType(carType?.id || vehicleTypes[0]?.id || "");
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

          {/* Pax, Luggage & Contact - compact */}
          <div className="grid grid-cols-3 gap-2">
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
            <div>
              <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> Contact</p>
              <div className="relative mt-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground font-semibold">+960</span>
                <input
                  ref={phoneInputRef}
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 7))}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); centerCodeInputRef.current?.focus(); }
                  }}
                  placeholder="Phone"
                  className="w-full pl-9 pr-1.5 py-1 bg-surface border border-border rounded text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary h-6"
                />
              </div>
            </div>
          </div>

          {/* FROM - Pickup */}
          <div className="space-y-1.5 relative">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">From*</p>
            <div className="relative flex gap-1">
              <div className="relative flex-1">
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
              <button
                type="button"
                onClick={() => setShowMapPicker("pickup")}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded border border-border bg-surface hover:bg-muted transition-colors"
                title="Pick on map"
              >
                <Crosshair className="w-4 h-4 text-primary" />
              </button>
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
            <div className="flex items-start gap-1">
              <div
                ref={toButtonsRef}
                className="flex flex-wrap gap-1.5 outline-none flex-1"
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
              <button
                type="button"
                onClick={() => setShowMapPicker("dropoff")}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded border border-border bg-surface hover:bg-muted transition-colors mt-0.5"
                title="Pick on map"
              >
                <Crosshair className="w-4 h-4 text-primary" />
              </button>
            </div>
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
                    try {
                      const getPriority = (item: CenterCodeIndexEntry) => {
                        const hasLoss = !!item.has_loss;
                        const hasTripsToday = (item.today_trips || 0) > 0;

                        if (hasLoss && !hasTripsToday) return 0;
                        if (!hasLoss && !hasTripsToday) return 1;
                        if (hasLoss && hasTripsToday) return 2;
                        return 3;
                      };

                      const priorityDiff = getPriority(a) - getPriority(b);
                      if (priorityDiff !== 0) return priorityDiff;

                      if (!a.last_trip_date && !b.last_trip_date) return 0;
                      if (!a.last_trip_date) return 1; // No trip data goes to bottom
                      if (!b.last_trip_date) return -1; // No trip data goes to bottom

                      return new Date(a.last_trip_date).getTime() - new Date(b.last_trip_date).getTime();
                    } catch (error) {
                      console.error("Vehicle sorting error:", error);
                      return 0;
                    }
                  });

                  setCenterCodeResults(updated);

                  const topResult = updated[0];
                  if (topResult?.vehicle_type_id) {
                    setSelectedVehicleType(topResult.vehicle_type_id);
                  }
                };

                // 1) Instant path: use preloaded index, but verify vehicle is still active
                const cached = centerCodeIndex?.[code];
                if (cached) {
                  // Quick check vehicle is still active and not blocked
                  const { data: vCheck } = await supabase
                    .from("vehicles")
                    .select("id, blocked_until")
                    .eq("center_code", code)
                    .eq("is_active", true)
                    .limit(1)
                    .maybeSingle();
                  if (!vCheck) {
                    toast({ title: "Vehicle inactive", description: `Code "${code}" belongs to an inactive vehicle`, variant: "destructive" });
                    return;
                  }
                  if (vCheck.blocked_until && new Date(vCheck.blocked_until as string) > new Date()) {
                    const remaining = Math.ceil((new Date(vCheck.blocked_until as string).getTime() - Date.now()) / 60000);
                    toast({
                      title: "Vehicle blocked",
                      description: `Code "${code}" is blocked for ${remaining} more min. Unblock?`,
                      action: (
                        <button
                          className="text-xs font-bold text-primary underline ml-2"
                          onClick={async () => {
                            await supabase.from("vehicles").update({ blocked_until: null } as any).eq("center_code", code);
                            toast({ title: "Unblocked", description: `${code} has been unblocked` });
                          }}
                        >Unblock</button>
                      ),
                    });
                    return;
                  }
                  addEntry({ ...cached, code });
                  return;
                }

                // 2) Silent fallback: direct lookup
                try {
                  const { data: vehicle } = await supabase
                    .from("vehicles")
                    .select("id, plate_number, color, vehicle_type_id, driver_id, blocked_until, vehicle_types:vehicle_type_id(name)")
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

                  // Check if blocked
                  if ((vehicle as any).blocked_until && new Date((vehicle as any).blocked_until) > new Date()) {
                    const remaining = Math.ceil((new Date((vehicle as any).blocked_until).getTime() - Date.now()) / 60000);
                    toast({
                      title: "Vehicle blocked",
                      description: `Code "${code}" is blocked for ${remaining} more min. Unblock?`,
                      action: (
                        <button
                          className="text-xs font-bold text-primary underline ml-2"
                          onClick={async () => {
                            await supabase.from("vehicles").update({ blocked_until: null } as any).eq("center_code", code);
                            toast({ title: "Unblocked", description: `${code} has been unblocked` });
                          }}
                        >Unblock</button>
                      ),
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
                        .select("created_at")
                        .eq("vehicle_id", vehicle.id)
                        .eq("dispatch_type", "operator")
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .maybeSingle(),
                      supabase
                        .from("trips")
                        .select("id", { count: "exact", head: true })
                        .eq("vehicle_id", vehicle.id)
                        .gte("created_at", todayStart.toISOString())
                        .in("status", ["requested", "accepted", "started", "completed"]),
                      supabase
                        .from("trips")
                        .select("id", { count: "exact", head: true })
                        .eq("vehicle_id", vehicle.id)
                        .eq("is_loss", true)
                        .eq("dispatch_type", "operator"),
                    ]);

                    if (profile) {
                      driverName = `${profile.first_name} ${profile.last_name}`.trim();
                      driverPhone = profile.phone_number;
                    }
                    if (lastTrip?.created_at) {
                      lastTripDate = lastTrip.created_at;
                    }
                    todayTrips = todayCount || 0;
                    hasLoss = (lossCount || 0) > 0;
                  }

                  addEntry({
                    code,
                    vehicle_id: vehicle.id,
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
              <div className="space-y-1.5">
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
                        {info.vehicle_type && <span className="text-muted-foreground"> • {info.vehicle_type === 'Mini Pickup' ? 'MPickup' : info.vehicle_type === 'Big Pickup' ? 'BPickup' : info.vehicle_type}</span>}
                        {info.color && <span className="text-muted-foreground"> • {info.color}</span>}
                        <span className="text-primary font-semibold"> • {info.today_trips || 0}</span>
                        {info.last_trip_date && <span className="text-muted-foreground/70 text-[9px]"> • {new Date(info.last_trip_date).toLocaleDateString([], { month: "short", day: "2-digit" })} {new Date(info.last_trip_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                        {info.driver_phone && <span className="text-muted-foreground"> • {info.driver_phone}</span>}
                      </span>
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          title="Block vehicle for 3 hours"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const blockedUntil = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
                            const { error } = await supabase
                              .from("vehicles")
                              .update({ blocked_until: blockedUntil } as any)
                              .eq("center_code", info.code);
                            if (!error) {
                              toast({ title: "Vehicle blocked", description: `${info.code} blocked for 3 hours` });
                              const updated = centerCodeResults.filter(r => r.code !== info.code);
                              setCenterCodeResults(updated);
                              if (selectedCenterCode === info.code) setSelectedCenterCode(null);
                            } else {
                              toast({ title: "Block failed", variant: "destructive" });
                            }
                          }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Ban className="w-3 h-3" />
                        </button>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          const updated = centerCodeResults.filter(r => r.code !== info.code);
                          setCenterCodeResults(updated);
                          if (selectedCenterCode === info.code) setSelectedCenterCode(null);
                          if (updated.length > 0 && updated[0].vehicle_type_id) {
                            setSelectedVehicleType(updated[0].vehicle_type_id);
                          }
                        }} className="text-muted-foreground hover:text-destructive">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
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
        <div className="p-3 pt-0 flex gap-2">
          <button onClick={handleSubmit} disabled={submitting || !pickup || !dropoff || (dispatchMethod === "broadcast" && !customerPhone)} className={`flex-1 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 text-sm ${dispatchMethod === "broadcast" ? "bg-orange-500 text-white" : "bg-primary text-primary-foreground"}`}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> {dispatchMethod === "broadcast" ? "Send to App" : "Assign"}</>}
          </button>
          {dispatchMethod === "specific" && (
            <button
              onClick={async () => {
                if (!pickup || !dropoff) {
                  toast({ title: "Select pickup and dropoff", variant: "destructive" });
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
                    customer_name: "Dispatch",
                    customer_phone: customerPhone.trim(),
                    created_by: dispatcherProfile?.id || null,
                    dispatch_type: "operator",
                    vehicle_type_id: selectedVehicleType || null,
                    status: "cancelled",
                    cancel_reason: "No vehicle available",
                    cancelled_at: new Date().toISOString(),
                    fare_type: "distance",
                    estimated_fare: estimatedFare || null,
                    booking_notes: (centerCodeResults.length > 0) ? `Center: ${centerCodeResults.map(r => r.code).join(", ")}` : "No Vehicle",
                    is_loss: true,
                  };
                  const { error } = await supabase.from("trips").insert(tripPayload);
                  if (error) throw error;
                  toast({ title: "Recorded as No Vehicle", description: "Booking saved as loss" });
                  clearForm();
                  onTripCreated();
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                }
                setSubmitting(false);
              }}
              disabled={submitting || !pickup || !dropoff}
              className="px-3 py-3 rounded-xl font-semibold text-sm bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-40 flex items-center gap-1.5"
            >
              <ShieldOff className="w-4 h-4" />
              No Vehicle
            </button>
          )}
        </div>
      )}

      {/* Map Picker Modal */}
      {showMapPicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/50 backdrop-blur-sm" onClick={() => setShowMapPicker(null)}>
          <div className="w-full max-w-lg h-[80vh] max-h-[600px] rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <MapPicker
              initialLat={showMapPicker === "pickup" ? (pickup?.lat || undefined) : (dropoff?.lat || undefined)}
              initialLng={showMapPicker === "pickup" ? (pickup?.lng || undefined) : (dropoff?.lng || undefined)}
              onConfirm={(lat, lng, name, address) => {
                const loc = { lat, lng, address: name || address };
                if (showMapPicker === "pickup") {
                  setPickup(loc);
                  setPickupQuery(loc.address);
                } else {
                  setDropoff(loc);
                }
                setShowMapPicker(null);
              }}
              onCancel={() => setShowMapPicker(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DispatchTripForm;
