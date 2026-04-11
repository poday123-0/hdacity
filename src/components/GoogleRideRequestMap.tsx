import { useEffect, useRef, memo } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";

interface GoogleRideRequestMapProps {
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  stops?: Array<{ lat?: number | null; lng?: number | null; stop_order: number }>;
  passengerMapIconUrl?: string | null;
}

const GoogleRideRequestMap = memo(({ pickupLat, pickupLng, dropoffLat, dropoffLng, stops = [], passengerMapIconUrl }: GoogleRideRequestMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const initialized = useRef(false);
  const { isLoaded, error, mapId } = useGoogleMaps();

  useEffect(() => {
    if (!isLoaded || !mapRef.current || initialized.current) return;

    const hasPickup = pickupLat != null && pickupLng != null;
    const hasDropoff = dropoffLat != null && dropoffLng != null;
    if (!hasPickup && !hasDropoff) return;

    initialized.current = true;

    const bounds = new google.maps.LatLngBounds();
    if (hasPickup) bounds.extend({ lat: pickupLat!, lng: pickupLng! });
    if (hasDropoff) bounds.extend({ lat: dropoffLat!, lng: dropoffLng! });
    stops.forEach(s => { if (s.lat != null && s.lng != null) bounds.extend({ lat: Number(s.lat), lng: Number(s.lng) }); });

    const map = new google.maps.Map(mapRef.current, {
      mapId: mapId || undefined,
      disableDefaultUI: true,
      zoomControl: true,
    });
    map.fitBounds(bounds, 40);
    mapInstance.current = map;

    // Pickup
    if (hasPickup) {
      new google.maps.Marker({
        position: { lat: pickupLat!, lng: pickupLng! },
        map,
        label: { text: "P", color: "white", fontWeight: "bold" },
        icon: passengerMapIconUrl
          ? { url: passengerMapIconUrl, scaledSize: new google.maps.Size(24, 24), anchor: new google.maps.Point(12, 12) }
          : { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: "#22c55e", fillOpacity: 1, strokeColor: "white", strokeWeight: 3 },
        zIndex: 1000,
      });
    }

    // Dropoff
    if (hasDropoff) {
      new google.maps.Marker({
        position: { lat: dropoffLat!, lng: dropoffLng! },
        map,
        label: { text: "D", color: "white", fontWeight: "bold" },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "white", strokeWeight: 3 },
        zIndex: 999,
      });
    }

    // Stop markers
    stops.forEach(s => {
      if (s.lat != null && s.lng != null) {
        new google.maps.Marker({
          position: { lat: Number(s.lat), lng: Number(s.lng) },
          map,
          label: { text: `${s.stop_order}`, color: "white", fontWeight: "bold", fontSize: "10px" },
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#f59e0b", fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
          zIndex: 998,
        });
      }
    });

    // Route via Directions API
    if (hasPickup && hasDropoff) {
      const directionsService = new google.maps.DirectionsService();
      const waypoints = stops
        .filter(s => s.lat != null && s.lng != null)
        .map(s => ({ location: { lat: Number(s.lat), lng: Number(s.lng) }, stopover: true }));

      directionsService.route({
        origin: { lat: pickupLat!, lng: pickupLng! },
        destination: { lat: dropoffLat!, lng: dropoffLng! },
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === "OK" && result && mapInstance.current) {
          new google.maps.DirectionsRenderer({
            map: mapInstance.current,
            directions: result,
            suppressMarkers: true,
            polylineOptions: { strokeColor: "#4285F4", strokeWeight: 4, strokeOpacity: 0.8 },
          });
        }
      });
    }

    return () => {
      mapInstance.current = null;
      initialized.current = false;
    };
  }, [isLoaded, pickupLat, pickupLng, dropoffLat, dropoffLng, passengerMapIconUrl]);

  if (error) return <div className="w-full h-full flex items-center justify-center bg-muted"><p className="text-sm text-destructive">Maps error</p></div>;
  if (!isLoaded) return <div className="w-full h-full flex items-center justify-center bg-muted animate-pulse"><p className="text-xs text-muted-foreground">Loading…</p></div>;

  return <div ref={mapRef} className="w-full h-full rounded-xl" />;
});

GoogleRideRequestMap.displayName = "GoogleRideRequestMap";
export default GoogleRideRequestMap;
