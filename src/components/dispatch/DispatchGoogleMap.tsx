import { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { useRoadClosures, RoadClosure } from "@/hooks/use-road-closures";
import { supabase } from "@/integrations/supabase/client";
import { Search, X, AlertTriangle, Minus, MapPin, Trash2, Clock, Layers, Calendar, Repeat, Construction, Car, TriangleAlert, Cone } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// Waze-inspired map style
const wazeMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#f0efe9" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#52524e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 3 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c9c9c1" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e8e7df" }] },
  { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#eceae2" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#dfddd5" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#b6e59e" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#4a8c3f" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#d6d5cd" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#5ac8fa" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#38a3d0" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "labels.text.stroke", stylers: [{ color: "#38a3d0" }, { weight: 3 }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#ffd866" }] },
  { featureType: "road.arterial", elementType: "geometry.stroke", stylers: [{ color: "#d4b04a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#aadaff" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5b98c0" }] },
];

const wazeDarkStyle = [
  { elementType: "geometry", stylers: [{ color: "#1c1c28" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a0a0a8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1c1c28" }, { weight: 3 }] },
  { elementType: "labels.icon", stylers: [{ visibility: "on" }, { lightness: -30 }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#22222e" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#282838" }] },
  { featureType: "poi.park", elementType: "geometry.fill", stylers: [{ color: "#1a3a20" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#2e2e3e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1c1c28" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#2a7ab5" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1a5a8a" }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#8a7a30" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1a2e" }] },
];

type DrawMode = null | "point" | "line";

const SEVERITY_OPTIONS = [
  { value: "closed", label: "Road Closed", color: "#ef4444", icon: "🚫" },
  { value: "lane_closed", label: "Lane Closed", color: "#f59e0b", icon: "🚧" },
  { value: "cones", label: "Cones", color: "#eab308", icon: "🔶" },
  { value: "accident", label: "Accident", color: "#dc2626", icon: "💥" },
  { value: "hazard", label: "Hazard", color: "#f97316", icon: "⚠️" },
];

const EXPIRY_OPTIONS = [
  { value: "", label: "No expiry" },
  { value: "1", label: "1 hour" },
  { value: "4", label: "4 hours" },
  { value: "8", label: "8 hours" },
  { value: "24", label: "24 hours" },
  { value: "48", label: "2 days" },
  { value: "168", label: "1 week" },
];

const DAY_OPTIONS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

const DispatchGoogleMap = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const searchMarkerRef = useRef<google.maps.Marker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [namedLocations, setNamedLocations] = useState<Array<{ id: string; name: string; address: string; lat: number; lng: number; type: "named" }>>([]);
  const [serviceAreas, setServiceAreas] = useState<Array<{ id: string; name: string; address: string; lat: number; lng: number; type: "service" }>>([]);
  const [filteredResults, setFilteredResults] = useState<Array<{ id: string; name: string; address: string; lat: number; lng: number; type: "named" | "service" }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { isLoaded, error } = useGoogleMaps();

  // Road closure state
  const { closures, pendingClosures, addClosure, removeClosure, approveClosure, rejectClosure } = useRoadClosures();
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [linePoints, setLinePoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [showClosureForm, setShowClosureForm] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<Array<{ lat: number; lng: number }>>([]);
  const [pendingType, setPendingType] = useState<"point" | "line">("point");
  const [closureNotes, setClosureNotes] = useState("");
  const [closureSeverity, setClosureSeverity] = useState("closed");
  const [closureExpiry, setClosureExpiry] = useState("");
  const [scheduleType, setScheduleType] = useState<"immediate" | "scheduled" | "recurring">("immediate");
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [scheduleStartTime, setScheduleStartTime] = useState("08:00");
  const [scheduleEndTime, setScheduleEndTime] = useState("17:00");
  const [scheduledDate, setScheduledDate] = useState("");

  // Refs for map objects
  const closureMarkersRef = useRef<any[]>([]);
  const closureLinesRef = useRef<any[]>([]);
  const drawTempMarkersRef = useRef<any[]>([]);
  const drawTempLineRef = useRef<any>(null);
  const clickListenerRef = useRef<any>(null);

  // Init map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const isDark = document.documentElement.classList.contains("dark");

    const map = new g.maps.Map(mapRef.current, {
      center: { lat: 4.2105, lng: 73.5400 },
      zoom: 16,
      disableDefaultUI: true,
      zoomControl: true,
      fullscreenControl: true,
      gestureHandling: "greedy",
      styles: isDark ? wazeDarkStyle : wazeMapStyle,
    });

    mapInstance.current = map;

    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      map.setOptions({ styles: dark ? wazeDarkStyle : wazeMapStyle });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
      mapInstance.current = null;
    };
  }, [isLoaded]);

  // Load named locations & service areas
  useEffect(() => {
    supabase
      .from("named_locations")
      .select("id, name, address, lat, lng")
      .eq("is_active", true)
      .eq("status", "approved")
      .then(({ data }) => {
        if (data) setNamedLocations(data.map((d) => ({ ...d, type: "named" as const })));
      });
    supabase
      .from("service_locations")
      .select("id, name, address, lat, lng")
      .eq("is_active", true)
      .then(({ data }) => {
        if (data) setServiceAreas(data.map((d) => ({ ...d, lat: Number(d.lat), lng: Number(d.lng), type: "service" as const })));
      });
  }, []);

  // Filter on search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 1) {
      setFilteredResults([]);
      setShowSuggestions(false);
      return;
    }
    const q = searchQuery.toLowerCase();
    const namedMatches = namedLocations.filter(
      (l) => l.name.toLowerCase().includes(q) || l.address.toLowerCase().includes(q)
    ).slice(0, 5);
    const serviceMatches = serviceAreas.filter(
      (l) => l.name.toLowerCase().includes(q) || l.address.toLowerCase().includes(q)
    ).slice(0, 3);
    const combined = [...serviceMatches, ...namedMatches];
    setFilteredResults(combined);
    setShowSuggestions(combined.length > 0);
  }, [searchQuery, namedLocations, serviceAreas]);

  const selectNamedLocation = useCallback((loc: { id: string; name: string; address: string; lat: number; lng: number; type: string }) => {
    const g = (window as any).google;
    if (!g?.maps || !mapInstance.current) return;

    if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);
    const pos = { lat: loc.lat, lng: loc.lng };
    mapInstance.current.panTo(pos);
    mapInstance.current.setZoom(18);

    searchMarkerRef.current = new g.maps.Marker({
      map: mapInstance.current,
      position: pos,
      title: loc.name,
      animation: g.maps.Animation.DROP,
      icon: {
        path: g.maps.SymbolPath.CIRCLE,
        scale: 12, fillColor: "#22c55e", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3,
      },
    });

    const iw = new g.maps.InfoWindow({
      content: `<div style="font-size:12px;font-weight:600;padding:4px">${loc.name}<br/><span style="font-weight:400;color:#666">${loc.address}</span></div>`,
    });
    iw.open(mapInstance.current, searchMarkerRef.current);

    setSearchQuery(loc.name);
    if (inputRef.current) inputRef.current.value = loc.name;
    setShowSuggestions(false);
  }, []);

  // Suppress Google Places pac-container dropdown on our search input
  useEffect(() => {
    const observer = new MutationObserver(() => {
      document.querySelectorAll(".pac-container").forEach((el) => {
        (el as HTMLElement).style.display = "none";
      });
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, []);


  // Draw mode click listener
  useEffect(() => {
    if (!mapInstance.current || !isLoaded) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    // Remove old listener
    if (clickListenerRef.current) {
      g.maps.event.removeListener(clickListenerRef.current);
      clickListenerRef.current = null;
    }

    if (!drawMode) {
      // Clear temp markers
      drawTempMarkersRef.current.forEach((m) => m.setMap(null));
      drawTempMarkersRef.current = [];
      if (drawTempLineRef.current) { drawTempLineRef.current.setMap(null); drawTempLineRef.current = null; }
      return;
    }

    clickListenerRef.current = mapInstance.current.addListener("click", (e: any) => {
      const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };

      if (drawMode === "point") {
        // Immediately open form
        setPendingCoords([pos]);
        setPendingType("point");
        setShowClosureForm(true);
        setDrawMode(null);
        // Temp marker
        const m = new g.maps.Marker({
          map: mapInstance.current,
          position: pos,
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#ef4444", fillOpacity: 0.8, strokeColor: "#fff", strokeWeight: 2 },
        });
        drawTempMarkersRef.current.push(m);
      } else if (drawMode === "line") {
        setLinePoints((prev) => {
          const updated = [...prev, pos];
          // Add temp marker
          const m = new g.maps.Marker({
            map: mapInstance.current,
            position: pos,
            icon: { path: g.maps.SymbolPath.CIRCLE, scale: 6, fillColor: "#ef4444", fillOpacity: 0.9, strokeColor: "#fff", strokeWeight: 2 },
          });
          drawTempMarkersRef.current.push(m);

          // Update temp line
          if (drawTempLineRef.current) drawTempLineRef.current.setMap(null);
          if (updated.length > 1) {
            drawTempLineRef.current = new g.maps.Polyline({
              map: mapInstance.current,
              path: updated,
              strokeColor: "#ef4444",
              strokeWeight: 5,
              strokeOpacity: 0.7,
              icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "15px" }],
            });
          }
          return updated;
        });
      }
    });

    return () => {
      if (clickListenerRef.current) {
        g.maps.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
    };
  }, [drawMode, isLoaded]);

  // Render closures on map
  useEffect(() => {
    if (!mapInstance.current || !isLoaded) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    // Clear old
    closureMarkersRef.current.forEach((m) => m.setMap(null));
    closureLinesRef.current.forEach((l) => l.setMap(null));
    closureMarkersRef.current = [];
    closureLinesRef.current = [];

    closures.forEach((c) => {
      const coords = c.coordinates;
      const sev = SEVERITY_OPTIONS.find((s) => s.value === c.severity) || SEVERITY_OPTIONS[0];

      if (c.closure_type === "point" && coords.length > 0) {
        const marker = new g.maps.Marker({
          map: mapInstance.current,
          position: coords[0],
          icon: {
            path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z",
            fillColor: sev.color,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 1.5,
            scale: 1.3,
            anchor: new g.maps.Point(12, 12),
          },
          zIndex: 2000,
        });

        const driverInfo = c.reported_by_type === "driver" && c.reporter_name
          ? `<div style="font-size:10px;color:#3b82f6;font-weight:600;margin-bottom:2px">🚗 Reported by: ${c.reporter_name}${c.reporter_phone ? ` (${c.reporter_phone})` : ""}</div>`
          : "";
        const iw = new g.maps.InfoWindow({
          content: `<div style="font-size:12px;padding:4px;max-width:220px">
            ${driverInfo}
            <strong style="color:${sev.color}">${sev.label}</strong>
            ${c.notes ? `<br/><span style="color:#666">${c.notes}</span>` : ""}
            ${c.expires_at ? `<br/><span style="font-size:10px;color:#999">Expires: ${new Date(c.expires_at).toLocaleString()}</span>` : ""}
            <br/><button onclick="window.__removeClosure__('${c.id}')" style="margin-top:4px;font-size:11px;color:#ef4444;cursor:pointer;background:none;border:none;text-decoration:underline">Remove</button>
          </div>`,
        });
        marker.addListener("click", () => iw.open(mapInstance.current, marker));
        closureMarkersRef.current.push(marker);
      } else if (c.closure_type === "line" && coords.length > 1) {
        const line = new g.maps.Polyline({
          map: mapInstance.current,
          path: coords,
          strokeColor: sev.color,
          strokeWeight: 6,
          strokeOpacity: 0.8,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 }, offset: "0", repeat: "15px" }],
          zIndex: 1999,
        });

        // Click on line to show info
        const midIdx = Math.floor(coords.length / 2);
        const midPoint = coords[midIdx];
        const infoMarker = new g.maps.Marker({
          map: mapInstance.current,
          position: midPoint,
          icon: {
            path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z",
            fillColor: sev.color,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 1.5,
            scale: 1.3,
            anchor: new g.maps.Point(12, 12),
          },
          zIndex: 2001,
        });

        const lineDriverInfo = c.reported_by_type === "driver" && c.reporter_name
          ? `<div style="font-size:10px;color:#3b82f6;font-weight:600;margin-bottom:2px">🚗 Reported by: ${c.reporter_name}${c.reporter_phone ? ` (${c.reporter_phone})` : ""}</div>`
          : "";
        const iw = new g.maps.InfoWindow({
          content: `<div style="font-size:12px;padding:4px;max-width:220px">
            ${lineDriverInfo}
            <strong style="color:${sev.color}">${sev.label}</strong>
            ${c.notes ? `<br/><span style="color:#666">${c.notes}</span>` : ""}
            ${c.expires_at ? `<br/><span style="font-size:10px;color:#999">Expires: ${new Date(c.expires_at).toLocaleString()}</span>` : ""}
            <br/><button onclick="window.__removeClosure__('${c.id}')" style="margin-top:4px;font-size:11px;color:#ef4444;cursor:pointer;background:none;border:none;text-decoration:underline">Remove</button>
          </div>`,
        });
        infoMarker.addListener("click", () => iw.open(mapInstance.current, infoMarker));

        closureLinesRef.current.push(line);
        closureMarkersRef.current.push(infoMarker);
      }
    });
  }, [closures, isLoaded]);

  // Render pending (driver-reported) closures with pulsing markers
  const pendingMarkersRef = useRef<any[]>([]);
  useEffect(() => {
    if (!mapInstance.current || !isLoaded) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    pendingMarkersRef.current.forEach((m) => m.setMap(null));
    pendingMarkersRef.current = [];

    pendingClosures.forEach((c) => {
      const coords = c.coordinates;
      if (coords.length === 0) return;
      const sev = SEVERITY_OPTIONS.find((s) => s.value === c.severity) || SEVERITY_OPTIONS[0];
      const pos = coords[0];

      const marker = new g.maps.Marker({
        map: mapInstance.current,
        position: pos,
        icon: {
          path: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z",
          fillColor: "#3b82f6",
          fillOpacity: 0.8,
          strokeColor: "#fff",
          strokeWeight: 2,
          scale: 1.5,
          anchor: new g.maps.Point(12, 12),
        },
        zIndex: 2100,
        animation: g.maps.Animation.BOUNCE,
      });

      const iw = new g.maps.InfoWindow({
        content: `<div style="font-size:12px;padding:4px;max-width:220px">
          <div style="font-size:10px;color:#3b82f6;font-weight:600;margin-bottom:2px">📋 DRIVER REPORT (pending)</div>
          <strong style="color:${sev.color}">${sev.label}</strong>
          ${c.notes ? `<br/><span style="color:#666">${c.notes}</span>` : ""}
          <div style="display:flex;gap:6px;margin-top:6px">
            <button onclick="window.__approveClosure__('${c.id}')" style="font-size:11px;color:#22c55e;cursor:pointer;background:none;border:1px solid #22c55e;border-radius:4px;padding:2px 8px;font-weight:600">✓ Approve</button>
            <button onclick="window.__rejectClosure__('${c.id}')" style="font-size:11px;color:#ef4444;cursor:pointer;background:none;border:1px solid #ef4444;border-radius:4px;padding:2px 8px;font-weight:600">✕ Reject</button>
          </div>
        </div>`,
      });
      marker.addListener("click", () => iw.open(mapInstance.current, marker));
      pendingMarkersRef.current.push(marker);
    });
  }, [pendingClosures, isLoaded]);

  // Global remove/approve/reject handlers
  useEffect(() => {
    (window as any).__removeClosure__ = async (id: string) => {
      await removeClosure(id);
      toast({ title: "Closure removed" });
    };
    (window as any).__approveClosure__ = async (id: string) => {
      await approveClosure(id);
      toast({ title: "Closure approved — now visible to drivers" });
    };
    (window as any).__rejectClosure__ = async (id: string) => {
      await rejectClosure(id);
      toast({ title: "Report rejected" });
    };
    return () => {
      delete (window as any).__removeClosure__;
      delete (window as any).__approveClosure__;
      delete (window as any).__rejectClosure__;
    };
  }, [removeClosure, approveClosure, rejectClosure]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    if (inputRef.current) inputRef.current.value = "";
    if (searchMarkerRef.current) {
      searchMarkerRef.current.setMap(null);
      searchMarkerRef.current = null;
    }
  }, []);

  const finishLineDraw = () => {
    if (linePoints.length < 2) {
      toast({ title: "Need at least 2 points for a line closure", variant: "destructive" });
      return;
    }
    setPendingCoords(linePoints);
    setPendingType("line");
    setShowClosureForm(true);
    setDrawMode(null);
    setLinePoints([]);
  };

  const cancelDraw = () => {
    setDrawMode(null);
    setLinePoints([]);
    drawTempMarkersRef.current.forEach((m) => m.setMap(null));
    drawTempMarkersRef.current = [];
    if (drawTempLineRef.current) { drawTempLineRef.current.setMap(null); drawTempLineRef.current = null; }
  };

  const submitClosure = async () => {
    try {
      let expiresAt: string | null = null;
      if (closureExpiry) {
        const d = new Date();
        d.setHours(d.getHours() + parseInt(closureExpiry));
        expiresAt = d.toISOString();
      }
      await addClosure({
        closure_type: pendingType,
        coordinates: pendingCoords,
        notes: closureNotes,
        severity: closureSeverity,
        expires_at: expiresAt,
        schedule_type: scheduleType,
        schedule_days: scheduleDays,
        schedule_start_time: scheduleType !== "immediate" ? scheduleStartTime : null,
        schedule_end_time: scheduleType !== "immediate" ? scheduleEndTime : null,
        scheduled_date: scheduleType === "scheduled" ? scheduledDate || null : null,
      });
      toast({ title: "Road closure added" });
      drawTempMarkersRef.current.forEach((m) => m.setMap(null));
      drawTempMarkersRef.current = [];
      if (drawTempLineRef.current) { drawTempLineRef.current.setMap(null); drawTempLineRef.current = null; }
    } catch {
      toast({ title: "Failed to add closure", variant: "destructive" });
    }
    setShowClosureForm(false);
    setClosureNotes("");
    setClosureSeverity("closed");
    setClosureExpiry("");
    setScheduleType("immediate");
    setScheduleDays([]);
    setScheduleStartTime("08:00");
    setScheduleEndTime("17:00");
    setScheduledDate("");
  };

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background text-muted-foreground text-sm">
        Map unavailable
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {/* Search bar */}
      <div className="absolute top-3 left-3 right-3 sm:left-4 sm:right-auto sm:w-80 z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search service areas & named locations..."
            autoComplete="off"
            className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-background/95 backdrop-blur-sm border border-border shadow-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => { if (filteredResults.length > 0) setShowSuggestions(true); }}
          />
          {searchQuery && (
            <button onClick={() => { clearSearch(); setShowSuggestions(false); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {/* Suggestions dropdown */}
        {showSuggestions && filteredResults.length > 0 && (
          <div className="mt-1 bg-background/95 backdrop-blur-sm border border-border rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
            {filteredResults.some((r) => r.type === "service") && (
              <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
                Service Areas
              </div>
            )}
            {filteredResults.filter((r) => r.type === "service").map((loc) => (
              <button
                key={loc.id}
                onClick={() => selectNamedLocation(loc)}
                className="w-full px-3 py-2 text-left hover:bg-accent flex items-start gap-2 border-b border-border/50 last:border-0"
              >
                <Layers className="w-3.5 h-3.5 text-chart-2 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{loc.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{loc.address}</div>
                </div>
              </button>
            ))}
            {filteredResults.some((r) => r.type === "named") && (
              <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
                Named Locations
              </div>
            )}
            {filteredResults.filter((r) => r.type === "named").map((loc) => (
              <button
                key={loc.id}
                onClick={() => selectNamedLocation(loc)}
                className="w-full px-3 py-2 text-left hover:bg-accent flex items-start gap-2 border-b border-border/50 last:border-0"
              >
                <MapPin className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">{loc.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{loc.address}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Road closure toolbar */}
      <div className="absolute top-3 right-3 sm:right-4 z-10 flex flex-col gap-2">
        <div className="bg-background/95 backdrop-blur-sm border border-border rounded-2xl shadow-lg p-1.5 flex flex-col gap-1">
          <div className="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            Road Closures
            {pendingClosures.length > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[8px] font-bold animate-pulse">
                {pendingClosures.length}
              </span>
            )}
          </div>
          <button
            onClick={() => { if (drawMode === "point") cancelDraw(); else { cancelDraw(); setDrawMode("point"); } }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              drawMode === "point"
                ? "bg-destructive text-destructive-foreground shadow-md"
                : "text-foreground hover:bg-accent"
            }`}
            title="Tap the map to mark a single point as closed"
          >
            <MapPin className="w-3.5 h-3.5" />
            <div className="text-left">
              <div>Point Closure</div>
              <div className={`text-[10px] ${drawMode === "point" ? "opacity-80" : "text-muted-foreground"}`}>Tap to mark a spot</div>
            </div>
          </button>
          <button
            onClick={() => { if (drawMode === "line") cancelDraw(); else { cancelDraw(); setDrawMode("line"); } }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              drawMode === "line"
                ? "bg-destructive text-destructive-foreground shadow-md"
                : "text-foreground hover:bg-accent"
            }`}
            title="Draw a line along the closed road segment"
          >
            <Minus className="w-3.5 h-3.5" />
            <div className="text-left">
              <div>Line Closure</div>
              <div className={`text-[10px] ${drawMode === "line" ? "opacity-80" : "text-muted-foreground"}`}>Draw a closed stretch</div>
            </div>
          </button>
        </div>
      </div>

      {/* Drawing mode indicator */}
      {drawMode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
          <div className="bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-xl text-xs font-medium shadow-lg flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            {drawMode === "point" ? "Tap map to place closure" : `Drawing line (${linePoints.length} pts) — tap to add points`}
          </div>
          {drawMode === "line" && linePoints.length >= 2 && (
            <button onClick={finishLineDraw} className="bg-primary text-primary-foreground px-3 py-2 rounded-xl text-xs font-medium shadow-lg">
              Done
            </button>
          )}
          <button onClick={cancelDraw} className="bg-muted text-muted-foreground px-3 py-2 rounded-xl text-xs font-medium shadow-lg">
            Cancel
          </button>
        </div>
      )}

      {/* Closure form modal */}
      {showClosureForm && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-96 max-w-[92vw] max-h-[85vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-border">
              <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {pendingType === "point" ? "Point Closure" : "Line Closure"}
                </h3>
                <p className="text-xs text-muted-foreground">Mark a road hazard or closure</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Severity - grid of cards */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Type</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {SEVERITY_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setClosureSeverity(s.value)}
                      className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all text-center ${
                        closureSeverity === s.value
                          ? "border-foreground bg-accent shadow-sm"
                          : "border-transparent bg-muted/50 hover:bg-accent/50"
                      }`}
                    >
                      <span className="text-base leading-none">{s.icon}</span>
                      <span className="text-[10px] font-medium leading-tight">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Construction on main road"
                  value={closureNotes}
                  onChange={(e) => setClosureNotes(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
                />
              </div>

              {/* Schedule Type Tabs */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Schedule</label>
                <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
                  {[
                    { value: "immediate" as const, label: "Now", icon: "⚡" },
                    { value: "scheduled" as const, label: "Date", icon: "📅" },
                    { value: "recurring" as const, label: "Repeat", icon: "🔁" },
                  ].map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setScheduleType(t.value)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                        scheduleType === t.value
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span>{t.icon}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Immediate: expiry */}
              {scheduleType === "immediate" && (
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <select
                    value={closureExpiry}
                    onChange={(e) => setClosureExpiry(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Scheduled: date + time range */}
              {scheduleType === "scheduled" && (
                <div className="space-y-3 p-3 bg-muted/30 rounded-xl border border-border">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">Date</label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">Start</label>
                      <input
                        type="time"
                        value={scheduleStartTime}
                        onChange={(e) => setScheduleStartTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">End</label>
                      <input
                        type="time"
                        value={scheduleEndTime}
                        onChange={(e) => setScheduleEndTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Recurring: day picker + time range */}
              {scheduleType === "recurring" && (
                <div className="space-y-3 p-3 bg-muted/30 rounded-xl border border-border">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground mb-2 block uppercase tracking-wider">Repeat On</label>
                    <div className="flex gap-1">
                      {DAY_OPTIONS.map((d) => (
                        <button
                          key={d.value}
                          onClick={() =>
                            setScheduleDays((prev) =>
                              prev.includes(d.value) ? prev.filter((x) => x !== d.value) : [...prev, d.value]
                            )
                          }
                          className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all ${
                            scheduleDays.includes(d.value)
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-background text-muted-foreground border border-border hover:bg-accent"
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">Start</label>
                      <input
                        type="time"
                        value={scheduleStartTime}
                        onChange={(e) => setScheduleStartTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">End</label>
                      <input
                        type="time"
                        value={scheduleEndTime}
                        onChange={(e) => setScheduleEndTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex gap-2 px-5 pb-5 pt-2 border-t border-border">
              <button
                onClick={() => {
                  setShowClosureForm(false);
                  drawTempMarkersRef.current.forEach((m) => m.setMap(null));
                  drawTempMarkersRef.current = [];
                  if (drawTempLineRef.current) { drawTempLineRef.current.setMap(null); drawTempLineRef.current = null; }
                }}
                className="flex-1 py-2.5 text-xs rounded-xl border border-border text-muted-foreground hover:bg-accent font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={submitClosure}
                className="flex-1 py-2.5 text-xs rounded-xl bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90 shadow-sm transition-all"
              >
                Add Closure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DispatchGoogleMap;
