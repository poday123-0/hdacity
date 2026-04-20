import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useRoadClosures, RoadClosure } from "@/hooks/use-road-closures";
import { supabase } from "@/integrations/supabase/client";
import { Search, X, AlertTriangle, Minus, MapPin, Trash2, Clock, Layers, Calendar, Repeat, Construction, Car, TriangleAlert, Cone, Pencil, Tag } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { getServiceAreasWithPolygons, isInsideAnyServiceArea } from "@/lib/service-area-filter";

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

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

const DispatchGoogleMap = ({ isActive = true }: { isActive?: boolean }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const searchMarkerRef = useRef<L.Marker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [namedLocations, setNamedLocations] = useState<Array<{ id: string; name: string; address: string; lat: number; lng: number; type: "named" }>>([]);
  const [serviceAreas, setServiceAreas] = useState<Array<{ id: string; name: string; address: string; lat: number; lng: number; type: "service" }>>([]);
  const [filteredResults, setFilteredResults] = useState<Array<{ id: string; name: string; address: string; lat: number; lng: number; type: "named" | "service" }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showNamedLabels, setShowNamedLabels] = useState(false);

  // Road closure state
  const { closures, pendingClosures, addClosure, removeClosure, updateClosure, approveClosure, rejectClosure } = useRoadClosures();
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

  // Edit closure state
  const [editingClosureId, setEditingClosureId] = useState<string | null>(null);
  const [editClosureNotes, setEditClosureNotes] = useState("");
  const [editClosureSeverity, setEditClosureSeverity] = useState("closed");
  const [editClosureExpiry, setEditClosureExpiry] = useState("");

  // Refs for map objects
  const closureLayersRef = useRef<L.Layer[]>([]);
  const drawTempMarkersRef = useRef<L.Marker[]>([]);
  const drawTempLineRef = useRef<L.Polyline | null>(null);

  // Init Leaflet map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const isDark = document.documentElement.classList.contains("dark");

    const map = L.map(mapRef.current, {
      center: [4.2105, 73.54],
      zoom: 16,
      zoomControl: true,
      attributionControl: false,
    });

    const tileUrl = isDark ? DARK_TILES : LIGHT_TILES;
    const tileLayer = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);
    tileLayerRef.current = tileLayer;
    mapInstance.current = map;

    const refreshMapSize = () => {
      if (!mapRef.current || !mapInstance.current) return;
      const { width, height } = mapRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        window.requestAnimationFrame(() => {
          mapInstance.current?.invalidateSize(false);
        });
      }
    };

    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains("dark");
      if (tileLayerRef.current) tileLayerRef.current.setUrl(dark ? DARK_TILES : LIGHT_TILES);
      refreshMapSize();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const resizeObserver = new ResizeObserver(() => refreshMapSize());
    resizeObserver.observe(mapRef.current);
    window.addEventListener("resize", refreshMapSize);

    refreshMapSize();
    window.setTimeout(refreshMapSize, 120);
    window.setTimeout(refreshMapSize, 320);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", refreshMapSize);
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isActive || !mapRef.current || !mapInstance.current) return;

    const refreshWhenVisible = () => {
      const { width, height } = mapRef.current!.getBoundingClientRect();
      if (width > 0 && height > 0) {
        mapInstance.current?.invalidateSize(false);
      }
    };

    window.requestAnimationFrame(refreshWhenVisible);
    window.setTimeout(refreshWhenVisible, 120);
    window.setTimeout(refreshWhenVisible, 320);
  }, [isActive]);

  // Named location labels on dispatch map
  const namedLabelsRef = useRef<L.Marker[]>([]);
  const namedLocCacheRef = useRef<any[]>([]);
  useEffect(() => {
    const fetchAll = async () => {
      let all: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data } = await supabase.from("named_locations").select("name, lat, lng").eq("is_active", true).eq("status", "approved").range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      namedLocCacheRef.current = all;
    };
    fetchAll();
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    const updateLabels = () => {
      namedLabelsRef.current.forEach(m => map.removeLayer(m));
      namedLabelsRef.current = [];
      if (!showNamedLabels) return;
      const zoom = map.getZoom();
      if (zoom < 15 || namedLocCacheRef.current.length === 0) return;
      const bounds = map.getBounds();
      const visible = namedLocCacheRef.current.filter(l => bounds.contains([Number(l.lat), Number(l.lng)])).slice(0, 120);
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
  }, [!!mapInstance.current, showNamedLabels]);

  // Load named locations & service areas (paginated)
  useEffect(() => {
    const fetchAllNamed = async () => {
      let all: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data } = await supabase.from("named_locations").select("id, name, address, lat, lng").eq("is_active", true).eq("status", "approved").range(from, from + PAGE - 1);
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      setNamedLocations(all.map((d) => ({ ...d, type: "named" as const })));
    };
    fetchAllNamed();
    supabase
      .from("service_locations")
      .select("id, name, address, lat, lng")
      .eq("is_active", true)
      .then(({ data }) => {
        if (data) setServiceAreas(data.map((d) => ({ ...d, lat: Number(d.lat), lng: Number(d.lng), type: "service" as const })));
      });
  }, []);

  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Filter on search — local + Nominatim + Photon parallel
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 1) {
      setFilteredResults([]);
      setShowSuggestions(false);
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(async () => {
      if (searchAbortRef.current) searchAbortRef.current.abort();
      const ctrl = new AbortController();
      searchAbortRef.current = ctrl;

      const q = searchQuery.toLowerCase();
      const namedMatches = namedLocations.filter(
        (l) => l.name.toLowerCase().includes(q) || l.address.toLowerCase().includes(q)
      ).slice(0, 5);
      const serviceMatches = serviceAreas.filter(
        (l) => l.name.toLowerCase().includes(q) || l.address.toLowerCase().includes(q)
      ).slice(0, 3);
      const combined: typeof filteredResults = [...serviceMatches, ...namedMatches];

      // Show local results immediately
      if (!ctrl.signal.aborted) {
        setFilteredResults(combined);
        setShowSuggestions(combined.length > 0);
      }

      // If fewer than 5 local results, fetch external — filtered by service area polygons
      if (combined.length < 5) {
        try {
          const areas = await getServiceAreasWithPolygons();
          const existingNames = new Set(combined.map(r => r.name.toLowerCase()));

          const [nomRes, photonRes] = await Promise.allSettled([
            fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=mv&limit=5&addressdetails=1`,
              { headers: { "Accept-Language": "en" }, signal: ctrl.signal }
            ).then(r => r.json()),
            fetch(
              `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=5&lat=4.1755&lon=73.5093&lang=en&bbox=72.5,-1,74,8`,
              { signal: ctrl.signal }
            ).then(r => r.json()),
          ]);

          const externalResults: typeof filteredResults = [];

          if (nomRes.status === "fulfilled" && Array.isArray(nomRes.value)) {
            for (const r of nomRes.value) {
              const name = r.name || r.display_name?.split(",")[0] || "";
              const lat = parseFloat(r.lat);
              const lng = parseFloat(r.lon);
              if (name && !existingNames.has(name.toLowerCase()) && isInsideAnyServiceArea(lat, lng, areas)) {
                externalResults.push({ id: `nom-${r.place_id}`, name, address: r.display_name?.split(",").slice(1, 3).join(",").trim() || "", lat, lng, type: "named" });
                existingNames.add(name.toLowerCase());
              }
            }
          }

          if (photonRes.status === "fulfilled" && photonRes.value?.features) {
            for (const f of photonRes.value.features) {
              const name = f.properties?.name || "";
              const lat = f.geometry.coordinates[1];
              const lng = f.geometry.coordinates[0];
              if (name && !existingNames.has(name.toLowerCase()) && isInsideAnyServiceArea(lat, lng, areas)) {
                externalResults.push({ id: `ph-${f.properties?.osm_id}`, name, address: [f.properties?.street, f.properties?.city].filter(Boolean).join(", "), lat, lng, type: "named" });
                existingNames.add(name.toLowerCase());
              }
            }
          }

          if (!ctrl.signal.aborted) {
            const merged = [...combined, ...externalResults].slice(0, 12);
            setFilteredResults(merged);
            setShowSuggestions(merged.length > 0);
          }
        } catch (e: any) {
          if (e?.name !== "AbortError") { /* keep local results */ }
        }
      }
    }, 80);

    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery, namedLocations, serviceAreas]);

  const selectNamedLocation = useCallback((loc: { id: string; name: string; address: string; lat: number; lng: number; type: string }) => {
    if (!mapInstance.current) return;

    if (searchMarkerRef.current) {
      mapInstance.current.removeLayer(searchMarkerRef.current);
      searchMarkerRef.current = null;
    }

    const pos: [number, number] = [loc.lat, loc.lng];
    mapInstance.current.setView(pos, 18);

    const icon = L.divIcon({
      className: "",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      html: `<div style="width:24px;height:24px;border-radius:50%;background:#22c55e;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
    });

    searchMarkerRef.current = L.marker(pos, { icon, zIndexOffset: 1000 }).addTo(mapInstance.current);
    searchMarkerRef.current.bindPopup(`<div style="font-size:12px;font-weight:600;padding:4px">${loc.name}<br/><span style="font-weight:400;color:#666">${loc.address}</span></div>`).openPopup();

    setSearchQuery(loc.name);
    if (inputRef.current) inputRef.current.value = loc.name;
    setShowSuggestions(false);
  }, []);

  // Draw mode click listener
  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    if (!drawMode) {
      drawTempMarkersRef.current.forEach(m => map.removeLayer(m));
      drawTempMarkersRef.current = [];
      if (drawTempLineRef.current) { map.removeLayer(drawTempLineRef.current); drawTempLineRef.current = null; }
      return;
    }

    const handleClick = (e: L.LeafletMouseEvent) => {
      const pos = { lat: e.latlng.lat, lng: e.latlng.lng };

      if (drawMode === "point") {
        setPendingCoords([pos]);
        setPendingType("point");
        setShowClosureForm(true);
        setDrawMode(null);
        const icon = L.divIcon({
          className: "",
          iconSize: [20, 20],
          iconAnchor: [10, 10],
          html: `<div style="width:20px;height:20px;border-radius:50%;background:#ef4444;opacity:0.8;border:2px solid white"></div>`,
        });
        const m = L.marker([pos.lat, pos.lng], { icon }).addTo(map);
        drawTempMarkersRef.current.push(m);
      } else if (drawMode === "line") {
        setLinePoints((prev) => {
          const updated = [...prev, pos];
          const icon = L.divIcon({
            className: "",
            iconSize: [12, 12],
            iconAnchor: [6, 6],
            html: `<div style="width:12px;height:12px;border-radius:50%;background:#ef4444;opacity:0.9;border:2px solid white"></div>`,
          });
          const m = L.marker([pos.lat, pos.lng], { icon }).addTo(map);
          drawTempMarkersRef.current.push(m);

          if (drawTempLineRef.current) map.removeLayer(drawTempLineRef.current);
          if (updated.length > 1) {
            drawTempLineRef.current = L.polyline(
              updated.map(p => [p.lat, p.lng] as [number, number]),
              { color: "#ef4444", weight: 5, opacity: 0.7, dashArray: "10 6" }
            ).addTo(map);
          }
          return updated;
        });
      }
    };

    map.on("click", handleClick);
    return () => { map.off("click", handleClick); };
  }, [drawMode]);

  // Render closures on map
  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    closureLayersRef.current.forEach(l => map.removeLayer(l));
    closureLayersRef.current = [];

    closures.forEach((c) => {
      const coords = c.coordinates;
      const sev = SEVERITY_OPTIONS.find((s) => s.value === c.severity) || SEVERITY_OPTIONS[0];

      if (c.closure_type === "point" && coords.length > 0) {
        const icon = L.divIcon({
          className: "",
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          html: `<div style="width:26px;height:26px;border-radius:50%;background:${sev.color};border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">⚠</div>`,
        });
        const marker = L.marker([coords[0].lat, coords[0].lng], { icon, zIndexOffset: 2000 }).addTo(map);

        const driverInfo = c.reported_by_type === "driver" && c.reporter_name
          ? `<div style="font-size:10px;color:#3b82f6;font-weight:600;margin-bottom:2px">🚗 Reported by: ${c.reporter_name}${c.reporter_phone ? ` (${c.reporter_phone})` : ""}</div>`
          : "";
        const popupHtml = `
          <div style="font-size:12px;padding:4px;max-width:220px">
            ${driverInfo}
            <strong style="color:${sev.color}">${sev.label}</strong>
            ${c.notes ? `<br/><span style="color:#666">${c.notes}</span>` : ""}
            ${c.expires_at ? `<br/><span style="font-size:10px;color:#999">Expires: ${new Date(c.expires_at).toLocaleString("en-US", { timeZone: "Indian/Maldives" })}</span>` : ""}
          </div>`;
        marker.bindPopup(popupHtml);
        closureLayersRef.current.push(marker);
      } else if (c.closure_type === "line" && coords.length > 1) {
        const line = L.polyline(
          coords.map(p => [p.lat, p.lng] as [number, number]),
          { color: sev.color, weight: 6, opacity: 0.8, dashArray: "10 6" }
        ).addTo(map);

        const midIdx = Math.floor(coords.length / 2);
        const midPoint = coords[midIdx];
        const icon = L.divIcon({
          className: "",
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          html: `<div style="width:26px;height:26px;border-radius:50%;background:${sev.color};border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,0.3)">⚠</div>`,
        });
        const infoMarker = L.marker([midPoint.lat, midPoint.lng], { icon, zIndexOffset: 2001 }).addTo(map);

        const lineDriverInfo = c.reported_by_type === "driver" && c.reporter_name
          ? `<div style="font-size:10px;color:#3b82f6;font-weight:600;margin-bottom:2px">🚗 Reported by: ${c.reporter_name}${c.reporter_phone ? ` (${c.reporter_phone})` : ""}</div>`
          : "";
        const popupHtml = `
          <div style="font-size:12px;padding:4px;max-width:220px">
            ${lineDriverInfo}
            <strong style="color:${sev.color}">${sev.label}</strong>
            ${c.notes ? `<br/><span style="color:#666">${c.notes}</span>` : ""}
            ${c.expires_at ? `<br/><span style="font-size:10px;color:#999">Expires: ${new Date(c.expires_at).toLocaleString("en-US", { timeZone: "Indian/Maldives" })}</span>` : ""}
          </div>`;
        infoMarker.bindPopup(popupHtml);

        closureLayersRef.current.push(line);
        closureLayersRef.current.push(infoMarker);
      }
    });
  }, [closures]);

  // Global remove/edit handlers
  useEffect(() => {
    (window as any).__removeClosure__ = async (id: string) => {
      await removeClosure(id);
      toast({ title: "Closure removed" });
    };
    (window as any).__editClosure__ = (id: string, severity: string, notes: string, expiresAt: string) => {
      setEditingClosureId(id);
      setEditClosureSeverity(severity);
      setEditClosureNotes(notes);
      setEditClosureExpiry(expiresAt);
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
      delete (window as any).__editClosure__;
      delete (window as any).__approveClosure__;
      delete (window as any).__rejectClosure__;
    };
  }, [removeClosure, approveClosure, rejectClosure]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    if (inputRef.current) inputRef.current.value = "";
    if (searchMarkerRef.current && mapInstance.current) {
      mapInstance.current.removeLayer(searchMarkerRef.current);
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
    if (mapInstance.current) {
      drawTempMarkersRef.current.forEach(m => mapInstance.current!.removeLayer(m));
      drawTempMarkersRef.current = [];
      if (drawTempLineRef.current) { mapInstance.current.removeLayer(drawTempLineRef.current); drawTempLineRef.current = null; }
    }
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
      if (mapInstance.current) {
        drawTempMarkersRef.current.forEach(m => mapInstance.current!.removeLayer(m));
        drawTempMarkersRef.current = [];
        if (drawTempLineRef.current) { mapInstance.current.removeLayer(drawTempLineRef.current); drawTempLineRef.current = null; }
      }
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

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {/* Search bar — top-right so it clears Leaflet's zoom buttons (top-left) */}
      <div className="absolute top-3 left-16 right-3 sm:left-auto sm:right-4 sm:w-80 z-[1000]">
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

      {/* Road closure toolbar — pushed below the search bar on the right */}
      <div className="absolute top-16 right-3 sm:top-20 sm:right-4 z-[1000] flex flex-col gap-2">
        <div className="bg-background/95 backdrop-blur-sm border border-border rounded-2xl shadow-lg p-1.5 flex flex-col gap-1">
          <div className="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            Road Closures
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

        {/* Named locations toggle */}
        <button
          onClick={() => setShowNamedLabels(prev => !prev)}
          className={`flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-medium transition-all border shadow-lg backdrop-blur-sm ${
            showNamedLabels
              ? "bg-primary text-primary-foreground border-primary shadow-md"
              : "bg-background/95 text-foreground border-border hover:bg-accent"
          }`}
          title="Toggle named location labels on map"
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Places</span>
        </button>
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

            <div className="flex gap-2 px-5 pb-5 pt-2 border-t border-border">
              <button
                onClick={() => {
                  setShowClosureForm(false);
                  if (mapInstance.current) {
                    drawTempMarkersRef.current.forEach(m => mapInstance.current!.removeLayer(m));
                    drawTempMarkersRef.current = [];
                    if (drawTempLineRef.current) { mapInstance.current.removeLayer(drawTempLineRef.current); drawTempLineRef.current = null; }
                  }
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

      {/* Edit closure modal */}
      {editingClosureId && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-96 max-w-[92vw]">
            <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-border">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Pencil className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Edit Closure</h3>
                <p className="text-xs text-muted-foreground">Update road closure details</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Type</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {SEVERITY_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setEditClosureSeverity(s.value)}
                      className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all text-center ${
                        editClosureSeverity === s.value
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

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Construction on main road"
                  value={editClosureNotes}
                  onChange={(e) => setEditClosureNotes(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
                />
              </div>

              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <select
                  value={editClosureExpiry ? "" : ""}
                  onChange={(e) => {
                    if (e.target.value) {
                      const d = new Date();
                      d.setHours(d.getHours() + parseInt(e.target.value));
                      setEditClosureExpiry(d.toISOString());
                    } else {
                      setEditClosureExpiry("");
                    }
                  }}
                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">{editClosureExpiry ? `Current: ${new Date(editClosureExpiry).toLocaleString()}` : "No expiry"}</option>
                  {EXPIRY_OPTIONS.filter(o => o.value).map((o) => (
                    <option key={o.value} value={o.value}>Reset to {o.label} from now</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-5 pt-2 border-t border-border">
              <button
                onClick={() => setEditingClosureId(null)}
                className="flex-1 py-2.5 text-xs rounded-xl border border-border text-muted-foreground hover:bg-accent font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await updateClosure(editingClosureId, {
                      severity: editClosureSeverity,
                      notes: editClosureNotes,
                      expires_at: editClosureExpiry || null,
                    });
                    toast({ title: "Closure updated" });
                    setEditingClosureId(null);
                  } catch {
                    toast({ title: "Failed to update", variant: "destructive" });
                  }
                }}
                className="flex-1 py-2.5 text-xs rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-sm transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DispatchGoogleMap;
