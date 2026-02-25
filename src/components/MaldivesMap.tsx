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
      mapId: "hda_map",
      styles: isDark ? darkMapStyle : [],
      gestureHandling: "greedy",
    });

    const userDot = document.createElement("div");
    userDot.innerHTML = `<div style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`;
    const userMarker = new g.maps.marker.AdvancedMarkerElement({
      map,
      position: userPos || MALE_CENTER,
      content: userDot,
      zIndex: 900,
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
    userMarkerRef.current.position = userPos;
    if (!rideData?.showRoute) {
      mapInstance.current.panTo(userPos);
    }
  }, [userPos, rideData?.showRoute]);

  // Ride markers & route
  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;

    rideMarkersRef.current.forEach((m: any) => { m.map = null; });
    rideMarkersRef.current = [];
    if (driverMarkerRef.current) { driverMarkerRef.current.map = null; driverMarkerRef.current = null; }
    if (directionsRendererRef.current) { directionsRendererRef.current.setMap(null); directionsRendererRef.current = null; }

    if (!rideData) return;
    const { pickup, dropoff, driverLat, driverLng, showRoute } = rideData;

    if (pickup) {
      const el = createMarkerEl("#22c55e", "P");
      const m = new g.maps.marker.AdvancedMarkerElement({ map, position: { lat: pickup.lat, lng: pickup.lng }, content: el, zIndex: 1000 });
      rideMarkersRef.current.push(m);
    }
    if (dropoff) {
      const el = createMarkerEl("#ef4444", "D");
      const m = new g.maps.marker.AdvancedMarkerElement({ map, position: { lat: dropoff.lat, lng: dropoff.lng }, content: el, zIndex: 1000 });
      rideMarkersRef.current.push(m);
    }
    if (driverLat != null && driverLng != null) {
      const el = createCarEl();
      driverMarkerRef.current = new g.maps.marker.AdvancedMarkerElement({ map, position: { lat: driverLat, lng: driverLng }, content: el, zIndex: 1100 });
    }

    if (showRoute && pickup && dropoff) {
      const ds = new g.maps.DirectionsService();
      const dr = new g.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        polylineOptions: { strokeColor: "#4285F4", strokeWeight: 5, strokeOpacity: 0.85 },
      });
      directionsRendererRef.current = dr;

      const waypoints = driverLat != null && driverLng != null
        ? [{ location: { lat: pickup.lat, lng: pickup.lng }, stopover: true }]
        : [];
      const origin = driverLat != null ? { lat: driverLat, lng: driverLng } : { lat: pickup.lat, lng: pickup.lng };
      const destination = { lat: dropoff.lat, lng: dropoff.lng };

      ds.route({
        origin,
        destination,
        waypoints,
        travelMode: g.maps.TravelMode.DRIVING,
      }).then((result: any) => {
        dr.setDirections(result);
      }).catch((err: any) => console.error("Directions error:", err));
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
    driverMarkerRef.current.position = { lat: rideData.driverLat, lng: rideData.driverLng };
  }, [rideData?.driverLat, rideData?.driverLng]);

  // Vehicle markers
  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;
    vehicleMarkersRef.current.forEach((m: any) => { m.map = null; });
    vehicleMarkersRef.current = [];
    if (rideData?.showRoute) return;

    if (vehicleMarkers && vehicleMarkers.length > 0) {
      vehicleMarkers.forEach(v => {
        const el = v.imageUrl ? createImageMarkerEl(v.imageUrl) : createCarEl();
        const m = new g.maps.marker.AdvancedMarkerElement({ map, position: { lat: v.lat, lng: v.lng }, content: el });
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

function createMarkerEl(color: string, letter: string) {
  const el = document.createElement("div");
  el.innerHTML = `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:700;">${letter}</div>`;
  return el;
}

function createCarEl() {
  const el = document.createElement("div");
  el.innerHTML = `<div style="width:28px;height:28px;border-radius:50%;background:#4285F4;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
  </div>`;
  return el;
}

function createImageMarkerEl(imageUrl: string) {
  const el = document.createElement("div");
  el.innerHTML = `<img src="${imageUrl}" style="width:30px;height:30px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));" />`;
  return el;
}

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
