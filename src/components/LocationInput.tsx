import { MapPin, ChevronDown, ChevronUp, Loader2, Search, Locate, Users, Luggage, Minus, Plus, Navigation, X, CirclePlus, Home, Briefcase, Star, Heart, MapPinned, Calendar, Clock, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import MapPicker from "./MapPicker";
import { reverseGeocodeLocation } from "@/lib/geocode";

interface ServiceLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface ServiceAreaPolygon {
  id: string;
  name: string;
  lat: number;
  lng: number;
  polygon: { lat: number; lng: number }[] | null;
}

interface PlaceResult {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface SavedLocation {
  id: string;
  label: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  icon: string;
}

export type BookingType = "now" | "scheduled" | "hourly";

interface LocationInputProps {
  onSearch: (pickup: ServiceLocation, dropoff: ServiceLocation, passengers: number, luggage: number, stops?: ServiceLocation[], bookingType?: BookingType, scheduledAt?: string, bookingNotes?: string) => void;
  userId?: string;
}

const ICON_MAP: Record<string, typeof Home> = {
  home: Home,
  briefcase: Briefcase,
  star: Star,
  heart: Heart,
};

const PRESET_LABELS = [
  { label: "Home", icon: "home" },
  { label: "Office", icon: "briefcase" },
];

const LocationInput = ({ onSearch, userId }: LocationInputProps) => {
  const [locations, setLocations] = useState<ServiceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickup, setPickup] = useState<ServiceLocation | null>(null);
  const [dropoff, setDropoff] = useState<ServiceLocation | null>(null);
  const [stops, setStops] = useState<(ServiceLocation | null)[]>([]);
  const [stopQueries, setStopQueries] = useState<string[]>([]);
  const [activeField, setActiveField] = useState<"pickup" | "dropoff" | `stop-${number}` | null>(null);
  const [mapPickerField, setMapPickerField] = useState<"pickup" | "dropoff" | `stop-${number}` | null>(null);
  const [pickupQuery, setPickupQuery] = useState("");
  const [dropoffQuery, setDropoffQuery] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [settingOnMap, setSettingOnMap] = useState(false);
  const [bookingType, setBookingType] = useState<BookingType>("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [serviceAreas, setServiceAreas] = useState<ServiceAreaPolygon[]>([]);
  const [featureScheduled, setFeatureScheduled] = useState(true);
  const [featureHourly, setFeatureHourly] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const pickupRef = useRef<HTMLInputElement>(null);
  const dropoffRef = useRef<HTMLInputElement>(null);
  const stopRefs = useRef<(HTMLInputElement | null)[]>([]);
  const autocompleteServiceRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);

  const activeQuery = activeField === "pickup" ? pickupQuery
    : activeField === "dropoff" ? dropoffQuery
    : activeField?.startsWith("stop-") ? stopQueries[parseInt(activeField.split("-")[1])] || ""
    : "";

  // Fetch service locations + polygons + feature toggles
  useEffect(() => {
    const fetchLocations = async () => {
      const [locRes, settingsRes] = await Promise.all([
        supabase
          .from("service_locations")
          .select("id, name, address, lat, lng, polygon")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("system_settings")
          .select("key, value")
          .in("key", ["feature_scheduled_rides", "feature_hourly_booking"]),
      ]);
      const data = locRes.data;
      if (data) {
        setLocations(data.map((d: any) => ({ id: d.id, name: d.name, address: d.address, lat: d.lat, lng: d.lng })));
        setServiceAreas(data.map((d: any) => ({ id: d.id, name: d.name, lat: d.lat, lng: d.lng, polygon: d.polygon })));
      }
      // Parse feature toggles
      settingsRes.data?.forEach((s: any) => {
        if (s.key === "feature_scheduled_rides") setFeatureScheduled(s.value === true || s.value === "true");
        if (s.key === "feature_hourly_booking") setFeatureHourly(s.value === true || s.value === "true");
      });
      setLoading(false);
    };
    fetchLocations();
  }, []);

  // Fetch saved/favorite locations
  useEffect(() => {
    if (!userId) return;
    const fetchSaved = async () => {
      const { data } = await supabase
        .from("saved_locations")
        .select("id, label, name, address, lat, lng, icon")
        .eq("user_id", userId)
        .order("created_at");
      if (data) setSavedLocations(data as SavedLocation[]);
    };
    fetchSaved();
  }, [userId]);

  useEffect(() => {
    if (!pickup) detectCurrentLocation();
  }, [locations.length]);

  // Point-in-polygon check
  const isPointInPolygon = useCallback((lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lat, yi = polygon[i].lng;
      const xj = polygon[j].lat, yj = polygon[j].lng;
      const intersect = ((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }, []);

  // Check if point is within any service area
  const isInServiceArea = useCallback((lat: number, lng: number): ServiceAreaPolygon | null => {
    for (const area of serviceAreas) {
      if (area.polygon && isPointInPolygon(lat, lng, area.polygon)) {
        return area;
      }
    }
    return null;
  }, [serviceAreas, isPointInPolygon]);

  // Google Places search with debounce — only show results within service areas
  useEffect(() => {
    if (!activeQuery.trim() || activeQuery.length < 2) {
      setPlaceResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const g = (window as any).google;

      // Try Google Places Autocomplete
      if (g?.maps?.places?.AutocompleteService) {
        if (!autocompleteServiceRef.current) {
          autocompleteServiceRef.current = new g.maps.places.AutocompleteService();
        }
        if (!placesServiceRef.current) {
          const mapDiv = document.createElement("div");
          placesServiceRef.current = new g.maps.places.PlacesService(mapDiv);
        }

        // Calculate bounds from all service areas
        const bounds = new g.maps.LatLngBounds();
        serviceAreas.forEach(area => {
          if (area.polygon) {
            area.polygon.forEach(p => bounds.extend(new g.maps.LatLng(p.lat, p.lng)));
          } else {
            bounds.extend(new g.maps.LatLng(area.lat, area.lng));
          }
        });

        try {
          const predictions = await new Promise<any[]>((resolve) => {
            autocompleteServiceRef.current.getPlacePredictions(
              {
                input: activeQuery,
                locationBias: bounds,
                componentRestrictions: { country: "mv" },
              },
              (results: any[] | null, status: string) => {
                resolve(status === "OK" && results ? results : []);
              }
            );
          });

          // Get details for each prediction to get lat/lng
          const detailedResults: PlaceResult[] = [];
          const detailPromises = predictions.slice(0, 8).map(
            (pred) =>
              new Promise<PlaceResult | null>((resolve) => {
                placesServiceRef.current.getDetails(
                  { placeId: pred.place_id, fields: ["geometry", "name", "formatted_address"] },
                  (place: any, status: string) => {
                    if (status === "OK" && place?.geometry?.location) {
                      const lat = place.geometry.location.lat();
                      const lng = place.geometry.location.lng();
                      // Only include if within a service area
                      const area = isInServiceArea(lat, lng);
                      if (area) {
                        resolve({
                          place_id: pred.place_id,
                          name: place.name || pred.structured_formatting?.main_text || pred.description.split(",")[0],
                          address: place.formatted_address || pred.description,
                          lat,
                          lng,
                        });
                      } else {
                        resolve(null);
                      }
                    } else {
                      resolve(null);
                    }
                  }
                );
              })
          );

          const results = await Promise.all(detailPromises);
          results.forEach((r) => { if (r) detailedResults.push(r); });
          setPlaceResults(detailedResults);
        } catch {
          setPlaceResults([]);
        }
      } else {
        // Fallback to Nominatim if Google not loaded
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(activeQuery)}&countrycodes=mv&limit=8&addressdetails=1`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          const filtered: PlaceResult[] = [];
          for (const r of data) {
            const lat = parseFloat(r.lat);
            const lng = parseFloat(r.lon);
            const area = isInServiceArea(lat, lng);
            if (area) {
              filtered.push({
                place_id: String(r.place_id),
                name: r.name || r.display_name.split(",")[0],
                address: r.display_name.split(",").slice(0, 3).join(", "),
                lat,
                lng,
              });
            }
          }
          setPlaceResults(filtered);
        } catch {
          setPlaceResults([]);
        }
      }
      setSearching(false);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [activeQuery, serviceAreas, isInServiceArea]);

  const findNearestServiceArea = useCallback((lat: number, lng: number): ServiceLocation | null => {
    let nearest: ServiceLocation | null = null;
    let minDist = Infinity;
    for (const loc of locations) {
      const d = Math.sqrt(Math.pow(loc.lat - lat, 2) + Math.pow(loc.lng - lng, 2));
      if (d < minDist) {
        minDist = d;
        nearest = loc;
      }
    }
    return nearest;
  }, [locations]);

  const detectCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setDetectingLocation(true);

    // Try fast low-accuracy first, then refine with high accuracy
    const onPosition = async (pos: GeolocationPosition, isFinal: boolean) => {
      const { latitude, longitude } = pos.coords;
      const nearest = findNearestServiceArea(latitude, longitude);

      // Set immediately with nearest area name so UI feels instant
      const quickLoc: ServiceLocation = {
        id: nearest?.id || "current-location",
        name: nearest?.name || "Current Location",
        address: nearest?.address || "",
        lat: latitude,
        lng: longitude,
      };
      setPickup(quickLoc);
      setPickupQuery(quickLoc.name);
      setDetectingLocation(false);

      if (!dropoff) {
        setActiveField("dropoff");
        setTimeout(() => dropoffRef.current?.focus(), 100);
      }

      // Resolve actual place name in background (non-blocking)
      reverseGeocodeLocation(latitude, longitude).then((result) => {
        const detailedLoc: ServiceLocation = {
          ...quickLoc,
          name: result.name,
          address: result.address,
        };
        setPickup(detailedLoc);
        setPickupQuery(result.name);
      }).catch(() => {});
    };

    // 1) Fast coarse position (cell/wifi, no GPS wait)
    navigator.geolocation.getCurrentPosition(
      (pos) => onPosition(pos, false),
      () => {},
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 }
    );

    // 2) Accurate GPS position (refines the coarse one)
    navigator.geolocation.getCurrentPosition(
      (pos) => onPosition(pos, true),
      () => setDetectingLocation(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const selectLocation = (loc: ServiceLocation) => {
    if (activeField === "pickup") {
      setPickup(loc);
      setPickupQuery(loc.name);
      setPlaceResults([]);
      if (!dropoff) {
        setActiveField("dropoff");
        setTimeout(() => dropoffRef.current?.focus(), 100);
        return;
      }
    } else if (activeField === "dropoff") {
      setDropoff(loc);
      setDropoffQuery(loc.name);
      setPlaceResults([]);
    } else if (activeField?.startsWith("stop-")) {
      const idx = parseInt(activeField.split("-")[1]);
      const newStops = [...stops];
      newStops[idx] = loc;
      setStops(newStops);
      const newQueries = [...stopQueries];
      newQueries[idx] = loc.name;
      setStopQueries(newQueries);
      setPlaceResults([]);
    }
    setActiveField(null);
  };

  const handlePlaceSelect = (result: PlaceResult) => {
    const nearest = findNearestServiceArea(result.lat, result.lng);
    const specificLocation: ServiceLocation = {
      id: nearest?.id || "place-selected",
      name: result.name,
      address: result.address,
      lat: result.lat,
      lng: result.lng,
    };
    selectLocation(specificLocation);
  };

  const clearField = (field: "pickup" | "dropoff" | `stop-${number}`) => {
    if (field === "pickup") {
      setPickup(null);
      setPickupQuery("");
      setActiveField("pickup");
      setTimeout(() => pickupRef.current?.focus(), 50);
    } else if (field === "dropoff") {
      setDropoff(null);
      setDropoffQuery("");
      setActiveField("dropoff");
      setTimeout(() => dropoffRef.current?.focus(), 50);
    } else if (field.startsWith("stop-")) {
      const idx = parseInt(field.split("-")[1]);
      const newStops = [...stops];
      newStops[idx] = null;
      setStops(newStops);
      const newQueries = [...stopQueries];
      newQueries[idx] = "";
      setStopQueries(newQueries);
      setActiveField(field);
      setTimeout(() => stopRefs.current[idx]?.focus(), 50);
    }
    setPlaceResults([]);
  };

  const addStop = () => {
    if (stops.length >= 5) return;
    setStops([...stops, null]);
    setStopQueries([...stopQueries, ""]);
    const newIdx = stops.length;
    setActiveField(`stop-${newIdx}`);
    setTimeout(() => stopRefs.current[newIdx]?.focus(), 100);
  };

  const removeStop = (idx: number) => {
    const newStops = stops.filter((_, i) => i !== idx);
    const newQueries = stopQueries.filter((_, i) => i !== idx);
    setStops(newStops);
    setStopQueries(newQueries);
    if (activeField === `stop-${idx}`) setActiveField(null);
  };

  // Saved locations management
  const handleSelectSaved = (saved: SavedLocation) => {
    const loc: ServiceLocation = {
      id: saved.id,
      name: saved.name,
      address: saved.address,
      lat: saved.lat,
      lng: saved.lng,
    };
    setDropoff(loc);
    setDropoffQuery(saved.name);
    setActiveField(null);
  };


  const handleSetOnMap = (field: "pickup" | "dropoff" | `stop-${number}`) => {
    setMapPickerField(field);
    setSettingOnMap(true);
    setActiveField(null);
    setPlaceResults([]);
  };

  const handleMapPickerConfirm = (lat: number, lng: number, name: string, address: string) => {
    const nearest = findNearestServiceArea(lat, lng);
    const loc: ServiceLocation = {
      id: nearest?.id || "map-selected",
      name,
      address,
      lat,
      lng,
    };
    if (mapPickerField === "pickup") {
      setPickup(loc);
      setPickupQuery(name);
    } else if (mapPickerField === "dropoff") {
      setDropoff(loc);
      setDropoffQuery(name);
    } else if (mapPickerField?.startsWith("stop-")) {
      const idx = parseInt(mapPickerField.split("-")[1]);
      const newStops = [...stops];
      newStops[idx] = loc;
      setStops(newStops);
      const newQueries = [...stopQueries];
      newQueries[idx] = name;
      setStopQueries(newQueries);
    }
    setActiveField(null);
    setSettingOnMap(false);
    setMapPickerField(null);
  };

  const canConfirm = pickup && (bookingType === "hourly" || dropoff);
  const validStops = stops.filter((s): s is ServiceLocation => s !== null);
  const scheduledAtIso = scheduledDate && scheduledTime ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString() : undefined;


  const renderSearchResults = (fieldKey: string) => {
    if (activeField !== fieldKey) return null;
    if (placeResults.length === 0 && !searching) return null;
    return (
      <div className="mt-2 bg-card border border-border rounded-xl shadow-lg max-h-[30vh] overflow-y-auto">
        {searching && (
          <div className="flex items-center gap-2 px-4 py-3">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Searching...</span>
          </div>
        )}
        {placeResults.map((r) => (
          <button
            key={r.place_id}
            onClick={() => handlePlaceSelect(r)}
            className="flex items-center gap-3 w-full px-4 py-3 hover:bg-surface active:bg-muted transition-colors border-b border-border last:border-0"
          >
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Navigation className="w-4 h-4 text-primary" />
            </div>
            <div className="text-left min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{r.address}</p>
            </div>
          </button>
        ))}
      </div>
    );
  };


  if (settingOnMap) {
    return (
      <MapPicker
        onConfirm={handleMapPickerConfirm}
        onCancel={() => { setSettingOnMap(false); setMapPickerField(null); }}
        initialLat={pickup?.lat}
        initialLng={pickup?.lng}
      />
    );
  }

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed bottom-0 left-0 right-0 bg-card rounded-t-[1.75rem] shadow-[0_-8px_40px_rgba(0,0,0,0.15)] z-10 flex flex-col"
      style={{ maxHeight: "min(calc(100dvh - 3.5rem), calc(100vh - 3.5rem))" }}
    >
      <div className="px-4 pt-3 pb-2 space-y-2.5 overflow-y-auto flex-1 overscroll-contain min-h-0">
        {/* Handle */}
        <button onClick={() => setMinimized(!minimized)} className="w-full flex justify-center py-1">
          <div className="w-12 h-1.5 rounded-full bg-border/60" />
        </button>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground tracking-tight">Where to?</h2>
            {!minimized && <p className="text-[11px] text-muted-foreground mt-0.5">Type to search any place</p>}
            {minimized && pickup && (
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[10rem]">{pickup.name}{dropoff ? ` → ${dropoff.name}` : ""}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!minimized && (
              <button
                onClick={detectCurrentLocation}
                disabled={detectingLocation}
                className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-primary/10 text-primary text-[11px] font-semibold active:scale-95 transition-all"
              >
                <Locate className={`w-3.5 h-3.5 ${detectingLocation ? "animate-spin" : ""}`} />
                <span className="hidden min-[360px]:inline">{detectingLocation ? "Detecting..." : "My location"}</span>
              </button>
            )}
            <button onClick={() => { setMinimized(!minimized); if (activeField) { setActiveField(null); setPlaceResults([]); } }} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform">
              {minimized ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {loading && !minimized ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !minimized ? (
          <>
            {/* Compact Passenger & Luggage row */}
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-1.5 bg-surface rounded-xl px-2 py-1.5">
                <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Pax</span>
                <div className="flex items-center gap-0.5 ml-auto">
                  <button onClick={() => setPassengerCount(Math.max(1, passengerCount - 1))} className="w-6 h-6 rounded-md bg-card flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30" disabled={passengerCount <= 1}>
                    <Minus className="w-3 h-3 text-foreground" />
                  </button>
                  <span className="text-sm font-bold text-foreground tabular-nums min-w-[1.5ch] text-center">{passengerCount}</span>
                  <button onClick={() => setPassengerCount(Math.min(10, passengerCount + 1))} className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30" disabled={passengerCount >= 10}>
                    <Plus className="w-3 h-3 text-primary" />
                  </button>
                </div>
              </div>
              <div className="flex-1 flex items-center gap-1.5 bg-surface rounded-xl px-2 py-1.5">
                <Luggage className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Bags</span>
                <div className="flex items-center gap-0.5 ml-auto">
                  <button onClick={() => setLuggageCount(Math.max(0, luggageCount - 1))} className="w-6 h-6 rounded-md bg-card flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30" disabled={luggageCount <= 0}>
                    <Minus className="w-3 h-3 text-foreground" />
                  </button>
                  <span className="text-sm font-bold text-foreground tabular-nums min-w-[1.5ch] text-center">{luggageCount}</span>
                  <button onClick={() => setLuggageCount(Math.min(20, luggageCount + 1))} className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30" disabled={luggageCount >= 20}>
                    <Plus className="w-3 h-3 text-primary" />
                  </button>
                </div>
              </div>
            </div>

            {/* Booking Type Toggle */}
            {(featureScheduled || featureHourly) && (
            <div className="flex gap-1 bg-surface rounded-xl p-1">
              {([
                { key: "now" as BookingType, label: "Now", icon: Navigation, show: true },
                { key: "scheduled" as BookingType, label: "Schedule", icon: Calendar, show: featureScheduled },
                { key: "hourly" as BookingType, label: "Hourly", icon: Clock, show: featureHourly },
              ]).filter(o => o.show).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setBookingType(key)}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    bookingType === key
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
            )}

            {/* Schedule fields */}
            {bookingType === "scheduled" && (
              <div className="bg-surface rounded-xl p-3 space-y-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Schedule Pickup</p>
                
                {/* Date selection - quick buttons */}
                <div>
                  <label className="text-[9px] text-muted-foreground font-medium mb-1.5 block">Pick a date</label>
                  <div className="flex gap-1.5 mb-2">
                    {(() => {
                      const today = new Date();
                      const dates = [];
                      for (let i = 0; i < 5; i++) {
                        const d = new Date(today);
                        d.setDate(today.getDate() + i);
                        const iso = d.toISOString().split("T")[0];
                        const dayName = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en", { weekday: "short" });
                        const dateNum = d.getDate();
                        const month = d.toLocaleDateString("en", { month: "short" });
                        dates.push({ iso, dayName, dateNum, month });
                      }
                      return dates.map(({ iso, dayName, dateNum, month }) => (
                        <button
                          key={iso}
                          onClick={() => setScheduledDate(iso)}
                          className={`flex-1 flex flex-col items-center py-2 rounded-xl text-center transition-all ${
                            scheduledDate === iso
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-card border border-border text-foreground hover:border-primary/40"
                          }`}
                        >
                          <span className="text-[9px] font-semibold leading-tight">{dayName}</span>
                          <span className="text-base font-bold leading-tight">{dateNum}</span>
                          <span className="text-[9px] opacity-70 leading-tight">{month}</span>
                        </button>
                      ));
                    })()}
                  </div>
                  {/* Fallback calendar input for dates further out */}
                  <button
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "date";
                      input.min = new Date().toISOString().split("T")[0];
                      input.value = scheduledDate;
                      input.style.position = "fixed";
                      input.style.opacity = "0";
                      document.body.appendChild(input);
                      input.addEventListener("change", (e) => {
                        setScheduledDate((e.target as HTMLInputElement).value);
                        input.remove();
                      });
                      input.addEventListener("blur", () => input.remove());
                      input.showPicker?.();
                      input.focus();
                    }}
                    className="text-[10px] text-primary font-semibold hover:underline"
                  >
                    Pick another date →
                  </button>
                </div>

                {/* Time selection - native input */}
                <div>
                  <label className="text-[9px] text-muted-foreground font-medium mb-1.5 block">Pick a time</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full bg-card border border-border rounded-xl px-3 py-3 text-base font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                  />
                </div>

                {/* Selected summary */}
                {scheduledDate && scheduledTime && (
                  <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2">
                    <Calendar className="w-4 h-4 text-primary shrink-0" />
                    <p className="text-xs font-semibold text-foreground">
                      {(() => {
                        const d = new Date(scheduledDate + "T" + scheduledTime);
                        return d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }) +
                          " at " +
                          d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true });
                      })()}
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-[9px] text-muted-foreground">Notes (optional)</label>
                  <textarea
                    value={bookingNotes}
                    onChange={(e) => setBookingNotes(e.target.value)}
                    placeholder="Special instructions..."
                    rows={2}
                    className="w-full bg-card border border-border rounded-lg px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>
              </div>
            )}

            {/* Hourly booking note */}
            {bookingType === "hourly" && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Hourly Booking</p>
                </div>
                <p className="text-[11px] text-muted-foreground">Driver will start a timer when the trip begins. You'll be charged per hour based on vehicle type rate.</p>
                <div>
                  <label className="text-[9px] text-muted-foreground">Notes (optional)</label>
                  <textarea
                    value={bookingNotes}
                    onChange={(e) => setBookingNotes(e.target.value)}
                    placeholder="What do you need the vehicle for?"
                    rows={2}
                    className="w-full bg-card border border-border rounded-lg px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>
              </div>
            )}

            {/* Pickup, Stops & Dropoff */}
            <div className="flex items-start gap-2.5">
              {/* Route dots */}
              <div className="flex flex-col items-center gap-0.5 pt-3.5">
                <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.3)] animate-pulse-dot" />
                <div className="w-0.5 h-7 bg-gradient-to-b from-primary/40 to-primary/20" />
                {stops.map((_, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-sm bg-accent" />
                    <div className="w-0.5 h-7 bg-gradient-to-b from-accent/40 to-foreground/20" />
                  </div>
                ))}
                <div className="w-2.5 h-2.5 rounded-sm bg-foreground" />
              </div>

              <div className="flex-1 space-y-2">
                {/* Pickup input */}
                <div className="relative">
                  <div className={`flex items-center rounded-xl px-3 py-2.5 transition-all ${
                    activeField === "pickup" ? "bg-primary/10 ring-2 ring-primary shadow-sm" : "bg-surface"
                  }`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">Pickup</p>
                      <input
                        ref={pickupRef}
                        type="text"
                        placeholder="Search pickup location..."
                        value={pickupQuery}
                        onChange={(e) => { setPickupQuery(e.target.value); if (activeField !== "pickup") setActiveField("pickup"); }}
                        onFocus={() => setActiveField("pickup")}
                        className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none mt-0.5"
                      />
                      {pickup && pickup.address !== pickup.name && activeField !== "pickup" && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{pickup.address}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {pickup && !activeField && (
                        <button onClick={() => clearField("pickup")} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center active:scale-90">
                          <X className="w-3 h-3 text-muted-foreground" />
                        </button>
                      )}
                      {!activeField && (
                        <button onClick={() => handleSetOnMap("pickup")} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold active:scale-95 transition-all whitespace-nowrap">
                          <MapPinned className="w-3 h-3" />
                          Map
                        </button>
                      )}
                    </div>
                  </div>
                  {renderSearchResults("pickup")}
                </div>

                {/* Intermediate stops */}
                {stops.map((stop, idx) => (
                  <div key={idx} className="relative">
                    <div className={`flex items-center rounded-xl px-3 py-2.5 transition-all ${
                      activeField === `stop-${idx}` ? "bg-accent/20 ring-2 ring-accent shadow-sm" : "bg-surface"
                    }`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">Stop {idx + 1}</p>
                        <input
                          ref={(el) => { stopRefs.current[idx] = el; }}
                          type="text"
                          placeholder="Search stop location..."
                          value={stopQueries[idx] || ""}
                          onChange={(e) => {
                            const newQ = [...stopQueries];
                            newQ[idx] = e.target.value;
                            setStopQueries(newQ);
                            if (activeField !== `stop-${idx}`) setActiveField(`stop-${idx}`);
                          }}
                          onFocus={() => setActiveField(`stop-${idx}`)}
                          className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none mt-0.5"
                        />
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {!activeField && (
                          <button onClick={() => removeStop(idx)} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center active:scale-90">
                            <X className="w-3 h-3 text-muted-foreground" />
                          </button>
                        )}
                        {!activeField && (
                          <button onClick={() => handleSetOnMap(`stop-${idx}`)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-accent/10 text-accent-foreground text-[10px] font-semibold active:scale-95 transition-all whitespace-nowrap">
                            <MapPinned className="w-3 h-3" />
                            Map
                          </button>
                        )}
                      </div>
                    </div>
                    {renderSearchResults(`stop-${idx}`)}
                  </div>
                ))}

                {/* Add stop button */}
                {stops.length < 5 && dropoff && (
                  <button
                    onClick={addStop}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-primary active:scale-95 transition-transform"
                  >
                    <CirclePlus className="w-3.5 h-3.5" />
                    Add stop
                  </button>
                )}

                {/* Dropoff input */}
                <div className="relative">
                  {activeField === "dropoff" && (placeResults.length > 0 || searching) && (
                    <div className="mb-2 bg-card border border-border rounded-xl shadow-lg max-h-[30vh] overflow-y-auto">
                      {searching && (
                        <div className="flex items-center gap-2 px-4 py-3">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Searching...</span>
                        </div>
                      )}
                      {placeResults.map((r) => (
                        <button
                          key={r.place_id}
                          onClick={() => handlePlaceSelect(r)}
                          className="flex items-center gap-3 w-full px-4 py-3 hover:bg-surface active:bg-muted transition-colors border-b border-border last:border-0"
                        >
                          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Navigation className="w-4 h-4 text-primary" />
                          </div>
                          <div className="text-left min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{r.address}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={`flex items-center rounded-xl px-3 py-2.5 transition-all ${
                    activeField === "dropoff" ? "bg-primary/10 ring-2 ring-primary shadow-sm" : "bg-surface"
                  }`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">Destination</p>
                      <input
                        ref={dropoffRef}
                        type="text"
                        placeholder="Search destination..."
                        value={dropoffQuery}
                        onChange={(e) => { setDropoffQuery(e.target.value); if (activeField !== "dropoff") setActiveField("dropoff"); }}
                        onFocus={() => setActiveField("dropoff")}
                        className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none mt-0.5"
                      />
                      {dropoff && dropoff.address !== dropoff.name && activeField !== "dropoff" && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{dropoff.address}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {dropoff && !activeField && (
                        <button onClick={() => clearField("dropoff")} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center active:scale-90">
                          <X className="w-3 h-3 text-muted-foreground" />
                        </button>
                      )}
                      {!activeField && (
                        <button onClick={() => handleSetOnMap("dropoff")} className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-semibold active:scale-95 transition-all whitespace-nowrap">
                          <MapPinned className="w-3 h-3" />
                          Map
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Saved location quick-pick chips */}
            {savedLocations.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
                {savedLocations.map((saved) => {
                  const IconComp = ICON_MAP[saved.icon] || Star;
                  return (
                    <button
                      key={saved.id}
                      onClick={() => handleSelectSaved(saved)}
                      className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface border border-border/60 text-xs font-semibold whitespace-nowrap active:scale-[0.97] transition-all shrink-0 shadow-sm"
                    >
                      <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
                        <IconComp className="w-3 h-3 text-primary" />
                      </div>
                      <span className="text-foreground">{saved.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

          </>
        ) : null}
      </div>

      {/* Sticky confirm button - always visible */}
      {!minimized && !activeField && (
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-2 bg-card border-t border-border/40 shrink-0">
          <button
            onClick={() => {
              if (!canConfirm) return;
              const dummyDropoff = bookingType === "hourly" && !dropoff ? { ...pickup!, name: pickup!.name + " (Hourly)" } : dropoff!;
              onSearch(pickup!, dummyDropoff, passengerCount, luggageCount, validStops, bookingType, scheduledAtIso, bookingNotes || undefined);
            }}
            disabled={!canConfirm || (bookingType === "scheduled" && (!scheduledDate || !scheduledTime))}
            className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl text-sm transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 shadow-[0_4px_12px_rgba(var(--primary),0.2)]"
          >
            {!canConfirm
              ? (bookingType === "hourly" ? "Select pickup location" : "Select pickup & destination")
              : bookingType === "scheduled" && (!scheduledDate || !scheduledTime)
                ? "Set date & time"
                : bookingType === "scheduled"
                  ? "Schedule ride"
                  : bookingType === "hourly"
                    ? "Find hourly ride"
                    : validStops.length > 0
                      ? `Find a ride (${validStops.length} ${validStops.length === 1 ? "stop" : "stops"})`
                      : "Find a ride"}
          </button>
        </div>
      )}
    </motion.div>
  );
};


export default LocationInput;
