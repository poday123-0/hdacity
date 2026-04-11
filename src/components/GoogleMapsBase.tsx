import { useEffect, useRef, useState, memo } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";

interface GoogleMapsBaseProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
  className?: string;
  children?: React.ReactNode;
}

const GoogleMapsBase = memo(({ center, zoom = 15, onMapReady, className = "w-full h-full" }: GoogleMapsBaseProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const { isLoaded, error, mapId } = useGoogleMaps();

  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: center || { lat: 4.1755, lng: 73.5093 },
      zoom,
      mapId: mapId || undefined,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    mapInstance.current = map;
    onMapReady?.(map);

    return () => {
      mapInstance.current = null;
    };
  }, [isLoaded]);

  if (error) {
    return (
      <div className={`${className} flex items-center justify-center bg-muted`}>
        <p className="text-sm text-destructive">Failed to load Google Maps: {error}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={`${className} flex items-center justify-center bg-muted animate-pulse`}>
        <p className="text-xs text-muted-foreground">Loading Google Maps…</p>
      </div>
    );
  }

  return <div ref={mapRef} className={className} />;
});

GoogleMapsBase.displayName = "GoogleMapsBase";
export default GoogleMapsBase;
