import { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { Search, X } from "lucide-react";

// Waze-inspired map style
const wazeMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#f0efe9" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#52524e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 3 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c9c9c1" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e8e7df" }] },
  { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#eceae2" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#dfddd5" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#b6e59e" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#4a8c3f" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#d6d5cd" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#5ac8fa" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#38a3d0" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#38a3d0" }, { weight: 3 }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#ffd866" }] },
  { featureType: "road.arterial", elementType: "geometry.stroke", stylers: [{ color: "#d4b04a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#aadaff" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5b98c0" }] },
];

const wazeDarkStyle = [
  { elementType: "geometry", stylers: [{ color: "#1c1c28" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a0a0a8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1c1c28" }, { weight: 3 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }, { lightness: -30 }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#22222e" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#282838" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#1a3a20" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2e2e3e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1c1c28" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#2a7ab5" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1a5a8a" }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#8a7a30" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a2e" }] },
];

const DispatchGoogleMap = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const searchBoxRef = useRef<google.maps.places.SearchBox | null>(null);
  const searchMarkerRef = useRef<google.maps.Marker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { isLoaded, error } = useGoogleMaps();

  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const isDark = document.documentElement.classList.contains("dark");

    const map = new g.maps.Map(mapRef.current, {
      center: { lat: 4.2105, lng: 73.5400 },
      zoom: 16,
      disableDefaultUI: true,
      zoomControl: true,
      fullscreenControl: true,
      gestureHandling: "greedy",
      styles: isDark ? wazeDarkStyle : wazeMapStyle,
    });

    mapInstance.current = map;

    // Theme observer
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      map.setOptions({ styles: dark ? wazeDarkStyle : wazeMapStyle });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
      mapInstance.current = null;
    };
  }, [isLoaded]);

  // Init SearchBox after map is ready
  useEffect(() => {
    if (!isLoaded || !mapInstance.current || !inputRef.current) return;
    const g = (window as any).google;
    if (!g?.maps?.places) return;

    const searchBox = new g.maps.places.SearchBox(inputRef.current, {
      bounds: mapInstance.current.getBounds(),
    });
    searchBoxRef.current = searchBox;

    searchBox.addListener("places_changed", () => {
      const places = searchBox.getPlaces();
      if (!places || places.length === 0) return;

      const place = places[0];
      if (!place.geometry?.location) return;

      // Clear old marker
      if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);

      // Pan to place
      mapInstance.current?.panTo(place.geometry.location);
      mapInstance.current?.setZoom(18);

      // Drop marker
      searchMarkerRef.current = new g.maps.Marker({
        map: mapInstance.current,
        position: place.geometry.location,
        title: place.name || place.formatted_address,
        animation: g.maps.Animation.DROP,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: "#4285F4",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });

      // Info window
      const iw = new g.maps.InfoWindow({
        content: `<div style="font-size:12px;font-weight:600;padding:4px">${place.name || ""}<br/><span style="font-weight:400;color:#666">${place.formatted_address || ""}</span></div>`,
      });
      iw.open(mapInstance.current, searchMarkerRef.current);

      setSearchQuery(place.name || place.formatted_address || "");
    });

    return () => {
      g.maps.event.clearInstanceListeners(searchBox);
    };
  }, [isLoaded, !!mapInstance.current]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    if (inputRef.current) inputRef.current.value = "";
    if (searchMarkerRef.current) {
      searchMarkerRef.current.setMap(null);
      searchMarkerRef.current = null;
    }
  }, []);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background text-muted-foreground text-sm">
        Map unavailable
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      {/* Search bar overlay */}
      <div className="absolute top-3 left-3 right-3 sm:left-4 sm:right-auto sm:w-80 z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search locations..."
            className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-background/95 backdrop-blur-sm border border-border shadow-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            defaultValue={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DispatchGoogleMap;
