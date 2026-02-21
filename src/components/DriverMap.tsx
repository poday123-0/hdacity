import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MALE_CENTER: [number, number] = [4.1755, 73.5093];

// Sample locations in Malé
const PICKUP_LOCATION: [number, number] = [4.1745, 73.5088]; // Majeedhee Magu
const DROPOFF_LOCATION: [number, number] = [4.1912, 73.5291]; // Velana Airport area

const driverIcon = L.divIcon({
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#40A3DB;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
  </div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  className: "",
});

const pickupIcon = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  className: "",
});

const dropoffIcon = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:7px;background:#ef4444;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  className: "",
});

interface DriverMapProps {
  isNavigating: boolean;
  radiusKm?: number;
}

const DriverMap = ({ isNavigating, radiusKm }: DriverMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const routeLayer = useRef<L.Polyline | null>(null);
  const radiusCircle = useRef<L.Circle | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: MALE_CENTER,
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    L.marker(MALE_CENTER, { icon: driverIcon })
      .addTo(map)
      .bindPopup("<b>Your location</b>");

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Draw route when navigating
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

    if (!isNavigating) return;

    // Add pickup & dropoff markers
    const pMarker = L.marker(PICKUP_LOCATION, { icon: pickupIcon })
      .addTo(map)
      .bindPopup("<b>Pickup</b><br/>Majeedhee Magu");
    const dMarker = L.marker(DROPOFF_LOCATION, { icon: dropoffIcon })
      .addTo(map)
      .bindPopup("<b>Dropoff</b><br/>Velana Airport");
    markersRef.current = [pMarker, dMarker];

    // Fetch route from OSRM
    const from = `${MALE_CENTER[1]},${MALE_CENTER[0]}`;
    const pickup = `${PICKUP_LOCATION[1]},${PICKUP_LOCATION[0]}`;
    const dropoff = `${DROPOFF_LOCATION[1]},${DROPOFF_LOCATION[0]}`;

    fetch(
      `https://router.project-osrm.org/route/v1/driving/${from};${pickup};${dropoff}?overview=full&geometries=geojson`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.routes && data.routes[0]) {
          const coords = data.routes[0].geometry.coordinates.map(
            (c: [number, number]) => [c[1], c[0]] as [number, number]
          );

          routeLayer.current = L.polyline(coords, {
            color: "#40A3DB",
            weight: 5,
            opacity: 0.8,
            dashArray: "10, 6",
          }).addTo(map);

          // Fit the map to the route
          map.fitBounds(routeLayer.current.getBounds(), { padding: [60, 60] });
        }
      })
      .catch((err) => console.error("OSRM route error:", err));
  }, [isNavigating]);

  // Radius circle
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (radiusCircle.current) {
      map.removeLayer(radiusCircle.current);
      radiusCircle.current = null;
    }

    if (radiusKm && radiusKm > 0 && !isNavigating) {
      radiusCircle.current = L.circle(MALE_CENTER, {
        radius: radiusKm * 1000,
        color: "#40A3DB",
        fillColor: "#40A3DB",
        fillOpacity: 0.08,
        weight: 2,
        dashArray: "6, 4",
        interactive: false,
      }).addTo(map);
    }
  }, [radiusKm, isNavigating]);

  return <div ref={mapRef} className="absolute inset-0 z-0" />;
};

export default DriverMap;
