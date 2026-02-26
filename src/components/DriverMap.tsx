import { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { Navigation, ChevronUp, ChevronDown } from "lucide-react";

const MALE_CENTER = { lat: 4.1755, lng: 73.5093 };

type TripPhase = "heading_to_pickup" | "arrived" | "in_progress";

interface NavStep {
  instruction: string;
  distance: string;
  maneuver?: string;
}

interface DriverMapProps {
  isNavigating: boolean;
  tripPhase?: TripPhase;
  radiusKm?: number;
  gpsEnabled: boolean;
  pickupCoords?: [number, number];
  dropoffCoords?: [number, number];
  pickupLabel?: string;
  dropoffLabel?: string;
  mapIconUrl?: string | null;
}

const DriverMap = ({ isNavigating, tripPhase = "heading_to_pickup", radiusKm, gpsEnabled, pickupCoords, dropoffCoords, pickupLabel, dropoffLabel, mapIconUrl }: DriverMapProps) => {
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

  const radiusFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRadius, setShowRadius] = useState(false);
  const prevRadiusRef = useRef<number | undefined>(radiusKm);

  // Navigation state
  const [navSteps, setNavSteps] = useState<NavStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [navEta, setNavEta] = useState("");
  const [navDistance, setNavDistance] = useState("");
  const [navExpanded, setNavExpanded] = useState(false);

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
      styles: isDark ? darkMapStyle : [],
      gestureHandling: "greedy",
    });

    const markerOpts: any = {
      map, position: currentPos || MALE_CENTER, zIndex: 1000,
    };
    if (mapIconUrl) {
      markerOpts.icon = { url: mapIconUrl, scaledSize: new g.maps.Size(30, 30) };
    } else {
      markerOpts.icon = {
        path: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
        scale: 0.9, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 2, anchor: new g.maps.Point(12, 12),
      };
    }
    driverMarkerRef.current = new g.maps.Marker(markerOpts);
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
    driverMarkerRef.current.setPosition(currentPos);
    const g = (window as any).google;
    if (mapIconUrl) {
      driverMarkerRef.current.setIcon({ url: mapIconUrl, scaledSize: new g.maps.Size(30, 30) });
    } else {
      driverMarkerRef.current.setIcon({
        path: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
        scale: 0.9, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 2, anchor: new g.maps.Point(12, 12),
      });
    }
    if (!isNavigating) mapInstance.current.panTo(currentPos);
  }, [currentPos, isNavigating, mapIconUrl]);

  // Parse navigation steps from directions result
  const parseNavSteps = useCallback((result: any) => {
    try {
      const route = result.routes[0];
      const leg = route.legs[0]; // Single leg, A→B only
      
      setNavEta(leg.duration?.text || "");
      setNavDistance(leg.distance?.text || "");
      
      const steps: NavStep[] = leg.steps.map((step: any) => ({
        instruction: step.instructions?.replace(/<[^>]*>/g, '') || '',
        distance: step.distance?.text || '',
        maneuver: step.maneuver || undefined,
      }));
      setNavSteps(steps);
      
      // Auto-advance step based on driver proximity
      if (currentPos && steps.length > 0) {
        const driverLat = currentPos.lat;
        const driverLng = currentPos.lng;
        let closestIdx = 0;
        let closestDist = Infinity;
        
        leg.steps.forEach((step: any, idx: number) => {
          const endLat = step.end_location.lat();
          const endLng = step.end_location.lng();
          const dist = Math.sqrt(Math.pow(driverLat - endLat, 2) + Math.pow(driverLng - endLng, 2));
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = idx;
          }
        });
        
        setCurrentStepIndex(Math.min(closestIdx, steps.length - 1));
      }
    } catch (e) {
      console.warn("Failed to parse nav steps:", e);
    }
  }, [currentPos]);

  // Route when navigating — clean single A→B route
  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;

    rideMarkersRef.current.forEach((m: any) => m.setMap(null));
    rideMarkersRef.current = [];
    if (directionsRendererRef.current) { directionsRendererRef.current.setMap(null); directionsRendererRef.current = null; }
    if (routeRefreshRef.current) { clearInterval(routeRefreshRef.current); routeRefreshRef.current = null; }

    if (!isNavigating) {
      setNavSteps([]);
      setCurrentStepIndex(0);
      return;
    }

    const driverPos = currentPos || MALE_CENTER;
    const pickup = pickupCoords ? { lat: pickupCoords[0], lng: pickupCoords[1] } : null;
    const dropoff = dropoffCoords ? { lat: dropoffCoords[0], lng: dropoffCoords[1] } : null;

    if (!pickup || !dropoff) return;

    // Determine origin and destination based on trip phase
    // heading_to_pickup: driver → pickup (single route)
    // arrived: show pickup → dropoff (preview)
    // in_progress: driver → dropoff (single route)
    let origin: { lat: number; lng: number };
    let destination: { lat: number; lng: number };
    let destLabel: string;
    let destColor: string;

    if (tripPhase === "in_progress") {
      origin = driverPos;
      destination = dropoff;
      destLabel = "D";
      destColor = "#ef4444";
    } else if (tripPhase === "arrived") {
      origin = pickup;
      destination = dropoff;
      destLabel = "D";
      destColor = "#ef4444";
    } else {
      // heading_to_pickup
      origin = driverPos;
      destination = pickup;
      destLabel = "P";
      destColor = "#22c55e";
    }

    // Only show destination marker (origin is the driver's current position marker)
    const destMarker = new g.maps.Marker({
      map, position: destination, zIndex: 1000,
      label: { text: destLabel, color: "white", fontWeight: "700", fontSize: "12px" },
      icon: { path: g.maps.SymbolPath.CIRCLE, scale: 14, fillColor: destColor, fillOpacity: 1, strokeColor: "white", strokeWeight: 3 },
    });
    rideMarkersRef.current = [destMarker];

    // If in_progress, also show pickup marker faded
    if (tripPhase === "in_progress") {
      const pickupMarker = new g.maps.Marker({
        map, position: pickup, zIndex: 999,
        label: { text: "P", color: "white", fontWeight: "700", fontSize: "11px" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#22c55e", fillOpacity: 0.5, strokeColor: "white", strokeWeight: 2 },
      });
      rideMarkersRef.current.push(pickupMarker);
    }

    // If heading to pickup, also show dropoff as a faded marker for context
    if (tripPhase === "heading_to_pickup") {
      const dropMarker = new g.maps.Marker({
        map, position: dropoff, zIndex: 999,
        label: { text: "D", color: "white", fontWeight: "700", fontSize: "11px" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#ef4444", fillOpacity: 0.4, strokeColor: "white", strokeWeight: 2 },
      });
      rideMarkersRef.current.push(dropMarker);
    }

    const fetchRoute = () => {
      const ds = new g.maps.DirectionsService();
      const dr = new g.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        suppressInfoWindows: true,
        preserveViewport: false,
        polylineOptions: {
          strokeColor: tripPhase === "in_progress" ? "#4285F4" : "#22c55e",
          strokeWeight: 6,
          strokeOpacity: 0.9,
        },
      });
      if (directionsRendererRef.current) directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = dr;

      ds.route({
        origin,
        destination,
        travelMode: g.maps.TravelMode.DRIVING,
        provideRouteAlternatives: false,
      }).then((result: any) => {
        dr.setDirections(result);
        parseNavSteps(result);
      }).catch((err: any) => console.error("Directions error:", err));
    };

    fetchRoute();
    // Refresh route every 15s to track driver movement
    routeRefreshRef.current = setInterval(fetchRoute, 15000);

    return () => {
      if (routeRefreshRef.current) { clearInterval(routeRefreshRef.current); routeRefreshRef.current = null; }
    };
  }, [isNavigating, pickupCoords, dropoffCoords, tripPhase, parseNavSteps]);

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
        map, center, radius: radiusKm * 1000,
        strokeColor: "#4285F4", strokeWeight: 2, strokeOpacity: 0.6,
        fillColor: "#4285F4", fillOpacity: 0.08,
      });
    }
  }, [radiusKm, isNavigating, currentPos, showRadius]);

  // Get maneuver icon
  const getManeuverIcon = (maneuver?: string) => {
    if (!maneuver) return "↑";
    if (maneuver.includes("left")) return "←";
    if (maneuver.includes("right")) return "→";
    if (maneuver.includes("uturn")) return "↩";
    if (maneuver.includes("roundabout")) return "↻";
    if (maneuver.includes("merge")) return "↗";
    return "↑";
  };

  if (error) {
    return <div className="absolute inset-0 bg-surface flex items-center justify-center text-muted-foreground text-sm">Map unavailable</div>;
  }
  if (!isLoaded) {
    return <div className="absolute inset-0 bg-surface flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <>
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* In-app Navigation Overlay */}
      {isNavigating && navSteps.length > 0 && (
        <div className="absolute top-16 left-3 right-3 z-[460]">
          {/* Current step card */}
          <div className="bg-card/95 backdrop-blur-md rounded-2xl shadow-lg overflow-hidden">
            {/* ETA bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-primary/10 border-b border-border/30">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  {tripPhase === "heading_to_pickup" ? "To Pickup" : tripPhase === "in_progress" ? "To Destination" : "Route Preview"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-primary">{navEta}</span>
                <span className="text-xs text-muted-foreground">{navDistance}</span>
              </div>
            </div>

            {/* Current instruction */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                <span className="text-lg font-bold text-primary-foreground">
                  {getManeuverIcon(navSteps[currentStepIndex]?.maneuver)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                  {navSteps[currentStepIndex]?.instruction || "Continue"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {navSteps[currentStepIndex]?.distance}
                </p>
              </div>
              <button
                onClick={() => setNavExpanded(!navExpanded)}
                className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center shrink-0 active:scale-90 transition-transform"
              >
                {navExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>

            {/* Expanded step list */}
            {navExpanded && (
              <div className="border-t border-border/30 max-h-48 overflow-y-auto">
                {navSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 px-4 py-2.5 ${
                      idx === currentStepIndex ? "bg-primary/5" : ""
                    } ${idx < currentStepIndex ? "opacity-40" : ""}`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                      idx === currentStepIndex
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface text-muted-foreground"
                    }`}>
                      {getManeuverIcon(step.maneuver)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground leading-snug line-clamp-1">{step.instruction}</p>
                      <p className="text-[10px] text-muted-foreground">{step.distance}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
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

export default DriverMap;