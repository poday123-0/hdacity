import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchOsrmRoute, pickShortestOsrmRoute, type OsrmRoute, type OsrmStep } from "@/lib/osrm-routing";
import { useRoadClosures } from "@/hooks/use-road-closures";
import { supabase } from "@/integrations/supabase/client";
import { Navigation, ChevronUp, ChevronDown, Locate, Route, Crosshair, X, AlertTriangle, MapPin, Construction, Car, TriangleAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

// Utility: smoothly animate a marker between two positions
const animateMarker = (
  marker: L.Marker,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  duration: number,
  onComplete?: () => void
) => {
  const startTime = performance.now();
  const animate = (currentTime: number) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const lat = from.lat + (to.lat - from.lat) * eased;
    const lng = from.lng + (to.lng - from.lng) * eased;
    marker.setLatLng([lat, lng]);
    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      onComplete?.();
    }
  };
  requestAnimationFrame(animate);
};

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

// Leaflet icon helpers
const circleIcon = (color: string, label: string, size = 32) =>
  L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${label}</div>`,
  });

const driverDotIcon = (color = "#4285F4") =>
  L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
  });

const driverArrowIcon = (heading: number, color = "#4285F4") =>
  L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;transform:rotate(${heading}deg)"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 2L4 20h16L12 2z" fill="${color}" stroke="white" stroke-width="2"/></svg></div>`,
  });

const customImgIcon = (url: string, size = 36) =>
  L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<img src="${url}" style="width:${size}px;height:${size}px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.2))" />`,
  });

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

type TripPhase = "heading_to_pickup" | "arrived" | "in_progress";

export interface NavSettings {
  followSensitivity: "low" | "medium" | "high";
  lookAheadDistance: "short" | "medium" | "far";
  rerouteAggressiveness: "relaxed" | "normal" | "aggressive";
  autoRefocusOnTurn: boolean;
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
  externalPosition?: { lat: number; lng: number } | null;
  startFreeNavRef?: React.MutableRefObject<((target: { lat: number; lng: number }) => void) | null>;
  onFreeNavChange?: (active: boolean) => void;
}

const DriverMap = ({ isNavigating, tripPhase = "heading_to_pickup", radiusKm, gpsEnabled, pickupCoords, dropoffCoords, pickupLabel, dropoffLabel, mapIconUrl, passengerMapIconUrl, passengerLiveLocation, onRecenterAvailableChange, recenterRef, onNavUpdate, onFollowDriverChange, followToggleRef, onSpeedChange, tripPanelOpen, onNavStepChange, navSettings: navSettingsProp, onMapHeadingChange, resetNorthRef, onMapReady, externalPosition, startFreeNavRef, onFreeNavChange }: DriverMapProps) => {
  const navSettings = navSettingsProp || DEFAULT_NAV_SETTINGS;
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);
  const rideMarkersRef = useRef<(L.Marker | L.Circle | L.Polyline)[]>([]);
  const passengerLiveMarkerRef = useRef<L.Marker | null>(null);
  const passengerPulseRef = useRef<L.Circle | null>(null);
  const passengerPulseIntervalRef = useRef<any>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const routePathRef = useRef<[number, number][]>([]);
  const radiusCircleRef = useRef<L.Circle | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const routeRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  const userInteractingRef = useRef(false);
  const [userPannedAway, setUserPannedAway] = useState(false);
  const [followDriver, setFollowDriver] = useState(true);
  const interactTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { closures: roadClosures, addClosure } = useRoadClosures();
  const roadClosureLayersRef = useRef<L.Layer[]>([]);
  const [closureWarning, setClosureWarning] = useState<string | null>(null);
  const closureWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHeadingRef = useRef<number>(0);
  const prevMarkerPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Driver closure reporting state
  const [reportMenuPos, setReportMenuPos] = useState<{ lat: number; lng: number; x: number; y: number } | null>(null);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportCoords, setReportCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [reportSeverity, setReportSeverity] = useState("closed");
  const [reportLaneSide, setReportLaneSide] = useState<"right" | "left" | null>(null);
  const [reportNotes, setReportNotes] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Free navigation state
  const [freeNavTarget, setFreeNavTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [freeNavEta, setFreeNavEta] = useState("");
  const [freeNavDist, setFreeNavDist] = useState("");
  const [freeNavSteps, setFreeNavSteps] = useState<NavStep[]>([]);
  const [freeNavStepIndex, setFreeNavStepIndex] = useState(0);
  const freeNavPolylineRef = useRef<L.Polyline | null>(null);
  const freeNavMarkerRef = useRef<L.Marker | null>(null);
  const freeNavIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const freeNavPathRef = useRef<[number, number][]>([]);
  const filteredPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const animatingRef = useRef(false);
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
    const map = mapInstance.current;
    if (!map || !currentPos) return;

    stopFreeNav();
    setFreeNavTarget(target);
    setFreeNavSteps([]);
    setFreeNavStepIndex(0);
    freeNavPathRef.current = [];

    // Place destination marker
    const marker = L.marker([target.lat, target.lng], {
      icon: circleIcon("#6366f1", "📍", 32),
      zIndexOffset: 3000,
    }).addTo(map);
    freeNavMarkerRef.current = marker;

    // Create polyline
    const polyline = L.polyline([], {
      color: "#6366f1",
      weight: 7,
      opacity: 0.85,
    }).addTo(map);
    freeNavPolylineRef.current = polyline;

    map.setZoom(18);
    setFollowDriver(true);
    userInteractingRef.current = false;
    setUserPannedAway(false);

    const fetchFreeRoute = () => {
      const driverPos = currentPosRef.current;
      if (!driverPos) return;

      fetchOsrmRoute(driverPos, target, [], true)
        .then(routes => {
          const best = pickShortestOsrmRoute(routes, roadClosures);
          freeNavPathRef.current = best.coordinates;
          if (freeNavPolylineRef.current) freeNavPolylineRef.current.setLatLngs(best.coordinates);
          setFreeNavEta(best.durationText);
          setFreeNavDist(best.distanceText);

          const steps: NavStep[] = best.steps.map(s => ({
            instruction: s.instruction,
            distance: s.distance,
            maneuver: s.maneuver,
            endLat: s.endLat,
            endLng: s.endLng,
          }));
          setFreeNavSteps(steps);

          if (driverPos && steps.length > 0) {
            let closestIdx = 0;
            let closestDist = Infinity;
            for (let idx = 0; idx < steps.length; idx++) {
              if (steps[idx].endLat == null || steps[idx].endLng == null) continue;
              const dist = getDistanceMeters(driverPos, { lat: steps[idx].endLat!, lng: steps[idx].endLng! });
              if (dist < closestDist) { closestDist = dist; closestIdx = idx; }
            }
            setFreeNavStepIndex((prev) => Math.max(prev, Math.min(closestIdx, steps.length - 1)));
          }
        })
        .catch(() => {});
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
    if (freeNavPolylineRef.current) { freeNavPolylineRef.current.remove(); freeNavPolylineRef.current = null; }
    if (freeNavMarkerRef.current) { freeNavMarkerRef.current.remove(); freeNavMarkerRef.current = null; }
    if (freeNavIntervalRef.current) { clearInterval(freeNavIntervalRef.current); freeNavIntervalRef.current = null; }
    const map = mapInstance.current;
    if (map) map.setZoom(16);
  }, []);

  useEffect(() => () => { stopFreeNav(); }, [stopFreeNav]);

  // GPS watcher — own high-accuracy GPS during navigation
  useEffect(() => {
    const needsOwnGps = isNavigating || !!freeNavTarget;
    if (!needsOwnGps) {
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
            mapInstance.current.panTo([newPos.lat, newPos.lng]);
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

  // External position from parent when not navigating
  useEffect(() => {
    if (isNavigating || freeNavTarget || !externalPosition) return;
    setCurrentPos(prev => {
      if (!prev && mapInstance.current) {
        mapInstance.current.panTo([externalPosition.lat, externalPosition.lng]);
        mapInstance.current.setZoom(16);
      }
      return externalPosition;
    });
  }, [isNavigating, externalPosition?.lat, externalPosition?.lng]);

  const DEFAULT_MAP_CENTER: [number, number] = [4.1755, 73.5093];
  const initialCenterRef = useRef<[number, number] | null>(null);
  if (!initialCenterRef.current) {
    initialCenterRef.current =
      currentPos ? [currentPos.lat, currentPos.lng] :
      pickupCoords ? [pickupCoords[0], pickupCoords[1]] :
      DEFAULT_MAP_CENTER;
  }

  // Init map — only once
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const center = initialCenterRef.current || DEFAULT_MAP_CENTER;

    const isDark = document.documentElement.classList.contains("dark");

    const map = L.map(mapRef.current, {
      center,
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    const tileLayer = L.tileLayer(isDark ? DARK_TILES : LIGHT_TILES, { maxZoom: 19 }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Driver marker
    const icon = mapIconUrl
      ? customImgIcon(mapIconUrl, 44)
      : driverDotIcon();
    const driverMarker = L.marker(center, { icon, zIndexOffset: 1000 }).addTo(map);
    driverMarkerRef.current = driverMarker;
    mapInstance.current = map;
    onMapReady?.(map);

    // Detect user interaction (drag AND zoom)
    let autoResumeTimeout: ReturnType<typeof setTimeout> | null = null;
    const pauseAutoFollow = () => {
      userInteractingRef.current = true;
      setUserPannedAway(true);
      setFollowDriver(false);
    };
    const scheduleResume = () => {
      if (userInteractingRef.current) {
        if (autoResumeTimeout) clearTimeout(autoResumeTimeout);
        autoResumeTimeout = setTimeout(() => {
          setFollowDriver(true);
          userInteractingRef.current = false;
          setUserPannedAway(false);
        }, 8000);
      }
    };
    map.on("dragstart", pauseAutoFollow);
    map.on("zoomstart", pauseAutoFollow);
    map.on("moveend", scheduleResume);
    map.on("zoomend", scheduleResume);

    // Long-press context menu for road closure reporting
    let lpTimer: ReturnType<typeof setTimeout> | null = null;
    let touchMoved = false;

    map.on("contextmenu", (e: L.LeafletMouseEvent) => {
      const coords = { lat: e.latlng.lat, lng: e.latlng.lng };
      const point = map.latLngToContainerPoint(e.latlng);
      setReportMenuPos({ lat: coords.lat, lng: coords.lng, x: point.x, y: point.y });
    });

    const mapDiv = map.getContainer();
    const onTouchStart = () => { touchMoved = false; lpTimer = setTimeout(() => { if (!touchMoved) { /* handled by contextmenu */ } }, 600); };
    const onTouchMove = () => { touchMoved = true; if (lpTimer) clearTimeout(lpTimer); };
    const onTouchEnd = () => { if (lpTimer) clearTimeout(lpTimer); };
    mapDiv.addEventListener("touchstart", onTouchStart, { passive: true });
    mapDiv.addEventListener("touchmove", onTouchMove, { passive: true });
    mapDiv.addEventListener("touchend", onTouchEnd, { passive: true });

    map.on("click", () => { setReportMenuPos(null); });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Track map readiness
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    if (mapInstance.current && !mapReady) setMapReady(true);
  });

  // Theme observer
  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const map = mapInstance.current;
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      if (tileLayerRef.current) {
        tileLayerRef.current.setUrl(isDark ? DARK_TILES : LIGHT_TILES);
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [mapReady]);

  // Navigation mode zoom — fit bounds to show full route when trip starts
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    if (isNavigating) {
      setFollowDriver(true);
      userInteractingRef.current = false;
      setUserPannedAway(false);
      // Fit bounds to show driver + pickup + dropoff
      const bounds = L.latLngBounds([]);
      if (currentPos) bounds.extend([currentPos.lat, currentPos.lng]);
      if (pickupCoords) bounds.extend([pickupCoords[0], pickupCoords[1]]);
      if (dropoffCoords) bounds.extend([dropoffCoords[0], dropoffCoords[1]]);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      } else {
        map.setZoom(16);
      }
    } else {
      map.setZoom(16);
    }
  }, [isNavigating]);

  // Update driver marker position & auto-follow
  useEffect(() => {
    if (!currentPos || !driverMarkerRef.current || !mapInstance.current) return;
    const map = mapInstance.current;

    if (!hasReceivedFirstGpsRef.current) {
      hasReceivedFirstGpsRef.current = true;
      map.setView([currentPos.lat, currentPos.lng], map.getZoom());
      driverMarkerRef.current.setLatLng([currentPos.lat, currentPos.lng]);
      filteredPosRef.current = currentPos;
      prevMarkerPosRef.current = currentPos;
    }

    // Position filtering
    const prevFiltered = filteredPosRef.current;
    let displayPos = currentPos;
    if (prevFiltered) {
      const jumpMeters = getDistanceMeters(prevFiltered, currentPos);
      if (jumpMeters > 150 && currentSpeed < 20) {
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

    // Calculate heading
    let heading = prevHeadingRef.current;
    if (currentHeading != null && !isNaN(currentHeading) && currentSpeed > 2) {
      heading = currentHeading;
    } else if (prevMarkerPosRef.current) {
      const prev = prevMarkerPosRef.current;
      const dLat = displayPos.lat - prev.lat;
      const dLng = displayPos.lng - prev.lng;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist > 0.000008) {
        const dLngRad = (displayPos.lng - prev.lng) * Math.PI / 180;
        const lat1 = prev.lat * Math.PI / 180;
        const lat2 = displayPos.lat * Math.PI / 180;
        const y = Math.sin(dLngRad) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLngRad);
        heading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      }
    }
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

    // Smooth heading
    const prevH = prevHeadingRef.current;
    let diff = heading - prevH;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) > 3) {
      heading = prevH + diff * 0.4;
      if (heading < 0) heading += 360;
      if (heading >= 360) heading -= 360;
    } else {
      heading = prevH;
    }
    prevHeadingRef.current = heading;

    // Animate marker
    const prevPos = prevMarkerPosRef.current;
    if (prevPos && !animatingRef.current && isNavigating) {
      const dist = Math.sqrt(Math.pow(displayPos.lat - prevPos.lat, 2) + Math.pow(displayPos.lng - prevPos.lng, 2));
      if (dist < 0.003 && dist > 0.000005) {
        animatingRef.current = true;
        animateMarker(driverMarkerRef.current, prevPos, displayPos, 1000, () => {
          animatingRef.current = false;
        });
      } else {
        driverMarkerRef.current.setLatLng([displayPos.lat, displayPos.lng]);
      }
    } else if (!animatingRef.current) {
      driverMarkerRef.current.setLatLng([displayPos.lat, displayPos.lng]);
    }
    prevMarkerPosRef.current = displayPos;

    // Update marker icon based on state
    if (!isNavigating) {
      driverMarkerRef.current.setIcon(driverDotIcon());
    } else if (mapIconUrl) {
      driverMarkerRef.current.setIcon(customImgIcon(mapIconUrl, 36));
    } else {
      driverMarkerRef.current.setIcon(driverArrowIcon(heading));
    }

    // Auto-follow
    const cameraThrottleMs = navSettings.followSensitivity === "high" ? 200 : navSettings.followSensitivity === "low" ? 600 : 350;
    if (followDriver) {
      userInteractingRef.current = false;
      const now = Date.now();
      if (now - lastCameraUpdateAtRef.current > cameraThrottleMs) {
        lastCameraUpdateAtRef.current = now;
        if (isNavigating || freeNavTarget) {
          const lookAheadBase = navSettings.lookAheadDistance === "far" ? { slow: 80, mid: 110, fast: 140 } : navSettings.lookAheadDistance === "short" ? { slow: 25, mid: 40, fast: 60 } : { slow: 50, mid: 70, fast: 95 };
          const lookAheadMeters = currentSpeed > 40 ? lookAheadBase.fast : currentSpeed > 20 ? lookAheadBase.mid : lookAheadBase.slow;
          const cameraTarget = getPointAhead(displayPos, heading, lookAheadMeters);
          map.panTo([cameraTarget.lat, cameraTarget.lng], { animate: true, duration: 0.3 });
          // Don't force zoom — respect driver's manual zoom level
        } else {
          map.panTo([displayPos.lat, displayPos.lng], { animate: true, duration: 0.3 });
        }
      }
    }
  }, [currentPos, isNavigating, freeNavTarget, mapIconUrl, currentHeading, currentSpeed, navSteps, currentStepIndex, followDriver, navSettings]);

  // Trim route polyline behind driver
  useEffect(() => {
    if (!isNavigating || !currentPos || !routePolylineRef.current || routePathRef.current.length < 2) return;
    const fullPath = routePathRef.current;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < fullPath.length; i++) {
      const d = getDistanceMeters(currentPos, { lat: fullPath[i][0], lng: fullPath[i][1] });
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    }
    if (closestIdx > 0) {
      const trimmedPath: [number, number][] = [[currentPos.lat, currentPos.lng], ...fullPath.slice(closestIdx)];
      routePolylineRef.current.setLatLngs(trimmedPath);
    }
  }, [currentPos, isNavigating]);

  // Trim free nav polyline
  useEffect(() => {
    if (!freeNavTarget || !currentPos || !freeNavPolylineRef.current || freeNavPathRef.current.length < 2) return;
    const fullPath = freeNavPathRef.current;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < fullPath.length; i++) {
      const d = getDistanceMeters(currentPos, { lat: fullPath[i][0], lng: fullPath[i][1] });
      if (d < closestDist) { closestDist = d; closestIdx = i; }
    }
    if (closestIdx > 0) {
      const trimmedPath: [number, number][] = [[currentPos.lat, currentPos.lng], ...fullPath.slice(closestIdx)];
      freeNavPolylineRef.current.setLatLngs(trimmedPath);
    }
  }, [currentPos, freeNavTarget]);

  // Apply map icon when available
  useEffect(() => {
    if (!mapIconUrl || !driverMarkerRef.current) return;
    driverMarkerRef.current.setIcon(customImgIcon(mapIconUrl, 36));
  }, [mapIconUrl]);

  // Auto-refocus on turn change
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

  // Parse OSRM nav steps
  const parseOsrmRoute = useCallback((route: OsrmRoute, driverPos: { lat: number; lng: number } | null) => {
    setNavEta(route.durationText);
    setNavDistance(route.distanceText);

    const etaMins = Math.round(route.durationSeconds / 60);
    const distKm = Math.round(route.distanceMeters / 100) / 10;
    onNavUpdate?.(route.durationText, route.distanceText, etaMins, distKm);

    const steps: NavStep[] = route.steps.map(s => ({
      instruction: s.instruction,
      distance: s.distance,
      maneuver: s.maneuver,
      endLat: s.endLat,
      endLng: s.endLng,
    }));
    setNavSteps(steps);

    if (driverPos && steps.length > 0) {
      const startIdx = Math.max(0, Math.min(currentStepIndex, steps.length - 1));
      let closestIdx = startIdx;
      let closestDist = Infinity;
      for (let idx = startIdx; idx < steps.length; idx++) {
        if (steps[idx].endLat == null || steps[idx].endLng == null) continue;
        const dist = getDistanceMeters(driverPos, { lat: steps[idx].endLat!, lng: steps[idx].endLng! });
        if (dist < closestDist) { closestDist = dist; closestIdx = idx; }
      }
      setCurrentStepIndex((prev) => Math.max(prev, Math.min(closestIdx, steps.length - 1)));
    }
  }, [onNavUpdate, currentStepIndex]);

  // Route when navigating
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear old markers/polylines
    rideMarkersRef.current.forEach((m) => m.remove());
    rideMarkersRef.current = [];
    if (routePolylineRef.current) { routePolylineRef.current.remove(); routePolylineRef.current = null; }
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

    if (tripPhase === "in_progress" || tripPhase === "arrived") {
      destination = dropoff;
      destLabel = "D";
      destColor = "#ef4444";
    } else {
      destination = pickup;
      destLabel = "P";
      destColor = "#22c55e";
    }

    // Destination marker
    const destIcon = (tripPhase === "heading_to_pickup" && passengerMapIconUrl && !passengerLiveLocationRef.current)
      ? customImgIcon(passengerMapIconUrl, 28)
      : circleIcon(destColor, destLabel);
    const destMarker = L.marker([destination.lat, destination.lng], { icon: destIcon, zIndexOffset: 1000 }).addTo(map);
    rideMarkersRef.current.push(destMarker);

    // Pulse circle around destination
    const pulseCircle = L.circle([destination.lat, destination.lng], {
      radius: 30, color: destColor, weight: 2, opacity: 0.4, fillColor: destColor, fillOpacity: 0.1,
    }).addTo(map);
    rideMarkersRef.current.push(pulseCircle);

    if (tripPhase === "in_progress") {
      const pickupMarker = L.marker([pickup.lat, pickup.lng], {
        icon: circleIcon("#22c55e", "P", 20), zIndexOffset: 999,
      }).addTo(map);
      rideMarkersRef.current.push(pickupMarker);
    }

    if (tripPhase === "heading_to_pickup") {
      const dropMarker = L.marker([dropoff.lat, dropoff.lng], {
        icon: circleIcon("#ef4444", "D", 20), zIndexOffset: 999,
      }).addTo(map);
      rideMarkersRef.current.push(dropMarker);
    }

    // Route polyline
    const routeColor = tripPhase === "in_progress" ? "#4285F4" : "#22c55e";
    const polyline = L.polyline([], {
      color: routeColor, weight: 7, opacity: 0.85,
    }).addTo(map);
    routePolylineRef.current = polyline;

    const rerouteConfig = navSettings.rerouteAggressiveness === "aggressive"
      ? { interval: 8000, movement: 15 }
      : navSettings.rerouteAggressiveness === "relaxed"
      ? { interval: 20000, movement: 50 }
      : { interval: 12000, movement: 25 };
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

      fetchOsrmRoute(origin, destination, [], true)
        .then(routes => {
          const best = pickShortestOsrmRoute(routes, roadClosures);
          if (routeRequestSeqRef.current !== requestSeq) return;

          lastRouteFetchAtRef.current = Date.now();
          lastRerouteOriginRef.current = origin;

          routePathRef.current = best.coordinates;
          if (routePolylineRef.current) {
            routePolylineRef.current.setLatLngs(best.coordinates);
          }

          parseOsrmRoute(best, driverPos);

          // Check route proximity to road closures
          const PROXIMITY_M = 100;
          const nearbyClosures = roadClosures.filter((c) =>
            c.coordinates.some((cp) =>
              best.coordinates.some((rp) => getDistanceMeters({ lat: rp[0], lng: rp[1] }, cp) < PROXIMITY_M)
            )
          );

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
        })
        .catch((err) => console.error("OSRM route error:", err))
        .finally(() => {
          if (routeRequestSeqRef.current === requestSeq) routeFetchInFlightRef.current = false;
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
    if (!map) return;

    if (radiusCircleRef.current) { radiusCircleRef.current.remove(); radiusCircleRef.current = null; }

    if (radiusKm && radiusKm > 0 && !isNavigating && showRadius && currentPos) {
      radiusCircleRef.current = L.circle([currentPos.lat, currentPos.lng], {
        radius: radiusKm * 1000,
        color: "#4285F4", weight: 2, opacity: 0.6,
        fillColor: "#4285F4", fillOpacity: 0.08,
      }).addTo(map);
    }
  }, [radiusKm, isNavigating, currentPos, showRadius]);

  // Road closures overlay
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    roadClosureLayersRef.current.forEach((l) => map.removeLayer(l));
    roadClosureLayersRef.current = [];

    const sevColors: Record<string, string> = { closed: "#ef4444", lane_closed: "#f59e0b", hazard: "#f97316", cones: "#f59e0b", accident: "#dc2626" };
    const sevLabels: Record<string, string> = { closed: "Road Closed", lane_closed: "Lane Closed", hazard: "Hazard", cones: "Cones", accident: "Accident" };

    roadClosures.forEach((c) => {
      const coords = c.coordinates;
      const color = sevColors[c.severity] || "#ef4444";
      const label = sevLabels[c.severity] || "Closure";

      if (c.closure_type === "point" && coords.length > 0) {
        const marker = L.marker([coords[0].lat, coords[0].lng], {
          icon: L.divIcon({
            className: "",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">⚠️</div>`,
          }),
          zIndexOffset: 2000,
        }).addTo(map);
        marker.bindPopup(`<div style="font-size:12px;padding:4px"><strong style="color:${color}">${label}</strong>${c.notes ? `<br/>${c.notes}` : ""}</div>`);
        roadClosureLayersRef.current.push(marker);
      } else if (c.closure_type === "line" && coords.length > 1) {
        const line = L.polyline(coords.map(p => [p.lat, p.lng] as [number, number]), {
          color, weight: 6, opacity: 0.8, dashArray: "10 5",
        }).addTo(map);
        roadClosureLayersRef.current.push(line);

        const midIdx = Math.floor(coords.length / 2);
        const infoMarker = L.marker([coords[midIdx].lat, coords[midIdx].lng], {
          icon: L.divIcon({
            className: "",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">⚠️</div>`,
          }),
          zIndexOffset: 2001,
        }).addTo(map);
        infoMarker.bindPopup(`<div style="font-size:12px;padding:4px"><strong style="color:${color}">${label}</strong>${c.notes ? `<br/>${c.notes}` : ""}</div>`);
        roadClosureLayersRef.current.push(infoMarker);
      }
    });
  }, [roadClosures, mapReady]);

  // Passenger live location marker
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (!passengerLiveLocation || tripPhase === "in_progress" || !isNavigating) {
      if (passengerLiveMarkerRef.current) { passengerLiveMarkerRef.current.remove(); passengerLiveMarkerRef.current = null; }
      if (passengerPulseRef.current) { passengerPulseRef.current.remove(); passengerPulseRef.current = null; }
      if (passengerPulseIntervalRef.current) { clearInterval(passengerPulseIntervalRef.current); passengerPulseIntervalRef.current = null; }
      return;
    }

    const pos: [number, number] = [passengerLiveLocation.lat, passengerLiveLocation.lng];

    if (passengerPulseRef.current) {
      passengerPulseRef.current.setLatLng(pos);
    } else {
      const pulseCircle = L.circle(pos, {
        radius: 30, fillColor: "#3b82f6", fillOpacity: 0.25,
        color: "#3b82f6", opacity: 0.4, weight: 2,
      }).addTo(map);
      passengerPulseRef.current = pulseCircle;

      let growing = true;
      let currentRadius = 30;
      passengerPulseIntervalRef.current = setInterval(() => {
        if (!passengerPulseRef.current) return;
        if (growing) { currentRadius += 4; if (currentRadius >= 60) growing = false; }
        else { currentRadius -= 4; if (currentRadius <= 30) growing = true; }
        passengerPulseRef.current.setRadius(currentRadius);
        passengerPulseRef.current.setStyle({
          fillOpacity: 0.25 - (currentRadius - 30) * 0.006,
          opacity: 0.4 - (currentRadius - 30) * 0.01,
        });
      }, 150);
    }

    if (passengerLiveMarkerRef.current) {
      passengerLiveMarkerRef.current.setLatLng(pos);
    } else {
      const icon = passengerMapIconUrl
        ? customImgIcon(passengerMapIconUrl, 32)
        : circleIcon("#3b82f6", "👤", 28);
      passengerLiveMarkerRef.current = L.marker(pos, { icon, zIndexOffset: 998 }).addTo(map);
    }
  }, [passengerLiveLocation, tripPhase, isNavigating, passengerMapIconUrl]);

  // Maneuver icons
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

  // Expose recenter
  useEffect(() => {
    onRecenterAvailableChange?.(userPannedAway && !isNavigating);
  }, [userPannedAway, isNavigating, onRecenterAvailableChange]);

  useEffect(() => {
    if (recenterRef) {
      recenterRef.current = () => {
        userInteractingRef.current = false;
        setUserPannedAway(false);
        if (currentPos && mapInstance.current) {
          mapInstance.current.panTo([currentPos.lat, currentPos.lng]);
          mapInstance.current.setZoom(16);
        }
      };
    }
  }, [currentPos, recenterRef]);

  // Expose startFreeNav to parent
  useEffect(() => {
    if (startFreeNavRef) startFreeNavRef.current = startFreeNav;
  }, [startFreeNav, startFreeNavRef]);

  // Notify parent of free nav state changes
  useEffect(() => {
    onFreeNavChange?.(!!freeNavTarget);
  }, [freeNavTarget, onFreeNavChange]);

  // Expose follow toggle
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
          if (mapInstance.current) {
            const bounds = L.latLngBounds([]);
            if (currentPos) bounds.extend([currentPos.lat, currentPos.lng]);
            if (pickupCoords) bounds.extend([pickupCoords[0], pickupCoords[1]]);
            if (dropoffCoords) bounds.extend([dropoffCoords[0], dropoffCoords[1]]);
            if (bounds.isValid()) mapInstance.current.fitBounds(bounds, { padding: [60, 60] });
          }
        } else {
          setFollowDriver(true);
          userInteractingRef.current = false;
          setUserPannedAway(false);
          if (currentPos && mapInstance.current) {
            mapInstance.current.panTo([currentPos.lat, currentPos.lng]);
            mapInstance.current.setZoom(18);
          }
        }
      };
    }
  }, [followDriver, followToggleRef, currentPos, pickupCoords, dropoffCoords]);

  // Compass / heading — Leaflet doesn't support map rotation, so these are no-ops
  useEffect(() => {
    if (resetNorthRef) {
      resetNorthRef.current = () => {
        setMapHeading(0);
        onMapHeadingChange?.(0);
      };
    }
  }, [resetNorthRef, onMapHeadingChange]);

  const nextStep = navSteps[currentStepIndex + 1];

  return (
    <>
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* Compass reset exposed via ref to parent */}

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

      {/* Free navigation — turn-by-turn UI */}
      {freeNavTarget && (
        <>
          {freeNavSteps.length > 0 && (
            <div className="absolute top-3 left-3 right-3 z-[9980]">
              <div className="bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
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

      {/* Context menu on map tap/long-press */}
      <AnimatePresence>
        {reportMenuPos && !showReportForm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[9990] bg-black/20"
              onClick={() => setReportMenuPos(null)}
            />
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
              className="fixed bottom-0 left-0 right-0 z-[9991] px-3 pb-4"
            >
              <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex justify-center pt-2.5 pb-1">
                  <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                </div>
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
                      status: "approved",
                      reported_by: user?.id,
                      reported_by_type: "driver",
                    });
                    toast({ title: "Report submitted", description: "Your report is now live on the map" });
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
            <p className="text-[10px] text-muted-foreground text-center">Your report will appear on the map immediately</p>
          </div>
        </div>
      )}
    </>
  );
};

export default DriverMap;
