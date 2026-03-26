import { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { selectShortestRoute } from "@/lib/shortest-route";

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
  onMapReady?: (map: google.maps.Map) => void;
}

const MaldivesMap = ({ rideData, vehicleMarkers, tripRoutes, onMapClick, onMapReady }: MaldivesMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const rideMarkersRef = useRef<any[]>([]);
  const driverMarkerRef = useRef<any>(null);
  const vehicleMarkersRef = useRef<any[]>([]);
  const directionsRendererRef = useRef<any>(null);
  const vehicleInfoWindowRef = useRef<any>(null);
  const tripRenderersRef = useRef<any[]>([]);
  const tripMarkersRef = useRef<any[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const didInitialFitRef = useRef(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const { isLoaded, error, mapId } = useGoogleMaps();

  // Stable ref for latest rideData/tripRoutes to avoid re-creating markers
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
      { enableHighAccuracy: false, maximumAge: 30000 }
    );
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // Initial center — computed once
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
    if (!isLoaded || !mapRef.current || mapInstance.current) return;
    const center = initialCenterRef.current || { lat: 4.1755, lng: 73.5093 };
    const g = (window as any).google;
    if (!g?.maps) return;

    const isDark = document.documentElement.classList.contains("dark");
    const mapOptions: any = {
      center,
      zoom: 15,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "greedy",
    };

    if (mapId) {
      mapOptions.mapId = mapId;
      const colorScheme = g.maps?.ColorScheme;
      if (colorScheme) mapOptions.colorScheme = isDark ? colorScheme.DARK : colorScheme.LIGHT;
    } else {
      mapOptions.styles = isDark ? darkMapStyle : [];
    }

    const map = new g.maps.Map(mapRef.current, mapOptions);
    const userMarker = new g.maps.Marker({
      map, position: center, zIndex: 900,
      icon: { path: g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 3 },
    });
    userMarkerRef.current = userMarker;
    mapInstance.current = map;
    onMapReady?.(map);

    map.addListener("click", (e: any) => {
      const lat = e.latLng?.lat();
      const lng = e.latLng?.lng();
      if (lat != null && lng != null) window.dispatchEvent(new CustomEvent("map-tap", { detail: { lat, lng } }));
    });

    return () => { mapInstance.current = null; };
  }, [isLoaded, !!initialCenterRef.current, mapId]);

  // Track map readiness
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    if (mapInstance.current && !mapReady) setMapReady(true);
  });

  // Theme observer
  const [themeTransition, setThemeTransition] = useState(false);
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const map = mapInstance.current;
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>;
    const applyTheme = () => {
      const isDark = document.documentElement.classList.contains("dark");
      const g = (window as any).google;
      if (mapId) {
        const colorScheme = g?.maps?.ColorScheme;
        if (colorScheme) map?.setOptions({ colorScheme: isDark ? colorScheme.DARK : colorScheme.LIGHT });
        map?.setOptions({ styles: isDark ? darkMapStyle : [] });
      } else {
        map?.setOptions({ styles: isDark ? darkMapStyle : [] });
      }
    };
    const observer = new MutationObserver(() => {
      setThemeTransition(true);
      t1 = setTimeout(() => { applyTheme(); t2 = setTimeout(() => setThemeTransition(false), 500); }, 50);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { observer.disconnect(); clearTimeout(t1); clearTimeout(t2); };
  }, [mapReady, mapId]);

  // Update user marker position only — NEVER move the viewport
  useEffect(() => {
    if (!userPos || !userMarkerRef.current || !mapInstance.current) return;
    userMarkerRef.current.setPosition(userPos);
    // Only auto-center on very first GPS fix before anything else loads
    if (!didInitialFitRef.current && !rideData?.pickup && !tripRoutes?.length && !vehicleMarkers?.length) {
      didInitialFitRef.current = true;
      mapInstance.current.panTo(userPos);
    }
  }, [userPos]);

  // Ride markers & route — only recreate when ride identity changes, not coordinates
  const prevRideKeyRef = useRef("");
  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;

    const rd = rideData;
    const rideKey = rd ? `${rd.pickup?.lat},${rd.pickup?.lng}-${rd.dropoff?.lat},${rd.dropoff?.lng}-${rd.showRoute}` : "";

    // Only fully recreate markers when ride identity changes
    if (rideKey === prevRideKeyRef.current && driverMarkerRef.current) {
      // Just update driver position smoothly
      if (rd?.driverLat != null && rd?.driverLng != null) {
        driverMarkerRef.current.setPosition({ lat: rd.driverLat, lng: rd.driverLng });
      }
      return;
    }
    prevRideKeyRef.current = rideKey;

    // Clean up old markers
    rideMarkersRef.current.forEach((m: any) => m.setMap(null));
    rideMarkersRef.current = [];
    if (driverMarkerRef.current) { driverMarkerRef.current.setMap(null); driverMarkerRef.current = null; }
    if (directionsRendererRef.current) { directionsRendererRef.current.setMap(null); directionsRendererRef.current = null; }

    if (!rd) return;
    const { pickup, dropoff, driverLat, driverLng, showRoute } = rd;

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
      const markerOpts: any = { map, position: { lat: driverLat, lng: driverLng }, zIndex: 1100 };
      if (rd.driverIconUrl) {
        markerOpts.icon = { url: rd.driverIconUrl, scaledSize: new g.maps.Size(36, 36), anchor: new g.maps.Point(18, 18) };
        markerOpts.optimized = false;
      } else {
        markerOpts.icon = { path: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
          scale: 0.9, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 2, anchor: new g.maps.Point(12, 12) };
      }
      driverMarkerRef.current = new g.maps.Marker(markerOpts);
    }

    if (showRoute && pickup && dropoff) {
      const ds = new g.maps.DirectionsService();
      const dr = new g.maps.DirectionsRenderer({
        map, suppressMarkers: true,
        preserveViewport: true, // ← CRITICAL: prevents auto-zoom
        polylineOptions: { strokeColor: "#4285F4", strokeWeight: 5, strokeOpacity: 0.85 },
      });
      directionsRendererRef.current = dr;
      const waypoints = driverLat != null && driverLng != null
        ? [{ location: { lat: pickup.lat, lng: pickup.lng }, stopover: true }] : [];
      const origin = driverLat != null ? { lat: driverLat, lng: driverLng } : { lat: pickup.lat, lng: pickup.lng };
      ds.route({
        origin, destination: { lat: dropoff.lat, lng: dropoff.lng },
        waypoints, travelMode: g.maps.TravelMode.DRIVING, provideRouteAlternatives: true,
      }).then((raw: any) => {
        dr.setDirections(selectShortestRoute(raw));
        // Only fit bounds on the very first ride load
        if (!didInitialFitRef.current) {
          didInitialFitRef.current = true;
          const bounds = new g.maps.LatLngBounds();
          bounds.extend({ lat: pickup.lat, lng: pickup.lng });
          bounds.extend({ lat: dropoff.lat, lng: dropoff.lng });
          if (driverLat != null && driverLng != null) bounds.extend({ lat: driverLat, lng: driverLng });
          map.fitBounds(bounds, 60);
        }
      }).catch((err: any) => console.error("Directions error:", err));
    } else if (pickup && dropoff && !didInitialFitRef.current) {
      didInitialFitRef.current = true;
      const bounds = new g.maps.LatLngBounds();
      bounds.extend({ lat: pickup.lat, lng: pickup.lng });
      bounds.extend({ lat: dropoff.lat, lng: dropoff.lng });
      if (driverLat != null && driverLng != null) bounds.extend({ lat: driverLat, lng: driverLng });
      map.fitBounds(bounds, 60);
    }
  }, [rideData?.pickup?.lat, rideData?.dropoff?.lat, rideData?.driverLat, rideData?.driverLng, rideData?.driverIconUrl, rideData?.showRoute]);

  // Driver icon update only
  useEffect(() => {
    const g = (window as any).google;
    if (!driverMarkerRef.current || !g?.maps || !rideData?.driverIconUrl) return;
    driverMarkerRef.current.setIcon({
      url: rideData.driverIconUrl, scaledSize: new g.maps.Size(36, 36), anchor: new g.maps.Point(18, 18),
    });
    driverMarkerRef.current.setOptions({ optimized: false });
  }, [rideData?.driverIconUrl]);

  // Vehicle markers — reuse existing, only update positions
  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;
    if (rideData?.showRoute) {
      vehicleMarkersRef.current.forEach((m: any) => m.setMap(null));
      vehicleMarkersRef.current = [];
      return;
    }

    if (!vehicleMarkers || vehicleMarkers.length === 0) {
      vehicleMarkersRef.current.forEach((m: any) => m.setMap(null));
      vehicleMarkersRef.current = [];
      return;
    }

    const existingMap = new Map<string, any>();
    vehicleMarkersRef.current.forEach((m: any) => { if (m._vid) existingMap.set(m._vid, m); });

    const newMarkerRefs: any[] = [];

    const buildInfoContent = (v: VehicleMarkerData) => {
      const lines: string[] = [];
      if (v.driverName) lines.push(`<div style="font-weight:700;font-size:12px">${v.driverName}</div>`);
      if (v.driverPhone) lines.push(`<div style="font-size:11px;color:#666">📞 ${v.driverPhone}</div>`);
      if (v.centerCode) lines.push(`<div style="font-size:11px;color:#666">🏷️ ${v.centerCode}</div>`);
      if (v.plate) lines.push(`<div style="font-size:11px;color:#666">🚗 ${v.plate}</div>`);
      if (v.vehicleInfo) lines.push(`<div style="font-size:10px;color:#999">${v.vehicleInfo}</div>`);
      if (v.name) lines.push(`<div style="font-size:10px;color:#999">${v.name}</div>`);
      lines.push(`<div style="font-size:10px;margin-top:2px;color:${v.isOnTrip ? '#f59e0b' : '#22c55e'};font-weight:600">${v.isOnTrip ? '● On Trip' : '● Available'}</div>`);
      return `<div style="padding:4px;min-width:120px">${lines.join("")}</div>`;
    };

    vehicleMarkers.forEach(v => {
      const vid = v.id || v.lat + "," + v.lng;
      const existing = existingMap.get(vid);
      if (existing) {
        existing.setPosition({ lat: v.lat, lng: v.lng });
        if (v.imageUrl) {
          existing.setIcon({ url: v.imageUrl, scaledSize: new g.maps.Size(28, 28), anchor: new g.maps.Point(14, 14) });
          existing.setOptions({ optimized: false });
        }
        (existing as any)._vdata = v;
        newMarkerRefs.push(existing);
        existingMap.delete(vid);
      } else {
        const markerOpts: any = { map, position: { lat: v.lat, lng: v.lng } };
        if (v.imageUrl) {
          markerOpts.icon = { url: v.imageUrl, scaledSize: new g.maps.Size(28, 28), anchor: new g.maps.Point(14, 14) };
          markerOpts.optimized = false;
        } else {
          markerOpts.icon = {
            path: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
            scale: 0.9, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 2, anchor: new g.maps.Point(12, 12),
          };
        }
        const m = new g.maps.Marker(markerOpts);
        (m as any)._vid = vid;
        (m as any)._vdata = v;
        m.addListener("click", () => {
          if (vehicleInfoWindowRef.current) vehicleInfoWindowRef.current.close();
          const data = (m as any)._vdata as VehicleMarkerData;
          const iw = new g.maps.InfoWindow({ content: buildInfoContent(data) });
          iw.open(map, m);
          vehicleInfoWindowRef.current = iw;
        });
        newMarkerRefs.push(m);
      }
    });

    existingMap.forEach((m: any) => m.setMap(null));
    vehicleMarkersRef.current = newMarkerRefs;
  }, [vehicleMarkers, rideData?.showRoute]);

  // Trip routes — cache by trip IDs to avoid recreating on every poll
  const prevTripIdsRef = useRef("");
  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;

    const currentIds = (tripRoutes || []).map(t => t.id).sort().join(",");

    // If same trips, skip full re-render (markers/routes already on map)
    if (currentIds === prevTripIdsRef.current && tripRenderersRef.current.length > 0) return;
    prevTripIdsRef.current = currentIds;

    // Clear previous
    tripRenderersRef.current.forEach((r: any) => r.setMap(null));
    tripRenderersRef.current = [];
    tripMarkersRef.current.forEach((m: any) => m.setMap(null));
    tripMarkersRef.current = [];

    if (!tripRoutes || tripRoutes.length === 0) return;

    const ds = new g.maps.DirectionsService();

    tripRoutes.forEach((trip) => {
      const pickupM = new g.maps.Marker({
        map, position: { lat: trip.pickupLat, lng: trip.pickupLng }, zIndex: 800,
        label: { text: "P", color: "white", fontWeight: "700", fontSize: "10px" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#22c55e", fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
      });
      tripMarkersRef.current.push(pickupM);

      const dropoffM = new g.maps.Marker({
        map, position: { lat: trip.dropoffLat, lng: trip.dropoffLng }, zIndex: 800,
        label: { text: "D", color: "white", fontWeight: "700", fontSize: "10px" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
      });
      tripMarkersRef.current.push(dropoffM);

      const dr = new g.maps.DirectionsRenderer({
        map, suppressMarkers: true,
        preserveViewport: true, // ← CRITICAL: never auto-zoom
        polylineOptions: {
          strokeColor: trip.status === "in_progress" ? "#4285F4" : "#f59e0b",
          strokeWeight: 4, strokeOpacity: 0.7,
          icons: [{
            icon: { path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, fillColor: trip.status === "in_progress" ? "#4285F4" : "#f59e0b", fillOpacity: 1, strokeWeight: 0 },
            offset: "50%", repeat: "100px",
          }],
        },
      });
      tripRenderersRef.current.push(dr);

      ds.route({
        origin: { lat: trip.pickupLat, lng: trip.pickupLng },
        destination: { lat: trip.dropoffLat, lng: trip.dropoffLng },
        travelMode: g.maps.TravelMode.DRIVING, provideRouteAlternatives: true,
      }).then((raw: any) => dr.setDirections(selectShortestRoute(raw))).catch(() => {});

      if (trip.driverName) {
        const infoWindow = new g.maps.InfoWindow({
          content: `<div style="font-size:11px;font-weight:600;padding:2px">${trip.driverName}<br/><span style="font-size:10px;color:#666">${trip.status === "in_progress" ? "In Progress" : "Accepted"}</span></div>`,
        });
        pickupM.addListener("click", () => infoWindow.open(map, pickupM));
      }
    });
  }, [tripRoutes]);

  if (error) {
    return <div className="w-full h-full bg-surface flex items-center justify-center text-muted-foreground text-sm">Map unavailable</div>;
  }
  if (!isLoaded) {
    return <div className="w-full h-full bg-surface flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="relative" style={{ width: "100%", height: "100%" }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      <div className={`absolute inset-0 z-[1] pointer-events-none bg-background/90 backdrop-blur-sm transition-opacity duration-500 ease-in-out ${themeTransition ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
};

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#b0b0c0" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#505060" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#252538" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#9a9aaa" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ lightness: -20 }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2a2a3e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a1a2e" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#a0a0b0" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#3a3a50" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f2f42" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a2b" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4a6080" }] },
];

export default MaldivesMap;
