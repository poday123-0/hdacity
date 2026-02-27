import { MapPin, ChevronDown, ChevronUp, Loader2, Search, Locate, Users, Luggage, Minus, Plus, Navigation, X, CirclePlus, Home, Briefcase, Star, Heart, MapPinned, Trash2, Pencil, Calendar, Clock, FileText } from "lucide-react";
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

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  name?: string;
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
  const [pickupQuery, setPickupQuery] = useState("");
  const [dropoffQuery, setDropoffQuery] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [osmResults, setOsmResults] = useState<NominatimResult[]>([]);
  const [osmSearching, setOsmSearching] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [saveIcon, setSaveIcon] = useState("star");
  const [pendingSaveLocation, setPendingSaveLocation] = useState<ServiceLocation | null>(null);
  const [settingOnMap, setSettingOnMap] = useState(false);
  const [saveMapPicker, setSaveMapPicker] = useState(false);
  const [editingSavedId, setEditingSavedId] = useState<string | null>(null);
  const [bookingType, setBookingType] = useState<BookingType>("now");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const pickupRef = useRef<HTMLInputElement>(null);
  const dropoffRef = useRef<HTMLInputElement>(null);
  const stopRefs = useRef<(HTMLInputElement | null)[]>([]);

  const activeQuery = activeField === "pickup" ? pickupQuery
    : activeField === "dropoff" ? dropoffQuery
    : activeField?.startsWith("stop-") ? stopQueries[parseInt(activeField.split("-")[1])] || ""
    : "";

  // Fetch service locations
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
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(activeQuery)}&countrycodes=mv&limit=5&addressdetails=1&extratags=1&namedetails=1`,
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
    } else if (activeField?.startsWith("stop-")) {
      const idx = parseInt(activeField.split("-")[1]);
      const newStops = [...stops];
      newStops[idx] = loc;
      setStops(newStops);
      const newQueries = [...stopQueries];
      newQueries[idx] = loc.name;
      setStopQueries(newQueries);
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
    setOsmResults([]);
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

  const handleSaveLocation = async () => {
    if (!userId || !pendingSaveLocation || !saveLabel.trim()) return;
    const { data, error } = await supabase.from("saved_locations").insert({
      user_id: userId,
      label: saveLabel.trim(),
      name: pendingSaveLocation.name,
      address: pendingSaveLocation.address,
      lat: pendingSaveLocation.lat,
      lng: pendingSaveLocation.lng,
      icon: saveIcon,
    }).select().single();
    if (!error && data) {
      setSavedLocations(prev => [...prev, data as SavedLocation]);
    }
    setShowSaveDialog(false);
    setPendingSaveLocation(null);
    setSaveLabel("");
    setSaveIcon("star");
  };

  const handleDeleteSaved = async (id: string) => {
    await supabase.from("saved_locations").delete().eq("id", id);
    setSavedLocations(prev => prev.filter(s => s.id !== id));
  };

  const handleEditSaved = (saved: SavedLocation) => {
    setEditingSavedId(saved.id);
    setSaveLabel(saved.label);
    setSaveIcon(saved.icon);
    setPendingSaveLocation({ id: saved.id, name: saved.name, address: saved.address, lat: saved.lat, lng: saved.lng });
    setShowSaveDialog(true);
  };

  const handleUpdateSavedLocation = async () => {
    if (!editingSavedId || !pendingSaveLocation || !saveLabel.trim()) return;
    const { error } = await supabase.from("saved_locations").update({
      label: saveLabel.trim(),
      name: pendingSaveLocation.name,
      address: pendingSaveLocation.address,
      lat: pendingSaveLocation.lat,
      lng: pendingSaveLocation.lng,
      icon: saveIcon,
    }).eq("id", editingSavedId);
    if (!error) {
      setSavedLocations(prev => prev.map(s => s.id === editingSavedId ? { ...s, label: saveLabel.trim(), name: pendingSaveLocation.name, address: pendingSaveLocation.address, lat: pendingSaveLocation.lat, lng: pendingSaveLocation.lng, icon: saveIcon } : s));
    }
    setShowSaveDialog(false);
    setPendingSaveLocation(null);
    setSaveLabel("");
    setSaveIcon("star");
    setEditingSavedId(null);
  };

  const handleSetOnMap = () => {
    setSettingOnMap(true);
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
    setDropoff(loc);
    setDropoffQuery(name);
    setActiveField(null);
    setSettingOnMap(false);
  };

  const canConfirm = pickup && (bookingType === "hourly" || dropoff);
  const validStops = stops.filter((s): s is ServiceLocation => s !== null);
  const scheduledAtIso = scheduledDate && scheduledTime ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString() : undefined;

  // Check which preset labels already exist
  const existingLabels = savedLocations.map(s => s.label.toLowerCase());

  const renderSearchResults = (fieldKey: string) => {
    if (activeField !== fieldKey) return null;
    if (osmResults.length === 0 && !osmSearching) return null;
    return (
      <div className="mt-2 bg-card border border-border rounded-xl shadow-lg max-h-[30vh] overflow-y-auto">
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
      </div>
    );
  };

  if (saveMapPicker) {
    return (
      <MapPicker
        onConfirm={(lat, lng, name, address) => {
          const nearest = findNearestServiceArea(lat, lng);
          setPendingSaveLocation({
            id: nearest?.id || "saved-loc",
            name,
            address,
            lat,
            lng,
          });
          setSaveMapPicker(false);
        }}
        onCancel={() => setSaveMapPicker(false)}
        initialLat={pickup?.lat}
        initialLng={pickup?.lng}
      />
    );
  }

  if (settingOnMap) {
    return (
      <MapPicker
        onConfirm={handleMapPickerConfirm}
        onCancel={() => setSettingOnMap(false)}
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
      className={`absolute bottom-0 left-0 right-0 bg-card rounded-t-[1.75rem] shadow-[0_-8px_40px_rgba(0,0,0,0.15)] z-10 flex flex-col max-h-[calc(100dvh-3.5rem)]`}
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
            <button onClick={() => { setMinimized(!minimized); if (activeField) { setActiveField(null); setOsmResults([]); } }} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform">
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
            <div className="flex gap-1 bg-surface rounded-xl p-1">
              {([
                { key: "now" as BookingType, label: "Now", icon: Navigation },
                { key: "scheduled" as BookingType, label: "Schedule", icon: Calendar },
                { key: "hourly" as BookingType, label: "Hourly", icon: Clock },
              ]).map(({ key, label, icon: Icon }) => (
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

            {/* Schedule fields */}
            {bookingType === "scheduled" && (
              <div className="bg-surface rounded-xl p-3 space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Schedule Pickup</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[9px] text-muted-foreground">Date</label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      className="w-full bg-card border border-border rounded-lg px-2.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[9px] text-muted-foreground">Time</label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full bg-card border border-border rounded-lg px-2.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
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
                    {pickup && !activeField && (
                      <button onClick={() => clearField("pickup")} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 ml-2 active:scale-90">
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
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
                      {!activeField && (
                        <button onClick={() => removeStop(idx)} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 ml-2 active:scale-90">
                          <X className="w-3 h-3 text-muted-foreground" />
                        </button>
                      )}
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
                  {activeField === "dropoff" && (osmResults.length > 0 || osmSearching) && (
                    <div className="mb-2 bg-card border border-border rounded-xl shadow-lg max-h-[30vh] overflow-y-auto">
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
                    {dropoff && !activeField && (
                      <button onClick={() => clearField("dropoff")} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 ml-2 active:scale-90">
                        <X className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Saved Places & Set on Map ── */}
            {(
              <div className="space-y-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Quick Access</p>
                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 -mx-1 px-1 no-scrollbar">
                  {/* Set on Map button */}
                  <button
                    onClick={handleSetOnMap}
                    disabled={settingOnMap}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-primary/10 text-primary text-xs font-semibold whitespace-nowrap active:scale-95 transition-all shrink-0"
                  >
                    <div className="w-7 h-7 rounded-xl bg-primary/15 flex items-center justify-center">
                      <MapPinned className={`w-3.5 h-3.5 ${settingOnMap ? "animate-bounce" : ""}`} />
                    </div>
                    {settingOnMap ? "Tap map..." : "Set on map"}
                  </button>

                  {/* Saved location chips */}
                  {savedLocations.map((saved) => {
                    const IconComp = ICON_MAP[saved.icon] || Star;
                    return (
                      <div key={saved.id} className="flex items-center shrink-0 rounded-2xl bg-surface border border-border/60 overflow-hidden shadow-sm">
                        <button
                          onClick={() => handleSelectSaved(saved)}
                          className="flex items-center gap-2 pl-2.5 pr-2 py-2.5 text-xs font-semibold whitespace-nowrap active:scale-[0.97] transition-all"
                        >
                          <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center">
                            <IconComp className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <span className="text-foreground">{saved.label}</span>
                        </button>
                        <div className="flex items-center border-l border-border/40">
                          <button
                            onClick={() => handleEditSaved(saved)}
                            className="px-2 py-2.5 hover:bg-muted/50 transition-colors"
                          >
                            <Pencil className="w-3 h-3 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => handleDeleteSaved(saved.id)}
                            className="px-2 py-2.5 hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="w-3 h-3 text-destructive/60" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add preset labels that don't exist yet */}
                  {PRESET_LABELS.filter(p => !existingLabels.includes(p.label.toLowerCase())).map((preset) => {
                    const IconComp = ICON_MAP[preset.icon] || Star;
                    return (
                      <button
                        key={preset.label}
                        onClick={() => {
                          setSaveLabel(preset.label);
                          setSaveIcon(preset.icon);
                          setPendingSaveLocation(null);
                          setShowSaveDialog(true);
                        }}
                        className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border border-dashed border-border/60 text-xs font-medium text-muted-foreground whitespace-nowrap active:scale-95 transition-all hover:border-primary/40 hover:text-foreground hover:bg-primary/5 shrink-0"
                      >
                        <div className="w-7 h-7 rounded-xl bg-muted/50 flex items-center justify-center">
                          <IconComp className="w-3.5 h-3.5" />
                        </div>
                        {preset.label}
                      </button>
                    );
                  })}

                  {/* Add custom saved location */}
                  <button
                    onClick={() => {
                      setSaveLabel("");
                      setSaveIcon("star");
                      setPendingSaveLocation(null);
                      setShowSaveDialog(true);
                    }}
                    className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border border-dashed border-border/60 text-xs font-medium text-muted-foreground whitespace-nowrap active:scale-95 transition-all hover:border-primary/40 hover:text-foreground hover:bg-primary/5 shrink-0"
                  >
                    <div className="w-7 h-7 rounded-xl bg-muted/50 flex items-center justify-center">
                      <CirclePlus className="w-3.5 h-3.5" />
                    </div>
                    Add place
                  </button>
                </div>
              </div>
            )}

            {/* Save Location Dialog */}
            <AnimatePresence>
              {showSaveDialog && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="bg-surface border border-border rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground">{editingSavedId ? "Edit place" : "Save a place"}</h3>
                    <button onClick={() => { setShowSaveDialog(false); setEditingSavedId(null); }} className="w-6 h-6 rounded-full bg-muted flex items-center justify-center active:scale-90">
                      <X className="w-3 h-3 text-muted-foreground" />
                    </button>
                  </div>

                  {/* Label input */}
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Label</label>
                    <input
                      type="text"
                      placeholder="e.g. Home, Office, Gym..."
                      value={saveLabel}
                      onChange={(e) => setSaveLabel(e.target.value)}
                      className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary mt-1"
                    />
                  </div>

                  {/* Icon picker */}
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Icon</label>
                    <div className="flex gap-2 mt-1">
                      {[
                        { key: "home", Icon: Home },
                        { key: "briefcase", Icon: Briefcase },
                        { key: "heart", Icon: Heart },
                        { key: "star", Icon: Star },
                      ].map(({ key, Icon }) => (
                        <button
                          key={key}
                          onClick={() => setSaveIcon(key)}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                            saveIcon === key ? "bg-primary text-primary-foreground shadow-md" : "bg-card border border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Location search for saving */}
                  <div>
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Location</label>
                    {pendingSaveLocation ? (
                      <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 mt-1">
                        <MapPin className="w-4 h-4 text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{pendingSaveLocation.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{pendingSaveLocation.address}</p>
                        </div>
                        <button onClick={() => setPendingSaveLocation(null)} className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0 active:scale-90">
                          <X className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <SaveLocationSearch
                          onSelect={(loc) => setPendingSaveLocation(loc)}
                          findNearest={findNearestServiceArea}
                        />
                        <button
                          onClick={() => setSaveMapPicker(true)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent/15 text-accent-foreground text-xs font-semibold whitespace-nowrap active:scale-95 transition-all border border-accent/20 hover:bg-accent/25 w-full justify-center"
                        >
                          <MapPinned className="w-3.5 h-3.5" />
                          Pick on map
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Save button */}
                  <button
                    onClick={editingSavedId ? handleUpdateSavedLocation : handleSaveLocation}
                    disabled={!saveLabel.trim() || !pendingSaveLocation}
                    className="w-full bg-primary text-primary-foreground font-bold py-2.5 rounded-xl text-sm transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40"
                  >
                    {editingSavedId ? "Update place" : "Save place"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

          </>
        ) : null}
      </div>

      {/* Sticky confirm button - always visible */}
      {!minimized && !activeField && !showSaveDialog && (
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

// Mini search component for save dialog
const SaveLocationSearch = ({ onSelect, findNearest }: {
  onSelect: (loc: ServiceLocation) => void;
  findNearest: (lat: number, lng: number) => ServiceLocation | null;
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!query.trim() || query.length < 3) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=mv&limit=4&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        setResults(await res.json());
      } catch { setResults([]); }
      setSearching(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleSelect = (r: NominatimResult) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    const nearest = findNearest(lat, lng);
    onSelect({
      id: nearest?.id || "saved-loc",
      name: r.name || r.display_name.split(",")[0],
      address: r.display_name.split(",").slice(0, 3).join(", "),
      lat,
      lng,
    });
    setQuery("");
    setResults([]);
  };

  return (
    <div className="mt-1">
      <div className="flex items-center bg-card border border-border rounded-xl px-3 py-2">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0 mr-2" />
        <input
          type="text"
          placeholder="Search location to save..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {searching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-2" />}
      </div>
      {results.length > 0 && (
        <div className="mt-1 bg-card border border-border rounded-xl shadow-lg max-h-36 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.place_id}
              onClick={() => handleSelect(r)}
              className="flex items-center gap-2 w-full px-3 py-2 hover:bg-surface active:bg-muted transition-colors border-b border-border last:border-0"
            >
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{r.name || r.display_name.split(",")[0]}</p>
                <p className="text-[10px] text-muted-foreground truncate">{r.display_name.split(",").slice(0, 2).join(",")}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationInput;
