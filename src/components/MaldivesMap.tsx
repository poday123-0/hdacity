import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const MALE_CENTER: [number, number] = [4.1755, 73.5093];

const userIcon = L.divIcon({
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#40A3DB;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  className: "",
});

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
    <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
  </div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  className: "",
});

const driverCarIcon = L.divIcon({
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#40A3DB;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  className: "",
});

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

const createVehicleMapIcon = (imageUrl?: string, name?: string) => {
  if (imageUrl) {
    return L.divIcon({
      html: `<div style="width:36px;height:36px;border-radius:50%;background:white;border:2px solid #40A3DB;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;overflow:hidden;">
        <img src="${imageUrl}" style="width:26px;height:26px;object-fit:contain;" alt="${name || ''}" />
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      className: "",
    });
  }
  return driverCarIcon;
};

const MaldivesMap = ({ rideData, vehicleMarkers }: MaldivesMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const rideMarkersRef = useRef<L.Marker[]>([]);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const vehicleMarkersRef = useRef<L.Marker[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);

  // Track user's real location
  useEffect(() => {
    if (!navigator.geolocation) {
      setUserPos(MALE_CENTER);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => setUserPos(MALE_CENTER),
      { enableHighAccuracy: true, timeout: 10000 }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: userPos || MALE_CENTER,
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    // User location marker
    const marker = L.marker(userPos || MALE_CENTER, { icon: userIcon })
      .addTo(map)
      .bindPopup("<b>Your location</b><br/>Malé, Maldives");
    userMarkerRef.current = marker;

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Update user marker position
  useEffect(() => {
    if (!userPos || !userMarkerRef.current || !mapInstance.current) return;
    userMarkerRef.current.setLatLng(userPos);
    // Only re-center if no ride is active
    if (!rideData?.showRoute) {
      mapInstance.current.setView(userPos, mapInstance.current.getZoom(), { animate: true });
    }
  }, [userPos, rideData?.showRoute]);

  // Ride markers, driver icon & route
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear previous ride markers
    rideMarkersRef.current.forEach((m) => { try { map.removeLayer(m); } catch {} });
    rideMarkersRef.current = [];
    if (driverMarkerRef.current) {
      try { map.removeLayer(driverMarkerRef.current); } catch {}
      driverMarkerRef.current = null;
    }
    if (routeLayerRef.current) {
      try { map.removeLayer(routeLayerRef.current); } catch {}
      routeLayerRef.current = null;
    }

    if (!rideData) return;

    const { pickup, dropoff, driverLat, driverLng, showRoute } = rideData;

    // Add pickup marker
    if (pickup) {
      const pm = L.marker([pickup.lat, pickup.lng], { icon: pickupIcon })
        .addTo(map)
        .bindPopup(`<b>Pickup</b><br/>${pickup.name}`);
      rideMarkersRef.current.push(pm);
    }

    // Add dropoff marker
    if (dropoff) {
      const dm = L.marker([dropoff.lat, dropoff.lng], { icon: dropoffIcon })
        .addTo(map)
        .bindPopup(`<b>Dropoff</b><br/>${dropoff.name}`);
      rideMarkersRef.current.push(dm);
    }

    // Add driver car icon
    if (driverLat != null && driverLng != null) {
      driverMarkerRef.current = L.marker([driverLat, driverLng], { icon: driverCarIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup("<b>Driver</b>");
    }

    // Draw route
    if (showRoute && pickup && dropoff) {
      const driverPos = driverLat != null && driverLng != null
        ? `${driverLng},${driverLat}`
        : null;
      const p = `${pickup.lng},${pickup.lat}`;
      const d = `${dropoff.lng},${dropoff.lat}`;
      const waypoints = driverPos ? `${driverPos};${p};${d}` : `${p};${d}`;

      fetch(`https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`)
        .then((res) => res.json())
        .then((data) => {
          if (data.routes && data.routes[0]) {
            const coords = data.routes[0].geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]] as [number, number]
            );
            routeLayerRef.current = L.polyline(coords, {
              color: "#40A3DB",
              weight: 5,
              opacity: 0.85,
              dashArray: "10, 6",
            }).addTo(map);

            map.fitBounds(routeLayerRef.current.getBounds(), { padding: [60, 60] });
          }
        })
        .catch((err) => console.error("OSRM route error:", err));
    } else if (pickup && dropoff) {
      // Fit to pickup + dropoff without route
      const bounds = L.latLngBounds([pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]);
      if (driverLat != null && driverLng != null) bounds.extend([driverLat, driverLng]);
      map.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [rideData?.pickup?.lat, rideData?.dropoff?.lat, rideData?.driverLat, rideData?.driverLng, rideData?.showRoute]);

  // Smoothly update driver marker position without full re-render
  useEffect(() => {
    if (!driverMarkerRef.current || rideData?.driverLat == null || rideData?.driverLng == null) return;
    driverMarkerRef.current.setLatLng([rideData.driverLat, rideData.driverLng]);
  }, [rideData?.driverLat, rideData?.driverLng]);

  // Vehicle type markers on the map
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear old vehicle markers
    vehicleMarkersRef.current.forEach((m) => { try { map.removeLayer(m); } catch {} });
    vehicleMarkersRef.current = [];

    // Don't show during active ride
    if (rideData?.showRoute) return;

    if (vehicleMarkers && vehicleMarkers.length > 0) {
      vehicleMarkers.forEach((v) => {
        const icon = createVehicleMapIcon(v.imageUrl, v.name);
        const m = L.marker([v.lat, v.lng], { icon })
          .addTo(map)
          .bindPopup(`<b>${v.name}</b>`);
        vehicleMarkersRef.current.push(m);
      });
    }
  }, [vehicleMarkers, rideData?.showRoute]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
};

export default MaldivesMap;
