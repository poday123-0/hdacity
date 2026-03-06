import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Loader2, X, Check, Crosshair, Navigation } from "lucide-react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { reverseGeocodeLocation } from "@/lib/geocode";

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
  /** If true, selecting a nearby place updates the pin instead of closing */
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
  const nearbyRef = useRef<ReturnType<typeof setTimeout>>();
  const { isLoaded } = useGoogleMaps();

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
      zoom: 16,
      disableDefaultUI: true,
      zoomControl: true,
      zoomControlOptions: { position: g.maps.ControlPosition.RIGHT_CENTER },
      styles: isDark ? darkMapStyle : [],
      gestureHandling: "greedy",
    });

    mapInstance.current = map;
    setMapReady(true);

    // Listen for idle (after pan/zoom finishes)
    map.addListener("idle", () => {
      const c = map.getCenter();
      if (c) {
        setCenter({ lat: c.lat(), lng: c.lng() });
      }
    });

    // Theme change observer
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

  // Update map center when center state changes (initial only)
  useEffect(() => {
    if (mapInstance.current && !mapReady) {
      mapInstance.current.setCenter(center);
    }
  }, [center, mapReady]);

  // Reverse geocode on center change — don't clear name while loading
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await reverseGeocodeLocation(center.lat, center.lng, { skipAdminLocations: true });
        setPlaceName(result.name);
        setAddress(result.address);
      } catch {
        setPlaceName("Selected Location");
        setAddress(`${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
      }
      setLoading(false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [center.lat, center.lng]);

  // Fetch nearby places
  useEffect(() => {
    if (nearbyRef.current) clearTimeout(nearbyRef.current);
    nearbyRef.current = setTimeout(() => {
      const g = (window as any).google;
      if (!g?.maps?.places?.PlacesService) {
        setNearbyPlaces([]);
        return;
      }
      const mapDiv = document.createElement("div");
      const service = new g.maps.places.PlacesService(mapDiv);
      service.nearbySearch(
        { location: new g.maps.LatLng(center.lat, center.lng), radius: 80 },
        (results: any[], status: string) => {
          if (status !== "OK" || !results?.length) {
            setNearbyPlaces([]);
            return;
          }
          // Filter out the main place (already shown), take up to 3
          const places: NearbyPlace[] = [];
          for (const r of results) {
            if (!r.name || !r.geometry?.location) continue;
            if (r.name === placeName) continue;
            places.push({
              name: r.name,
              vicinity: r.vicinity || "",
              lat: r.geometry.location.lat(),
              lng: r.geometry.location.lng(),
            });
            if (places.length >= 3) break;
          }
          setNearbyPlaces(places);
        }
      );
    }, 500);
    return () => { if (nearbyRef.current) clearTimeout(nearbyRef.current); };
  }, [center.lat, center.lng, placeName]);

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1000] flex flex-col bg-background"
    >
      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="absolute inset-0" />

        {/* Center pin - always fixed in the middle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="flex flex-col items-center">
            {/* Pin shadow */}
            <div className="w-3 h-1 rounded-full bg-foreground/20 blur-sm mt-1 absolute bottom-0" />
            {/* Animated pin */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="flex flex-col items-center"
            >
              <div className="w-8 h-8 rounded-full bg-primary shadow-[0_4px_20px_rgba(var(--primary),0.4)] flex items-center justify-center">
                <MapPin className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="w-0.5 h-4 bg-primary" />
            </motion.div>
            {/* Ground dot */}
            <div className="w-2 h-2 rounded-full bg-primary/40 -mt-0.5" />
          </div>
        </div>

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-20 p-4 pt-safe">
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="w-10 h-10 rounded-xl bg-card/90 backdrop-blur-md border border-border shadow-lg flex items-center justify-center active:scale-90 transition-transform"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>
            <div className="flex-1 bg-card/90 backdrop-blur-md border border-border rounded-xl shadow-lg px-4 py-2.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Set destination</p>
              <p className="text-xs font-medium text-foreground mt-0.5">Move the map to position the pin</p>
            </div>
          </div>
        </div>

        {/* Recenter button */}
        <button
          onClick={handleRecenter}
          className="absolute right-4 bottom-4 z-20 w-10 h-10 rounded-xl bg-card/90 backdrop-blur-md border border-border shadow-lg flex items-center justify-center active:scale-90 transition-transform"
        >
          <Crosshair className="w-5 h-5 text-primary" />
        </button>
      </div>

      {/* Bottom confirmation panel */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-card border-t border-border px-4 pt-4 pb-safe shadow-[0_-8px_30px_rgba(0,0,0,0.1)]"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex items-center gap-2 py-1">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Finding address...</span>
              </div>
            ) : (
              <>
                <p className="text-sm font-bold text-foreground truncate">{placeName}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{address}</p>
              </>
            )}
          </div>
        </div>

        {/* Nearby places */}
        {nearbyPlaces.length > 0 && (
          <div className="mb-3 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">Nearby places</p>
            {nearbyPlaces.map((place, i) => (
              <button
                key={i}
                onClick={() => {
                  if (keepOpenOnNearbySelect && mapInstance.current) {
                    // Pan to the nearby place instead of closing
                    const newCenter = { lat: place.lat, lng: place.lng };
                    mapInstance.current.panTo(newCenter);
                    setCenter(newCenter);
                    setPlaceName(place.name);
                    setAddress(place.vicinity);
                  } else {
                    onConfirm(place.lat, place.lng, place.name, place.vicinity);
                  }
                }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl bg-surface border border-border hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98] transition-all"
              >
                <Navigation className="w-3.5 h-3.5 text-primary shrink-0" />
                <div className="text-left min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground truncate">{place.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{place.vicinity}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => onConfirm(center.lat, center.lng, placeName, address)}
          disabled={loading}
          className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 shadow-[0_4px_16px_rgba(var(--primary),0.25)] flex items-center justify-center gap-2 mb-2"
        >
          <Check className="w-4 h-4" />
          Confirm destination
        </button>
      </motion.div>
    </motion.div>
  );
};

export default MapPicker;
