import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MALE_CENTER: [number, number] = [4.1755, 73.5093];

const createCarIcon = (color: string, size: number = 22) =>
  L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
      <svg width="${size * 0.55}" height="${size * 0.55}" viewBox="0 0 24 24" fill="white"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    className: "",
  });

const driverIcon = createCarIcon("#40A3DB", 28);

const pickupIcon = L.divIcon({
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
  </div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: "",
});

const dropoffIcon = L.divIcon({
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M5 11l1.5-4.5h11L19 11H5zm12.5 5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm-11 0c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zM18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99z"/></svg>
  </div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: "",
});

// Default sample locations (used when no trip coords provided)
const DEFAULT_PICKUP: [number, number] = [4.1745, 73.5088];
const DEFAULT_DROPOFF: [number, number] = [4.1912, 73.5291];

interface DriverMapProps {
  isNavigating: boolean;
  radiusKm?: number;
  gpsEnabled: boolean;
  pickupCoords?: [number, number];
  dropoffCoords?: [number, number];
  pickupLabel?: string;
  dropoffLabel?: string;
}

const DriverMap = ({ isNavigating, radiusKm, gpsEnabled, pickupCoords, dropoffCoords, pickupLabel, dropoffLabel }: DriverMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const routeLayer = useRef<L.Polyline | null>(null);
  const radiusCircle = useRef<L.Circle | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const routeRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentPos, setCurrentPos] = useState<[number, number] | null>(null);

  // Always track GPS — gpsEnabled just controls whether map re-centers
  useEffect(() => {
    if (!navigator.geolocation) {
      setCurrentPos(MALE_CENTER);
      return;
    }

    // Get initial position immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => setCurrentPos([pos.coords.latitude, pos.coords.longitude]),
      () => setCurrentPos(MALE_CENTER),
      { enableHighAccuracy: true, timeout: 10000 }
    );

    // Always watch for live updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setCurrentPos([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: currentPos || MALE_CENTER,
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    // Driver marker
    const marker = L.marker(currentPos || MALE_CENTER, { icon: driverIcon, zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup("<b>Your location</b>");
    driverMarkerRef.current = marker;

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Update driver marker position in real-time
  useEffect(() => {
    if (!currentPos || !driverMarkerRef.current || !mapInstance.current) return;
    driverMarkerRef.current.setLatLng(currentPos);
    // Only re-center if not navigating (navigating uses fitBounds)
    if (!isNavigating) {
      mapInstance.current.setView(currentPos, mapInstance.current.getZoom(), { animate: true });
    }
  }, [currentPos, isNavigating]);

  // Fetch route helper
  const fetchRoute = (map: L.Map, driverPos: [number, number], pickup: [number, number], dropoff: [number, number], fitBounds: boolean) => {
    const from = `${driverPos[1]},${driverPos[0]}`;
    const p = `${pickup[1]},${pickup[0]}`;
    const d = `${dropoff[1]},${dropoff[0]}`;

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${from};${p};${d}?overview=full&geometries=geojson`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.routes && data.routes[0]) {
          // Remove old route line
          if (routeLayer.current) {
            try { map.removeLayer(routeLayer.current); } catch {}
          }

          const coords = data.routes[0].geometry.coordinates.map(
            (c: [number, number]) => [c[1], c[0]] as [number, number]
          );

          routeLayer.current = L.polyline(coords, {
            color: "#40A3DB",
            weight: 5,
            opacity: 0.85,
            dashArray: "10, 6",
          }).addTo(map);

          if (fitBounds) {
            map.fitBounds(routeLayer.current.getBounds(), { padding: [60, 60] });
          }
        }
      })
      .catch((err) => console.error("OSRM route error:", err));
  };

  // Draw route when navigating + live refresh every 10s
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear previous route and markers
    if (routeLayer.current) {
      map.removeLayer(routeLayer.current);
      routeLayer.current = null;
    }
    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];
    if (routeRefreshRef.current) {
      clearInterval(routeRefreshRef.current);
      routeRefreshRef.current = null;
    }

    if (!isNavigating) return;

    const driverPos = currentPos || MALE_CENTER;
    const pickup = pickupCoords || DEFAULT_PICKUP;
    const dropoff = dropoffCoords || DEFAULT_DROPOFF;

    // Add pickup & dropoff markers with vehicle icons
    const pMarker = L.marker(pickup, { icon: pickupIcon })
      .addTo(map)
      .bindPopup(`<b>Pickup</b><br/>${pickupLabel || "Pickup location"}`);
    const dMarker = L.marker(dropoff, { icon: dropoffIcon })
      .addTo(map)
      .bindPopup(`<b>Dropoff</b><br/>${dropoffLabel || "Dropoff location"}`);
    markersRef.current = [pMarker, dMarker];

    // Initial route fetch
    fetchRoute(map, driverPos, pickup, dropoff, true);

    // Live refresh route every 10 seconds while navigating
    routeRefreshRef.current = setInterval(() => {
      const pos = currentPos || MALE_CENTER;
      fetchRoute(map, pos, pickup, dropoff, false);
    }, 10000);

    return () => {
      if (routeRefreshRef.current) {
        clearInterval(routeRefreshRef.current);
        routeRefreshRef.current = null;
      }
    };
  }, [isNavigating, pickupCoords, dropoffCoords]);

  // Radius circle with animated fade-out after setting
  const radiusFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRadius, setShowRadius] = useState(false);
  const prevRadiusRef = useRef<number | undefined>(radiusKm);

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
    if (!map) return;

    // Fade out existing circle
    if (!showRadius && radiusCircle.current) {
      const el = radiusCircle.current.getElement() as HTMLElement | null;
      const circle = radiusCircle.current;
      if (el) {
        el.style.transition = "opacity 0.6s ease-out";
        el.style.opacity = "0";
        setTimeout(() => {
          if (map && circle) { try { map.removeLayer(circle); } catch {} }
          if (radiusCircle.current === circle) radiusCircle.current = null;
        }, 600);
      } else {
        map.removeLayer(circle);
        radiusCircle.current = null;
      }
      return;
    }

    // Remove old and draw new
    if (radiusCircle.current) {
      map.removeLayer(radiusCircle.current);
      radiusCircle.current = null;
    }

    const center = currentPos || MALE_CENTER;

    if (radiusKm && radiusKm > 0 && !isNavigating && showRadius) {
      radiusCircle.current = L.circle(center, {
        radius: radiusKm * 1000,
        color: "#40A3DB",
        fillColor: "#40A3DB",
        fillOpacity: 0.08,
        weight: 2,
        dashArray: "6, 4",
        interactive: false,
      }).addTo(map);

      // Fade in
      const el = radiusCircle.current.getElement() as HTMLElement | null;
      if (el) {
        el.style.opacity = "0";
        el.style.transition = "opacity 0.4s ease-in";
        requestAnimationFrame(() => { el.style.opacity = "1"; });
      }
    }
  }, [radiusKm, isNavigating, currentPos, showRadius]);

  return <div ref={mapRef} className="absolute inset-0 z-0" />;
};

export default DriverMap;
