import { useEffect, useRef, memo, useCallback } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { selectShortestRoute } from "@/lib/shortest-route";

interface RideRequestMapProps {
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  stops?: Array<{ lat?: number | null; lng?: number | null; stop_order: number }>;
  passengerMapIconUrl?: string | null;
}

const RideRequestMap = memo(({ pickupLat, pickupLng, dropoffLat, dropoffLng, stops = [], passengerMapIconUrl }: RideRequestMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const initialized = useRef(false);
  const { isLoaded } = useGoogleMaps();

  const initMap = useCallback(() => {
    if (!isLoaded || !mapRef.current || initialized.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    initialized.current = true;
    const isDark = document.documentElement.classList.contains("dark");

    const bounds = new g.maps.LatLngBounds();
    const hasPickup = pickupLat != null && pickupLng != null;
    const hasDropoff = dropoffLat != null && dropoffLng != null;

    if (!hasPickup && !hasDropoff) return;

    if (hasPickup) bounds.extend({ lat: pickupLat, lng: pickupLng });
    if (hasDropoff) bounds.extend({ lat: dropoffLat, lng: dropoffLng });
    stops.forEach(s => {
      if (s.lat != null && s.lng != null) bounds.extend({ lat: Number(s.lat), lng: Number(s.lng) });
    });

    const map = new g.maps.Map(mapRef.current, {
      center: bounds.getCenter(),
      zoom: 14,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "greedy",
      styles: isDark ? darkStyle : [],
    });

    map.fitBounds(bounds, 40);
    mapInstance.current = map;

    // Pickup marker
    if (hasPickup) {
      const markerOpts: any = {
        map,
        position: { lat: pickupLat, lng: pickupLng },
        zIndex: 1000,
      };
      if (passengerMapIconUrl) {
        markerOpts.icon = { url: passengerMapIconUrl, scaledSize: new g.maps.Size(24, 24) };
      } else {
        markerOpts.label = { text: "P", color: "white", fontWeight: "700", fontSize: "11px" };
        markerOpts.icon = { path: g.maps.SymbolPath.CIRCLE, scale: 14, fillColor: "#22c55e", fillOpacity: 1, strokeColor: "white", strokeWeight: 3 };
      }
      new g.maps.Marker(markerOpts);
    }

    // Drop-off marker
    if (hasDropoff) {
      new g.maps.Marker({
        map,
        position: { lat: dropoffLat, lng: dropoffLng },
        zIndex: 999,
        label: { text: "D", color: "white", fontWeight: "700", fontSize: "11px" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 14, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "white", strokeWeight: 3 },
      });
    }

    // Stop markers
    stops.forEach(s => {
      if (s.lat != null && s.lng != null) {
        new g.maps.Marker({
          map,
          position: { lat: Number(s.lat), lng: Number(s.lng) },
          zIndex: 998,
          label: { text: `${s.stop_order}`, color: "white", fontWeight: "700", fontSize: "10px" },
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#f59e0b", fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
        });
      }
    });

    // Draw route line
    if (hasPickup && hasDropoff) {
      const ds = new g.maps.DirectionsService();
      const waypoints = stops
        .filter(s => s.lat != null && s.lng != null)
        .map(s => ({ location: { lat: Number(s.lat), lng: Number(s.lng) }, stopover: true }));

      ds.route({
        origin: { lat: pickupLat, lng: pickupLng },
        destination: { lat: dropoffLat, lng: dropoffLng },
        waypoints,
        travelMode: g.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
      }).then((raw: any) => {
        const result = selectShortestRoute(raw);
        if (mapInstance.current) {
          new g.maps.DirectionsRenderer({
            map: mapInstance.current,
            directions: result,
            suppressMarkers: true,
            suppressInfoWindows: true,
            preserveViewport: true,
            polylineOptions: { strokeColor: "#4285F4", strokeWeight: 4, strokeOpacity: 0.8 },
          });
        }
      }).catch(() => {});
    }
  }, [isLoaded, pickupLat, pickupLng, dropoffLat, dropoffLng, passengerMapIconUrl]);

  useEffect(() => {
    initMap();
    return () => {
      mapInstance.current = null;
      initialized.current = false;
    };
  }, [initMap]);

  // Theme change observer
  useEffect(() => {
    if (!mapInstance.current) return;
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      const g = (window as any).google;
      const colorScheme = g?.maps?.ColorScheme;
      if (colorScheme) {
        mapInstance.current?.setOptions({ colorScheme: isDark ? colorScheme.DARK : colorScheme.LIGHT });
      }
      mapInstance.current?.setOptions({ styles: isDark ? darkStyle : [] });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [isLoaded]);

  if (!isLoaded) {
    return <div className="w-full h-full bg-surface animate-pulse rounded-xl" />;
  }

  return <div ref={mapRef} className="w-full h-full rounded-xl" />;
});

RideRequestMap.displayName = "RideRequestMap";

const darkStyle = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#b0b0c0" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2a2a3e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a2b" }] },
];

export default RideRequestMap;
