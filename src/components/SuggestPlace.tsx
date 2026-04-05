import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPinned, X, Search, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface SuggestPlaceProps {
  userId?: string;
  userType: "driver" | "passenger";
  visible: boolean;
  onClose: () => void;
}

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

const SuggestPlace = ({ userId, userType, visible, onClose }: SuggestPlaceProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>();

  // Search for places via Nominatim
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) { setSearchResults([]); return; }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=mv&limit=5&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        setSearchResults(await res.json());
      } catch { setSearchResults([]); }
      setSearching(false);
    }, 400);
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); };
  }, [searchQuery]);

  const placeMarker = useCallback((latVal: number, lngVal: number) => {
    if (!mapInstanceRef.current) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([latVal, lngVal]);
    } else {
      markerRef.current = L.marker([latVal, lngVal], {
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(mapInstanceRef.current);
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current?.getLatLng();
        if (pos) {
          setLat(pos.lat.toFixed(6));
          setLng(pos.lng.toFixed(6));
          fetchRoadName(pos.lat, pos.lng);
        }
      });
    }
    mapInstanceRef.current.setView([latVal, lngVal], 17);
  }, []);

  const fetchRoadName = async (latVal: number, lngVal: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latVal}&lon=${lngVal}&zoom=18`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      if (data?.address?.road) {
        setAddress(data.address.road);
      }
    } catch {}
  };

  // Initialize Leaflet map
  useEffect(() => {
    if (!visible || !mapRef.current || mapInstanceRef.current) return;

    const isDark = document.documentElement.classList.contains("dark");

    const map = L.map(mapRef.current, {
      center: [4.1755, 73.5093],
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
    });

    const tileUrl = isDark ? DARK_TILES : LIGHT_TILES;
    const tileLayer = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);
    tileLayerRef.current = tileLayer;
    mapInstanceRef.current = map;

    map.on("click", (e: L.LeafletMouseEvent) => {
      const clickLat = e.latlng.lat;
      const clickLng = e.latlng.lng;
      setLat(clickLat.toFixed(6));
      setLng(clickLng.toFixed(6));
      placeMarker(clickLat, clickLng);
      fetchRoadName(clickLat, clickLng);
    });
  }, [visible, placeMarker]);

  // Cleanup on close
  useEffect(() => {
    if (!visible) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }
      markerRef.current = null;
      mapInstanceRef.current = null;
    }
  }, [visible]);

  const selectSearchResult = (result: any) => {
    const latVal = parseFloat(result.lat);
    const lngVal = parseFloat(result.lon);
    setLat(latVal.toFixed(6));
    setLng(lngVal.toFixed(6));
    setName(result.name || result.display_name?.split(",")[0] || "");
    setSearchQuery("");
    setSearchResults([]);
    placeMarker(latVal, lngVal);
    fetchRoadName(latVal, lngVal);
  };

  const handleSubmit = async () => {
    if (!userId || !name.trim() || !lat || !lng) {
      toast({ title: "Please enter a name and pick a location on the map", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("named_locations").insert({
      name: name.trim().slice(0, 100),
      address: address.trim().slice(0, 200),
      description: description.trim().slice(0, 300) || null,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      suggested_by: userId,
      suggested_by_type: userType,
      status: "pending",
      is_active: false,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to submit", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Place suggested!", description: "Your suggestion will be reviewed by admin." });
    setName(""); setAddress(""); setDescription(""); setLat(""); setLng("");
    onClose();
  };

  const resetAndClose = () => {
    setName(""); setAddress(""); setDescription(""); setLat(""); setLng(""); setSearchQuery(""); setSearchResults([]);
    onClose();
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[800] flex items-end justify-center bg-foreground/50 backdrop-blur-sm"
        onClick={resetAndClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="bg-card rounded-t-3xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90dvh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 pb-6 space-y-3 overflow-y-auto max-h-[90dvh]">
            <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPinned className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">Suggest a Place</h3>
              </div>
              <button onClick={resetAndClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Know a place that's hard to find? Suggest it and we'll add it to the map after review.
            </p>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for a place..."
                className="w-full pl-9 pr-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />}
            </div>

            {searchResults.length > 0 && (
              <div className="bg-surface rounded-xl border border-border overflow-hidden max-h-40 overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => selectSearchResult(r)}
                    className="w-full text-left px-3 py-2.5 text-xs text-foreground hover:bg-muted/50 border-b border-border last:border-0 transition-colors"
                  >
                    <p className="font-medium truncate">{r.display_name}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Map */}
            <div className="rounded-xl overflow-hidden border border-border" style={{ height: 250 }}>
              <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
            </div>
            <p className="text-[10px] text-muted-foreground">Tap the map to pin the exact location. Drag to adjust.</p>

            {/* Form fields */}
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Place Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 100))}
                  placeholder="e.g. Ali's Café, Henveiru Mosque"
                  className="w-full mt-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Road / Address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value.slice(0, 200))}
                  placeholder="Auto-filled from map"
                  className="w-full mt-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 300))}
                  placeholder="Near the blue building on 2nd floor"
                  className="w-full mt-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {lat && lng && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Check className="w-3 h-3 text-primary" />
                Location pinned: {lat}, {lng}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={saving || !name.trim() || !lat || !lng}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
            >
              {saving ? "Submitting..." : "Submit Suggestion"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SuggestPlace;
