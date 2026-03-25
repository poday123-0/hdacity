import { useEffect, useRef } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";

// Waze-inspired map style: bright roads, soft colors, clean look
const wazeMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#f0efe9" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#52524e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 3 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c9c9c1" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#8a8a80" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e8e7df" }] },
  { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#eceae2" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#dfddd5" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#7a7a70" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#b6e59e" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#4a8c3f" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#d6d5cd" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#696961" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#5ac8fa" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#38a3d0" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#38a3d0" }, { weight: 3 }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#ffd866" }] },
  { featureType: "road.arterial", elementType: "geometry.stroke", stylers: [{ color: "#d4b04a" }] },
  { featureType: "road.local", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.local", elementType: "geometry.stroke", stylers: [{ color: "#e0dfda" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#dad8d0" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#aadaff" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5b98c0" }] },
];

const wazeDarkStyle = [
  { elementType: "geometry", stylers: [{ color: "#1c1c28" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a0a0a8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1c1c28" }, { weight: 3 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }, { lightness: -30 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#3a3a48" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#22222e" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#282838" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#707080" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#1a3a20" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2e2e3e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1c1c28" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a8a98" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#2a7ab5" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1a5a8a" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#d0d0e0" }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#8a7a30" }] },
  { featureType: "road.arterial", elementType: "geometry.stroke", stylers: [{ color: "#5a5020" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#282838" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a2e" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3a6a90" }] },
];

const DispatchGoogleMap = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const { isLoaded, error } = useGoogleMaps();

  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const isDark = document.documentElement.classList.contains("dark");

    const map = new g.maps.Map(mapRef.current, {
      center: { lat: 4.2105, lng: 73.5400 }, // Hulhumalé
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

  return <div ref={mapRef} className="w-full h-full" />;
};

export default DispatchGoogleMap;
