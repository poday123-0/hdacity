import { MapPin, ChevronDown, ChevronUp, Loader2, Search, Locate, Users, Luggage, Minus, Plus, Navigation } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ServiceLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  name?: string;
}

interface LocationInputProps {
  onSearch: (pickup: ServiceLocation, dropoff: ServiceLocation, passengers: number, luggage: number) => void;
}

const LocationInput = ({ onSearch }: LocationInputProps) => {
  const [locations, setLocations] = useState<ServiceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickup, setPickup] = useState<ServiceLocation | null>(null);
  const [dropoff, setDropoff] = useState<ServiceLocation | null>(null);
  const [selecting, setSelecting] = useState<"pickup" | "dropoff" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [osmResults, setOsmResults] = useState<NominatimResult[]>([]);
  const [osmSearching, setOsmSearching] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const fetchLocations = async () => {
      const { data } = await supabase
        .from("service_locations")
        .select("id, name, address, lat, lng")
        .eq("is_active", true)
        .order("name");
      setLocations(data || []);
      setLoading(false);
    };
    fetchLocations();
  }, []);

  useEffect(() => {
    if (!pickup) detectCurrentLocation();
  }, [locations.length]);

  // Nominatim search with debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setOsmResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setOsmSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=mv&limit=5&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        const data: NominatimResult[] = await res.json();
        setOsmResults(data);
      } catch {
        setOsmResults([]);
      }
      setOsmSearching(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

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
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const nearest = findNearestServiceArea(latitude, longitude);

        // Reverse geocode for precise address
        let name = nearest?.name || "Current Location";
        let address = nearest?.address || "";
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          address = data.display_name?.split(",").slice(0, 3).join(", ") || address;
          name = data.name || data.address?.road || data.address?.neighbourhood || name;
        } catch {}

        setPickup({
          id: nearest?.id || "current-location",
          name,
          address,
          lat: latitude,
          lng: longitude,
        });
        setDetectingLocation(false);
      },
      () => setDetectingLocation(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSelect = (loc: ServiceLocation) => {
    if (selecting === "pickup") {
      setPickup(loc);
      if (!dropoff) {
        setSelecting("dropoff");
        setSearchQuery("");
        setOsmResults([]);
        return;
      }
    } else if (selecting === "dropoff") {
      setDropoff(loc);
    }
    setSelecting(null);
    setSearchQuery("");
    setOsmResults([]);
  };

  const handleOsmSelect = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const nearest = findNearestServiceArea(lat, lng);
    if (!nearest) return;

    // Create a location with the specific place name but linked to nearest service area
    const specificLocation: ServiceLocation = {
      ...nearest,
      address: result.display_name.split(",").slice(0, 3).join(", "),
      lat,
      lng,
    };

    if (selecting === "pickup") {
      setPickup(specificLocation);
      if (!dropoff) {
        setSelecting("dropoff");
        setSearchQuery("");
        setOsmResults([]);
        return;
      }
    } else if (selecting === "dropoff") {
      setDropoff(specificLocation);
    }
    setSelecting(null);
    setSearchQuery("");
    setOsmResults([]);
  };

  const availableForDropoff = locations.filter((l) => l.id !== pickup?.id);
  const availableForPickup = locations.filter((l) => l.id !== dropoff?.id);
  const displayList = selecting === "pickup" ? availableForPickup : availableForDropoff;

  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return displayList;
    const q = searchQuery.toLowerCase();
    return displayList.filter(
      (l) => l.name.toLowerCase().includes(q) || l.address.toLowerCase().includes(q)
    );
  }, [displayList, searchQuery]);

  const canConfirm = pickup && dropoff;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[1.75rem] shadow-[0_-8px_40px_rgba(0,0,0,0.15)] z-10 max-h-[85vh] flex flex-col"
    >
      <div className="px-5 pt-3 pb-8 space-y-3 overflow-y-auto flex-1 overscroll-contain">
        {/* Handle — tap to toggle */}
        <button onClick={() => setMinimized(!minimized)} className="w-full flex justify-center py-1">
          <div className="w-12 h-1.5 rounded-full bg-border/60" />
        </button>

        {/* Always visible: compact bar when minimized */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight">Where to?</h2>
            {!minimized && <p className="text-xs text-muted-foreground mt-0.5">Search a place or select an area</p>}
            {minimized && pickup && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{pickup.name}{dropoff ? ` → ${dropoff.name}` : ""}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!minimized && (
              <button
                onClick={detectCurrentLocation}
                disabled={detectingLocation}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-primary/10 text-primary text-xs font-semibold active:scale-95 transition-all hover:bg-primary/15"
              >
                <Locate className={`w-4 h-4 ${detectingLocation ? "animate-spin" : ""}`} />
                {detectingLocation ? "Detecting..." : "My location"}
              </button>
            )}
            <button onClick={() => setMinimized(!minimized)} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform">
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
            {/* Pickup & Dropoff selectors */}
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-0.5 pt-4">
                <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.3)] animate-pulse-dot" />
                <div className="w-0.5 h-8 bg-gradient-to-b from-primary/40 to-foreground/30" />
                <div className="w-3 h-3 rounded-sm bg-foreground" />
              </div>
              <div className="flex-1 space-y-2.5">
                <button
                  onClick={() => { setSelecting(selecting === "pickup" ? null : "pickup"); setSearchQuery(""); setOsmResults([]); }}
                  className={`w-full flex items-center justify-between rounded-2xl px-4 py-3 transition-all ${
                    selecting === "pickup" ? "bg-primary/10 ring-2 ring-primary shadow-sm" : "bg-surface hover:bg-muted"
                  }`}
                >
                  <div className="text-left min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Pickup</p>
                    <p className={`text-sm font-medium truncate mt-0.5 ${pickup ? "text-foreground" : "text-muted-foreground"}`}>
                      {pickup ? pickup.name : "Select pickup area"}
                    </p>
                    {pickup?.address && pickup.address !== pickup.name && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{pickup.address}</p>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${selecting === "pickup" ? "rotate-180" : ""}`} />
                </button>

                <button
                  onClick={() => { setSelecting(selecting === "dropoff" ? null : "dropoff"); setSearchQuery(""); setOsmResults([]); }}
                  className={`w-full flex items-center justify-between rounded-2xl px-4 py-3 transition-all ${
                    selecting === "dropoff" ? "bg-primary/10 ring-2 ring-primary shadow-sm" : "bg-surface hover:bg-muted"
                  }`}
                >
                  <div className="text-left min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Destination</p>
                    <p className={`text-sm font-medium truncate mt-0.5 ${dropoff ? "text-foreground" : "text-muted-foreground"}`}>
                      {dropoff ? dropoff.name : "Select destination area"}
                    </p>
                    {dropoff?.address && dropoff.address !== dropoff.name && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{dropoff.address}</p>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${selecting === "dropoff" ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            {/* Location search dropdown */}
            <AnimatePresence>
              {selecting && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search places or areas..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                      className="w-full pl-10 pr-10 py-3 rounded-2xl bg-surface text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-shadow"
                    />
                    {osmSearching && (
                      <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-0.5 -mx-1 px-1">
                    {/* OSM Results */}
                    {osmResults.length > 0 && (
                      <>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold px-3 pt-2 pb-1">Places</p>
                        {osmResults.map((r) => (
                          <button
                            key={r.place_id}
                            onClick={() => handleOsmSelect(r)}
                            className="flex items-center gap-3 w-full px-3 py-3 rounded-2xl hover:bg-surface active:bg-muted active:scale-[0.98] transition-all"
                          >
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                              <Navigation className="w-4.5 h-4.5 text-primary" />
                            </div>
                            <div className="text-left min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {r.name || r.display_name.split(",")[0]}
                              </p>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {r.display_name.split(",").slice(0, 3).join(",")}
                              </p>
                            </div>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Service Areas */}
                    {filteredList.length > 0 && (
                      <>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold px-3 pt-2 pb-1">Service Areas</p>
                        {filteredList.map((loc) => (
                          <button
                            key={loc.id}
                            onClick={() => handleSelect(loc)}
                            className="flex items-center gap-3 w-full px-3 py-3 rounded-2xl hover:bg-surface active:bg-muted active:scale-[0.98] transition-all"
                          >
                            <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center shrink-0 border border-border/50">
                              <MapPin className="w-4.5 h-4.5 text-muted-foreground" />
                            </div>
                            <div className="text-left min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{loc.name}</p>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{loc.address}</p>
                            </div>
                          </button>
                        ))}
                      </>
                    )}

                    {filteredList.length === 0 && osmResults.length === 0 && !osmSearching && (
                      <p className="text-sm text-muted-foreground px-3 py-4 text-center">No places found</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Passenger & Luggage counters */}
            {!selecting && (
              <div className="flex gap-2">
                <div className="flex-1 bg-surface rounded-2xl p-3 flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 w-full">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Users className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Passengers</p>
                  </div>
                  <div className="flex items-center justify-between w-full bg-card rounded-xl px-1 py-1">
                    <button onClick={() => setPassengerCount(Math.max(1, passengerCount - 1))} className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30" disabled={passengerCount <= 1}>
                      <Minus className="w-4 h-4 text-foreground" />
                    </button>
                    <span className="text-lg font-bold text-foreground tabular-nums min-w-[2ch] text-center">{passengerCount}</span>
                    <button onClick={() => setPassengerCount(Math.min(10, passengerCount + 1))} className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30" disabled={passengerCount >= 10}>
                      <Plus className="w-4 h-4 text-primary" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 bg-surface rounded-2xl p-3 flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 w-full">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Luggage className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Luggage</p>
                  </div>
                  <div className="flex items-center justify-between w-full bg-card rounded-xl px-1 py-1">
                    <button onClick={() => setLuggageCount(Math.max(0, luggageCount - 1))} className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30" disabled={luggageCount <= 0}>
                      <Minus className="w-4 h-4 text-foreground" />
                    </button>
                    <span className="text-lg font-bold text-foreground tabular-nums min-w-[2ch] text-center">{luggageCount}</span>
                    <button onClick={() => setLuggageCount(Math.min(20, luggageCount + 1))} className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30" disabled={luggageCount >= 20}>
                      <Plus className="w-4 h-4 text-primary" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Confirm button */}
            <button
              onClick={() => canConfirm && onSearch(pickup!, dropoff!, passengerCount, luggageCount)}
              disabled={!canConfirm}
              className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-2xl text-sm transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 shadow-[0_4px_12px_rgba(var(--primary),0.2)]"
            >
              {canConfirm ? "Find a ride" : "Select pickup & destination"}
            </button>
          </>
        ) : null}
      </div>
    </motion.div>
  );
};

export default LocationInput;
