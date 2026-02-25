import { useEffect, useRef, useState } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";

const MALE_CENTER = { lat: 4.1755, lng: 73.5093 };

interface DriverMapProps {
  isNavigating: boolean;
  radiusKm?: number;
  gpsEnabled: boolean;
  pickupCoords?: [number, number];
  dropoffCoords?: [number, number];
  pickupLabel?: string;
  dropoffLabel?: string;
  mapIconUrl?: string | null;
}

const DriverMap = ({ isNavigating, radiusKm, gpsEnabled, pickupCoords, dropoffCoords, pickupLabel, dropoffLabel, mapIconUrl }: DriverMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const rideMarkersRef = useRef<any[]>([]);
  const directionsRendererRef = useRef<any>(null);
  const radiusCircleRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const routeRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const { isLoaded, error } = useGoogleMaps();

  // Radius fade
  const radiusFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRadius, setShowRadius] = useState(false);
  const prevRadiusRef = useRef<number | undefined>(radiusKm);

  // Track GPS
  useEffect(() => {
    if (!navigator.geolocation) { setCurrentPos(MALE_CENTER); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setCurrentPos(MALE_CENTER),
      { enableHighAccuracy: true, timeout: 10000 }
    );
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000 }
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
      center: currentPos || MALE_CENTER,
      zoom: 16,
      disableDefaultUI: true,
      zoomControl: false,
      mapId: "hda_driver_map",
      styles: isDark ? darkMapStyle : [],
      gestureHandling: "greedy",
    });

    const el = mapIconUrl ? createImageMarkerEl(mapIconUrl) : createCarEl();
    const marker = new g.maps.marker.AdvancedMarkerElement({
      map,
      position: currentPos || MALE_CENTER,
      content: el,
      zIndex: 1000,
    });
    driverMarkerRef.current = marker;
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

  // Update driver marker position & icon
  useEffect(() => {
    if (!currentPos || !driverMarkerRef.current || !mapInstance.current) return;
    driverMarkerRef.current.position = currentPos;
    const el = mapIconUrl ? createImageMarkerEl(mapIconUrl) : createCarEl();
    driverMarkerRef.current.content = el;
    if (!isNavigating) {
      mapInstance.current.panTo(currentPos);
    }
  }, [currentPos, isNavigating, mapIconUrl]);

  // Route when navigating
  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;

    rideMarkersRef.current.forEach((m: any) => { m.map = null; });
    rideMarkersRef.current = [];
    if (directionsRendererRef.current) { directionsRendererRef.current.setMap(null); directionsRendererRef.current = null; }
    if (routeRefreshRef.current) { clearInterval(routeRefreshRef.current); routeRefreshRef.current = null; }

    if (!isNavigating) return;

    const driverPos = currentPos || MALE_CENTER;
    const pickup = pickupCoords ? { lat: pickupCoords[0], lng: pickupCoords[1] } : { lat: 4.1745, lng: 73.5088 };
    const dropoff = dropoffCoords ? { lat: dropoffCoords[0], lng: dropoffCoords[1] } : { lat: 4.1912, lng: 73.5291 };

    const pEl = createMarkerEl("#22c55e", "P");
    const pM = new g.maps.marker.AdvancedMarkerElement({ map, position: pickup, content: pEl, zIndex: 1000 });
    const dEl = createMarkerEl("#ef4444", "D");
    const dM = new g.maps.marker.AdvancedMarkerElement({ map, position: dropoff, content: dEl, zIndex: 1000 });
    rideMarkersRef.current = [pM, dM];

    const fetchRoute = () => {
      const ds = new g.maps.DirectionsService();
      const dr = new g.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        polylineOptions: { strokeColor: "#4285F4", strokeWeight: 5, strokeOpacity: 0.85 },
      });
      if (directionsRendererRef.current) directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = dr;

      ds.route({
        origin: currentPos || driverPos,
        destination: dropoff,
        waypoints: [{ location: pickup, stopover: true }],
        travelMode: g.maps.TravelMode.DRIVING,
      }).then((result: any) => {
        dr.setDirections(result);
      }).catch((err: any) => console.error("Directions error:", err));
    };

    fetchRoute();
    routeRefreshRef.current = setInterval(fetchRoute, 15000);

    return () => {
      if (routeRefreshRef.current) { clearInterval(routeRefreshRef.current); routeRefreshRef.current = null; }
    };
  }, [isNavigating, pickupCoords, dropoffCoords]);

  // Radius circle
  useEffect(() => {
    if (radiusKm !== prevRadiusRef.current) {
      setShowRadius(true);
      prevRadiusRef.current = radiusKm;
      if (radiusFadeTimer.current) clearTimeout(radiusFadeTimer.current);
      radiusFadeTimer.current = setTimeout(() => setShowRadius(false), 2000);
    }
    return () => { if (radiusFadeTimer.current) clearTimeout(radiusFadeTimer.current); };
  }, [radiusKm]);

  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;

    if (radiusCircleRef.current) { radiusCircleRef.current.setMap(null); radiusCircleRef.current = null; }

    if (radiusKm && radiusKm > 0 && !isNavigating && showRadius) {
      const center = currentPos || MALE_CENTER;
      radiusCircleRef.current = new g.maps.Circle({
        map,
        center,
        radius: radiusKm * 1000,
        strokeColor: "#4285F4",
        strokeWeight: 2,
        strokeOpacity: 0.6,
        fillColor: "#4285F4",
        fillOpacity: 0.08,
      });
    }
  }, [radiusKm, isNavigating, currentPos, showRadius]);

  if (error) {
    return <div className="absolute inset-0 bg-surface flex items-center justify-center text-muted-foreground text-sm">Map unavailable</div>;
  }
  if (!isLoaded) {
    return <div className="absolute inset-0 bg-surface flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return <div ref={mapRef} className="absolute inset-0 z-0" />;
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

export default DriverMap;
