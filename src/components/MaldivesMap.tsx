import { useEffect, useRef, useState } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";



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
  const tripRenderersRef = useRef<any[]>([]);
  const tripMarkersRef = useRef<any[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const userInteractingRef = useRef(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const { isLoaded, error, mapId } = useGoogleMaps();

  // Track user location
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* No fallback — wait for real GPS */ },
      { enableHighAccuracy: true, timeout: 10000 }
    );
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // Use a ref for initial center so GPS updates don't re-trigger map init
  const initialCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  if (!initialCenterRef.current) {
    initialCenterRef.current = userPos
      || (rideData?.pickup ? { lat: rideData.pickup.lat, lng: rideData.pickup.lng } : null)
      || (tripRoutes && tripRoutes.length > 0 ? { lat: tripRoutes[0].pickupLat, lng: tripRoutes[0].pickupLng } : null)
      || (vehicleMarkers && vehicleMarkers.length > 0 ? { lat: vehicleMarkers[0].lat, lng: vehicleMarkers[0].lng } : null);
  }
  if (!initialCenterRef.current && userPos) {
    initialCenterRef.current = userPos;
  }
  if (!initialCenterRef.current && rideData?.pickup) {
    initialCenterRef.current = { lat: rideData.pickup.lat, lng: rideData.pickup.lng };
  }

  // Init map — only once
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current) return;
    const center = initialCenterRef.current || { lat: 4.1755, lng: 73.5093 }; // Fallback to Malé
    if (!center) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const isDark = document.documentElement.classList.contains("dark");

    const mapOptions: any = {
      center,
      zoom: 15,
      disableDefaultUI: true,
      zoomControl: false,
      gestureHandling: "greedy",
    };

    if (mapId) {
      mapOptions.mapId = mapId;
      const colorScheme = g.maps?.ColorScheme;
      if (colorScheme) {
        mapOptions.colorScheme = isDark ? colorScheme.DARK : colorScheme.LIGHT;
      }
    } else {
      mapOptions.styles = isDark ? darkMapStyle : [];
    }

    const map = new g.maps.Map(mapRef.current, mapOptions);

    const userMarker = new g.maps.Marker({
      map,
      position: center,
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
    onMapReady?.(map);

    map.addListener("click", (e: any) => {
      const lat = e.latLng?.lat();
      const lng = e.latLng?.lng();
      if (lat != null && lng != null) {
        window.dispatchEvent(new CustomEvent("map-tap", { detail: { lat, lng } }));
      }
    });

    // Detect user interaction to stop auto-panning
    map.addListener("dragstart", () => { userInteractingRef.current = true; });

    return () => { mapInstance.current = null; };
  }, [isLoaded, !!initialCenterRef.current, mapId]);

  // Track map readiness for dependent effects
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    if (mapInstance.current && !mapReady) setMapReady(true);
  });

  // Theme observer — smooth crossfade overlay
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
        if (colorScheme) {
          map?.setOptions({ colorScheme: isDark ? colorScheme.DARK : colorScheme.LIGHT });
        }
        map?.setOptions({ styles: isDark ? darkMapStyle : [] });
      } else {
        map?.setOptions({ styles: isDark ? darkMapStyle : [] });
      }
    };

    const observer = new MutationObserver(() => {
      setThemeTransition(true);
      t1 = setTimeout(() => {
        applyTheme();
        t2 = setTimeout(() => setThemeTransition(false), 500);
      }, 50);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { observer.disconnect(); clearTimeout(t1); clearTimeout(t2); };
  }, [mapReady, mapId]);

  // Update user marker
  useEffect(() => {
    if (!userPos || !userMarkerRef.current || !mapInstance.current) return;
    userMarkerRef.current.setPosition(userPos);
    if (!rideData?.showRoute && !userInteractingRef.current) {
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
      const markerOpts: any = {
        map, position: { lat: driverLat, lng: driverLng }, zIndex: 1100,
      };
      if (rideData.driverIconUrl) {
        markerOpts.icon = { url: rideData.driverIconUrl, scaledSize: new g.maps.Size(36, 36), anchor: new g.maps.Point(18, 18) };
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
          markerOpts.icon = { url: v.imageUrl, scaledSize: new g.maps.Size(28, 28), anchor: new g.maps.Point(14, 14) };
          markerOpts.optimized = false;
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

  // Trip routes rendering
  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;

    // Clear previous trip renderers and markers
    tripRenderersRef.current.forEach((r: any) => r.setMap(null));
    tripRenderersRef.current = [];
    tripMarkersRef.current.forEach((m: any) => m.setMap(null));
    tripMarkersRef.current = [];

    if (!tripRoutes || tripRoutes.length === 0) return;

    const ds = new g.maps.DirectionsService();

    tripRoutes.forEach((trip) => {
      // Pickup marker
      const pickupM = new g.maps.Marker({
        map, position: { lat: trip.pickupLat, lng: trip.pickupLng }, zIndex: 800,
        label: { text: "P", color: "white", fontWeight: "700", fontSize: "10px" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#22c55e", fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
      });
      tripMarkersRef.current.push(pickupM);

      // Dropoff marker
      const dropoffM = new g.maps.Marker({
        map, position: { lat: trip.dropoffLat, lng: trip.dropoffLng }, zIndex: 800,
        label: { text: "D", color: "white", fontWeight: "700", fontSize: "10px" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
      });
      tripMarkersRef.current.push(dropoffM);

      // Route
      const dr = new g.maps.DirectionsRenderer({
        map, suppressMarkers: true,
        polylineOptions: {
          strokeColor: trip.status === "in_progress" ? "#4285F4" : "#f59e0b",
          strokeWeight: 4,
          strokeOpacity: 0.7,
          icons: [{
            icon: { path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3, fillColor: trip.status === "in_progress" ? "#4285F4" : "#f59e0b", fillOpacity: 1, strokeWeight: 0 },
            offset: "50%",
            repeat: "100px",
          }],
        },
      });
      tripRenderersRef.current.push(dr);

      ds.route({
        origin: { lat: trip.pickupLat, lng: trip.pickupLng },
        destination: { lat: trip.dropoffLat, lng: trip.dropoffLng },
        travelMode: g.maps.TravelMode.DRIVING,
      }).then((result: any) => dr.setDirections(result))
        .catch(() => {});

      // Info window on pickup
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
