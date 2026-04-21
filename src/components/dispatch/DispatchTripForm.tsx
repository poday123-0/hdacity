import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllNamedLocations } from "@/lib/fetch-all-locations";
import { notifyTripRequested, notifyTripAssigned } from "@/lib/push-notifications";
import { filterDriversByPersonalRadius } from "@/lib/driver-radius-filter";
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
  isOnline?: boolean;
  onOfflineQueue?: (payload: Record<string, any>) => void;
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
let _locationsCache: { serviceLocations: any[]; namedLocations: any[]; fareZones: any[]; surcharges: any[]; recentBookings: any[] } | null = null;
let _locationsCacheTs = 0;
const LOC_CACHE_TTL = 30_000; // 30 sec

// Nominatim result cache
const _placesCache = new Map<string, { results: any[]; ts: number }>();
const PLACES_CACHE_TTL = 60_000;

const DispatchTripForm = ({
  formIndex,
  dispatcherProfile,
  vehicleTypes,
  onlineDrivers,
  centerCodeIndex,
  onTripCreated,
  isOnline = true,
  onOfflineQueue,
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
  const [resultHighlight, setResultHighlight] = useState(-1);
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
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [segmentDistances, setSegmentDistances] = useState<number[]>([]);
  const [estimatedFare, setEstimatedFare] = useState<number | null>(null);
  const [selectedDisposalType, setSelectedDisposalType] = useState<string | null>(null);
  const [availableDisposalTypes, setAvailableDisposalTypes] = useState<any[]>([]);

  // Realtime: update centerCodeResults when trip is_loss changes
  useEffect(() => {
    if (centerCodeResults.length === 0) return;
    const vehicleIds = centerCodeResults.map(r => r.vehicle_id).filter(Boolean);
    if (vehicleIds.length === 0) return;

    const channel = supabase
      .channel(`dispatch-loss-${formIndex}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'trips' },
        (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;
          // Only react to is_loss changes on operator trips with matching vehicles
          if (newRow.is_loss === oldRow.is_loss) return;
          if (newRow.dispatch_type !== 'operator') return;
          const changedVehicleId = newRow.vehicle_id;
          if (!changedVehicleId || !vehicleIds.includes(changedVehicleId)) return;

          setCenterCodeResults((prev) => {
            const updated = prev.map((entry) => {
              if (entry.vehicle_id !== changedVehicleId) return entry;
              return { ...entry, has_loss: newRow.is_loss };
            });
            // Re-sort with priority logic
            return [...updated].sort((a, b) => {
              const getPriority = (item: CenterCodeIndexEntry) => {
                const hasLoss = !!item.has_loss;
                const hasTripsToday = (item.today_trips || 0) > 0;
                if (hasLoss) return 0;
                if (!hasTripsToday) return 1;
                return 2;
              };
              const priorityDiff = getPriority(a) - getPriority(b);
              if (priorityDiff !== 0) return priorityDiff;
              if (!a.last_trip_date && !b.last_trip_date) return 0;
              if (!a.last_trip_date) return 1;
              if (!b.last_trip_date) return -1;
              return new Date(a.last_trip_date).getTime() - new Date(b.last_trip_date).getTime();
            });
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [centerCodeResults.map(r => r.vehicle_id).join(','), formIndex]);

  // Load fare data with shared cache — render service-area buttons ASAP
  useEffect(() => {
    const load = async () => {
      const now = Date.now();
      if (_locationsCache && now - _locationsCacheTs < LOC_CACHE_TTL) {
        setFareZones(_locationsCache.fareZones);
        setSurcharges(_locationsCache.surcharges);
        setServiceLocations(_locationsCache.serviceLocations);
        setNamedLocations(_locationsCache.namedLocations);
        setRecentBookings(_locationsCache.recentBookings);
        return;
      }

      const slOrder = ["P1", "P2", "MLE", "VIA", "Sterminal"];
      const sortSl = (rows: any[]) => [...rows].sort((a, b) => {
        const ai = slOrder.indexOf(a.name);
        const bi = slOrder.indexOf(b.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });

      // Fire all queries in parallel but apply each result independently
      // so the UI (especially the To* buttons) updates the moment its data is ready.
      const slPromise = supabase
        .from("service_locations")
        .select("id, name, lat, lng, polygon")
        .eq("is_active", true)
        .order("name")
        .then(res => {
          const sorted = sortSl(res.data || []);
          setServiceLocations(sorted);
          return sorted;
        });

      const fzPromise = supabase.from("fare_zones").select("*").eq("is_active", true)
        .then(res => { setFareZones(res.data || []); return res.data || []; });

      const scPromise = supabase.from("fare_surcharges").select("*").eq("is_active", true)
        .then(res => { setSurcharges(res.data || []); return res.data || []; });

      const rbPromise = supabase
        .from("trips")
        .select("pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng")
        .not("pickup_lat", "is", null).not("pickup_lng", "is", null)
        .order("created_at", { ascending: false }).limit(200)
        .then(res => {
          const seen = new Set<string>();
          const bookingLocs: any[] = [];
          for (const t of res.data || []) {
            if (t.pickup_address && t.pickup_lat && t.pickup_lng) {
              const key = t.pickup_address.trim().toLowerCase();
              if (!seen.has(key)) { seen.add(key); bookingLocs.push({ name: t.pickup_address, lat: t.pickup_lat, lng: t.pickup_lng }); }
            }
            if (t.dropoff_address && t.dropoff_lat && t.dropoff_lng) {
              const key = t.dropoff_address.trim().toLowerCase();
              if (!seen.has(key)) { seen.add(key); bookingLocs.push({ name: t.dropoff_address, lat: t.dropoff_lat, lng: t.dropoff_lng }); }
            }
          }
          setRecentBookings(bookingLocs);
          return bookingLocs;
        });

      const nlPromise = fetchAllNamedLocations(
        "id, name, address, description, group_name, lat, lng, road_name, suggested_by_type"
      ).then(data => { setNamedLocations(data); return data; });

      // Cache once everything resolves (so we don't block the UI)
      Promise.all([slPromise, fzPromise, scPromise, rbPromise, nlPromise])
        .then(([sl, fz, sc, rb, nl]) => {
          _locationsCache = {
            fareZones: fz,
            surcharges: sc,
            serviceLocations: sl,
            namedLocations: nl,
            recentBookings: rb,
          };
          _locationsCacheTs = Date.now();
        })
        .catch(() => {});
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

    // Check if dropoff is in a fixed surcharge destination area
    const lastWp = waypoints[waypoints.length - 1];
    let fixedSurchargeMatches: any[] = [];
    if (lastWp) {
      const dropArea = findServiceArea(lastWp.lat, lastWp.lng);
      if (dropArea) {
        fixedSurchargeMatches = surcharges.filter((sc: any) =>
          sc.surcharge_type === "fixed" && sc.destination_area_id === dropArea.id &&
          (!sc.vehicle_type_id || sc.vehicle_type_id === vt.id)
        );
      }
    }

    // Only use fixed fare if dispatcher explicitly selected a disposal type
    if (fixedSurchargeMatches.length > 0 && selectedDisposalType) {
      const selectedSc = fixedSurchargeMatches.find((sc: any) => sc.id === selectedDisposalType) || fixedSurchargeMatches[0];
      let totalFare = Number(selectedSc.amount);
      totalFare += totalFare * (Number(vt.passenger_tax_pct) / 100);
      setEstimatedFare(Math.max(Math.round(totalFare), Number(vt.minimum_fare)));
      setAvailableDisposalTypes(fixedSurchargeMatches);
      return;
    }

    // Always expose available disposal types so the selector is shown
    setAvailableDisposalTypes(fixedSurchargeMatches);
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
  }, [pickup, dropoff, stops, selectedVehicleType, vehicleTypes, fareZones, surcharges, serviceLocations, distanceKm, segmentDistances, luggageCount, selectedDisposalType]);

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

  // Helper: find nearest service area name for a lat/lng — use polygon containment first
  const findNearestServiceAreaName = useCallback((lat: number, lng: number): string => {
    const pointInPolygon = (plat: number, plng: number, polygon: { lat: number; lng: number }[]): boolean => {
      if (!polygon || polygon.length < 3) return false;
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat, yi = polygon[i].lng;
        const xj = polygon[j].lat, yj = polygon[j].lng;
        if ((yi > plng) !== (yj > plng) && plat < ((xj - xi) * (plng - yi)) / (yj - yi) + xi) inside = !inside;
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

    // 1. Point-in-polygon — prefer smallest polygon (most specific area)
    let bestMatch: any = null;
    let smallestArea = Infinity;
    for (const sl of serviceLocations) {
      if (sl.polygon && pointInPolygon(lat, lng, sl.polygon as any)) {
        const area = calcPolyArea(sl.polygon as any);
        if (area < smallestArea) { smallestArea = area; bestMatch = sl; }
      }
    }
    if (bestMatch) return bestMatch.name;

    // 2. Fallback to nearest center point
    let best: string = "Location";
    let bestDist = Infinity;
    for (const sl of serviceLocations) {
      const d = haversineKm(lat, lng, Number(sl.lat), Number(sl.lng));
      if (d < bestDist) { bestDist = d; best = sl.name; }
    }
    return best;
  }, [serviceLocations]);

  // Check if a coordinate falls within any admin service area (10km radius)
  const isWithinServiceArea = useCallback((lat: number, lng: number): boolean => {
    for (const sl of serviceLocations) {
      if (haversineKm(lat, lng, Number(sl.lat), Number(sl.lng)) <= 10) return true;
    }
    return false;
  }, [serviceLocations]);

  const searchAbortRef = useRef<AbortController | null>(null);

  // Search: local DB + Nominatim (no Google Places)
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 1) { setOsmResults([]); setResultHighlight(-1); return; }
    setResultHighlight(-1);
    const q = searchQuery.toLowerCase();

    if (searchAbortRef.current) searchAbortRef.current.abort();
    const abortCtrl = new AbortController();
    searchAbortRef.current = abortCtrl;

    // 1. Instant local matches from DB + recent bookings (zero latency)
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
        .filter((nl: any) => {
          const nameMatch = nl.name.toLowerCase().includes(q);
          const addrMatch = (nl.address || "").toLowerCase().includes(q);
          const descMatch = (nl.description || "").toLowerCase().includes(q);
          const groupMatch = (nl.group_name || "").toLowerCase().includes(q);
          return nameMatch || addrMatch || descMatch || groupMatch;
        })
        .map((nl: any, i: number) => {
          const areaName = findNearestServiceAreaName(Number(nl.lat), Number(nl.lng));
          const roadInfo = nl.road_name || "";
          return {
            place_id: 800000 + i,
            display_name: `${nl.name} — ${areaName}`,
            lat: String(nl.lat),
            lon: String(nl.lng),
            name: nl.name,
            tag: areaName,
            road: roadInfo || undefined,
          };
        }),
      ...recentBookings
        .filter((rb: any) => rb.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map((rb: any, i: number) => {
          const areaName = findNearestServiceAreaName(Number(rb.lat), Number(rb.lng));
          return {
            place_id: 600000 + i,
            display_name: `${rb.name} — ${areaName}`,
            lat: String(rb.lat),
            lon: String(rb.lng),
            name: rb.name,
            tag: areaName,
            road: "Recent",
          };
        }),
    ];
    // Deduplicate: remove recent bookings that overlap with service/named locations
    const coordSet = new Set(localMatches.filter(m => m.place_id >= 800000).map(m => `${parseFloat(m.lat).toFixed(4)},${parseFloat(m.lon).toFixed(4)}`));
    const deduped = localMatches.filter(m => {
      if (m.place_id < 700000) {
        const key = `${parseFloat(m.lat).toFixed(4)},${parseFloat(m.lon).toFixed(4)}`;
        return !coordSet.has(key);
      }
      return true;
    });
    // Sort by relevance
    deduped.sort((a, b) => {
      const aName = (a.name || "").toLowerCase();
      const bName = (b.name || "").toLowerCase();
      const aExact = aName === q ? 0 : aName.startsWith(q) ? 1 : 2;
      const bExact = bName === q ? 0 : bName.startsWith(q) ? 1 : 2;
      if (aExact !== bExact) return aExact - bExact;
      const aPrio = a.place_id >= 900000 ? 0 : a.place_id >= 800000 ? 1 : 2;
      const bPrio = b.place_id >= 900000 ? 0 : b.place_id >= 800000 ? 1 : 2;
      return aPrio - bPrio;
    });
    setOsmResults(deduped);

    if (searchQuery.length < 2) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const mergeResults = (newResults: NominatimResult[]) => {
        if (newResults.length > 0) {
          setOsmResults(prev => {
            const existingCoords = new Set(prev.map(r => `${parseFloat(r.lat).toFixed(4)},${parseFloat(r.lon).toFixed(4)}`));
            const filtered = newResults.filter(nr => !existingCoords.has(`${parseFloat(nr.lat).toFixed(4)},${parseFloat(nr.lon).toFixed(4)}`));
            const merged = [...prev, ...filtered];
            merged.sort((a, b) => {
              const aName = (a.name || "").toLowerCase();
              const bName = (b.name || "").toLowerCase();
              const aExact = aName === q ? 0 : aName.startsWith(q) ? 1 : 2;
              const bExact = bName === q ? 0 : bName.startsWith(q) ? 1 : 2;
              if (aExact !== bExact) return aExact - bExact;
              const aPrio = a.place_id >= 900000 ? 0 : a.place_id >= 800000 ? 1 : 2;
              const bPrio = b.place_id >= 900000 ? 0 : b.place_id >= 800000 ? 1 : 2;
              return aPrio - bPrio;
            });
            return merged;
          });
        }
      };

      // Nominatim free geocoding
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=mv&limit=5&addressdetails=1`, {
        signal: abortCtrl.signal,
        headers: { "Accept-Language": "en" },
      })
        .then(res => res.json())
        .then(data => {
          if (abortCtrl.signal.aborted || !Array.isArray(data)) return;
          const nominatimResults: NominatimResult[] = data
            .filter((r: any) => isWithinServiceArea(parseFloat(r.lat), parseFloat(r.lon)))
            .map((r: any, i: number) => {
              const lat = parseFloat(r.lat);
              const lng = parseFloat(r.lon);
              const areaName = findNearestServiceAreaName(lat, lng);
              return {
                place_id: 700000 + i,
                display_name: `${r.display_name?.split(",")[0] || searchQuery} — ${areaName}`,
                lat: String(lat),
                lon: String(lng),
                name: r.display_name?.split(",")[0] || "",
                tag: areaName,
                road: r.address?.road || undefined,
              };
            });
          if (nominatimResults.length > 0) mergeResults(nominatimResults);
        })
        .catch(() => {});

      // Photon (free OSM geocoder) — fallback for better coverage
      fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&lat=4.1755&lon=73.5093&limit=5&lang=en&bbox=72.5,-1,74,8`, { signal: abortCtrl.signal })
        .then(res => res.json())
        .then(data => {
          if (abortCtrl.signal.aborted || !data.features?.length) return;
          const photonResults: NominatimResult[] = data.features
            .filter((f: any) => f.geometry?.coordinates && isWithinServiceArea(f.geometry.coordinates[1], f.geometry.coordinates[0]))
            .map((f: any, i: number) => {
              const lat = f.geometry.coordinates[1];
              const lng = f.geometry.coordinates[0];
              const areaName = findNearestServiceAreaName(lat, lng);
              return {
                place_id: 500000 + i,
                display_name: `${f.properties.name || f.properties.street || searchQuery} — ${areaName}`,
                lat: String(lat),
                lon: String(lng),
                name: f.properties.name || f.properties.street || "",
                tag: areaName,
                road: f.properties.street || undefined,
              };
            });
          if (photonResults.length > 0) mergeResults(photonResults);
        })
        .catch(() => {});
    }, 80);

    return () => { abortCtrl.abort(); };
  }, [searchQuery, serviceLocations, namedLocations, recentBookings, findNearestServiceAreaName, isWithinServiceArea]);

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

  // Allow dispatchers to use a custom typed location name (no coordinates yet)
  // Saves it as a pending named_location so admin can add lat/lng later
  const useCustomLocation = async (customName: string) => {
    const trimmed = customName.trim();
    if (!trimmed) return;

    // Use center of first service area as placeholder coordinates
    const defaultLat = serviceLocations.length > 0 ? Number(serviceLocations[0].lat) : 4.1755;
    const defaultLng = serviceLocations.length > 0 ? Number(serviceLocations[0].lng) : 73.5093;

    const loc: StopLocation = { address: trimmed, lat: defaultLat, lng: defaultLng };
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

    // Save as pending named_location for future use (fire and forget)
    try {
      const { error } = await supabase.from("named_locations").insert({
        name: trimmed,
        lat: 0,
        lng: 0,
        address: "",
        status: "pending",
        suggested_by_type: "dispatch",
        is_active: false,
      });
      if (!error) {
        toast({ title: "Location saved", description: `"${trimmed}" saved for admin to set coordinates later.` });
        // Invalidate location cache
        _locationsCache = null;
      }
    } catch {}
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
      const customerName = "Dispatch";
      const isBroadcast = dispatchMethod === "broadcast";

      // Build the trip payload up-front so the offline branch can queue it
      // without doing ANY network round-trips first.
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
        customer_phone: customerPhone.trim() || "3352020",
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

      // OFFLINE: queue immediately, do not attempt any supabase calls.
      // Without this guard the "blocked vehicle" pre-check below would hang
      // forever on a dead connection and leave the Assign button spinning.
      if (!isOnline && onOfflineQueue) {
        onOfflineQueue(tripPayload);
        clearForm();
        onTripCreated();
        setSubmitting(false);
        return;
      }

      // Check if assigned vehicle is blocked (online only)
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

      // Pre-fetch broadcast data in parallel with trip insert for zero-delay notifications
      let broadcastDriversCache: any[] | null = null;
      let broadcastTimeoutMsCache = 60_000;


      // Fire trip insert + broadcast pre-fetch in parallel
      const tripInsertPromise = supabase.from("trips").insert(tripPayload).select("*").single();

      const driverLocQuery = supabase.from("driver_locations").select("driver_id, lat, lng, vehicle_type_id").eq("is_online", true).eq("is_on_trip", false);
      // Only send to drivers currently operating the requested vehicle type
      if (selectedVehicleType) {
        driverLocQuery.eq("vehicle_type_id", selectedVehicleType);
      }

      // Pre-fetch system default radius in parallel — drivers' personal radii
      // are fetched right after we know who's online, but we kick off the
      // settings query now so it costs zero extra time.
      const broadcastPreFetchPromise = isBroadcast ? Promise.all([
        driverLocQuery,
        Promise.resolve(supabase.from("system_settings").select("value").eq("key", "dispatch_broadcast_timeout_seconds").single()).catch(() => ({ data: null })),
        Promise.resolve(supabase.from("system_settings").select("value").eq("key", "default_trip_radius_km").maybeSingle()).catch(() => ({ data: null })),
      ]) : Promise.resolve(null);

      const [tripResult, broadcastData] = await Promise.all([tripInsertPromise, broadcastPreFetchPromise]);
      
      const { data: trip, error } = tripResult;
      if (error) throw error;

      let defaultRadiusCache = 10;
      if (broadcastData) {
        const [driversRes, timeoutRes, defaultRes] = broadcastData as any;
        const allDrivers = driversRes?.data || [];
        
        broadcastDriversCache = allDrivers;
        if (timeoutRes?.data?.value) {
          const secs = typeof timeoutRes.data.value === "number" ? timeoutRes.data.value : parseInt(String(timeoutRes.data.value)) || 60;
          broadcastTimeoutMsCache = secs * 1000;
        }
        if (defaultRes?.data?.value != null) {
          defaultRadiusCache = Number(defaultRes.data.value) || 10;
        }
      }

      // If the assigned VEHICLE (center code) had a loss trip, clear only
      // that vehicle's loss — NOT every loss trip belonging to the driver.
      // A driver/number (e.g. 7320207) can hold multiple center codes
      // (e.g. 375 + 377). Assigning code 377 must NOT clear code 375's loss.
      const assignedVehicleId = assignedEntry?.vehicle_id || null;
      if (assignedVehicleId) {
        supabase.from("trips")
          .update({ is_loss: false })
          .eq("vehicle_id", assignedVehicleId)
          .eq("is_loss", true)
          .eq("dispatch_type", "operator")
          .then(() => { onTripCreated(); });
      } else if (assignedDriverId && dispatchMethod === "specific") {
        // Manual driver assignment with no center-code vehicle linked —
        // fall back to the legacy driver-scoped clear so behaviour is unchanged.
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
          // Fire-and-forget — don't block the broadcast on stops insert
          supabase.from("trip_stops").insert(
            validStops.map((s, i) => ({ trip_id: trip.id, stop_order: i + 1, address: s.address, lat: s.lat, lng: s.lng }))
          ).then(({ error }) => { if (error) console.warn("Trip stops insert failed:", error); });
        }
      }

      toast({ title: `Bid ${formIndex + 1} sent!`, description: isAssigned ? "Assigned to driver" : "Broadcasting to nearby drivers" });

      // Fire notifications non-blocking for speed
      if (isAssigned && assignedDriverId) {
        notifyTripAssigned(assignedDriverId, trip.id, tripPayload.pickup_address).catch(console.warn);
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
          // INSTANT BROADCAST: First send to the 10 nearest drivers (geographic
          // distance only) so the push fires within milliseconds. The personal
          // radius filter is applied AFTER the push as a refinement to cancel
          // any out-of-range drivers' notifications client-side. Drivers see
          // the request without waiting for an extra DB round-trip.
          const driversWithCoords = (broadcastDriversCache as any[])
            .filter((d: any) => typeof d.lat === "number" && typeof d.lng === "number")
            .map((d: any) => ({ ...d, dist: haversineKm(pickup.lat, pickup.lng, d.lat, d.lng) }))
            .sort((a: any, b: any) => a.dist - b.dist);

          // Cap at 10 nearest within a generous 50km bound (Maldives-wide)
          const nearbyDrivers = driversWithCoords
            .filter((d: any) => d.dist <= 50)
            .slice(0, 10);

          if (nearbyDrivers.length === 0) {
            // No drivers within bound — immediately cancel
            await supabase.from("trips").update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              cancel_reason: "No drivers available in area",
            }).eq("id", tripId);
            toast({ title: "No drivers in range", description: "Trip cancelled — no drivers nearby", variant: "destructive" });
            onTripCreated();
          } else {
            // Respect each driver's personal trip_radius_km — never push to
            // drivers who set a smaller radius than their distance to pickup.
            // (Direct dispatcher assignments bypass this in the isAssigned branch above.)
            const eligibleIds = await filterDriversByPersonalRadius(nearbyDrivers as any, pickup.lat, pickup.lng);

            if (eligibleIds.length === 0) {
              await supabase.from("trips").update({
                status: "cancelled",
                cancelled_at: new Date().toISOString(),
                cancel_reason: "No drivers within personal radius",
              }).eq("id", tripId);
              toast({ title: "No drivers in range", description: "All nearby drivers set a smaller radius", variant: "destructive" });
              onTripCreated();
              return;
            }

            // 🚀 FIRE PUSH IMMEDIATELY — only to drivers whose personal radius covers the pickup
            const selectedVtName = vehicleTypes.find(v => v.id === selectedVehicleType)?.name || null;
            notifyTripRequested(
              eligibleIds,
              trip.id,
              tripPayload.pickup_address,
              selectedVehicleType || undefined,
              estimatedFare,
              selectedVtName,
              pickup.lat,
              pickup.lng,
            ).catch(console.warn);

            toast({ title: `Sent to ${eligibleIds.length} nearby driver(s)`, description: `Auto-cancel in ${Math.round(broadcastTimeoutMsCache / 1000)}s if no one accepts` });

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
                // No auto-SMS — dispatcher uses No Vehicle button manually
                onTripCreated();
              }
            }, timeoutMs);
          }
        }
      }

      // For broadcast (Send to App), keep form data so dispatcher can re-assign without re-entering
      if (!isBroadcast) {
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
        const carType = vehicleTypes.find(vt => vt.name.toLowerCase() === "car");
        setSelectedVehicleType(carType?.id || vehicleTypes[0]?.id || "");
        setSelectedDriverId("");
        setEstimatedFare(null);
      }
      onTripCreated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const formLabels = ["Bid 1", "Bid 2", "Bid 3"];

  return (
    <div className={`bg-card border border-border rounded-lg overflow-hidden flex flex-col min-w-[260px] max-w-[320px] max-h-[calc(100vh-130px)]`}>
      {/* Form header */}
      <div className="border-b border-border px-2.5 py-1 flex items-center justify-between gap-2">
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

      {!collapsed && availableDisposalTypes.length > 0 && (
        <div className="px-2.5 py-1.5 bg-accent/30 border-b border-border flex items-center gap-1.5 flex-wrap">
          <Trash2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <button
            onClick={() => setSelectedDisposalType(null)}
            className={`px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors ${!selectedDisposalType ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}
          >
            Normal Trip
          </button>
          {availableDisposalTypes.map((dt: any) => (
            <button
              key={dt.id}
              onClick={() => setSelectedDisposalType(dt.id)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors ${selectedDisposalType === dt.id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}
            >
              {dt.name} — {dt.amount} MVR
            </button>
          ))}
        </div>
      )}

      {!collapsed && (
        <div className="p-1.5 space-y-1 overflow-y-auto flex-1 min-h-0">
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
                  className={`px-2 py-1 rounded text-[9px] font-medium transition-all border flex items-center gap-1 ${
                    selectedVehicleType === vt.id ? "bg-primary text-primary-foreground border-primary" : i === vehicleTypeFocusIndex ? "bg-muted border-primary/50" : "bg-surface border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {vt.image_url && <img src={vt.image_url} alt="" className="w-4 h-3 object-contain" />}
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
                  placeholder="3352020"
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
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setResultHighlight(prev => Math.min(prev + 1, osmResults.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setResultHighlight(prev => Math.max(prev - 1, -1));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const idx = resultHighlight >= 0 ? resultHighlight : 0;
                      if (osmResults.length > 0 && !pickup) {
                        selectLocation(osmResults[idx]);
                      } else if (osmResults.length === 0 && searchQuery.trim().length >= 2 && !pickup) {
                        useCustomLocation(searchQuery);
                      }
                      setResultHighlight(-1);
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
            {selecting === "pickup" && (osmResults.length > 0 || searchQuery.trim().length >= 2) && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {osmResults.map((r, idx) => (
                  <div key={r.place_id} className={`flex items-center gap-1 w-full px-3 py-2 border-b border-border last:border-0 ${idx === resultHighlight ? "bg-primary/10" : "hover:bg-surface"}`}>
                    <button onClick={() => { selectLocation(r); setResultHighlight(-1); setTimeout(() => toButtonsRef.current?.focus(), 50); }} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                      <Navigation className="w-3.5 h-3.5 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{r.name || r.display_name.split(",")[0]}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{r.road ? `${r.road} • ${r.tag || r.display_name.split("—").slice(1).join("—").trim()}` : (r.tag || r.display_name.split("—").slice(1).join("—").trim())}</p>
                      </div>
                      {r.tag && (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-primary/15 text-primary">{r.tag}</span>
                      )}
                    </button>
                    {r.lat && r.lon && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const field = selecting || "pickup";
                          const loc = { lat: parseFloat(r.lat), lng: parseFloat(r.lon), address: r.name || r.display_name.split(",")[0] };
                          if (field === "pickup") {
                            setPickup(loc);
                            setPickupQuery(loc.address);
                          } else {
                            setDropoff(loc);
                          }
                          setShowMapPicker(field as "pickup" | "dropoff");
                          setSelecting(null);
                        }}
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-primary/10 transition-colors"
                        title="Show on map"
                      >
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                      </button>
                    )}
                  </div>
                ))}
                {searchQuery.trim().length >= 2 && (
                  <button onClick={() => { useCustomLocation(searchQuery); setTimeout(() => toButtonsRef.current?.focus(), 50); }} className="flex items-center gap-2 w-full px-3 py-2 text-left transition-colors hover:bg-surface border-t border-border bg-muted/30">
                    <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                    <p className="text-xs font-medium text-primary truncate">Use "{searchQuery.trim()}" as custom location</p>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* TO - Service area buttons + search */}
          <div className="space-y-1.5 relative">
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
            {/* Dropoff search input */}
            <div className="relative flex gap-1">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={selecting === "dropoff" ? searchQuery : (dropoff?.address || "")}
                  onChange={e => { setSelecting("dropoff"); setSearchQuery(e.target.value); }}
                  onFocus={() => { setSelecting("dropoff"); setSearchQuery(""); }}
                  onKeyDown={e => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setResultHighlight(prev => Math.min(prev + 1, osmResults.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setResultHighlight(prev => Math.max(prev - 1, -1));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const idx = resultHighlight >= 0 ? resultHighlight : 0;
                      if (osmResults.length > 0 && !dropoff) {
                        selectLocation(osmResults[idx]);
                      } else if (osmResults.length === 0 && searchQuery.trim().length >= 2 && !dropoff) {
                        useCustomLocation(searchQuery);
                      }
                      setResultHighlight(-1);
                      setTimeout(() => phoneInputRef.current?.focus(), 50);
                    }
                  }}
                  placeholder="Or search a location..."
                  className="w-full pl-8 pr-8 py-1.5 bg-surface border border-border rounded text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {dropoff && (
                  <button tabIndex={-1} onClick={() => { setDropoff(null); setSearchQuery(""); setSelecting("dropoff"); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                    <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>
            </div>
            {selecting === "dropoff" && (osmResults.length > 0 || searchQuery.trim().length >= 2) && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {osmResults.map((r, idx) => (
                  <div key={r.place_id} className={`flex items-center gap-1 w-full px-3 py-2 border-b border-border last:border-0 ${idx === resultHighlight ? "bg-primary/10" : "hover:bg-surface"}`}>
                    <button onClick={() => { selectLocation(r); setResultHighlight(-1); setTimeout(() => phoneInputRef.current?.focus(), 50); }} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                      <Navigation className="w-3.5 h-3.5 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{r.name || r.display_name.split(",")[0]}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{r.road ? `${r.road} • ${r.tag || r.display_name.split("—").slice(1).join("—").trim()}` : (r.tag || r.display_name.split("—").slice(1).join("—").trim())}</p>
                      </div>
                      {r.tag && (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0 bg-primary/15 text-primary">{r.tag}</span>
                      )}
                    </button>
                    {r.lat && r.lon && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const loc = { lat: parseFloat(r.lat), lng: parseFloat(r.lon), address: r.name || r.display_name.split(",")[0] };
                          setDropoff(loc);
                          setShowMapPicker("dropoff");
                          setSelecting(null);
                        }}
                        className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-primary/10 transition-colors"
                        title="Show on map"
                      >
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                      </button>
                    )}
                  </div>
                ))}
                {searchQuery.trim().length >= 2 && (
                  <button onClick={() => { useCustomLocation(searchQuery); setTimeout(() => phoneInputRef.current?.focus(), 50); }} className="flex items-center gap-2 w-full px-3 py-2 text-left transition-colors hover:bg-surface border-t border-border bg-muted/30">
                    <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                    <p className="text-xs font-medium text-primary truncate">Use "{searchQuery.trim()}" as custom location</p>
                  </button>
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
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setResultHighlight(prev => Math.min(prev + 1, osmResults.length - 1));
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setResultHighlight(prev => Math.max(prev - 1, -1));
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            const selIdx = resultHighlight >= 0 ? resultHighlight : 0;
                            if (osmResults.length > 0 && !stop.address) selectLocation(osmResults[selIdx]);
                            else if (osmResults.length === 0 && searchQuery.trim().length >= 2 && !stop.address) useCustomLocation(searchQuery);
                            setResultHighlight(-1);
                            setTimeout(() => phoneInputRef.current?.focus(), 50);
                          }
                        }}
                        placeholder={`Stop ${i + 1}`}
                        className="w-full pl-7 pr-2.5 py-2 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <button tabIndex={-1} onClick={() => removeStop(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  {selecting === i && (osmResults.length > 0 || searchQuery.trim().length >= 2) && (
                    <div className="absolute left-0 right-6 z-20 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {osmResults.map((r, idx) => (
                        <button key={r.place_id} onClick={() => { selectLocation(r); setResultHighlight(-1); }} className={`flex items-center gap-2 w-full px-3 py-2 text-left transition-colors border-b border-border last:border-0 ${idx === resultHighlight ? "bg-primary/10" : "hover:bg-surface"}`}>
                          <Navigation className="w-3 h-3 text-primary shrink-0" />
                          <p className="text-xs text-foreground truncate">{r.name || r.display_name.split(",")[0]}</p>
                        </button>
                      ))}
                      {searchQuery.trim().length >= 2 && (
                        <button onClick={() => { useCustomLocation(searchQuery); }} className="flex items-center gap-2 w-full px-3 py-2 text-left transition-colors hover:bg-surface border-t border-border bg-muted/30">
                          <Plus className="w-3 h-3 text-primary shrink-0" />
                          <p className="text-[11px] font-medium text-primary truncate">Use "{searchQuery.trim()}"</p>
                        </button>
                      )}
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
                  setCenterCodeResults((prev) => {
                    if (prev.some((r) => r.code === entry.code)) return prev;
                    const updated = [...prev, entry].sort((a, b) => {
                      try {
                        const getPriority = (item: CenterCodeIndexEntry) => {
                          const hasLoss = !!item.has_loss;
                          const hasTripsToday = (item.today_trips || 0) > 0;

                          if (hasLoss) return 0; // Loss always top
                          if (!hasTripsToday) return 1; // No trips today next
                          return 2; // Has trips today last
                        };

                        const priorityDiff = getPriority(a) - getPriority(b);
                        if (priorityDiff !== 0) return priorityDiff;

                        if (!a.last_trip_date && !b.last_trip_date) return 0;
                        if (!a.last_trip_date) return 1;
                        if (!b.last_trip_date) return -1;

                        return new Date(a.last_trip_date).getTime() - new Date(b.last_trip_date).getTime();
                      } catch (error) {
                        console.error("Vehicle sorting error:", error);
                        return 0;
                      }
                    });

                    const topResult = updated[0];
                    if (topResult?.vehicle_type_id) {
                      setSelectedVehicleType(topResult.vehicle_type_id);
                    }

                    return updated;
                  });
                };

                // OFFLINE fast-path: use cached index directly, skip all live DB checks
                if (!isOnline) {
                  const cached = centerCodeIndex?.[code];
                  if (cached) {
                    addEntry({ ...cached, code, today_trips: cached.today_trips || 0, has_loss: !!cached.has_loss });
                    toast({ title: "Offline mode", description: `Using cached data for ${code}. Trip counts may be stale.` });
                  } else {
                    toast({ title: "Not found offline", description: `Code "${code}" not in cache. Try when online.`, variant: "destructive" });
                  }
                  return;
                }

                // 1) Instant path: use preloaded index, but re-fetch today_trips live
                const cached = centerCodeIndex?.[code];
                if (cached) {
                  const { data: vCheck } = await supabase
                    .from("vehicles")
                    .select("id, blocked_until, is_active, center_fee_exempt")
                    .eq("center_code", code)
                    .limit(1)
                    .maybeSingle();
                  if (!vCheck) {
                    toast({ title: "No vehicle found", description: `Code "${code}" not found`, variant: "destructive" });
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

                  // Check center payment status (skip if exempt)
                  let hasPendingPayment = false;
                  if (!(vCheck as any).center_fee_exempt) {
                    const centerNow = new Date();
                    const centerCurrentMonth = `${centerNow.getFullYear()}-${String(centerNow.getMonth() + 1).padStart(2, "0")}`;
                    if (centerNow.getDate() >= 5) {
                      const { data: centerPayment } = await supabase
                        .from("center_payments")
                        .select("status")
                        .eq("vehicle_id", vCheck.id)
                        .eq("payment_month", centerCurrentMonth)
                        .in("status", ["approved", "submitted"])
                        .limit(1);
                      if (!centerPayment || centerPayment.length === 0) {
                        toast({ title: "⚠️ Pending payment", description: `Code "${code}" has unpaid center fee for ${centerCurrentMonth}. Payment must be cleared first.`, variant: "destructive" });
                        return;
                      }
                    }
                  }

                  // Re-fetch today_trips and loss status live
                  const nowUtcMs = Date.now();
                  const maldivesNow = new Date(nowUtcMs + 5 * 3600000);
                  const yy = maldivesNow.getUTCFullYear();
                  const mm = String(maldivesNow.getUTCMonth() + 1).padStart(2, '0');
                  const dd = String(maldivesNow.getUTCDate()).padStart(2, '0');
                  const todayStartISO = `${yy}-${mm}-${dd}T00:00:00+05:00`;

                  const { data: codeVehicles } = await supabase
                    .from("vehicles")
                    .select("id")
                    .eq("center_code", code);
                  const codeVehicleIds = (codeVehicles || []).map((v: any) => v.id);

                  const [{ count: todayCount }, { count: lossCount }] = await Promise.all([
                    supabase
                      .from("trips")
                      .select("id", { count: "exact", head: true })
                      .in("vehicle_id", codeVehicleIds.length > 0 ? codeVehicleIds : ["__none__"])
                      .gte("created_at", todayStartISO)
                      .in("status", ["requested", "accepted", "started", "completed"])
                      .eq("dispatch_type", "operator")
                      .eq("is_loss", false),
                    supabase
                      .from("trips")
                      .select("id", { count: "exact", head: true })
                      .in("vehicle_id", codeVehicleIds.length > 0 ? codeVehicleIds : ["__none__"])
                      .eq("is_loss", true)
                      .eq("dispatch_type", "operator"),
                  ]);

                  addEntry({ ...cached, code, today_trips: todayCount || 0, has_loss: (lossCount || 0) > 0 });
                  return;
                }

                // 2) Silent fallback: direct lookup
                try {
                  const { data: vehicle } = await supabase
                    .from("vehicles")
                    .select("id, plate_number, color, vehicle_type_id, driver_id, blocked_until, center_fee_exempt, vehicle_types:vehicle_type_id(name)")
                    .eq("center_code", code)
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

                  // Check center payment status (skip if exempt)
                  if (!(vehicle as any).center_fee_exempt) {
                    const centerNow2 = new Date();
                    const centerMonth2 = `${centerNow2.getFullYear()}-${String(centerNow2.getMonth() + 1).padStart(2, "0")}`;
                    if (centerNow2.getDate() >= 5) {
                      const { data: centerPmt } = await supabase
                        .from("center_payments")
                        .select("status")
                        .eq("vehicle_id", vehicle.id)
                        .eq("payment_month", centerMonth2)
                        .in("status", ["approved", "submitted"])
                        .maybeSingle();
                      if (!centerPmt) {
                        toast({ title: "⚠️ Pending payment", description: `Code "${code}" has unpaid center fee for ${centerMonth2}. Payment must be cleared first.`, variant: "destructive" });
                        return;
                      }
                    }
                  }

                  let driverName: string | null = null;
                  let driverPhone: string | null = null;
                  let lastTripDate: string | null = null;
                  let todayTrips = 0;
                  let hasLoss = false;

                  if (vehicle.driver_id) {
                    // Use Maldives time (UTC+5) for "today" calculation
                    // Maldives midnight = current UTC date adjusted by +5h, then back to UTC
                    const nowUtcMs = Date.now();
                    const maldivesNow = new Date(nowUtcMs + 5 * 3600000);
                    const yy = maldivesNow.getUTCFullYear();
                    const mm = String(maldivesNow.getUTCMonth() + 1).padStart(2, '0');
                    const dd = String(maldivesNow.getUTCDate()).padStart(2, '0');
                    // Midnight Maldives in UTC = subtract 5 hours
                    const todayStartISO = `${yy}-${mm}-${dd}T00:00:00+05:00`;

                    // Get all vehicle IDs for this center code to count trips by code
                    const { data: codeVehicles } = await supabase
                      .from("vehicles")
                      .select("id")
                      .eq("center_code", code);
                    const codeVehicleIds = (codeVehicles || []).map((v: any) => v.id);

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
                        .in("vehicle_id", codeVehicleIds.length > 0 ? codeVehicleIds : ["__none__"])
                        .gte("created_at", todayStartISO)
                        .in("status", ["requested", "accepted", "started", "completed"])
                        .eq("dispatch_type", "operator")
                        .eq("is_loss", false),
                      supabase
                        .from("trips")
                        .select("id", { count: "exact", head: true })
                        .in("vehicle_id", codeVehicleIds.length > 0 ? codeVehicleIds : ["__none__"])
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
                    console.log(`[CenterCode] ${code}: todayStart=${todayStartISO}, vehicleIds=${codeVehicleIds.length}, todayTrips=${todayTrips}, hasLoss=${(lossCount || 0) > 0}`);
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
              <div className="space-y-1">
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
                    className={`border rounded px-2 py-1 text-[10px] cursor-pointer transition-all ${
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
                        {(info.today_trips || 0) > 0 && <span className="text-primary font-semibold"> • {info.today_trips}</span>}
                        {info.driver_phone && <span className="text-muted-foreground"> • {info.driver_phone}</span>}
                        {info.last_trip_date && <span className="text-muted-foreground/70 text-[9px]"> • {new Date(info.last_trip_date).toLocaleDateString([], { month: "short", day: "2-digit" })} {new Date(info.last_trip_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                      </span>
                      <div className="flex items-center gap-1 ml-2">
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



        </div>
      )}

      {/* Submit */}
      {!collapsed && (
      <div className="p-3 pt-0 flex gap-2">
          <button onClick={handleSubmit} disabled={submitting || !pickup || !dropoff || (dispatchMethod === "broadcast" && !customerPhone)} className={`flex-1 font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-40 text-xs ${dispatchMethod === "broadcast" ? "bg-orange-500 text-white" : "bg-primary text-primary-foreground"}`}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3.5 h-3.5" /> {dispatchMethod === "broadcast" ? "Send to App" : "Assign"}</>}
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
                    customer_phone: customerPhone.trim() || "3352020",
                    created_by: dispatcherProfile?.id || null,
                    dispatch_type: "operator",
                    vehicle_type_id: selectedVehicleType || null,
                    status: "completed",
                    completed_at: new Date().toISOString(),
                    fare_type: "distance",
                    estimated_fare: estimatedFare || null,
                    booking_notes: (centerCodeResults.length > 0) ? `Center: ${centerCodeResults.map(r => r.code).join(", ")} — No Vehicle` : "No Vehicle",
                    is_loss: false,
                  };
                  // OFFLINE: queue immediately
                  if (!isOnline && onOfflineQueue) {
                    onOfflineQueue(tripPayload);
                    clearForm();
                    onTripCreated();
                    setSubmitting(false);
                    return;
                  }
                  const { error } = await supabase.from("trips").insert(tripPayload);
                  if (error) throw error;
                  toast({ title: "Recorded as No Vehicle", description: "Booking saved" });
                  // Send SMS to passenger if phone provided
                  if (customerPhone.trim()) {
                    supabase.functions.invoke("send-no-vehicle-sms", {
                      body: { phone: customerPhone.trim() },
                    }).then(() => toast({ title: "SMS sent to passenger" })).catch(console.warn);
                  }
                  clearForm();
                  onTripCreated();
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                }
                setSubmitting(false);
              }}
              disabled={submitting || !pickup || !dropoff}
              className="px-2.5 py-2 rounded-lg font-semibold text-xs bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              <ShieldOff className="w-3.5 h-3.5" />
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
