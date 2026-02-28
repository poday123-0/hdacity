import { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { Navigation, ChevronUp, ChevronDown, Locate, Route, Crosshair, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";



type TripPhase = "heading_to_pickup" | "arrived" | "in_progress";

interface NavStep {
  instruction: string;
  distance: string;
  maneuver?: string;
  endLat?: number;
  endLng?: number;
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
  passengerMapIconUrl?: string | null;
  passengerLiveLocation?: { lat: number; lng: number } | null;
  onRecenterAvailableChange?: (available: boolean) => void;
  recenterRef?: React.MutableRefObject<(() => void) | null>;
  onNavUpdate?: (etaText: string, distanceText: string, etaMinutes: number, distanceKm: number) => void;
  onFollowDriverChange?: (following: boolean) => void;
  followToggleRef?: React.MutableRefObject<(() => void) | null>;
  onSpeedChange?: (speed: number) => void;
  tripPanelOpen?: boolean;
  onNavStepChange?: (data: { instruction: string; distance: string; maneuver?: string; eta: string; totalDistance: string; nextInstruction?: string; nextManeuver?: string; nextDistance?: string }) => void;
}

const DriverMap = ({ isNavigating, tripPhase = "heading_to_pickup", radiusKm, gpsEnabled, pickupCoords, dropoffCoords, pickupLabel, dropoffLabel, mapIconUrl, passengerMapIconUrl, passengerLiveLocation, onRecenterAvailableChange, recenterRef, onNavUpdate, onFollowDriverChange, followToggleRef, onSpeedChange, tripPanelOpen, onNavStepChange }: DriverMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const rideMarkersRef = useRef<any[]>([]);
  const passengerLiveMarkerRef = useRef<any>(null);
  const passengerPulseRef = useRef<any>(null);
  const passengerPulseIntervalRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const radiusCircleRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const routeRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const userInteractingRef = useRef(false);
  const [userPannedAway, setUserPannedAway] = useState(false);
  const [followDriver, setFollowDriver] = useState(true);
  const interactTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isLoaded, error } = useGoogleMaps();
  const prevHeadingRef = useRef<number>(0);

  const radiusFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRadius, setShowRadius] = useState(false);
  const prevRadiusRef = useRef<number | undefined>(radiusKm);

  // Navigation state
  const [navSteps, setNavSteps] = useState<NavStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [navEta, setNavEta] = useState("");
  const [navDistance, setNavDistance] = useState("");
  const [navExpanded, setNavExpanded] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [currentHeading, setCurrentHeading] = useState<number | null>(null);

  // Broadcast current nav step to parent
  useEffect(() => {
    if (!onNavStepChange || navSteps.length === 0) return;
    const step = navSteps[currentStepIndex];
    const next = currentStepIndex + 1 < navSteps.length ? navSteps[currentStepIndex + 1] : undefined;
    onNavStepChange({
      instruction: step?.instruction || "Continue straight",
      distance: step?.distance || "",
      maneuver: step?.maneuver,
      eta: navEta,
      totalDistance: navDistance,
      nextInstruction: next?.instruction,
      nextManeuver: next?.maneuver,
      nextDistance: next?.distance,
    });
  }, [currentStepIndex, navSteps, navEta, navDistance, onNavStepChange]);

  // Track GPS with heading
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (pos.coords.speed != null && pos.coords.speed >= 0) setCurrentSpeed(Math.round(pos.coords.speed * 3.6));
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) setCurrentHeading(pos.coords.heading);
      },
      () => { /* Wait for real GPS — no fallback */ },
      { enableHighAccuracy: true, timeout: 10000 }
    );
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (pos.coords.speed != null && pos.coords.speed >= 0) {
          const spd = Math.round(pos.coords.speed * 3.6);
          setCurrentSpeed(spd);
          onSpeedChange?.(spd);
        }
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) setCurrentHeading(pos.coords.heading);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // Init map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current || !currentPos) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const isDark = document.documentElement.classList.contains("dark");

    const map = new g.maps.Map(mapRef.current, {
      center: currentPos,
      zoom: 16,
      disableDefaultUI: true,
      zoomControl: false,
      styles: isDark ? darkMapStyle : lightNavStyle,
      gestureHandling: "greedy",
    });

    const markerOpts: any = {
      map, position: currentPos, zIndex: 1000,
    };
    if (mapIconUrl) {
      markerOpts.icon = { url: mapIconUrl, scaledSize: new g.maps.Size(28, 28), anchor: new g.maps.Point(14, 14) };
      markerOpts.optimized = false;
    } else {
      markerOpts.icon = {
        path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 6, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 2.5,
        rotation: 0, anchor: new g.maps.Point(0, 2.5),
      };
    }
    driverMarkerRef.current = new g.maps.Marker(markerOpts);
    mapInstance.current = map;

    // Detect user interaction
    const handleUserInteract = () => {
      userInteractingRef.current = true;
      setUserPannedAway(true);
      if (interactTimeoutRef.current) clearTimeout(interactTimeoutRef.current);
    };
    map.addListener("dragstart", handleUserInteract);
    map.addListener("zoom_changed", () => {
      if (!userInteractingRef.current) {
        handleUserInteract();
      }
    });

    return () => { mapInstance.current = null; };
  }, [isLoaded, currentPos]);

  // Theme observer
  useEffect(() => {
    if (!mapInstance.current) return;
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      mapInstance.current?.setOptions({ styles: isDark ? darkMapStyle : (isNavigating ? lightNavStyle : []) });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [isLoaded, isNavigating]);

  // Navigation mode: tilt map + higher zoom + heading rotation
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (isNavigating) {
      map.setTilt(45);
      if (followDriver) map.setZoom(18);
      const isDark = document.documentElement.classList.contains("dark");
      map.setOptions({ styles: isDark ? darkMapStyle : lightNavStyle });
    } else {
      map.setTilt(0);
      map.setZoom(16);
      const isDark = document.documentElement.classList.contains("dark");
      map.setOptions({ styles: isDark ? darkMapStyle : [] });
    }
  }, [isNavigating]);

  // Update driver marker position, rotation & auto-follow
  useEffect(() => {
    if (!currentPos || !driverMarkerRef.current || !mapInstance.current) return;
    driverMarkerRef.current.setPosition(currentPos);
    const g = (window as any).google;

    // Calculate heading from GPS or from bearing to next step
    let heading = currentHeading ?? prevHeadingRef.current;
    if (isNavigating && navSteps[currentStepIndex]?.endLat != null) {
      const nextStep = navSteps[currentStepIndex];
      if (nextStep.endLat && nextStep.endLng) {
        const dLng = (nextStep.endLng - currentPos.lng) * Math.PI / 180;
        const lat1 = currentPos.lat * Math.PI / 180;
        const lat2 = nextStep.endLat * Math.PI / 180;
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        const bearingToStep = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        // Use GPS heading if moving, otherwise bearing to next step
        if (currentSpeed > 3 && currentHeading != null) {
          heading = currentHeading;
        } else {
          heading = bearingToStep;
        }
      }
    }
    prevHeadingRef.current = heading;

    if (mapIconUrl) {
      driverMarkerRef.current.setIcon({ url: mapIconUrl, scaledSize: new g.maps.Size(32, 32), anchor: new g.maps.Point(16, 16) });
      driverMarkerRef.current.setOptions({ optimized: false });
    } else {
      // Navigation arrow marker
      driverMarkerRef.current.setIcon({
        path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 7, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 2.5,
        rotation: heading, anchor: new g.maps.Point(0, 2.5),
      });
    }

    if (!userInteractingRef.current && followDriver) {
      mapInstance.current.panTo(currentPos);
      if (isNavigating) {
        mapInstance.current.setZoom(18);
        // Rotate map heading to match driving direction
        if (heading && mapInstance.current.setHeading) {
          mapInstance.current.setHeading(heading);
        }
      }
    }
  }, [currentPos, isNavigating, mapIconUrl, currentHeading, currentSpeed, navSteps, currentStepIndex, followDriver]);

  const parseNavStepsRef = useRef<(result: any) => void>(() => {});

  // Parse navigation steps from directions result
  useEffect(() => {
    parseNavStepsRef.current = (result: any) => {
      try {
        const route = result.routes[0];
        const leg = route.legs[0];
        
        setNavEta(leg.duration?.text || "");
        setNavDistance(leg.distance?.text || "");
        
        const etaMins = Math.round((leg.duration?.value || 0) / 60);
        const distKm = Math.round((leg.distance?.value || 0) / 100) / 10;
        onNavUpdate?.(leg.duration?.text || "", leg.distance?.text || "", etaMins, distKm);
        
        const steps: NavStep[] = leg.steps.map((step: any) => ({
          instruction: step.instructions?.replace(/<[^>]*>/g, '') || '',
          distance: step.distance?.text || '',
          maneuver: step.maneuver || undefined,
          endLat: step.end_location?.lat?.() ?? undefined,
          endLng: step.end_location?.lng?.() ?? undefined,
        }));
        setNavSteps(steps);
        
        // Auto-advance step based on driver proximity
        const pos = currentPos;
        if (pos && steps.length > 0) {
          let closestIdx = 0;
          let closestDist = Infinity;
          
          leg.steps.forEach((step: any, idx: number) => {
            const endLat = step.end_location.lat();
            const endLng = step.end_location.lng();
            const dist = Math.sqrt(Math.pow(pos.lat - endLat, 2) + Math.pow(pos.lng - endLng, 2));
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
    };
  });

  // Route when navigating — use refs for volatile values to avoid re-triggering
  const currentPosRef = useRef(currentPos);
  currentPosRef.current = currentPos;

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

    const pickup = pickupCoords ? { lat: pickupCoords[0], lng: pickupCoords[1] } : null;
    const dropoff = dropoffCoords ? { lat: dropoffCoords[0], lng: dropoffCoords[1] } : null;

    if (!pickup || !dropoff) return;

    let destination: { lat: number; lng: number };
    let destLabel: string;
    let destColor: string;

    if (tripPhase === "in_progress") {
      destination = dropoff;
      destLabel = "D";
      destColor = "#ef4444";
    } else if (tripPhase === "arrived") {
      destination = dropoff;
      destLabel = "D";
      destColor = "#ef4444";
    } else {
      destination = pickup;
      destLabel = "P";
      destColor = "#22c55e";
    }

    // Destination marker with pulse effect
    const destMarkerOpts: any = {
      map, position: destination, zIndex: 1000,
    };
    if (tripPhase === "heading_to_pickup" && passengerMapIconUrl) {
      destMarkerOpts.icon = { url: passengerMapIconUrl, scaledSize: new g.maps.Size(28, 28), anchor: new g.maps.Point(14, 14) };
    } else {
      destMarkerOpts.label = { text: destLabel, color: "white", fontWeight: "700", fontSize: "13px" };
      destMarkerOpts.icon = { path: g.maps.SymbolPath.CIRCLE, scale: 16, fillColor: destColor, fillOpacity: 1, strokeColor: "white", strokeWeight: 3 };
    }
    const destMarker = new g.maps.Marker(destMarkerOpts);
    rideMarkersRef.current = [destMarker];

    // Pulse circle around destination
    const pulseCircle = new g.maps.Circle({
      map, center: destination, radius: 30,
      strokeColor: destColor, strokeWeight: 2, strokeOpacity: 0.4,
      fillColor: destColor, fillOpacity: 0.1,
    });
    rideMarkersRef.current.push(pulseCircle);

    if (tripPhase === "in_progress") {
      const pickupMarker = new g.maps.Marker({
        map, position: pickup, zIndex: 999,
        label: { text: "P", color: "white", fontWeight: "700", fontSize: "11px" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#22c55e", fillOpacity: 0.5, strokeColor: "white", strokeWeight: 2 },
      });
      rideMarkersRef.current.push(pickupMarker);
    }

    if (tripPhase === "heading_to_pickup") {
      const dropMarker = new g.maps.Marker({
        map, position: dropoff, zIndex: 999,
        label: { text: "D", color: "white", fontWeight: "700", fontSize: "11px" },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#ef4444", fillOpacity: 0.4, strokeColor: "white", strokeWeight: 2 },
      });
      rideMarkersRef.current.push(dropMarker);
    }

    // Create a single DirectionsRenderer and reuse it to avoid flashing
    const routeColor = tripPhase === "in_progress" ? "#4285F4" : "#22c55e";
    const dr = new g.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      suppressInfoWindows: true,
      preserveViewport: true,
      polylineOptions: {
        strokeColor: routeColor,
        strokeWeight: 7,
        strokeOpacity: 0.85,
      },
    });
    directionsRendererRef.current = dr;

    const fetchRoute = () => {
      const driverPos = currentPosRef.current;
      if (!driverPos) return;
      let origin: { lat: number; lng: number };
      if (tripPhase === "arrived") {
        origin = pickup;
      } else {
        origin = driverPos;
      }

      const ds = new g.maps.DirectionsService();
      ds.route({
        origin,
        destination,
        travelMode: g.maps.TravelMode.DRIVING,
        provideRouteAlternatives: false,
      }).then((result: any) => {
        if (directionsRendererRef.current === dr) {
          dr.setDirections(result);
          parseNavStepsRef.current(result);
        }
      }).catch((err: any) => console.error("Directions error:", err));
    };

    fetchRoute();
    routeRefreshRef.current = setInterval(fetchRoute, 15000);

    return () => {
      if (routeRefreshRef.current) { clearInterval(routeRefreshRef.current); routeRefreshRef.current = null; }
    };
  }, [isNavigating, pickupCoords?.[0], pickupCoords?.[1], dropoffCoords?.[0], dropoffCoords?.[1], tripPhase]);

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
      if (!currentPos) return;
      const center = currentPos;
      radiusCircleRef.current = new g.maps.Circle({
        map, center, radius: radiusKm * 1000,
        strokeColor: "#4285F4", strokeWeight: 2, strokeOpacity: 0.6,
        fillColor: "#4285F4", fillOpacity: 0.08,
      });
    }
  }, [radiusKm, isNavigating, currentPos, showRadius]);

  // Passenger live location marker (shown before trip starts)
  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;

    // Only show during heading_to_pickup or arrived phases
    if (!passengerLiveLocation || tripPhase === "in_progress" || !isNavigating) {
      if (passengerLiveMarkerRef.current) {
        passengerLiveMarkerRef.current.setMap(null);
        passengerLiveMarkerRef.current = null;
      }
      if (passengerPulseRef.current) {
        passengerPulseRef.current.setMap(null);
        passengerPulseRef.current = null;
      }
      if (passengerPulseIntervalRef.current) {
        clearInterval(passengerPulseIntervalRef.current);
        passengerPulseIntervalRef.current = null;
      }
      return;
    }

    const pos = { lat: passengerLiveLocation.lat, lng: passengerLiveLocation.lng };

    // Update or create the pulsing circle overlay
    if (passengerPulseRef.current) {
      passengerPulseRef.current.setCenter(pos);
    } else {
      const pulseCircle = new g.maps.Circle({
        map,
        center: pos,
        radius: 30,
        fillColor: "#3b82f6",
        fillOpacity: 0.25,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.4,
        strokeWeight: 2,
        zIndex: 997,
        clickable: false,
      });
      passengerPulseRef.current = pulseCircle;

      // Animate the pulse
      let growing = true;
      let currentRadius = 30;
      passengerPulseIntervalRef.current = setInterval(() => {
        if (!passengerPulseRef.current) return;
        if (growing) {
          currentRadius += 2;
          if (currentRadius >= 60) growing = false;
        } else {
          currentRadius -= 2;
          if (currentRadius <= 30) growing = true;
        }
        passengerPulseRef.current.setRadius(currentRadius);
        passengerPulseRef.current.setOptions({
          fillOpacity: 0.25 - (currentRadius - 30) * 0.006,
          strokeOpacity: 0.4 - (currentRadius - 30) * 0.01,
        });
      }, 50);
    }

    // Update or create the main marker
    if (passengerLiveMarkerRef.current) {
      passengerLiveMarkerRef.current.setPosition(pos);
    } else {
      const markerOpts: any = {
        map,
        position: pos,
        zIndex: 998,
        title: "Passenger",
      };
      if (passengerMapIconUrl) {
        markerOpts.icon = { url: passengerMapIconUrl, scaledSize: new g.maps.Size(32, 32), anchor: new g.maps.Point(16, 16) };
      } else {
        markerOpts.label = { text: "👤", fontSize: "18px" };
        markerOpts.icon = { path: g.maps.SymbolPath.CIRCLE, scale: 14, fillColor: "#3b82f6", fillOpacity: 0.9, strokeColor: "white", strokeWeight: 3 };
      }
      passengerLiveMarkerRef.current = new g.maps.Marker(markerOpts);
    }
  }, [passengerLiveLocation, tripPhase, isNavigating, passengerMapIconUrl]);

  // Maneuver icons - more visual
  const getManeuverIcon = (maneuver?: string) => {
    if (!maneuver) return "↑";
    if (maneuver.includes("turn-left") || maneuver === "left") return "↰";
    if (maneuver.includes("turn-right") || maneuver === "right") return "↱";
    if (maneuver.includes("sharp-left")) return "↲";
    if (maneuver.includes("sharp-right")) return "↳";
    if (maneuver.includes("slight-left")) return "↖";
    if (maneuver.includes("slight-right")) return "↗";
    if (maneuver.includes("uturn")) return "↩";
    if (maneuver.includes("roundabout")) return "↻";
    if (maneuver.includes("merge")) return "↗";
    if (maneuver.includes("ramp-left")) return "↙";
    if (maneuver.includes("ramp-right")) return "↘";
    if (maneuver.includes("keep-left")) return "↖";
    if (maneuver.includes("keep-right")) return "↗";
    return "↑";
  };

  const getManeuverColor = (maneuver?: string) => {
    if (!maneuver) return "bg-primary";
    if (maneuver.includes("left")) return "bg-blue-500";
    if (maneuver.includes("right")) return "bg-blue-500";
    if (maneuver.includes("uturn")) return "bg-amber-500";
    if (maneuver.includes("roundabout")) return "bg-violet-500";
    return "bg-primary";
  };

  // Expose recenter function and availability to parent
  useEffect(() => {
    onRecenterAvailableChange?.(userPannedAway && !isNavigating);
  }, [userPannedAway, isNavigating, onRecenterAvailableChange]);

  useEffect(() => {
    if (recenterRef) {
      recenterRef.current = () => {
        userInteractingRef.current = false;
        setUserPannedAway(false);
        if (currentPos && mapInstance.current) {
          mapInstance.current.panTo(currentPos);
          mapInstance.current.setZoom(16);
        }
      };
    }
  }, [currentPos, recenterRef]);

  // Expose follow toggle to parent
  useEffect(() => {
    onFollowDriverChange?.(followDriver);
  }, [followDriver, onFollowDriverChange]);

  useEffect(() => {
    if (followToggleRef) {
      followToggleRef.current = () => {
        if (followDriver) {
          setFollowDriver(false);
          userInteractingRef.current = true;
          setUserPannedAway(false);
          const g = (window as any).google;
          if (g?.maps && mapInstance.current) {
            mapInstance.current.setTilt(0);
            if (mapInstance.current.setHeading) mapInstance.current.setHeading(0);
            const bounds = new g.maps.LatLngBounds();
            if (currentPos) bounds.extend(currentPos);
            if (pickupCoords) bounds.extend({ lat: pickupCoords[0], lng: pickupCoords[1] });
            if (dropoffCoords) bounds.extend({ lat: dropoffCoords[0], lng: dropoffCoords[1] });
            mapInstance.current.fitBounds(bounds, 60);
          }
        } else {
          setFollowDriver(true);
          userInteractingRef.current = false;
          setUserPannedAway(false);
          if (currentPos && mapInstance.current) {
            mapInstance.current.panTo(currentPos);
            mapInstance.current.setZoom(18);
            mapInstance.current.setTilt(45);
          }
        }
      };
    }
  }, [followDriver, followToggleRef, currentPos, pickupCoords, dropoffCoords]);

  if (error) {
    return <div className="absolute inset-0 bg-surface flex items-center justify-center text-muted-foreground text-sm">Map unavailable</div>;
  }
  if (!isLoaded) {
    return <div className="absolute inset-0 bg-surface flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const nextStep = navSteps[currentStepIndex + 1];

  return (
    <>
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* Route/follow toggle removed — now in DriverApp sidebar */}

      {/* Speed indicator — only show on map when trip panel is NOT open */}
      {isNavigating && !tripPanelOpen && (
        <div className="absolute bottom-4 left-3 z-[460] hidden md:block">
          <div className="w-14 h-14 rounded-full bg-card/95 backdrop-blur-md shadow-lg border-2 border-border/30 flex flex-col items-center justify-center">
            <span className="text-base font-black text-foreground leading-none">{currentSpeed}</span>
            <span className="text-[8px] text-muted-foreground font-medium mt-0.5">km/h</span>
          </div>
        </div>
      )}


    </>
  );
};

// Clean light style for navigation mode
const lightNavStyle = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e0e0e0" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#ffd54f" }] },
  { featureType: "landscape", elementType: "geometry.fill", stylers: [{ color: "#f5f5f5" }] },
];

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
