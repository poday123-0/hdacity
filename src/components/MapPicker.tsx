import { useEffect, useRef, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Loader2, X, Check, Crosshair, Navigation, Search } from "lucide-react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { reverseGeocodeLocation } from "@/lib/geocode";
import { supabase } from "@/integrations/supabase/client";

interface NearbyPlace {
  name: string;
  vicinity: string;
  lat: number;
  lng: number;
}

interface MapPickerProps {
  onConfirm: (lat: number, lng: number, name: string, address: string) => void;
  onCancel: () => void;
  initialLat?: number;
  initialLng?: number;
  keepOpenOnNearbySelect?: boolean;
}

const MALE_CENTER = { lat: 4.1755, lng: 73.5093 };

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8a9a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a3e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a2b" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#9a9aaa" }] },
  { featureType: "poi", elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
];

const MapPicker = ({ onConfirm, onCancel, initialLat, initialLng, keepOpenOnNearbySelect = true }: MapPickerProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [center, setCenter] = useState({ lat: initialLat || MALE_CENTER.lat, lng: initialLng || MALE_CENTER.lng });
  const [address, setAddress] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const nearbyRef = useRef<ReturnType<typeof setTimeout>>(); // kept for potential future use
  const { isLoaded } = useGoogleMaps();
  const [isPanning, setIsPanning] = useState(false);
  const skipReverseGeocodeRef = useRef(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ name: string; lat: number; lng: number; tag?: string }[]>([]);
  const [searchLocations, setSearchLocations] = useState<any[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load named + service locations once
  useEffect(() => {
    const load = async () => {
      const [nlRes, slRes] = await Promise.all([
        supabase.from("named_locations").select("name, lat, lng, address").eq("is_active", true).eq("status", "approved"),
        supabase.from("service_locations").select("name, lat, lng").eq("is_active", true),
      ]);
      setSearchLocations([
        ...(slRes.data || []).map((s: any) => ({ ...s, tag: "Area" })),
        ...(nlRes.data || []).map((n: any) => ({ ...n, tag: "Place" })),
      ]);
    };
    load();
  }, []);

  // Filter search results — local first, then Google Places fallback
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(async () => {
      const q = searchQuery.toLowerCase();
      const localMatches = searchLocations
        .filter(l => l.name.toLowerCase().includes(q) || (l.address || "").toLowerCase().includes(q))
        .sort((a, b) => {
          const an = a.name.toLowerCase();
          const bn = b.name.toLowerCase();
          const aScore = an === q ? 0 : an.startsWith(q) ? 1 : 2;
          const bScore = bn === q ? 0 : bn.startsWith(q) ? 1 : 2;
          return aScore - bScore;
        })
        .slice(0, 8)
        .map(l => ({ name: l.name, lat: Number(l.lat), lng: Number(l.lng), tag: l.tag }));

      // If fewer than 3 local results, fetch from Google Places
      if (localMatches.length < 3) {
        const g = (window as any).google;
        if (g?.maps?.places?.AutocompleteService) {
          try {
            const autoSvc = new g.maps.places.AutocompleteService();
            const predictions = await new Promise<any[]>((resolve) => {
              autoSvc.getPlacePredictions(
                { input: searchQuery, componentRestrictions: { country: "mv" } },
                (res: any[] | null, status: string) => resolve(status === "OK" && res ? res : [])
              );
            });

            const mapDiv = document.createElement("div");
            const placesSvc = new g.maps.places.PlacesService(mapDiv);
            const existingNames = new Set(localMatches.map(r => r.name.toLowerCase()));

            for (const pred of predictions.slice(0, 5)) {
              const detail = await new Promise<any>((resolve) => {
                placesSvc.getDetails(
                  { placeId: pred.place_id, fields: ["geometry", "name", "formatted_address"] },
                  (place: any, st: string) => resolve(st === "OK" ? place : null)
                );
              });
              if (detail?.geometry?.location && !existingNames.has((detail.name || "").toLowerCase())) {
                localMatches.push({
                  name: detail.name || pred.structured_formatting?.main_text || "",
                  lat: detail.geometry.location.lat(),
                  lng: detail.geometry.location.lng(),
                  tag: "Google",
                });
                existingNames.add((detail.name || "").toLowerCase());
              }
            }
          } catch {}
        }
      }

      setSearchResults(localMatches.slice(0, 10));
    }, 300);

    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery, searchLocations]);

  // Get user location on mount
  useEffect(() => {
    if (initialLat && initialLng) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Init map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const isDark = document.documentElement.classList.contains("dark");

    const map = new g.maps.Map(mapRef.current, {
      center,
      zoom: 17,
      disableDefaultUI: true,
      zoomControl: false,
      styles: isDark ? darkMapStyle : [],
      gestureHandling: "greedy",
    });

    mapInstance.current = map;
    setMapReady(true);

    map.addListener("dragstart", () => setIsPanning(true));

    map.addListener("idle", () => {
      const c = map.getCenter();
      if (c) {
        setCenter({ lat: c.lat(), lng: c.lng() });
      }
      setIsPanning(false);
    });

    const themeObserver = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      const colorScheme = g?.maps?.ColorScheme;
      if (colorScheme) {
        mapInstance.current?.setOptions({ colorScheme: isDark ? colorScheme.DARK : colorScheme.LIGHT });
      }
      mapInstance.current?.setOptions({ styles: isDark ? darkMapStyle : [] });
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => { mapInstance.current = null; themeObserver.disconnect(); };
  }, [isLoaded]);

  useEffect(() => {
    if (mapInstance.current && !mapReady) {
      mapInstance.current.setCenter(center);
    }
  }, [center, mapReady]);

  // Reverse geocode on center change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (skipReverseGeocodeRef.current) {
      skipReverseGeocodeRef.current = false;
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        // Check local named/service locations first for accurate place names
        const result = await reverseGeocodeLocation(center.lat, center.lng, { skipNearbyPlace: true });
        setPlaceName(result.name);
        setAddress(result.address);
      } catch {
        setPlaceName("Selected Location");
        setAddress(`${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
      }
      setLoading(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [center.lat, center.lng]);

  // Use pre-loaded named/service locations for nearby chips, fallback to Google Places
  useEffect(() => {
    const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const R = 6371000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // First try local named/service locations
    const nearby = searchLocations
      .map(l => ({ name: l.name, vicinity: l.address || "", lat: Number(l.lat), lng: Number(l.lng), dist: haversine(center.lat, center.lng, Number(l.lat), Number(l.lng)) }))
      .filter(l => l.dist <= 300 && l.name !== placeName)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);

    // Always also fetch Google Places and merge
    const g = (window as any).google;
    if (!g?.maps?.places?.PlacesService || !mapInstance.current) {
      setNearbyPlaces(nearby);
      return;
    }

    const svc = new g.maps.places.PlacesService(mapInstance.current);
    svc.nearbySearch(
      {
        location: new g.maps.LatLng(center.lat, center.lng),
        rankBy: g.maps.places.RankBy.DISTANCE,
        type: "point_of_interest",
      },
      (results: any[] | null, status: string) => {
        const existingNames = new Set(nearby.map(p => p.name.toLowerCase()));
        let googlePlaces: NearbyPlace[] = [];
        if (status === "OK" && results) {
          googlePlaces = results
            .filter((p: any) => p.name && p.geometry?.location && !existingNames.has(p.name.toLowerCase()))
            .slice(0, 4)
            .map((p: any) => ({
              name: p.name,
              vicinity: p.vicinity || "",
              lat: p.geometry.location.lat(),
              lng: p.geometry.location.lng(),
            }));
        }
        setNearbyPlaces([...nearby, ...googlePlaces].slice(0, 6));
      }
    );
  }, [center.lat, center.lng, searchLocations, placeName]);

  const handleRecenter = () => {
    if (!navigator.geolocation || !mapInstance.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        mapInstance.current.panTo(p);
        setCenter(p);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleZoom = (dir: "in" | "out") => {
    if (!mapInstance.current) return;
    const z = mapInstance.current.getZoom() || 16;
    mapInstance.current.setZoom(dir === "in" ? z + 1 : z - 1);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1000] flex flex-col bg-background"
    >
      {/* Full-screen map */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="absolute inset-0" />

        {/* Center pin */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="flex flex-col items-center">
            <motion.div
              animate={{ y: isPanning ? -14 : 0, scale: isPanning ? 1.1 : 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="flex flex-col items-center"
            >
              <div className="w-10 h-10 rounded-full bg-primary shadow-[0_4px_24px_rgba(var(--primary),0.5)] flex items-center justify-center ring-4 ring-primary/20">
                <MapPin className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="w-0.5 h-5 bg-primary" />
            </motion.div>
            <motion.div
              animate={{ scale: isPanning ? 0.6 : 1, opacity: isPanning ? 0.3 : 0.5 }}
              className="w-3 h-1.5 rounded-full bg-foreground/40 -mt-0.5 blur-[1px]"
            />
          </div>
        </div>

        {/* Top bar — close + search */}
        <div className="absolute top-0 left-0 right-0 z-20 p-3 pt-safe">
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="w-10 h-10 rounded-full bg-card/95 backdrop-blur-lg border border-border shadow-lg flex items-center justify-center active:scale-90 transition-transform"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>
            <div className="flex-1 relative">
              <div className="bg-card/95 backdrop-blur-lg border border-border rounded-full shadow-lg px-4 py-2.5 flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search locations..."
                  className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(""); setSearchResults([]); }} className="shrink-0">
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-card/95 backdrop-blur-lg border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSearchQuery("");
                        setSearchResults([]);
                        skipReverseGeocodeRef.current = true;
                        const newCenter = { lat: r.lat, lng: r.lng };
                        setCenter(newCenter);
                        setPlaceName(r.name);
                        setAddress(r.name);
                        if (mapInstance.current) {
                          mapInstance.current.panTo(newCenter);
                          mapInstance.current.setZoom(18);
                        }
                      }}
                      className="flex items-center gap-2.5 w-full px-3.5 py-2.5 hover:bg-primary/5 text-left transition-colors border-b border-border/50 last:border-0"
                    >
                      <Navigation className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs font-medium text-foreground truncate flex-1">{r.name}</span>
                      {r.tag && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">{r.tag}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right side controls */}
        <div className="absolute right-3 bottom-3 z-20 flex flex-col gap-2">
          <button
            onClick={() => handleZoom("in")}
            className="w-10 h-10 rounded-full bg-card/95 backdrop-blur-lg border border-border shadow-lg flex items-center justify-center text-foreground text-lg font-bold active:scale-90 transition-transform"
          >
            +
          </button>
          <button
            onClick={() => handleZoom("out")}
            className="w-10 h-10 rounded-full bg-card/95 backdrop-blur-lg border border-border shadow-lg flex items-center justify-center text-foreground text-lg font-bold active:scale-90 transition-transform"
          >
            −
          </button>
          <button
            onClick={handleRecenter}
            className="w-10 h-10 rounded-full bg-card/95 backdrop-blur-lg border border-border shadow-lg flex items-center justify-center active:scale-90 transition-transform"
          >
            <Crosshair className="w-5 h-5 text-primary" />
          </button>
        </div>
      </div>

      {/* Bottom panel */}
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 22 }}
        className="bg-card border-t border-border px-4 pt-3 pb-safe shadow-[0_-4px_30px_rgba(0,0,0,0.08)]"
      >
        {/* Selected location */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Finding address...</span>
              </div>
            ) : (
              <>
                <p className="text-sm font-bold text-foreground truncate">{placeName}</p>
                <p className="text-[11px] text-muted-foreground truncate">{address}</p>
              </>
            )}
          </div>
        </div>

        {/* Nearby places — compact horizontal scroll */}
        <AnimatePresence>
          {nearbyPlaces.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-3"
            >
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                {nearbyPlaces.map((place, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      onConfirm(place.lat, place.lng, place.name, place.vicinity);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border hover:border-primary/30 hover:bg-primary/5 active:scale-[0.97] transition-all whitespace-nowrap shrink-0"
                  >
                    <Navigation className="w-3 h-3 text-primary shrink-0" />
                    <span className="text-[11px] font-medium text-foreground">{place.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirm button */}
        <button
          onClick={() => onConfirm(center.lat, center.lng, placeName, address)}
          disabled={loading}
          className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl text-sm transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 shadow-[0_4px_16px_rgba(var(--primary),0.25)] flex items-center justify-center gap-2 mb-2"
        >
          <Check className="w-4 h-4" />
          Confirm Location
        </button>
      </motion.div>
    </motion.div>
  );
};

export default MapPicker;
