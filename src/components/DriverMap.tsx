import { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { selectShortestRoute } from "@/lib/shortest-route";
import { useRoadClosures } from "@/hooks/use-road-closures";
import { supabase } from "@/integrations/supabase/client";
import { Navigation, ChevronUp, ChevronDown, Locate, Route, Crosshair, X, AlertTriangle, MapPin, Construction, Car, TriangleAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
  /** Pass GPS position from parent to avoid duplicate GPS watchers (battery optimization) */
  externalPosition?: { lat: number; lng: number } | null;
  /** Ref to trigger free navigation from parent */
  startFreeNavRef?: React.MutableRefObject<((target: { lat: number; lng: number }) => void) | null>;
  /** Notify parent when free nav starts/stops */
  onFreeNavChange?: (active: boolean) => void;
}

const DriverMap = ({ isNavigating, tripPhase = "heading_to_pickup", radiusKm, gpsEnabled, pickupCoords, dropoffCoords, pickupLabel, dropoffLabel, mapIconUrl, passengerMapIconUrl, passengerLiveLocation, onRecenterAvailableChange, recenterRef, onNavUpdate, onFollowDriverChange, followToggleRef, onSpeedChange, tripPanelOpen, onNavStepChange, navSettings: navSettingsProp, onMapHeadingChange, resetNorthRef, onMapReady, externalPosition, startFreeNavRef, onFreeNavChange }: DriverMapProps) => {
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
  const { closures: roadClosures, addClosure } = useRoadClosures();
  const roadClosureMarkersRef = useRef<any[]>([]);
  const roadClosureLinesRef = useRef<any[]>([]);
  const [closureWarning, setClosureWarning] = useState<string | null>(null);
  const closureWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHeadingRef = useRef<number>(0);
  const prevMarkerPosRef = useRef<{ lat: number; lng: number } | null>(null);

  // Driver closure reporting state
  const [reportMenuPos, setReportMenuPos] = useState<{ lat: number; lng: number; x: number; y: number } | null>(null);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportCoords, setReportCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [reportSeverity, setReportSeverity] = useState("closed");
  const [reportLaneSide, setReportLaneSide] = useState<"right" | "left" | null>(null);
  const [reportNotes, setReportNotes] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Free navigation state (driver picks a destination on map)
  const [freeNavTarget, setFreeNavTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [freeNavEta, setFreeNavEta] = useState("");
  const [freeNavDist, setFreeNavDist] = useState("");
  const [freeNavSteps, setFreeNavSteps] = useState<NavStep[]>([]);
  const [freeNavStepIndex, setFreeNavStepIndex] = useState(0);
  const freeNavPolylineRef = useRef<any>(null);
  const freeNavMarkerRef = useRef<any>(null);
  const freeNavIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const freeNavPathRef = useRef<{ lat: number; lng: number }[]>([]);
  const filteredPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const animatingRef = useRef(false);
  const rotatedIconCacheRef = useRef<{ url: string; heading: number; dataUrl: string } | null>(null);
  const routeFetchInFlightRef = useRef(false);
  const routeRequestSeqRef = useRef(0);
  const lastRouteFetchAtRef = useRef(0);
  const lastRerouteOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastCameraUpdateAtRef = useRef(0);
  const hasReceivedFirstGpsRef = useRef(false);
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
  const currentPosRef = useRef(currentPos);
  currentPosRef.current = currentPos;

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

  // Free navigation: start navigating to a tapped location
  const startFreeNav = useCallback((target: { lat: number; lng: number }) => {
    const g = (window as any).google;
    const map = mapInstance.current;
    if (!g?.maps || !map || !currentPos) return;

    // Clear previous free nav
    stopFreeNav();
    setFreeNavTarget(target);
    setFreeNavSteps([]);
    setFreeNavStepIndex(0);
    freeNavPathRef.current = [];

    // Place destination marker with pulse
    const marker = new g.maps.Marker({
      map,
      position: target,
      icon: {
        path: g.maps.SymbolPath.CIRCLE,
        scale: 16,
        fillColor: "#6366f1",
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 3,
      },
      label: { text: "📍", fontSize: "14px" },
      zIndex: 3000,
    });
    freeNavMarkerRef.current = marker;

    // Create polyline matching in-trip style
    const polyline = new g.maps.Polyline({
      map,
      strokeColor: "#6366f1",
      strokeWeight: 7,
      strokeOpacity: 0.85,
      zIndex: 100,
    });
    freeNavPolylineRef.current = polyline;

    // Switch to nav camera mode
    map.setTilt(0);
    if ((map as any)._setProgrammaticZoom) (map as any)._setProgrammaticZoom();
    map.setZoom(18);
    setFollowDriver(true);
    userInteractingRef.current = false;
    setUserPannedAway(false);

    const fetchFreeRoute = () => {
      const driverPos = currentPosRef.current;
      if (!driverPos) return;

      const ds = new g.maps.DirectionsService();
      ds.route({
        origin: driverPos,
        destination: target,
        travelMode: g.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
      }).then((raw: any) => {
        const result = selectShortestRoute(raw);
        const leg = result.routes?.[0]?.legs?.[0];
        if (!leg) return;

        // Extract road-snapped path from individual steps
        const pathCoords: { lat: number; lng: number }[] = [];
        for (const step of leg.steps) {
          for (const p of (step.path || [])) {
            pathCoords.push({ lat: p.lat(), lng: p.lng() });
          }
        }
        freeNavPathRef.current = pathCoords;
        if (freeNavPolylineRef.current) freeNavPolylineRef.current.setPath(pathCoords);
        setFreeNavEta(leg.duration?.text || "");
        setFreeNavDist(leg.distance?.text || "");

        // Extract turn-by-turn steps
        const steps: NavStep[] = leg.steps.map((step: any) => ({
          instruction: step.instructions?.replace(/<[^>]*>/g, '') || '',
          distance: step.distance?.text || '',
          maneuver: step.maneuver || undefined,
          endLat: step.end_location?.lat?.() ?? undefined,
          endLng: step.end_location?.lng?.() ?? undefined,
        }));
        setFreeNavSteps(steps);

        // Auto-advance step based on proximity
        if (driverPos && steps.length > 0) {
          let closestIdx = 0;
          let closestDist = Infinity;
          for (let idx = 0; idx < leg.steps.length; idx++) {
            const step = leg.steps[idx];
            const endLat = step.end_location.lat();
            const endLng = step.end_location.lng();
            const dist = getDistanceMeters(driverPos, { lat: endLat, lng: endLng });
            if (dist < closestDist) { closestDist = dist; closestIdx = idx; }
          }
          setFreeNavStepIndex((prev) => Math.max(prev, Math.min(closestIdx, steps.length - 1)));
        }
      }).catch(() => {});
    };

    fetchFreeRoute();
    freeNavIntervalRef.current = setInterval(fetchFreeRoute, 8000);
  }, [currentPos]);

  const stopFreeNav = useCallback(() => {
    setFreeNavTarget(null);
    setFreeNavEta("");
    setFreeNavDist("");
    setFreeNavSteps([]);
    setFreeNavStepIndex(0);
    freeNavPathRef.current = [];
    if (freeNavPolylineRef.current) { freeNavPolylineRef.current.setMap(null); freeNavPolylineRef.current = null; }
    if (freeNavMarkerRef.current) { freeNavMarkerRef.current.setMap(null); freeNavMarkerRef.current = null; }
    if (freeNavIntervalRef.current) { clearInterval(freeNavIntervalRef.current); freeNavIntervalRef.current = null; }
    // Reset camera to non-nav mode
    const map = mapInstance.current;
    if (map) {
      if ((map as any)._setProgrammaticZoom) (map as any)._setProgrammaticZoom();
      map.setZoom(16);
      if (typeof map.setHeading === "function") {
        if ((map as any)._setProgrammaticHeading) (map as any)._setProgrammaticHeading();
        map.setHeading(0);
      }
    }
  }, []);

  // Cleanup free nav on unmount
  useEffect(() => () => { stopFreeNav(); }, [stopFreeNav]);



  // Use external position from parent when not navigating (saves battery — no duplicate GPS watcher)
  // Only start own GPS watcher during navigation (needs high-frequency heading/speed data)
  useEffect(() => {
    // If navigating or free-nav, we need our own high-accuracy GPS for heading/speed
    const needsOwnGps = isNavigating || !!freeNavTarget;
    if (!needsOwnGps) {
      // Clean up any existing watcher when not navigating
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (pos.coords.speed != null && pos.coords.speed >= 0) setCurrentSpeed(Math.round(pos.coords.speed * 3.6));
        if (pos.coords.heading != null && !isNaN(pos.coords.heading)) setCurrentHeading(pos.coords.heading);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentPos(prev => {
          if (!prev && mapInstance.current) {
            mapInstance.current.panTo(newPos);
            mapInstance.current.setZoom(17);
          }
          return newPos;
        });
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
    return () => { if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; } };
  }, [isNavigating, freeNavTarget]);

  // When not navigating/free-nav, use external position from parent
  useEffect(() => {
    if (isNavigating || freeNavTarget || !externalPosition) return;
    setCurrentPos(prev => {
      if (!prev && mapInstance.current) {
        mapInstance.current.panTo(externalPosition);
        mapInstance.current.setZoom(16);
      }
      return externalPosition;
    });
  }, [isNavigating, externalPosition?.lat, externalPosition?.lng]);

  // Use a ref for initial center so GPS updates don't re-trigger map init
  // IMPORTANT: never block map init on GPS — use fallback center immediately
  const DEFAULT_MAP_CENTER = { lat: 4.1755, lng: 73.5093 }; // Malé
  const initialCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  if (!initialCenterRef.current) {
    initialCenterRef.current =
      currentPos ||
      (pickupCoords ? { lat: pickupCoords[0], lng: pickupCoords[1] } : null) ||
      DEFAULT_MAP_CENTER;
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
    // IMPORTANT: Do NOT apply raster `styles` when using a vector mapId —
    // they conflict with vector rendering and can hide roads/features.
    if (mapId) {
      mapOptions.mapId = mapId;
      const colorScheme = g.maps?.ColorScheme;
      if (colorScheme) {
        mapOptions.colorScheme = isDark ? colorScheme.DARK : colorScheme.LIGHT;
      }
      // No raster styles for vector maps — they cause missing roads
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
    // Auto-resume follow after 8s of no interaction
    let autoResumeTimeout: ReturnType<typeof setTimeout> | null = null;
    map.addListener("idle", () => {
      if (userInteractingRef.current) {
        if (autoResumeTimeout) clearTimeout(autoResumeTimeout);
        autoResumeTimeout = setTimeout(() => {
          setFollowDriver(true);
          userInteractingRef.current = false;
          setUserPannedAway(false);
        }, 8000);
      }
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

    // Long-press / right-click to report closure
    const mapDiv = map.getDiv();

    let menuJustOpened = false;
    const showMenuAtLatLng = (latLng: any) => {
      const coords = { lat: latLng.lat(), lng: latLng.lng() };
      const bounds = map.getBounds();
      const proj = map.getProjection();
      if (bounds && proj) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const topRight = proj.fromLatLngToPoint(ne);
        const bottomLeft = proj.fromLatLngToPoint(sw);
        const point = proj.fromLatLngToPoint(latLng);
        if (topRight && bottomLeft && point) {
          const scale = Math.pow(2, map.getZoom() || 16);
          const px = (point.x - bottomLeft.x) * scale;
          const py = (point.y - topRight.y) * scale;
          const rect = mapDiv.getBoundingClientRect();
          menuJustOpened = true;
          setTimeout(() => { menuJustOpened = false; }, 400);
          setReportMenuPos({
            lat: coords.lat,
            lng: coords.lng,
            x: Math.min(px, rect.width - 200),
            y: Math.min(py, rect.height - 280),
          });
        }
      }
    };

    // Right-click (desktop)
    map.addListener("rightclick", (e: any) => {
      if (!e.latLng) return;
      showMenuAtLatLng(e.latLng);
    });

    // Touch long-press (mobile)
    let lpTimer: ReturnType<typeof setTimeout> | null = null;
    let lpLatLng: any = null;
    let touchMoved = false;

    const onTouchStart = (e: TouchEvent) => {
      touchMoved = false;
      lpTimer = setTimeout(() => {
        if (!touchMoved && lpLatLng) {
          showMenuAtLatLng(lpLatLng);
        }
      }, 600);
    };
    const onTouchMove = () => {
      touchMoved = true;
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
    };
    const onTouchEnd = () => {
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
    };

    // Capture the latLng from mousedown/touchstart via Google Maps
    map.addListener("mousedown", (e: any) => {
      if (e.latLng) lpLatLng = e.latLng;
    });

    mapDiv.addEventListener("touchstart", onTouchStart, { passive: true });
    mapDiv.addEventListener("touchmove", onTouchMove, { passive: true });
    mapDiv.addEventListener("touchend", onTouchEnd, { passive: true });

    // Dismiss on normal tap
    map.addListener("click", (e: any) => {
      if (menuJustOpened) return;
      setReportMenuPos(null);
    });

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
    const observer = new MutationObserver(() => {
      setThemeTransition(true);
      t1 = setTimeout(() => {
        const isDark = document.documentElement.classList.contains("dark");
        const g = (window as any).google;
        if (mapId) {
          const colorScheme = g?.maps?.ColorScheme;
          if (colorScheme) {
            map?.setOptions({ colorScheme: isDark ? colorScheme.DARK : colorScheme.LIGHT });
          }
          // No raster styles for vector maps
        } else {
          map?.setOptions({ styles: isDark ? darkMapStyle : (isNavigating ? lightNavStyle : []) });
        }
        t2 = setTimeout(() => setThemeTransition(false), 500);
      }, 50);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { observer.disconnect(); clearTimeout(t1); clearTimeout(t2); };
  }, [mapReady, isNavigating, mapId]);

  // Navigation mode: tilt map + higher zoom + heading rotation
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (isNavigating) {
      map.setTilt(0);
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
        // No raster styles for vector maps
      } else {
        map.setOptions({ styles: isDark ? darkMapStyle : lightNavStyle });
      }
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
        // No raster styles for vector maps
      } else {
        map.setOptions({ styles: isDark ? darkMapStyle : [] });
      }
    }
  }, [isNavigating, mapId]);

  // Update driver marker position, rotation & auto-follow
  useEffect(() => {
    if (!currentPos || !driverMarkerRef.current || !mapInstance.current) return;
    const g = (window as any).google;
    const map = mapInstance.current;

    // On first real GPS fix, snap map center to driver's actual location
    if (!hasReceivedFirstGpsRef.current) {
      hasReceivedFirstGpsRef.current = true;
      map.setCenter(currentPos);
      driverMarkerRef.current.setPosition(currentPos);
      filteredPosRef.current = currentPos;
      prevMarkerPosRef.current = currentPos;
    }

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

    // When NOT on a trip (not navigating), show a simple dot instead of directional arrow
    // because GPS heading is unreliable when stationary and the arrow points wrong
    if (!isNavigating) {
      driverMarkerRef.current.setIcon({
        path: g.maps.SymbolPath.CIRCLE,
        scale: 10, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 3,
        anchor: new g.maps.Point(0, 0),
      });
    } else if (mapIconUrl) {
      // Use exact admin map icon during navigation (no canvas transformation)
      driverMarkerRef.current.setIcon({
        url: mapIconUrl,
        scaledSize: new g.maps.Size(36, 36),
        anchor: new g.maps.Point(18, 18),
      });
      driverMarkerRef.current.setOptions({ optimized: false });
    } else {
      // Directional arrow during navigation
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

        if (isNavigating || freeNavTarget) {
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
          // Non-navigating (online idle): follow driver position, north-up
          if (typeof map.setHeading === "function") {
            if ((map as any)._setProgrammaticHeading) (map as any)._setProgrammaticHeading();
            map.setHeading(0);
          }
          map.panTo(displayPos);
        }
      }
    }
  }, [currentPos, isNavigating, freeNavTarget, mapIconUrl, currentHeading, currentSpeed, navSteps, currentStepIndex, followDriver, navSettings]);

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

  // Trim free nav polyline behind driver
  useEffect(() => {
    if (!freeNavTarget || !currentPos || !freeNavPolylineRef.current || freeNavPathRef.current.length < 2) return;
    const fullPath = freeNavPathRef.current;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < fullPath.length; i++) {
      const d = getDistanceMeters(currentPos, fullPath[i]);
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    }
    if (closestIdx > 0) {
      const trimmedPath = [{ lat: currentPos.lat, lng: currentPos.lng }, ...fullPath.slice(closestIdx)];
      freeNavPolylineRef.current.setPath(trimmedPath);
    }
  }, [currentPos, freeNavTarget]);

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
  // (currentPosRef is defined earlier, near free navigation)

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
        provideRouteAlternatives: true,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: g.maps.TrafficModel?.BEST_GUESS || "bestguess",
        },
      }).then((raw: any) => {
        const result = selectShortestRoute(raw);
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

            // Check if route passes near any road closure
            const PROXIMITY_M = 100; // warn if route is within 100m of a closure
            const nearbyClosures = roadClosures.filter((c) => {
              return c.coordinates.some((cp) =>
                pathCoords.some((rp) => getDistanceMeters(rp, cp) < PROXIMITY_M)
              );
            });

            if (nearbyClosures.length > 0) {
              const sevLabels: Record<string, string> = { closed: "Road Closed", lane_closed: "Lane Closed", hazard: "Hazard" };
              const labels = nearbyClosures.map((c) => {
                const label = sevLabels[c.severity] || "Closure";
                return c.notes ? `${label}: ${c.notes}` : label;
              });
              setClosureWarning(labels.join(" • "));
              if (closureWarningTimeoutRef.current) clearTimeout(closureWarningTimeoutRef.current);
              closureWarningTimeoutRef.current = setTimeout(() => setClosureWarning(null), 15000);
            } else {
              setClosureWarning(null);
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

  // Road closures overlay
  useEffect(() => {
    const map = mapInstance.current;
    const g = (window as any).google;
    if (!map || !g?.maps) return;

    // Clear old
    roadClosureMarkersRef.current.forEach((m) => m.setMap(null));
    roadClosureLinesRef.current.forEach((l) => l.setMap(null));
    roadClosureMarkersRef.current = [];
    roadClosureLinesRef.current = [];

    const sevColors: Record<string, string> = { closed: "#ef4444", lane_closed: "#f59e0b", hazard: "#f97316" };
    const sevLabels: Record<string, string> = { closed: "Road Closed", lane_closed: "Lane Closed", hazard: "Hazard" };

    roadClosures.forEach((c) => {
      const coords = c.coordinates;
      const color = sevColors[c.severity] || "#ef4444";
      const label = sevLabels[c.severity] || "Closure";

      if (c.closure_type === "point" && coords.length > 0) {
        const marker = new g.maps.Marker({
          map,
          position: coords[0],
          icon: {
            path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z",
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 1.5,
            scale: 1.2,
            anchor: new g.maps.Point(12, 12),
          },
          zIndex: 2000,
        });
        const iw = new g.maps.InfoWindow({
          content: `<div style="font-size:12px;padding:4px"><strong style="color:${color}">${label}</strong>${c.notes ? `<br/>${c.notes}` : ""}</div>`,
        });
        marker.addListener("click", () => iw.open(map, marker));
        roadClosureMarkersRef.current.push(marker);
      } else if (c.closure_type === "line" && coords.length > 1) {
        const line = new g.maps.Polyline({
          map,
          path: coords,
          strokeColor: color,
          strokeWeight: 6,
          strokeOpacity: 0.8,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "15px" }],
          zIndex: 1999,
        });
        roadClosureLinesRef.current.push(line);

        const midIdx = Math.floor(coords.length / 2);
        const infoMarker = new g.maps.Marker({
          map,
          position: coords[midIdx],
          icon: {
            path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z",
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 1.5,
            scale: 1.2,
            anchor: new g.maps.Point(12, 12),
          },
          zIndex: 2001,
        });
        const iw = new g.maps.InfoWindow({
          content: `<div style="font-size:12px;padding:4px"><strong style="color:${color}">${label}</strong>${c.notes ? `<br/>${c.notes}` : ""}</div>`,
        });
        infoMarker.addListener("click", () => iw.open(map, infoMarker));
        roadClosureMarkersRef.current.push(infoMarker);
      }
    });
  }, [roadClosures, isLoaded]);

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

  // Expose startFreeNav to parent
  useEffect(() => {
    if (startFreeNavRef) {
      startFreeNavRef.current = startFreeNav;
    }
  }, [startFreeNav, startFreeNavRef]);

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
            mapInstance.current.setTilt(0);
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

      {/* Road closure warning banner */}
      {isNavigating && closureWarning && (
        <div className="absolute top-3 left-3 right-3 z-[500]">
          <div className="bg-destructive/95 backdrop-blur-sm text-destructive-foreground rounded-xl px-4 py-2.5 shadow-lg flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold">⚠ Road Closure Ahead</div>
              <div className="text-[11px] opacity-90 mt-0.5 leading-tight">{closureWarning}</div>
            </div>
            <button onClick={() => setClosureWarning(null)} className="shrink-0 mt-0.5 opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Free navigation — turn-by-turn UI (same as in-trip) */}
      {freeNavTarget && (
        <>
          {/* Top: current maneuver step */}
          {freeNavSteps.length > 0 && (
            <div className="absolute top-3 left-3 right-3 z-[9980]">
              <div className="bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Maneuver icon */}
                  <div className={`w-12 h-12 rounded-xl ${getManeuverColor(freeNavSteps[freeNavStepIndex]?.maneuver)} text-white flex items-center justify-center shrink-0 shadow-md`}>
                    <span className="text-2xl font-bold">{getManeuverIcon(freeNavSteps[freeNavStepIndex]?.maneuver)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-foreground leading-tight truncate">
                      {freeNavSteps[freeNavStepIndex]?.instruction || "Continue straight"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {freeNavSteps[freeNavStepIndex]?.distance || ""}
                    </div>
                  </div>
                </div>
                {/* Next step preview */}
                {freeNavStepIndex + 1 < freeNavSteps.length && (
                  <div className="border-t border-border px-4 py-2 flex items-center gap-2 bg-muted/30">
                    <span className="text-xs text-muted-foreground">Then</span>
                    <span className="text-sm">{getManeuverIcon(freeNavSteps[freeNavStepIndex + 1]?.maneuver)}</span>
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {freeNavSteps[freeNavStepIndex + 1]?.instruction}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {freeNavSteps[freeNavStepIndex + 1]?.distance}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom: ETA + distance + stop button */}
          <div className="absolute bottom-4 left-3 right-3 z-[9980]">
            <div className="bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Route className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground font-medium">Navigating to location</div>
                <div className="text-sm font-bold text-foreground mt-0.5">
                  {freeNavDist && freeNavEta ? `${freeNavDist} • ${freeNavEta}` : "Calculating route…"}
                </div>
              </div>
              {/* Speed */}
              <div className="w-12 h-12 rounded-full bg-muted/60 border-2 border-border flex flex-col items-center justify-center shrink-0">
                <span className="text-sm font-black text-foreground leading-none">{currentSpeed}</span>
                <span className="text-[7px] text-muted-foreground font-medium">km/h</span>
              </div>
              <button
                onClick={stopFreeNav}
                className="shrink-0 w-10 h-10 rounded-xl bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:bg-destructive/90 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Context menu on map tap/long-press — bottom sheet style */}
      <AnimatePresence>
        {reportMenuPos && !showReportForm && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[9990] bg-black/20"
              onClick={() => setReportMenuPos(null)}
            />
            {/* Menu sheet */}
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
              className="fixed bottom-0 left-0 right-0 z-[9991] px-3 pb-4"
            >
              <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
                {/* Handle bar */}
                <div className="flex justify-center pt-2.5 pb-1">
                  <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                </div>
                {/* Navigate Here — hero action */}
                <div className="px-3 pb-2">
                  <button
                    onClick={() => {
                      startFreeNav({ lat: reportMenuPos.lat, lng: reportMenuPos.lng });
                      setReportMenuPos(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md hover:bg-primary/90 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary-foreground/20 flex items-center justify-center shrink-0">
                      <Route className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-semibold">Navigate Here</div>
                      <div className="text-[11px] opacity-80 font-normal">Get directions to this location</div>
                    </div>
                  </button>
                </div>
                {/* Report actions */}
                <div className="px-3 pb-1">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pb-1.5">Report an issue</div>
                </div>
                <div className="px-3 pb-2 grid grid-cols-2 gap-1.5">
                  {[
                    { severity: "closed", label: "Road Closed", icon: <AlertTriangle className="w-4 h-4" />, color: "text-destructive" },
                    { severity: "lane_closed", label: "Lane Closed", icon: <Construction className="w-4 h-4" />, color: "text-amber-500" },
                    { severity: "cones", label: "Cones", icon: <TriangleAlert className="w-4 h-4" />, color: "text-amber-500" },
                    { severity: "accident", label: "Accident", icon: <Car className="w-4 h-4" />, color: "text-destructive" },
                  ].map((item) => (
                    <button
                      key={item.severity}
                      onClick={() => {
                        setReportCoords({ lat: reportMenuPos.lat, lng: reportMenuPos.lng });
                        setShowReportForm(true);
                        setReportMenuPos(null);
                        setReportSeverity(item.severity);
                        setReportLaneSide(null);
                        setReportNotes("");
                      }}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border text-xs font-medium text-foreground hover:bg-accent transition-colors"
                    >
                      <span className={item.color}>{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
                {/* Cancel */}
                <div className="px-3 pb-3">
                  <button
                    onClick={() => setReportMenuPos(null)}
                    className="w-full py-2.5 text-xs font-medium text-muted-foreground rounded-xl hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Report closure form */}
      {showReportForm && reportCoords && (
        <div className="fixed inset-0 z-[9992] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-5 w-80 max-w-[90vw] space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Report Closure
            </h3>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { value: "closed", label: "Road Closed" },
                { value: "lane_closed", label: "Lane Closed" },
                { value: "cones", label: "Cones" },
                { value: "accident", label: "Accident" },
                { value: "hazard", label: "Hazard" },
              ].map((s) => (
                <button
                  key={s.value}
                  onClick={() => setReportSeverity(s.value)}
                  className={`text-xs py-1.5 px-2.5 rounded-lg border transition-all ${
                    reportSeverity === s.value
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-accent/50 text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {/* Lane side picker for lane_closed, accident, cones */}
            {["lane_closed", "accident", "cones"].includes(reportSeverity) && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">Which lane?</label>
                <div className="flex gap-2">
                  {([
                    { value: "left" as const, label: "← Left Lane" },
                    { value: "right" as const, label: "Right Lane →" },
                  ]).map((side) => (
                    <button
                      key={side.value}
                      onClick={() => setReportLaneSide(side.value)}
                      className={`flex-1 text-xs py-2 px-3 rounded-lg border transition-all font-medium ${
                        reportLaneSide === side.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-accent/50 text-foreground"
                      }`}
                    >
                      {side.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <input
              type="text"
              placeholder="Add details (optional)"
              value={reportNotes}
              onChange={(e) => setReportNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowReportForm(false); setReportCoords(null); }}
                className="flex-1 py-2 text-xs rounded-lg border border-border text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                disabled={reportSubmitting}
                onClick={async () => {
                  if (!reportCoords) return;
                  setReportSubmitting(true);
                  try {
                    const { data: { user } } = await supabase.auth.getUser();
                    const lanePart = reportLaneSide ? `[${reportLaneSide} lane] ` : "";
                    const fullNotes = `${lanePart}${reportNotes}`.trim();
                    await addClosure({
                      closure_type: "point",
                      coordinates: [reportCoords],
                      notes: fullNotes,
                      severity: reportSeverity,
                      expires_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
                      status: "pending",
                      reported_by: user?.id,
                      reported_by_type: "driver",
                    });
                    toast({ title: "Report submitted", description: "Dispatch will review your report" });
                    setShowReportForm(false);
                    setReportCoords(null);
                  } catch {
                    toast({ title: "Failed to submit", variant: "destructive" });
                  } finally {
                    setReportSubmitting(false);
                  }
                }}
                className="flex-1 py-2 text-xs rounded-lg bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 disabled:opacity-50"
              >
                {reportSubmitting ? "Submitting…" : "Submit Report"}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Report will be reviewed by dispatch before going live</p>
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
