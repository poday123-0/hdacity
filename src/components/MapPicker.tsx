import { useEffect, useRef, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Loader2, X, Check, Crosshair, Navigation, Search } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { reverseGeocodeLocation } from "@/lib/geocode";
import { supabase } from "@/integrations/supabase/client";
import { getServiceAreasWithPolygons, isInsideAnyServiceArea } from "@/lib/service-area-filter";

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
const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

const MapPicker = ({ onConfirm, onCancel, initialLat, initialLng, keepOpenOnNearbySelect = true }: MapPickerProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [center, setCenter] = useState({ lat: initialLat || MALE_CENTER.lat, lng: initialLng || MALE_CENTER.lng });
  const [address, setAddress] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [isPanning, setIsPanning] = useState(false);
  const skipReverseGeocodeRef = useRef(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ name: string; lat: number; lng: number; tag?: string }[]>([]);
  const [searchLocations, setSearchLocations] = useState<any[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const searchAbortRef = useRef<AbortController | null>(null);

  // Load named + service locations once
  useEffect(() => {
    const load = async () => {
      const [nlRes, slRes] = await Promise.all([
        supabase.from("named_locations").select("name, lat, lng, address, description, group_name, road_name").eq("is_active", true).eq("status", "approved"),
        supabase.from("service_locations").select("name, lat, lng, address, description").eq("is_active", true),
      ]);
      setSearchLocations([
        ...(slRes.data || []).map((s: any) => ({ ...s, tag: "Area" })),
        ...(nlRes.data || []).map((n: any) => ({ ...n, tag: "Place" })),
      ]);
    };
    load();
  }, []);

  // Filter search results — local first, then Nominatim + Photon parallel
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(async () => {
      if (searchAbortRef.current) searchAbortRef.current.abort();
      const ctrl = new AbortController();
      searchAbortRef.current = ctrl;

      const q = searchQuery.toLowerCase();
      const localMatches = searchLocations
        .filter(l =>
          l.name.toLowerCase().includes(q) ||
          (l.address || "").toLowerCase().includes(q) ||
          (l.description || "").toLowerCase().includes(q) ||
          (l.group_name || "").toLowerCase().includes(q) ||
          (l.road_name || "").toLowerCase().includes(q)
        )
        .sort((a, b) => {
          const an = a.name.toLowerCase();
          const bn = b.name.toLowerCase();
          const aScore = an === q ? 0 : an.startsWith(q) ? 1 : 2;
          const bScore = bn === q ? 0 : bn.startsWith(q) ? 1 : 2;
          return aScore - bScore;
        })
        .slice(0, 8)
        .map(l => ({ name: l.name, lat: Number(l.lat), lng: Number(l.lng), tag: l.tag }));

      // Show local results immediately
      if (!ctrl.signal.aborted) setSearchResults(localMatches);

      // Fetch Nominatim + Photon in parallel, filtered by service area polygons
      if (localMatches.length < 5) {
        try {
          const areas = await getServiceAreasWithPolygons();
          const existingNames = new Set(localMatches.map(r => r.name.toLowerCase()));
          const externalResults: { name: string; lat: number; lng: number; tag: string }[] = [];

          const [nomRes, photonRes] = await Promise.allSettled([
            fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=mv&limit=5&addressdetails=1`,
              { headers: { "Accept-Language": "en" }, signal: ctrl.signal }
            ).then(r => r.json()),
            fetch(
              `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=5&lat=4.1755&lon=73.5093&lang=en&bbox=72.5,-1,74,8`,
              { signal: ctrl.signal }
            ).then(r => r.json()),
          ]);

          if (nomRes.status === "fulfilled" && Array.isArray(nomRes.value)) {
            for (const r of nomRes.value) {
              const name = r.name || r.display_name?.split(",")[0] || "";
              const lat = parseFloat(r.lat);
              const lng = parseFloat(r.lon);
              if (name && !existingNames.has(name.toLowerCase()) && isInsideAnyServiceArea(lat, lng, areas)) {
                externalResults.push({ name, lat, lng, tag: "Map" });
                existingNames.add(name.toLowerCase());
              }
            }
          }

          if (photonRes.status === "fulfilled" && photonRes.value?.features) {
            for (const f of photonRes.value.features) {
              const name = f.properties?.name || "";
              const lat = f.geometry.coordinates[1];
              const lng = f.geometry.coordinates[0];
              if (name && !existingNames.has(name.toLowerCase()) && isInsideAnyServiceArea(lat, lng, areas)) {
                externalResults.push({ name, lat, lng, tag: "Map" });
                existingNames.add(name.toLowerCase());
              }
            }
          }

          if (!ctrl.signal.aborted) {
            setSearchResults([...localMatches, ...externalResults].slice(0, 12));
          }
        } catch (e: any) {
          if (e?.name !== "AbortError" && !ctrl.signal.aborted) {
            // keep local results on error
          }
        }
      }
    }, 80);

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

  // Init Leaflet map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const isDark = document.documentElement.classList.contains("dark");

    const map = L.map(mapRef.current, {
      center: [center.lat, center.lng],
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
    });

    const tileUrl = isDark ? DARK_TILES : LIGHT_TILES;
    const tileLayer = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);
    tileLayerRef.current = tileLayer;

    mapInstance.current = map;
    setMapReady(true);

    map.on("movestart", () => setIsPanning(true));

    map.on("moveend", () => {
      const c = map.getCenter();
      setCenter({ lat: c.lat, lng: c.lng });
      setIsPanning(false);
    });

    // Theme observer
    const themeObserver = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      const newUrl = isDark ? DARK_TILES : LIGHT_TILES;
      if (tileLayerRef.current) {
        tileLayerRef.current.setUrl(newUrl);
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      map.remove();
      mapInstance.current = null;
      themeObserver.disconnect();
    };
  }, []);

  // Show named location labels on map
  const namedMarkersRef = useRef<L.Marker[]>([]);
  useEffect(() => {
    if (!mapInstance.current || !mapReady || searchLocations.length === 0) return;
    const map = mapInstance.current;

    const updateLabels = () => {
      // Clear old markers
      namedMarkersRef.current.forEach(m => map.removeLayer(m));
      namedMarkersRef.current = [];

      const zoom = map.getZoom();
      if (zoom < 15) return; // Only show at close zoom

      const bounds = map.getBounds();
      const visible = searchLocations.filter(l => {
        const lat = Number(l.lat);
        const lng = Number(l.lng);
        return bounds.contains([lat, lng]);
      });

      // Limit to prevent overload
      const toShow = visible.slice(0, 60);

      toShow.forEach(l => {
        const lat = Number(l.lat);
        const lng = Number(l.lng);
        const label = l.name.length > 20 ? l.name.slice(0, 18) + "…" : l.name;
        const isDark = document.documentElement.classList.contains("dark");
        const icon = L.divIcon({
          className: "",
          iconSize: [0, 0],
          iconAnchor: [0, -4],
          html: `<div style="white-space:nowrap;font-size:10px;font-weight:600;color:${isDark ? '#93c5fd' : '#1d4ed8'};text-shadow:${isDark ? '0 0 3px rgba(0,0,0,0.8)' : '0 0 3px rgba(255,255,255,0.9),0 0 3px rgba(255,255,255,0.9)'};pointer-events:none;transform:translateX(-50%)">${label}</div>`,
        });
        const m = L.marker([lat, lng], { icon, interactive: false, zIndexOffset: -100 }).addTo(map);
        namedMarkersRef.current.push(m);
      });
    };

    updateLabels();
    map.on("moveend", updateLabels);
    map.on("zoomend", updateLabels);

    return () => {
      map.off("moveend", updateLabels);
      map.off("zoomend", updateLabels);
      namedMarkersRef.current.forEach(m => map.removeLayer(m));
      namedMarkersRef.current = [];
    };
  }, [mapReady, searchLocations]);

  // Pan to initial center if map already created but center changed before map init
  useEffect(() => {
    if (mapInstance.current && !mapReady) {
      mapInstance.current.setView([center.lat, center.lng]);
    }
  }, [center, mapReady]);

  // Reverse geocode on center change — only show named location label if within ~100m
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (skipReverseGeocodeRef.current) {
      skipReverseGeocodeRef.current = false;
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);

      // Check if any named/service location is within 100m
      const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const R = 6371000;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      const closestLocal = searchLocations
        .map(l => ({ name: l.name, address: l.address || "", dist: haversine(center.lat, center.lng, Number(l.lat), Number(l.lng)) }))
        .filter(l => l.dist <= 50)
        .sort((a, b) => a.dist - b.dist)[0];

      if (closestLocal) {
        setPlaceName(closestLocal.name);
        setAddress(closestLocal.address || closestLocal.name);
      } else {
        // No nearby named location — just show address from reverse geocode, no prominent name
        try {
          const result = await reverseGeocodeLocation(center.lat, center.lng, { skipNearbyPlace: true });
          setPlaceName(""); // Don't show floating label for far-away generic results
          setAddress(result.address || result.name);
        } catch {
          setPlaceName("");
          setAddress(`${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
        }
      }
      setLoading(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [center.lat, center.lng, searchLocations]);

  // Nearby places from local data
  useEffect(() => {
    const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      const R = 6371000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const nearby = searchLocations
      .map(l => ({ name: l.name, vicinity: l.address || "", lat: Number(l.lat), lng: Number(l.lng), dist: haversine(center.lat, center.lng, Number(l.lat), Number(l.lng)) }))
      .filter(l => l.dist <= 300 && l.name !== placeName)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 6);

    setNearbyPlaces(nearby);
  }, [center.lat, center.lng, searchLocations, placeName]);

  const handleRecenter = () => {
    if (!navigator.geolocation || !mapInstance.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        mapInstance.current?.panTo([p.lat, p.lng]);
        setCenter(p);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleZoom = (dir: "in" | "out") => {
    if (!mapInstance.current) return;
    const z = mapInstance.current.getZoom();
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

        {/* Center pin with floating label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
          <div className="flex flex-col items-center">
            {/* Floating location name label */}
            <AnimatePresence>
              {!isPanning && placeName && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="mb-2 px-3 py-1.5 rounded-lg bg-card/95 backdrop-blur-lg border border-border shadow-lg max-w-[200px]"
                >
                  <p className="text-[11px] font-semibold text-foreground truncate text-center">{placeName}</p>
                  {address && address !== placeName && (
                    <p className="text-[9px] text-muted-foreground truncate text-center">{address}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div
              animate={{ y: isPanning ? -14 : 0, scale: isPanning ? 1.1 : 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="flex flex-col items-center"
            >
              <div className="w-12 h-12 rounded-full bg-primary shadow-[0_4px_24px_rgba(0,0,0,0.3)] flex items-center justify-center ring-4 ring-primary/30">
                <MapPin className="w-6 h-6 text-primary-foreground" />
              </div>
              <div className="w-1 h-6 bg-primary rounded-b" />
            </motion.div>
            <motion.div
              animate={{ scale: isPanning ? 0.6 : 1, opacity: isPanning ? 0.3 : 0.6 }}
              className="w-4 h-2 rounded-full bg-foreground/50 -mt-0.5 blur-[1px]"
            />
          </div>
        </div>

        {/* Top bar — close + search */}
        <div className="absolute top-0 left-0 right-0 z-[1001] p-3 pt-safe">
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
                          mapInstance.current.setView([newCenter.lat, newCenter.lng], 18);
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
        <div className="absolute right-3 bottom-3 z-[1001] flex flex-col gap-2">
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
                {placeName ? (
                  <p className="text-sm font-bold text-foreground truncate">{placeName}</p>
                ) : null}
                <p className={`text-muted-foreground truncate ${placeName ? 'text-[11px]' : 'text-sm font-medium text-foreground'}`}>{address || "Move map to select location"}</p>
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
