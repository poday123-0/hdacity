import { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { Navigation, ChevronUp, ChevronDown, Locate, Route, Crosshair, X } from "lucide-react";

// Utility: create a rotated version of an image URL via canvas (no circle, just the icon rotated)
const createRotatedIcon = (
  imageUrl: string,
  heading: number,
  size: number,
  callback: (dataUrl: string) => void
) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cx = size / 2;
    const cy = size / 2;

    // Rotate the entire image by heading
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((heading * Math.PI) / 180);
    // Add subtle drop shadow for visibility on map
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.drawImage(img, -cx, -cy, size, size);
    ctx.restore();

    callback(canvas.toDataURL("image/png"));
  };
  img.onerror = () => callback(imageUrl);
  img.src = imageUrl;
};

// Utility: smoothly animate a marker between two positions
const animateMarker = (
  marker: any,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  duration: number,
  onComplete?: () => void
) => {
  const startTime = performance.now();
  const animate = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic for smooth deceleration
    const eased = 1 - Math.pow(1 - progress, 3);
    const lat = from.lat + (to.lat - from.lat) * eased;
    const lng = from.lng + (to.lng - from.lng) * eased;
    marker.setPosition({ lat, lng });
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      onComplete?.();
    }
  };
  requestAnimationFrame(animate);
};
import { motion, AnimatePresence } from "framer-motion";

const getDistanceMeters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) => {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const getPointAhead = (
  origin: { lat: number; lng: number },
  headingDeg: number,
  meters: number
) => {
  const R = 6378137;
  const bearing = (headingDeg * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const angularDistance = meters / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
};




type TripPhase = "heading_to_pickup" | "arrived" | "in_progress";

export interface NavSettings {
  followSensitivity: "low" | "medium" | "high"; // camera update throttle
  lookAheadDistance: "short" | "medium" | "far"; // how far ahead the camera looks
  rerouteAggressiveness: "relaxed" | "normal" | "aggressive"; // how often to reroute
  autoRefocusOnTurn: boolean; // snap back to follow on turn changes
}

export const DEFAULT_NAV_SETTINGS: NavSettings = {
  followSensitivity: "medium",
  lookAheadDistance: "medium",
  rerouteAggressiveness: "normal",
  autoRefocusOnTurn: true,
};

const NAV_SETTINGS_KEY = "driver_nav_settings";

export const loadNavSettings = (): NavSettings => {
  try {
    const raw = localStorage.getItem(NAV_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_NAV_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_NAV_SETTINGS };
};

export const saveNavSettings = (s: NavSettings) => {
  try { localStorage.setItem(NAV_SETTINGS_KEY, JSON.stringify(s)); } catch {}
};

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
  navSettings?: NavSettings;
  onMapHeadingChange?: (heading: number) => void;
  resetNorthRef?: React.MutableRefObject<(() => void) | null>;
  onMapReady?: (map: any) => void;
}

const DriverMap = ({ isNavigating, tripPhase = "heading_to_pickup", radiusKm, gpsEnabled, pickupCoords, dropoffCoords, pickupLabel, dropoffLabel, mapIconUrl, passengerMapIconUrl, passengerLiveLocation, onRecenterAvailableChange, recenterRef, onNavUpdate, onFollowDriverChange, followToggleRef, onSpeedChange, tripPanelOpen, onNavStepChange, navSettings: navSettingsProp, onMapHeadingChange, resetNorthRef, onMapReady }: DriverMapProps) => {
  const navSettings = navSettingsProp || DEFAULT_NAV_SETTINGS;
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const rideMarkersRef = useRef<any[]>([]);
  const passengerLiveMarkerRef = useRef<any>(null);
  const passengerPulseRef = useRef<any>(null);
  const passengerPulseIntervalRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const routePathRef = useRef<{ lat: number; lng: number }[]>([]);
  const radiusCircleRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const routeRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const userInteractingRef = useRef(false);
  const [userPannedAway, setUserPannedAway] = useState(false);
  const [followDriver, setFollowDriver] = useState(true);
  const interactTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isLoaded, error, mapId } = useGoogleMaps();
  const prevHeadingRef = useRef<number>(0);
  const prevMarkerPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const filteredPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const animatingRef = useRef(false);
  const rotatedIconCacheRef = useRef<{ url: string; heading: number; dataUrl: string } | null>(null);
  const routeFetchInFlightRef = useRef(false);
  const routeRequestSeqRef = useRef(0);
  const lastRouteFetchAtRef = useRef(0);
  const lastRerouteOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastCameraUpdateAtRef = useRef(0);
  const passengerLiveLocationRef = useRef(passengerLiveLocation);
  passengerLiveLocationRef.current = passengerLiveLocation;

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
  const [mapHeading, setMapHeading] = useState(0);

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
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // Use a ref for initial center so GPS updates don't re-trigger map init
  const initialCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  if (!initialCenterRef.current) {
    initialCenterRef.current = currentPos || (pickupCoords ? { lat: pickupCoords[0], lng: pickupCoords[1] } : null);
  }
  // Update ref when we get a position (for first init)
  if (!initialCenterRef.current && currentPos) {
    initialCenterRef.current = currentPos;
  }
  if (!initialCenterRef.current && pickupCoords) {
    initialCenterRef.current = { lat: pickupCoords[0], lng: pickupCoords[1] };
  }

  // Init map — only once
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current) return;
    const center = initialCenterRef.current;
    if (!center) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const isDark = document.documentElement.classList.contains("dark");

    const mapOptions: any = {
      center,
      zoom: 16,
      disableDefaultUI: true,
      zoomControl: false,
      rotateControl: true,
      gestureHandling: "greedy",
    };
    // Vector map (enables two-finger rotation, tilt, heading)
    if (mapId) {
      mapOptions.mapId = mapId;
      const colorScheme = g.maps?.ColorScheme;
      if (colorScheme) {
        mapOptions.colorScheme = isDark ? colorScheme.DARK : colorScheme.LIGHT;
      }
      // Also apply raster styles as fallback for dark mode
      if (!colorScheme && isDark) {
        mapOptions.styles = darkMapStyle;
      }
    } else {
      mapOptions.styles = isDark ? darkMapStyle : lightNavStyle;
    }

    const map = new g.maps.Map(mapRef.current, mapOptions);

    const markerOpts: any = {
      map, position: center, zIndex: 1000,
    };
    if (mapIconUrl) {
      markerOpts.icon = { url: mapIconUrl, scaledSize: new g.maps.Size(44, 44), anchor: new g.maps.Point(22, 22) };
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
    onMapReady?.(map);

    // Detect user interaction — only block auto-follow on drag, NOT on programmatic zoom
    let programmaticZoom = false;
    let programmaticHeading = false;
    const setProgrammaticZoom = () => { programmaticZoom = true; setTimeout(() => { programmaticZoom = false; }, 300); };
    const setProgrammaticHeading = () => { programmaticHeading = true; setTimeout(() => { programmaticHeading = false; }, 300); };
    (map as any)._setProgrammaticZoom = setProgrammaticZoom;
    (map as any)._setProgrammaticHeading = setProgrammaticHeading;

    map.addListener("dragstart", () => {
      userInteractingRef.current = true;
      setUserPannedAway(true);
      setFollowDriver(false);
    });
    map.addListener("heading_changed", () => {
      const h = typeof map.getHeading === "function" ? (map.getHeading() || 0) : 0;
      setMapHeading(h);
      onMapHeadingChange?.(h);
      if (programmaticHeading) return;
      // Manual rotation detected — break follow so auto-heading stops
      userInteractingRef.current = true;
      setFollowDriver(false);
    });
    map.addListener("zoom_changed", () => {
      if (programmaticZoom) return;
    });

    return () => { mapInstance.current = null; };
  }, [isLoaded, !!initialCenterRef.current, mapId]);

  // Theme observer — smooth crossfade overlay
  const [themeTransition, setThemeTransition] = useState(false);
  useEffect(() => {
    if (!mapInstance.current) return;
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      setThemeTransition(true);
      t1 = setTimeout(() => {
        const isDark = document.documentElement.classList.contains("dark");
        const g = (window as any).google;
        if (mapId) {
          const colorScheme = g?.maps?.ColorScheme;
          if (colorScheme) {
            mapInstance.current?.setOptions({ colorScheme: isDark ? colorScheme.DARK : colorScheme.LIGHT });
          }
          // Always also apply raster styles for dark mode reliability
          mapInstance.current?.setOptions({ styles: isDark ? darkMapStyle : (isNavigating ? lightNavStyle : []) });
        } else {
          mapInstance.current?.setOptions({ styles: isDark ? darkMapStyle : (isNavigating ? lightNavStyle : []) });
        }
        t2 = setTimeout(() => setThemeTransition(false), 500);
      }, 50);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { observer.disconnect(); clearTimeout(t1); clearTimeout(t2); };
  }, [isLoaded, isNavigating, mapId]);

  // Navigation mode: tilt map + higher zoom + heading rotation
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (isNavigating) {
      map.setTilt(45);
      // Reset follow mode when entering navigation
      setFollowDriver(true);
      userInteractingRef.current = false;
      setUserPannedAway(false);
      if ((map as any)._setProgrammaticZoom) (map as any)._setProgrammaticZoom();
      map.setZoom(18);
      if (typeof map.setHeading === "function") {
        if ((map as any)._setProgrammaticHeading) (map as any)._setProgrammaticHeading();
        map.setHeading(prevHeadingRef.current || 0);
      }
      const isDark = document.documentElement.classList.contains("dark");
      if (mapId) {
        const colorScheme = (window as any).google?.maps?.ColorScheme;
        if (colorScheme) map.setOptions({ colorScheme: isDark ? colorScheme.DARK : colorScheme.LIGHT });
      }
      map.setOptions({ styles: isDark ? darkMapStyle : lightNavStyle });
    } else {
      map.setTilt(0);
      if ((map as any)._setProgrammaticZoom) (map as any)._setProgrammaticZoom();
      map.setZoom(16);
      if (typeof map.setHeading === "function") {
        if ((map as any)._setProgrammaticHeading) (map as any)._setProgrammaticHeading();
        map.setHeading(0);
      }
      const isDark = document.documentElement.classList.contains("dark");
      if (mapId) {
        const colorScheme = (window as any).google?.maps?.ColorScheme;
        if (colorScheme) map.setOptions({ colorScheme: isDark ? colorScheme.DARK : colorScheme.LIGHT });
      }
      map.setOptions({ styles: isDark ? darkMapStyle : [] });
    }
  }, [isNavigating, mapId]);

  // Update driver marker position, rotation & auto-follow
  useEffect(() => {
    if (!currentPos || !driverMarkerRef.current || !mapInstance.current) return;
    const g = (window as any).google;
    const map = mapInstance.current;

    // Position filtering (Uber-like stability)
    const prevFiltered = filteredPosRef.current;
    let displayPos = currentPos;
    if (prevFiltered) {
      const jumpMeters = getDistanceMeters(prevFiltered, currentPos);
      if (jumpMeters > 150 && currentSpeed < 20) {
        // Ignore probable GPS spike when moving slowly
        displayPos = prevFiltered;
      } else {
        const alpha = isNavigating ? (currentSpeed > 25 ? 0.45 : 0.3) : 0.35;
        displayPos = {
          lat: prevFiltered.lat + (currentPos.lat - prevFiltered.lat) * alpha,
          lng: prevFiltered.lng + (currentPos.lng - prevFiltered.lng) * alpha,
        };
      }
    }
    filteredPosRef.current = displayPos;

    // Calculate heading: GPS heading → bearing from previous position → bearing to next step → last known
    let heading = prevHeadingRef.current;

    // 1) Try GPS heading (most accurate when moving)
    if (currentHeading != null && !isNaN(currentHeading) && currentSpeed > 2) {
      heading = currentHeading;
    }
    // 2) Calculate bearing from previous rendered marker position
    else if (prevMarkerPosRef.current) {
      const prev = prevMarkerPosRef.current;
      const dLat = displayPos.lat - prev.lat;
      const dLng = displayPos.lng - prev.lng;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist > 0.000008) { // ~1m movement threshold
        const dLngRad = (displayPos.lng - prev.lng) * Math.PI / 180;
        const lat1 = prev.lat * Math.PI / 180;
        const lat2 = displayPos.lat * Math.PI / 180;
        const y = Math.sin(dLngRad) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLngRad);
        heading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      }
    }
    // 3) Bearing to next navigation step (when stationary)
    if (isNavigating && currentSpeed <= 2 && navSteps[currentStepIndex]?.endLat != null) {
      const nextStep = navSteps[currentStepIndex];
      if (nextStep.endLat && nextStep.endLng) {
        const dLng = (nextStep.endLng - displayPos.lng) * Math.PI / 180;
        const lat1 = displayPos.lat * Math.PI / 180;
        const lat2 = nextStep.endLat * Math.PI / 180;
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        heading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      }
    }

    // Smooth heading transition (avoid jumpy rotations)
    const prevH = prevHeadingRef.current;
    let diff = heading - prevH;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    // Only update heading if change is significant (> 3°)
    if (Math.abs(diff) > 3) {
      heading = prevH + diff * 0.4;
      if (heading < 0) heading += 360;
      if (heading >= 360) heading -= 360;
    } else {
      heading = prevH;
    }
    prevHeadingRef.current = heading;

    // Smooth animation: interpolate from previous position to new position
    const prevPos = prevMarkerPosRef.current;
    if (prevPos && !animatingRef.current && isNavigating) {
      const dist = Math.sqrt(Math.pow(displayPos.lat - prevPos.lat, 2) + Math.pow(displayPos.lng - prevPos.lng, 2));
      // Only animate if distance is small enough (not a GPS jump)
      if (dist < 0.003 && dist > 0.000005) {
        animatingRef.current = true;
        animateMarker(driverMarkerRef.current, prevPos, displayPos, 1000, () => {
          animatingRef.current = false;
        });
      } else {
        driverMarkerRef.current.setPosition(displayPos);
      }
    } else if (!animatingRef.current) {
      driverMarkerRef.current.setPosition(displayPos);
    }
    prevMarkerPosRef.current = displayPos;

    // Use exact admin map icon (no canvas transformation)
    if (mapIconUrl) {
      driverMarkerRef.current.setIcon({
        url: mapIconUrl,
        scaledSize: new g.maps.Size(36, 36),
        anchor: new g.maps.Point(18, 18),
      });
      driverMarkerRef.current.setOptions({ optimized: false });
    } else {
      driverMarkerRef.current.setIcon({
        path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 8, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 2.5,
        rotation: heading, anchor: new g.maps.Point(0, 2.5),
      });
    }

    // Auto-follow with forward-looking camera + heading lock
    const cameraThrottleMs = navSettings.followSensitivity === "high" ? 200 : navSettings.followSensitivity === "low" ? 600 : 350;
    if (followDriver) {
      userInteractingRef.current = false;
      if ((map as any)._setProgrammaticZoom) (map as any)._setProgrammaticZoom();
      if ((map as any)._setProgrammaticHeading) (map as any)._setProgrammaticHeading();

      const now = Date.now();
      if (now - lastCameraUpdateAtRef.current > cameraThrottleMs) {
        lastCameraUpdateAtRef.current = now;

        if (isNavigating) {
          if (typeof map.setHeading === "function") {
            if ((map as any)._setProgrammaticHeading) (map as any)._setProgrammaticHeading();
            map.setHeading(heading);
          }
          const lookAheadBase = navSettings.lookAheadDistance === "far" ? { slow: 80, mid: 110, fast: 140 } : navSettings.lookAheadDistance === "short" ? { slow: 25, mid: 40, fast: 60 } : { slow: 50, mid: 70, fast: 95 };
          const lookAheadMeters = currentSpeed > 40 ? lookAheadBase.fast : currentSpeed > 20 ? lookAheadBase.mid : lookAheadBase.slow;
          const cameraTarget = getPointAhead(displayPos, heading, lookAheadMeters);
          map.panTo(cameraTarget);

          const currentZoom = map.getZoom();
          if (currentZoom < 17 || currentZoom > 19) {
            map.setZoom(18);
          }
        } else {
          if (typeof map.setHeading === "function") {
            if ((map as any)._setProgrammaticHeading) (map as any)._setProgrammaticHeading();
            map.setHeading(0);
          }
          map.panTo(displayPos);
        }
      }
    }
  }, [currentPos, isNavigating, mapIconUrl, currentHeading, currentSpeed, navSteps, currentStepIndex, followDriver, navSettings]);

  // Trim route polyline behind driver — remove passed segments
  useEffect(() => {
    if (!isNavigating || !currentPos || !routePolylineRef.current || routePathRef.current.length < 2) return;
    const fullPath = routePathRef.current;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < fullPath.length; i++) {
      const d = getDistanceMeters(currentPos, fullPath[i]);
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    }
    if (closestIdx > 0) {
      const trimmedPath = [{ lat: currentPos.lat, lng: currentPos.lng }, ...fullPath.slice(closestIdx)];
      routePolylineRef.current.setPath(trimmedPath);
    }
  }, [currentPos, isNavigating]);

  // Apply exact admin map icon when it becomes available
  useEffect(() => {
    if (!mapIconUrl || !driverMarkerRef.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    driverMarkerRef.current.setIcon({
      url: mapIconUrl,
      scaledSize: new g.maps.Size(36, 36),
      anchor: new g.maps.Point(18, 18),
    });
    driverMarkerRef.current.setOptions({ optimized: false });
  }, [mapIconUrl]);

  const prevStepIndexRef = useRef(0);
  useEffect(() => {
    if (!isNavigating || !navSettings.autoRefocusOnTurn) return;
    if (currentStepIndex !== prevStepIndexRef.current && currentStepIndex > prevStepIndexRef.current) {
      prevStepIndexRef.current = currentStepIndex;
      if (!followDriver) {
        setFollowDriver(true);
        userInteractingRef.current = false;
        setUserPannedAway(false);
      }
    }
    prevStepIndexRef.current = currentStepIndex;
  }, [currentStepIndex, isNavigating, followDriver, navSettings.autoRefocusOnTurn]);

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
        
        // Auto-advance step based on driver proximity (never jump backwards)
        const pos = currentPos;
        if (pos && steps.length > 0) {
          const startIdx = Math.max(0, Math.min(currentStepIndex, steps.length - 1));
          let closestIdx = startIdx;
          let closestDist = Infinity;

          for (let idx = startIdx; idx < leg.steps.length; idx++) {
            const step = leg.steps[idx];
            const endLat = step.end_location.lat();
            const endLng = step.end_location.lng();
            const dist = getDistanceMeters(pos, { lat: endLat, lng: endLng });
            if (dist < closestDist) {
              closestDist = dist;
              closestIdx = idx;
            }
          }

          setCurrentStepIndex((prev) => Math.max(prev, Math.min(closestIdx, steps.length - 1)));
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
    if (routePolylineRef.current) { routePolylineRef.current.setMap(null); routePolylineRef.current = null; }
    routePathRef.current = [];
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
    // Use ref to avoid re-triggering effect when passengerLiveLocation changes
    if (tripPhase === "heading_to_pickup" && passengerMapIconUrl && !passengerLiveLocationRef.current) {
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

    // Use hidden DirectionsRenderer (suppressPolylines) + custom polyline for trimming
    const routeColor = tripPhase === "in_progress" ? "#4285F4" : "#22c55e";
    const dr = new g.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      suppressInfoWindows: true,
      suppressPolylines: true,
      preserveViewport: true,
    });
    directionsRendererRef.current = dr;

    // Create custom route polyline (will be updated with trimmed path)
    const polyline = new g.maps.Polyline({
      map,
      strokeColor: routeColor,
      strokeWeight: 7,
      strokeOpacity: 0.85,
      zIndex: 100,
    });
    routePolylineRef.current = polyline;

    const rerouteConfig = navSettings.rerouteAggressiveness === "aggressive"
      ? { interval: 3000, movement: 10 }
      : navSettings.rerouteAggressiveness === "relaxed"
      ? { interval: 10000, movement: 40 }
      : { interval: 5000, movement: 20 };
    const MIN_REROUTE_INTERVAL_MS = rerouteConfig.interval;
    const MIN_REROUTE_MOVEMENT_M = rerouteConfig.movement;

    const fetchRoute = (force = false) => {
      const driverPos = currentPosRef.current;
      if (!driverPos || routeFetchInFlightRef.current) return;

      let origin: { lat: number; lng: number };
      if (tripPhase === "arrived") {
        origin = pickup;
      } else {
        origin = driverPos;
      }

      const now = Date.now();
      const lastOrigin = lastRerouteOriginRef.current;
      const movedSinceLastRoute = lastOrigin ? getDistanceMeters(origin, lastOrigin) : Infinity;
      if (!force) {
        if (now - lastRouteFetchAtRef.current < MIN_REROUTE_INTERVAL_MS) return;
        if (movedSinceLastRoute < MIN_REROUTE_MOVEMENT_M) return;
      }

      routeFetchInFlightRef.current = true;
      const requestSeq = ++routeRequestSeqRef.current;

      const ds = new g.maps.DirectionsService();
      ds.route({
        origin,
        destination,
        travelMode: g.maps.TravelMode.DRIVING,
        provideRouteAlternatives: false,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: g.maps.TrafficModel?.BEST_GUESS || "bestguess",
        },
      }).then((result: any) => {
        if (directionsRendererRef.current === dr && routeRequestSeqRef.current === requestSeq) {
          dr.setDirections(result);
          parseNavStepsRef.current(result);
          lastRouteFetchAtRef.current = Date.now();
          lastRerouteOriginRef.current = origin;

          // Extract detailed path from each step (road-snapped, not overview)
          try {
            const legs = result.routes[0].legs;
            const pathCoords: { lat: number; lng: number }[] = [];
            for (const leg of legs) {
              for (const step of leg.steps) {
                const stepPath = step.path || [];
                for (const p of stepPath) {
                  pathCoords.push({ lat: p.lat(), lng: p.lng() });
                }
              }
            }
            routePathRef.current = pathCoords;
            if (routePolylineRef.current) {
              routePolylineRef.current.setPath(pathCoords);
            }
          } catch {}
        }
      }).catch((err: any) => console.error("Directions error:", err))
        .finally(() => {
          if (routeRequestSeqRef.current === requestSeq) {
            routeFetchInFlightRef.current = false;
          }
        });
    };

    fetchRoute(true);
    routeRefreshRef.current = setInterval(() => fetchRoute(false), rerouteConfig.interval);

    return () => {
      if (routeRefreshRef.current) { clearInterval(routeRefreshRef.current); routeRefreshRef.current = null; }
      routeFetchInFlightRef.current = false;
    };
  }, [isNavigating, pickupCoords?.[0], pickupCoords?.[1], dropoffCoords?.[0], dropoffCoords?.[1], tripPhase, navSettings.rerouteAggressiveness]);

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
      {/* Theme transition overlay */}
      <div
        className={`absolute inset-0 z-[1] pointer-events-none bg-background/90 backdrop-blur-sm transition-opacity duration-500 ease-in-out ${themeTransition ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Compass reset exposed via ref to parent */}
      {(() => {
        if (resetNorthRef) {
          resetNorthRef.current = () => {
            const map = mapInstance.current;
            if (!map) return;
            if ((map as any)._setProgrammaticHeading) (map as any)._setProgrammaticHeading();
            if (typeof map.setHeading === "function") map.setHeading(0);
            map.setTilt(0);
            setMapHeading(0);
            onMapHeadingChange?.(0);
          };
        }
        return null;
      })()}

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
