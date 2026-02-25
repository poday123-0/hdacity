import { MapPin, ChevronDown, ChevronUp, Loader2, Search, Locate, Users, Luggage, Minus, Plus, Navigation, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
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
  const [activeField, setActiveField] = useState<"pickup" | "dropoff" | null>(null);
  const [pickupQuery, setPickupQuery] = useState("");
  const [dropoffQuery, setDropoffQuery] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [osmResults, setOsmResults] = useState<NominatimResult[]>([]);
  const [osmSearching, setOsmSearching] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const pickupRef = useRef<HTMLInputElement>(null);
  const dropoffRef = useRef<HTMLInputElement>(null);

  const activeQuery = activeField === "pickup" ? pickupQuery : dropoffQuery;

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
    if (!activeQuery.trim() || activeQuery.length < 3) {
      setOsmResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setOsmSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(activeQuery)}&countrycodes=mv&limit=5&addressdetails=1`,
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
  }, [activeQuery]);

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
        const loc: ServiceLocation = {
          id: nearest?.id || "current-location",
          name,
          address,
          lat: latitude,
          lng: longitude,
        };
        setPickup(loc);
        setPickupQuery(name);
        setDetectingLocation(false);
        // Auto-focus dropoff after detecting location
        if (!dropoff) {
          setActiveField("dropoff");
          setTimeout(() => dropoffRef.current?.focus(), 100);
        }
      },
      () => setDetectingLocation(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const selectLocation = (loc: ServiceLocation) => {
    if (activeField === "pickup") {
      setPickup(loc);
      setPickupQuery(loc.name);
      setOsmResults([]);
      if (!dropoff) {
        setActiveField("dropoff");
        setTimeout(() => dropoffRef.current?.focus(), 100);
        return;
      }
    } else if (activeField === "dropoff") {
      setDropoff(loc);
      setDropoffQuery(loc.name);
      setOsmResults([]);
    }
    setActiveField(null);
  };

  const handleOsmSelect = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const nearest = findNearestServiceArea(lat, lng);
    if (!nearest) return;

    const specificLocation: ServiceLocation = {
      ...nearest,
      name: result.name || result.display_name.split(",")[0],
      address: result.display_name.split(",").slice(0, 3).join(", "),
      lat,
      lng,
    };
    selectLocation(specificLocation);
  };

  const clearField = (field: "pickup" | "dropoff") => {
    if (field === "pickup") {
      setPickup(null);
      setPickupQuery("");
      setActiveField("pickup");
      setTimeout(() => pickupRef.current?.focus(), 50);
    } else {
      setDropoff(null);
      setDropoffQuery("");
      setActiveField("dropoff");
      setTimeout(() => dropoffRef.current?.focus(), 50);
    }
    setOsmResults([]);
  };

  const canConfirm = pickup && dropoff;

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-[1.75rem] shadow-[0_-8px_40px_rgba(0,0,0,0.15)] z-10 max-h-[85vh] flex flex-col"
    >
      <div className="px-5 pt-3 pb-8 space-y-3 overflow-y-auto flex-1 overscroll-contain">
        {/* Handle */}
        <button onClick={() => setMinimized(!minimized)} className="w-full flex justify-center py-1">
          <div className="w-12 h-1.5 rounded-full bg-border/60" />
        </button>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight">Where to?</h2>
            {!minimized && <p className="text-xs text-muted-foreground mt-0.5">Type to search any place</p>}
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
            {/* Compact Passenger & Luggage row - above pickup */}
            {!activeField && (
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 bg-surface rounded-xl px-2.5 py-1.5">
                  <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Pax</span>
                  <div className="flex items-center gap-1 ml-auto">
                    <button onClick={() => setPassengerCount(Math.max(1, passengerCount - 1))} className="w-6 h-6 rounded-md bg-card flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30" disabled={passengerCount <= 1}>
                      <Minus className="w-3 h-3 text-foreground" />
                    </button>
                    <span className="text-sm font-bold text-foreground tabular-nums min-w-[1.5ch] text-center">{passengerCount}</span>
                    <button onClick={() => setPassengerCount(Math.min(10, passengerCount + 1))} className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-30" disabled={passengerCount >= 10}>
                      <Plus className="w-3 h-3 text-primary" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-2 bg-surface rounded-xl px-2.5 py-1.5">
                  <Luggage className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Bags</span>
                  <div className="flex items-center gap-1 ml-auto">
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
            )}

            {/* Pickup & Dropoff inline search inputs */}
            <div className="flex items-start gap-3">
              {/* Route dots */}
              <div className="flex flex-col items-center gap-0.5 pt-4">
                <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.3)] animate-pulse-dot" />
                <div className="w-0.5 h-8 bg-gradient-to-b from-primary/40 to-foreground/30" />
                <div className="w-3 h-3 rounded-sm bg-foreground" />
              </div>

              <div className="flex-1 space-y-2.5">
                {/* Pickup input */}
                <div className="relative">
                  <div className={`flex items-center rounded-2xl px-4 py-3 transition-all ${
                    activeField === "pickup" ? "bg-primary/10 ring-2 ring-primary shadow-sm" : "bg-surface"
                  }`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Pickup</p>
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
                    {pickup && (
                      <button onClick={() => clearField("pickup")} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 ml-2 active:scale-90">
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  {/* Pickup search results */}
                  <AnimatePresence>
                    {activeField === "pickup" && (osmResults.length > 0 || osmSearching) && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-2xl shadow-lg z-20 max-h-48 overflow-y-auto"
                      >
                        {osmSearching && (
                          <div className="flex items-center gap-2 px-4 py-3">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Searching...</span>
                          </div>
                        )}
                        {osmResults.map((r) => (
                          <button
                            key={r.place_id}
                            onClick={() => handleOsmSelect(r)}
                            className="flex items-center gap-3 w-full px-4 py-3 hover:bg-surface active:bg-muted transition-colors border-b border-border last:border-0"
                          >
                            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                              <Navigation className="w-4 h-4 text-primary" />
                            </div>
                            <div className="text-left min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{r.name || r.display_name.split(",")[0]}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{r.display_name.split(",").slice(0, 3).join(",")}</p>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Dropoff input */}
                <div className="relative">
                  <div className={`flex items-center rounded-2xl px-4 py-3 transition-all ${
                    activeField === "dropoff" ? "bg-primary/10 ring-2 ring-primary shadow-sm" : "bg-surface"
                  }`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Destination</p>
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
                    {dropoff && (
                      <button onClick={() => clearField("dropoff")} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 ml-2 active:scale-90">
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  {/* Dropoff search results */}
                  <AnimatePresence>
                    {activeField === "dropoff" && (osmResults.length > 0 || osmSearching) && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-2xl shadow-lg z-20 max-h-48 overflow-y-auto"
                      >
                        {osmSearching && (
                          <div className="flex items-center gap-2 px-4 py-3">
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Searching...</span>
                          </div>
                        )}
                        {osmResults.map((r) => (
                          <button
                            key={r.place_id}
                            onClick={() => handleOsmSelect(r)}
                            className="flex items-center gap-3 w-full px-4 py-3 hover:bg-surface active:bg-muted transition-colors border-b border-border last:border-0"
                          >
                            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                              <Navigation className="w-4 h-4 text-primary" />
                            </div>
                            <div className="text-left min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{r.name || r.display_name.split(",")[0]}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{r.display_name.split(",").slice(0, 3).join(",")}</p>
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
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
