import { useEffect, useRef, useState } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";

const MALE_CENTER = { lat: 4.1755, lng: 73.5093 };

interface RideMapData {
  pickup?: { lat: number; lng: number; name: string };
  dropoff?: { lat: number; lng: number; name: string };
  driverLat?: number;
  driverLng?: number;
  showRoute?: boolean;
}

interface VehicleMarkerData {
  id: string;
  lat: number;
  lng: number;
  name: string;
  imageUrl?: string;
  icon?: string;
}

interface MaldivesMapProps {
  rideData?: RideMapData;
  vehicleMarkers?: VehicleMarkerData[];
}

const MaldivesMap = ({ rideData, vehicleMarkers }: MaldivesMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const rideMarkersRef = useRef<any[]>([]);
  const driverMarkerRef = useRef<any>(null);
  const vehicleMarkersRef = useRef<any[]>([]);
  const directionsRendererRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const { isLoaded, error } = useGoogleMaps();

  // Track user location
  useEffect(() => {
    if (!navigator.geolocation) { setUserPos(MALE_CENTER); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserPos(MALE_CENTER),
      { enableHighAccuracy: true, timeout: 10000 }
    );
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // Init map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const isDark = document.documentElement.classList.contains("dark");

    const map = new g.maps.Map(mapRef.current, {
      center: userPos || MALE_CENTER,
      zoom: 15,
      disableDefaultUI: true,
      zoomControl: false,
      styles: isDark ? darkMapStyle : [],
      gestureHandling: "greedy",
    });

    const userMarker = new g.maps.Marker({
      map,
      position: userPos || MALE_CENTER,
      zIndex: 900,
      icon: {
        path: g.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#4285F4",
        fillOpacity: 1,
        strokeColor: "white",
        strokeWeight: 3,
      },
    });
    userMarkerRef.current = userMarker;
    mapInstance.current = map;

    return () => { mapInstance.current = null; };
  }, [isLoaded]);

  // Theme observer
  useEffect(() => {
    if (!mapInstance.current) return;
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      mapInstance.current?.setOptions({ styles: isDark ? darkMapStyle : [] });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [isLoaded]);

  // Update user marker
  useEffect(() => {
    if (!userPos || !userMarkerRef.current || !mapInstance.current) return;
    userMarkerRef.current.setPosition(userPos);
    if (!rideData?.showRoute) {
      mapInstance.current.panTo(userPos);
    }
  }, [userPos, rideData?.showRoute]);

  // Ride markers & route
  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;

    rideMarkersRef.current.forEach((m: any) => m.setMap(null));
    rideMarkersRef.current = [];
    if (driverMarkerRef.current) { driverMarkerRef.current.setMap(null); driverMarkerRef.current = null; }
    if (directionsRendererRef.current) { directionsRendererRef.current.setMap(null); directionsRendererRef.current = null; }

    if (!rideData) return;
    const { pickup, dropoff, driverLat, driverLng, showRoute } = rideData;

    if (pickup) {
      const m = new g.maps.Marker({
        map, position: { lat: pickup.lat, lng: pickup.lng }, zIndex: 1000,
        label: { text: "P", color: "white", fontWeight: "700", fontSize: "12px" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 14, fillColor: "#22c55e", fillOpacity: 1, strokeColor: "white", strokeWeight: 3 },
      });
      rideMarkersRef.current.push(m);
    }
    if (dropoff) {
      const m = new g.maps.Marker({
        map, position: { lat: dropoff.lat, lng: dropoff.lng }, zIndex: 1000,
        label: { text: "D", color: "white", fontWeight: "700", fontSize: "12px" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 14, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "white", strokeWeight: 3 },
      });
      rideMarkersRef.current.push(m);
    }
    if (driverLat != null && driverLng != null) {
      driverMarkerRef.current = new g.maps.Marker({
        map, position: { lat: driverLat, lng: driverLng }, zIndex: 1100,
        icon: { path: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
          scale: 0.9, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 2, anchor: new g.maps.Point(12, 12) },
      });
    }

    if (showRoute && pickup && dropoff) {
      const ds = new g.maps.DirectionsService();
      const dr = new g.maps.DirectionsRenderer({
        map, suppressMarkers: true,
        polylineOptions: { strokeColor: "#4285F4", strokeWeight: 5, strokeOpacity: 0.85 },
      });
      directionsRendererRef.current = dr;

      const waypoints = driverLat != null && driverLng != null
        ? [{ location: { lat: pickup.lat, lng: pickup.lng }, stopover: true }] : [];
      const origin = driverLat != null ? { lat: driverLat, lng: driverLng } : { lat: pickup.lat, lng: pickup.lng };

      ds.route({
        origin, destination: { lat: dropoff.lat, lng: dropoff.lng },
        waypoints, travelMode: g.maps.TravelMode.DRIVING,
      }).then((result: any) => dr.setDirections(result))
        .catch((err: any) => console.error("Directions error:", err));
    } else if (pickup && dropoff) {
      const bounds = new g.maps.LatLngBounds();
      bounds.extend({ lat: pickup.lat, lng: pickup.lng });
      bounds.extend({ lat: dropoff.lat, lng: dropoff.lng });
      if (driverLat != null && driverLng != null) bounds.extend({ lat: driverLat, lng: driverLng });
      map.fitBounds(bounds, 60);
    }
  }, [rideData?.pickup?.lat, rideData?.dropoff?.lat, rideData?.driverLat, rideData?.driverLng, rideData?.showRoute]);

  // Smooth driver marker update
  useEffect(() => {
    if (!driverMarkerRef.current || rideData?.driverLat == null || rideData?.driverLng == null) return;
    driverMarkerRef.current.setPosition({ lat: rideData.driverLat, lng: rideData.driverLng });
  }, [rideData?.driverLat, rideData?.driverLng]);

  // Vehicle markers
  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;
    vehicleMarkersRef.current.forEach((m: any) => m.setMap(null));
    vehicleMarkersRef.current = [];
    if (rideData?.showRoute) return;

    if (vehicleMarkers && vehicleMarkers.length > 0) {
      vehicleMarkers.forEach(v => {
        const markerOpts: any = {
          map, position: { lat: v.lat, lng: v.lng },
        };
        if (v.imageUrl) {
          markerOpts.icon = { url: v.imageUrl, scaledSize: new g.maps.Size(30, 30) };
        } else {
          markerOpts.icon = {
            path: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
            scale: 0.9, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 2, anchor: new g.maps.Point(12, 12),
          };
        }
        const m = new g.maps.Marker(markerOpts);
        vehicleMarkersRef.current.push(m);
      });
    }
  }, [vehicleMarkers, rideData?.showRoute]);

  if (error) {
    return <div className="w-full h-full bg-surface flex items-center justify-center text-muted-foreground text-sm">Map unavailable</div>;
  }
  if (!isLoaded) {
    return <div className="w-full h-full bg-surface flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
};

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#292929" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#383838" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#484848" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f2f2f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
];

export default MaldivesMap;
