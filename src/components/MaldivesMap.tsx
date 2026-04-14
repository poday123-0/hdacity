import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchOsrmRoute, pickShortestOsrmRoute } from "@/lib/osrm-routing";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllNamedLocations } from "@/lib/fetch-all-locations";

interface RideMapData {
  pickup?: { lat: number; lng: number; name: string };
  dropoff?: { lat: number; lng: number; name: string };
  driverLat?: number;
  driverLng?: number;
  driverIconUrl?: string | null;
  showRoute?: boolean;
}

interface VehicleMarkerData {
  id: string;
  lat: number;
  lng: number;
  name: string;
  imageUrl?: string;
  icon?: string;
  isOnTrip?: boolean;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  plate?: string;
  centerCode?: string;
  vehicleInfo?: string;
  heading?: number | null;
}

interface TripRouteData {
  id: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  pickupAddress: string;
  dropoffAddress: string;
  driverName?: string;
  status: string;
}

interface MaldivesMapProps {
  rideData?: RideMapData;
  vehicleMarkers?: VehicleMarkerData[];
  tripRoutes?: TripRouteData[];
  onMapClick?: (lat: number, lng: number) => void;
  onMapReady?: (map: L.Map) => void;
}

// Helper: create a circle-based divIcon
const circleIcon = (color: string, label: string, size = 28) => {
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${label}</div>`,
  });
};

const userDotIcon = L.divIcon({
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
});

const vehicleIcon = (imageUrl?: string, heading?: number | null) => {
  const rotation = typeof heading === "number" ? `transform:rotate(${heading}deg)` : "";
  if (imageUrl) {
    return L.divIcon({
      className: "",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      html: `<img src="${imageUrl}" style="width:28px;height:28px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2));${rotation}" crossorigin="anonymous" />`,
    });
  }
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:18px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));${rotation}">🚗</div>`,
  });
};

const driverIcon = (iconUrl?: string | null) => {
  if (iconUrl) {
    return L.divIcon({
      className: "",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      html: `<img src="${iconUrl}" style="width:36px;height:36px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2))" crossorigin="anonymous" />`,
    });
  }
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:20px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">🚕</div>`,
  });
};

// Tile URLs
const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const MaldivesMap = ({ rideData, vehicleMarkers, tripRoutes, onMapClick, onMapReady }: MaldivesMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const rideMarkersRef = useRef<L.Marker[]>([]);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const vehicleMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const tripPolylinesRef = useRef<L.Polyline[]>([]);
  const tripMarkersRef = useRef<L.Marker[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const didInitialFitRef = useRef(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [themeTransition, setThemeTransition] = useState(false);

  const rideDataRef = useRef(rideData);
  rideDataRef.current = rideData;
  const tripRoutesRef = useRef(tripRoutes);
  tripRoutesRef.current = tripRoutes;

  // Track user location
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 15000 }
    );
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 60000 }
    );
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // Compute initial center
  const initialCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  if (!initialCenterRef.current) {
    initialCenterRef.current = userPos
      || (rideData?.pickup ? { lat: rideData.pickup.lat, lng: rideData.pickup.lng } : null)
      || (tripRoutes && tripRoutes.length > 0 ? { lat: tripRoutes[0].pickupLat, lng: tripRoutes[0].pickupLng } : null)
      || (vehicleMarkers && vehicleMarkers.length > 0 ? { lat: vehicleMarkers[0].lat, lng: vehicleMarkers[0].lng } : null);
  }
  if (!initialCenterRef.current && userPos) initialCenterRef.current = userPos;
  if (!initialCenterRef.current && rideData?.pickup) initialCenterRef.current = { lat: rideData.pickup.lat, lng: rideData.pickup.lng };

  // Init map — only once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const center = initialCenterRef.current || { lat: 4.1755, lng: 73.5093 };
    const isDark = document.documentElement.classList.contains("dark");

    const map = L.map(mapRef.current, {
      center: [center.lat, center.lng],
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
    });

    const removeLeafletAttribution = () => {
      try { map.attributionControl?.setPrefix(false); } catch {}
      try { map.attributionControl?.remove(); } catch {}
      const container = map.getContainer();
      container.querySelectorAll(".leaflet-control-attribution").forEach((node) => node.remove());
      container.querySelectorAll(".leaflet-bottom").forEach((node) => {
        (node as HTMLElement).style.display = "none";
      });
    };

    const tileUrl = isDark ? DARK_TILES : LIGHT_TILES;
    const tileLayer = L.tileLayer(tileUrl, { attribution: "", maxZoom: 19 }).addTo(map);
    tileLayerRef.current = tileLayer;
    removeLeafletAttribution();

    const attributionObserver = new MutationObserver(() => {
      removeLeafletAttribution();
    });
    attributionObserver.observe(map.getContainer(), { childList: true, subtree: true });

    // User marker
    const userMarker = L.marker([center.lat, center.lng], { icon: userDotIcon, zIndexOffset: 900 }).addTo(map);
    userMarkerRef.current = userMarker;

    mapInstance.current = map;
    onMapReady?.(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      window.dispatchEvent(new CustomEvent("map-tap", { detail: { lat: e.latlng.lat, lng: e.latlng.lng } }));
    });

    return () => {
      attributionObserver.disconnect();
      map.remove();
      mapInstance.current = null;
    };
  }, [!!initialCenterRef.current]);

  // Named location labels on map
  const namedLabelsRef = useRef<L.Marker[]>([]);
  const namedLocationsRef = useRef<any[]>([]);
  useEffect(() => {
    fetchAllNamedLocations("name, lat, lng")
      .then((data) => { namedLocationsRef.current = data; });
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    const updateLabels = () => {
      namedLabelsRef.current.forEach(m => map.removeLayer(m));
      namedLabelsRef.current = [];
      const zoom = map.getZoom();
      if (zoom < 17 || namedLocationsRef.current.length === 0) return;
      const bounds = map.getBounds();
      const visible = namedLocationsRef.current.filter(l => bounds.contains([Number(l.lat), Number(l.lng)])).slice(0, 60);
      const isDark = document.documentElement.classList.contains("dark");
      visible.forEach(l => {
        const label = l.name.length > 20 ? l.name.slice(0, 18) + "…" : l.name;
        const icon = L.divIcon({
          className: "",
          iconSize: [0, 0],
          iconAnchor: [0, -4],
          html: `<div style="white-space:nowrap;font-size:10px;font-weight:600;color:${isDark ? '#93c5fd' : '#1d4ed8'};text-shadow:${isDark ? '0 0 3px rgba(0,0,0,0.8)' : '0 0 3px rgba(255,255,255,0.9),0 0 3px rgba(255,255,255,0.9)'};pointer-events:none;transform:translateX(-50%)">${label}</div>`,
        });
        const m = L.marker([Number(l.lat), Number(l.lng)], { icon, interactive: false, zIndexOffset: -100 }).addTo(map);
        namedLabelsRef.current.push(m);
      });
    };

    updateLabels();
    map.on("moveend", updateLabels);
    map.on("zoomend", updateLabels);
    return () => {
      map.off("moveend", updateLabels);
      map.off("zoomend", updateLabels);
      namedLabelsRef.current.forEach(m => map.removeLayer(m));
      namedLabelsRef.current = [];
    };
  }, [!!mapInstance.current]);

  // Theme observer
  useEffect(() => {
    if (!mapInstance.current) return;
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      setThemeTransition(true);
      t1 = setTimeout(() => {
        const isDark = document.documentElement.classList.contains("dark");
        const newUrl = isDark ? DARK_TILES : LIGHT_TILES;
        if (tileLayerRef.current && mapInstance.current) {
          tileLayerRef.current.setUrl(newUrl);
        }
        t2 = setTimeout(() => setThemeTransition(false), 500);
      }, 50);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { observer.disconnect(); clearTimeout(t1); clearTimeout(t2); };
  }, [!!mapInstance.current]);

  // Update user marker position
  useEffect(() => {
    if (!userPos || !userMarkerRef.current || !mapInstance.current) return;
    userMarkerRef.current.setLatLng([userPos.lat, userPos.lng]);
    if (!didInitialFitRef.current && !rideData?.pickup && !tripRoutes?.length && !vehicleMarkers?.length) {
      didInitialFitRef.current = true;
      mapInstance.current.panTo([userPos.lat, userPos.lng]);
    }
  }, [userPos]);

  // Ride markers & route
  const prevRideKeyRef = useRef("");
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    const rd = rideData;
    const rideKey = rd ? `${rd.pickup?.lat},${rd.pickup?.lng}-${rd.dropoff?.lat},${rd.dropoff?.lng}-${rd.showRoute}` : "";

    // Just update driver position smoothly if ride identity hasn't changed
    if (rideKey === prevRideKeyRef.current && driverMarkerRef.current) {
      if (rd?.driverLat != null && rd?.driverLng != null) {
        driverMarkerRef.current.setLatLng([rd.driverLat, rd.driverLng]);
      }
      return;
    }
    prevRideKeyRef.current = rideKey;

    // Clean up old markers
    rideMarkersRef.current.forEach(m => map.removeLayer(m));
    rideMarkersRef.current = [];
    if (driverMarkerRef.current) { map.removeLayer(driverMarkerRef.current); driverMarkerRef.current = null; }
    if (routePolylineRef.current) { map.removeLayer(routePolylineRef.current); routePolylineRef.current = null; }

    if (!rd) return;
    const { pickup, dropoff, driverLat, driverLng, showRoute } = rd;

    if (pickup) {
      const m = L.marker([pickup.lat, pickup.lng], { icon: circleIcon("#22c55e", "P"), zIndexOffset: 1000 }).addTo(map);
      rideMarkersRef.current.push(m);
    }
    if (dropoff) {
      const m = L.marker([dropoff.lat, dropoff.lng], { icon: circleIcon("#ef4444", "D"), zIndexOffset: 1000 }).addTo(map);
      rideMarkersRef.current.push(m);
    }
    if (driverLat != null && driverLng != null) {
      driverMarkerRef.current = L.marker([driverLat, driverLng], {
        icon: driverIcon(rd.driverIconUrl),
        zIndexOffset: 1100,
      }).addTo(map);
    }

    if (showRoute && pickup && dropoff) {
      const origin = driverLat != null && driverLng != null ? { lat: driverLat, lng: driverLng } : { lat: pickup.lat, lng: pickup.lng };
      const waypoints = driverLat != null && driverLng != null ? [{ lat: pickup.lat, lng: pickup.lng }] : [];

      fetchOsrmRoute(origin, { lat: dropoff.lat, lng: dropoff.lng }, waypoints, true)
        .then(routes => {
          if (!mapInstance.current) return;
          const best = pickShortestOsrmRoute(routes);
          const latlngs = best.coordinates.map(c => [c[0], c[1]] as [number, number]);
          routePolylineRef.current = L.polyline(latlngs, {
            color: "#4285F4",
            weight: 5,
            opacity: 0.85,
          }).addTo(mapInstance.current);

          if (!didInitialFitRef.current) {
            didInitialFitRef.current = true;
            const bounds = L.latLngBounds([
              [pickup.lat, pickup.lng],
              [dropoff.lat, dropoff.lng],
            ]);
            if (driverLat != null && driverLng != null) bounds.extend([driverLat, driverLng]);
            map.fitBounds(bounds, { padding: [60, 60] });
          }
        })
        .catch(err => console.error("OSRM route error:", err));
    } else if (pickup && dropoff && !didInitialFitRef.current) {
      didInitialFitRef.current = true;
      const bounds = L.latLngBounds([
        [pickup.lat, pickup.lng],
        [dropoff.lat, dropoff.lng],
      ]);
      if (driverLat != null && driverLng != null) bounds.extend([driverLat, driverLng]);
      map.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [rideData?.pickup?.lat, rideData?.dropoff?.lat, rideData?.driverLat, rideData?.driverLng, rideData?.driverIconUrl, rideData?.showRoute]);

  // Driver icon update
  useEffect(() => {
    if (!driverMarkerRef.current || !rideData?.driverIconUrl) return;
    driverMarkerRef.current.setIcon(driverIcon(rideData.driverIconUrl));
  }, [rideData?.driverIconUrl]);

  // Vehicle markers
  const vehicleIdsKey = (vehicleMarkers || []).map(v => v.id).sort().join(",");

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (rideDataRef.current?.showRoute) {
      vehicleMarkersRef.current.forEach(m => map.removeLayer(m));
      vehicleMarkersRef.current.clear();
      return;
    }

    const markers = vehicleMarkers;
    if (!markers || markers.length === 0) {
      vehicleMarkersRef.current.forEach(m => map.removeLayer(m));
      vehicleMarkersRef.current.clear();
      return;
    }

    const newIds = new Set(markers.map(v => v.id || `${v.lat},${v.lng}`));

    // Remove markers no longer present
    vehicleMarkersRef.current.forEach((marker, id) => {
      if (!newIds.has(id)) {
        map.removeLayer(marker);
        vehicleMarkersRef.current.delete(id);
      }
    });

    // Add/update markers
    markers.forEach(v => {
      const vid = v.id || `${v.lat},${v.lng}`;
      const existing = vehicleMarkersRef.current.get(vid);

      if (existing) {
        existing.setLatLng([v.lat, v.lng]);
        existing.setIcon(vehicleIcon(v.imageUrl, v.heading));
      } else {
        const marker = L.marker([v.lat, v.lng], {
          icon: vehicleIcon(v.imageUrl, v.heading),
          zIndexOffset: 500,
        }).addTo(map);

        // Build info popup
        const lines: string[] = [];
        if (v.driverName) lines.push(`<strong>${v.driverName}</strong>`);
        if (v.driverPhone) lines.push(`📞 ${v.driverPhone}`);
        if (v.centerCode) lines.push(`🏷️ ${v.centerCode}`);
        if (v.plate) lines.push(`🚗 ${v.plate}`);
        if (v.vehicleInfo) lines.push(`<span style="color:#999">${v.vehicleInfo}</span>`);
        if (v.name) lines.push(`<span style="color:#999">${v.name}</span>`);
        lines.push(`<span style="color:${v.isOnTrip ? '#f59e0b' : '#22c55e'};font-weight:600">${v.isOnTrip ? '● On Trip' : '● Available'}</span>`);

        marker.bindPopup(`<div style="font-size:12px;min-width:120px">${lines.join("<br/>")}</div>`);
        vehicleMarkersRef.current.set(vid, marker);
      }
    });
  }, [vehicleIdsKey, rideData?.showRoute]);

  // Smoothly update vehicle positions
  useEffect(() => {
    if (!vehicleMarkers) return;
    vehicleMarkers.forEach(v => {
      const vid = v.id || `${v.lat},${v.lng}`;
      const marker = vehicleMarkersRef.current.get(vid);
      if (marker) marker.setLatLng([v.lat, v.lng]);
    });
  }, [vehicleMarkers]);

  // Trip routes
  const prevTripIdsRef = useRef("");
  const tripIdsKey = (tripRoutes || []).map(t => t.id).sort().join(",");

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (tripIdsKey === prevTripIdsRef.current && tripPolylinesRef.current.length > 0) return;
    prevTripIdsRef.current = tripIdsKey;

    // Clear previous
    tripPolylinesRef.current.forEach(p => map.removeLayer(p));
    tripPolylinesRef.current = [];
    tripMarkersRef.current.forEach(m => map.removeLayer(m));
    tripMarkersRef.current = [];

    const routes = tripRoutesRef.current;
    if (!routes || routes.length === 0) return;

    routes.forEach(trip => {
      const pickupM = L.marker([trip.pickupLat, trip.pickupLng], {
        icon: circleIcon("#22c55e", "P", 20),
        zIndexOffset: 800,
      }).addTo(map);
      tripMarkersRef.current.push(pickupM);

      const dropoffM = L.marker([trip.dropoffLat, trip.dropoffLng], {
        icon: circleIcon("#ef4444", "D", 20),
        zIndexOffset: 800,
      }).addTo(map);
      tripMarkersRef.current.push(dropoffM);

      if (trip.driverName) {
        pickupM.bindPopup(`<div style="font-size:11px"><strong>${trip.driverName}</strong><br/><span style="color:#666">${trip.status === "in_progress" ? "In Progress" : "Accepted"}</span></div>`);
      }

      // Fetch OSRM route
      fetchOsrmRoute(
        { lat: trip.pickupLat, lng: trip.pickupLng },
        { lat: trip.dropoffLat, lng: trip.dropoffLng },
        [],
        true
      ).then(routes => {
        if (!mapInstance.current) return;
        const best = pickShortestOsrmRoute(routes);
        const latlngs = best.coordinates.map(c => [c[0], c[1]] as [number, number]);
        const color = trip.status === "in_progress" ? "#4285F4" : "#f59e0b";
        const polyline = L.polyline(latlngs, { color, weight: 4, opacity: 0.7 }).addTo(mapInstance.current);
        tripPolylinesRef.current.push(polyline);
      }).catch(() => {});
    });
  }, [tripIdsKey]);

  return (
    <div className="relative" style={{ width: "100%", height: "100%" }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      <div className={`absolute inset-0 z-[1] pointer-events-none bg-background/90 backdrop-blur-sm transition-opacity duration-500 ease-in-out ${themeTransition ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
};

export default MaldivesMap;
