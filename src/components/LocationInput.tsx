import { MapPin, ChevronDown, Loader2, Search, Locate, Users, Luggage, Minus, Plus, Navigation } from "lucide-react";
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
    detectCurrentLocation();
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
    if (!navigator.geolocation || locations.length === 0) return;
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearest = findNearestServiceArea(pos.coords.latitude, pos.coords.longitude);
        if (nearest) setPickup(nearest);
        setDetectingLocation(false);
      },
      () => setDetectingLocation(false),
      { timeout: 5000 }
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
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] z-10"
    >
      <div className="p-4 pb-6 space-y-3">
        {/* Handle */}
        <div className="flex justify-center">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Greeting */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Where to?</h2>
            <p className="text-xs text-muted-foreground">Search a place or select an area</p>
          </div>
          <button
            onClick={detectCurrentLocation}
            disabled={detectingLocation}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold active:scale-95 transition-transform"
          >
            <Locate className={`w-3.5 h-3.5 ${detectingLocation ? "animate-spin" : ""}`} />
            {detectingLocation ? "Detecting..." : "My location"}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Pickup & Dropoff selectors */}
            <div className="flex items-center gap-3 px-1">
              <div className="flex flex-col items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse-dot" />
                <div className="w-0.5 h-7 bg-border" />
                <div className="w-2.5 h-2.5 rounded-sm bg-foreground" />
              </div>
              <div className="flex-1 space-y-2">
                <button
                  onClick={() => { setSelecting(selecting === "pickup" ? null : "pickup"); setSearchQuery(""); setOsmResults([]); }}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${
                    selecting === "pickup" ? "bg-primary/10 ring-2 ring-primary" : "bg-surface hover:bg-muted"
                  }`}
                >
                  <div className="text-left min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Pickup</p>
                    <p className={`text-sm font-medium truncate ${pickup ? "text-foreground" : "text-muted-foreground"}`}>
                      {pickup ? pickup.name : "Select pickup area"}
                    </p>
                    {pickup?.address && pickup.address !== pickup.name && (
                      <p className="text-[10px] text-muted-foreground truncate">{pickup.address}</p>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${selecting === "pickup" ? "rotate-180" : ""}`} />
                </button>

                <button
                  onClick={() => { setSelecting(selecting === "dropoff" ? null : "dropoff"); setSearchQuery(""); setOsmResults([]); }}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${
                    selecting === "dropoff" ? "bg-primary/10 ring-2 ring-primary" : "bg-surface hover:bg-muted"
                  }`}
                >
                  <div className="text-left min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Destination</p>
                    <p className={`text-sm font-medium truncate ${dropoff ? "text-foreground" : "text-muted-foreground"}`}>
                      {dropoff ? dropoff.name : "Select destination area"}
                    </p>
                    {dropoff?.address && dropoff.address !== dropoff.name && (
                      <p className="text-[10px] text-muted-foreground truncate">{dropoff.address}</p>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${selecting === "dropoff" ? "rotate-180" : ""}`} />
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder={`Search places or areas...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {osmSearching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {/* OSM Results */}
                    {osmResults.length > 0 && (
                      <>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold px-3 pt-1">Places</p>
                        {osmResults.map((r) => (
                          <button
                            key={r.place_id}
                            onClick={() => handleOsmSelect(r)}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-surface active:bg-muted transition-colors"
                          >
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <Navigation className="w-4 h-4 text-primary" />
                            </div>
                            <div className="text-left min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {r.name || r.display_name.split(",")[0]}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
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
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold px-3 pt-1">Service Areas</p>
                        {filteredList.map((loc) => (
                          <button
                            key={loc.id}
                            onClick={() => handleSelect(loc)}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-surface active:bg-muted transition-colors"
                          >
                            <div className="w-9 h-9 rounded-full bg-surface flex items-center justify-center shrink-0">
                              <MapPin className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="text-left min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{loc.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{loc.address}</p>
                            </div>
                          </button>
                        ))}
                      </>
                    )}

                    {filteredList.length === 0 && osmResults.length === 0 && !osmSearching && (
                      <p className="text-sm text-muted-foreground px-3 py-2">No places found</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Passenger & Luggage counters */}
            {!selecting && (
              <div className="flex gap-2">
                <div className="flex-1 bg-surface rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Passengers</p>
                      <p className="text-sm font-bold text-foreground">{passengerCount}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPassengerCount(Math.max(1, passengerCount - 1))} className="w-7 h-7 rounded-lg bg-card flex items-center justify-center active:scale-90 transition-transform">
                      <Minus className="w-3.5 h-3.5 text-foreground" />
                    </button>
                    <button onClick={() => setPassengerCount(Math.min(10, passengerCount + 1))} className="w-7 h-7 rounded-lg bg-card flex items-center justify-center active:scale-90 transition-transform">
                      <Plus className="w-3.5 h-3.5 text-foreground" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 bg-surface rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Luggage className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Luggage</p>
                      <p className="text-sm font-bold text-foreground">{luggageCount}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setLuggageCount(Math.max(0, luggageCount - 1))} className="w-7 h-7 rounded-lg bg-card flex items-center justify-center active:scale-90 transition-transform">
                      <Minus className="w-3.5 h-3.5 text-foreground" />
                    </button>
                    <button onClick={() => setLuggageCount(Math.min(20, luggageCount + 1))} className="w-7 h-7 rounded-lg bg-card flex items-center justify-center active:scale-90 transition-transform">
                      <Plus className="w-3.5 h-3.5 text-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Confirm button */}
            <button
              onClick={() => canConfirm && onSearch(pickup!, dropoff!, passengerCount, luggageCount)}
              disabled={!canConfirm}
              className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl text-base transition-transform active:scale-[0.98] hover:opacity-90 disabled:opacity-40"
            >
              {canConfirm ? "Find a ride" : "Select pickup & destination"}
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default LocationInput;
