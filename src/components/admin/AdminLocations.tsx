import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, MapPin, Undo2, Trash, Download, Loader2 } from "lucide-react";
import { useGoogleMaps } from "@/hooks/use-google-maps";

const MALE_CENTER = { lat: 4.1755, lng: 73.5093 };

interface PolygonPoint {
  lat: number;
  lng: number;
}

const emptyForm = { name: "", address: "", description: "", lat: "", lng: "" };

const AdminLocations = () => {
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [polygonPoints, setPolygonPoints] = useState<PolygonPoint[]>([]);
  const [drawingMode, setDrawingMode] = useState(false);
  const [fetchingPlaces, setFetchingPlaces] = useState<string | null>(null);
  const { isLoaded } = useGoogleMaps();

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const polygonRef = useRef<any>(null);
  const pointMarkersRef = useRef<any[]>([]);
  const areaPolygonsRef = useRef<any[]>([]);
  const areaMarkersRef = useRef<any[]>([]);
  const clickListenerRef = useRef<any>(null);

  const fetchLocations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("service_locations")
      .select("*")
      .order("created_at", { ascending: false });
    setLocations(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLocations(); }, []);

  const clearAreaLayers = () => {
    areaPolygonsRef.current.forEach(p => p.setMap(null));
    areaPolygonsRef.current = [];
    areaMarkersRef.current.forEach(m => m.setMap(null));
    areaMarkersRef.current = [];
  };

  const renderAreas = useCallback(() => {
    const g = (window as any).google;
    if (!mapInstance.current || !g?.maps) return;
    clearAreaLayers();

    locations.forEach((loc) => {
      if (loc.polygon && Array.isArray(loc.polygon) && loc.polygon.length >= 3) {
        const poly = new g.maps.Polygon({
          paths: loc.polygon.map((p: PolygonPoint) => ({ lat: p.lat, lng: p.lng })),
          strokeColor: "#4285F4",
          fillColor: "#4285F4",
          fillOpacity: 0.15,
          strokeWeight: 2,
          map: mapInstance.current,
        });
        areaPolygonsRef.current.push(poly);
      }

      const el = document.createElement("div");
      el.innerHTML = `<div style="background:#4285F4;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>`;
      const m = new g.maps.marker.AdvancedMarkerElement({
        map: mapInstance.current,
        position: { lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) },
        content: el,
        title: loc.name,
      });
      areaMarkersRef.current.push(m);
    });
  }, [locations]);

  // Initialize map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;

    const isDark = document.documentElement.classList.contains("dark");
    const map = new g.maps.Map(mapRef.current, {
      center: MALE_CENTER,
      zoom: 14,
      mapId: "hda_admin_map",
      styles: isDark ? darkMapStyle : [],
    });
    mapInstance.current = map;

    return () => { mapInstance.current = null; };
  }, [isLoaded, showForm]);

  useEffect(() => { renderAreas(); }, [locations, renderAreas, isLoaded]);

  const clearPolygonPreview = () => {
    if (polygonRef.current) { polygonRef.current.setMap(null); polygonRef.current = null; }
    pointMarkersRef.current.forEach(m => m.setMap(null));
    pointMarkersRef.current = [];
  };

  const updatePolygonPreview = useCallback((pts: PolygonPoint[]) => {
    const g = (window as any).google;
    if (!mapInstance.current || !g?.maps) return;
    clearPolygonPreview();

    pts.forEach((p, i) => {
      const el = document.createElement("div");
      el.innerHTML = `<div style="width:14px;height:14px;border-radius:50%;background:${i === 0 ? '#22c55e' : '#4285F4'};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>`;
      const m = new g.maps.marker.AdvancedMarkerElement({
        map: mapInstance.current,
        position: { lat: p.lat, lng: p.lng },
        content: el,
      });
      pointMarkersRef.current.push(m);
    });

    if (pts.length >= 3) {
      polygonRef.current = new g.maps.Polygon({
        paths: pts.map(p => ({ lat: p.lat, lng: p.lng })),
        strokeColor: "#ef4444",
        fillColor: "#ef4444",
        fillOpacity: 0.2,
        strokeWeight: 2,
        map: mapInstance.current,
      });
    } else if (pts.length === 2) {
      polygonRef.current = new g.maps.Polyline({
        path: pts.map(p => ({ lat: p.lat, lng: p.lng })),
        strokeColor: "#ef4444",
        strokeWeight: 2,
        map: mapInstance.current,
      });
    }
  }, []);

  // Handle map clicks
  useEffect(() => {
    const g = (window as any).google;
    if (!mapInstance.current || !showForm || !g?.maps) return;
    const map = mapInstance.current;

    if (clickListenerRef.current) {
      g.maps.event.removeListener(clickListenerRef.current);
    }

    clickListenerRef.current = map.addListener("click", (e: any) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();

      if (drawingMode) {
        setPolygonPoints((prev) => {
          const next = [...prev, { lat, lng }];
          updatePolygonPreview(next);
          const cLat = next.reduce((s, p) => s + p.lat, 0) / next.length;
          const cLng = next.reduce((s, p) => s + p.lng, 0) / next.length;
          setForm((f) => ({ ...f, lat: cLat.toFixed(6), lng: cLng.toFixed(6) }));
          return next;
        });
      } else {
        setForm((prev) => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6) }));
        if (markerRef.current) {
          markerRef.current.position = { lat, lng };
        } else {
          const el = document.createElement("div");
          el.innerHTML = `<div style="background:#ef4444;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>`;
          markerRef.current = new g.maps.marker.AdvancedMarkerElement({
            map,
            position: { lat, lng },
            content: el,
            gmpDraggable: true,
          });
          markerRef.current.addListener("dragend", () => {
            const pos = markerRef.current.position;
            setForm((prev) => ({ ...prev, lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6) }));
          });
        }
      }
    });

    return () => {
      if (clickListenerRef.current) {
        g.maps.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
    };
  }, [showForm, drawingMode, updatePolygonPreview]);

  useEffect(() => {
    if (showForm && form.lat && form.lng && mapInstance.current) {
      const lat = parseFloat(form.lat);
      const lng = parseFloat(form.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        mapInstance.current.setCenter({ lat, lng });
        mapInstance.current.setZoom(16);
      }
    }
  }, [editingId]);

  useEffect(() => { updatePolygonPreview(polygonPoints); }, [polygonPoints, updatePolygonPreview]);

  const undoLastPoint = () => {
    setPolygonPoints((prev) => {
      const next = prev.slice(0, -1);
      updatePolygonPreview(next);
      return next;
    });
  };

  const clearPolygon = () => {
    setPolygonPoints([]);
    updatePolygonPreview([]);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setPolygonPoints([]);
    setDrawingMode(false);
    if (markerRef.current) { markerRef.current.map = null; markerRef.current = null; }
    clearPolygonPreview();
  };

  const openEdit = (loc: any) => {
    setForm({
      name: loc.name || "",
      address: loc.address || "",
      description: loc.description || "",
      lat: loc.lat?.toString() || "",
      lng: loc.lng?.toString() || "",
    });
    setPolygonPoints(loc.polygon && Array.isArray(loc.polygon) ? loc.polygon : []);
    setEditingId(loc.id);
    setShowForm(true);
    setDrawingMode(false);
  };

  const fetchPlacesForArea = async (locationId: string) => {
    setFetchingPlaces(locationId);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-area-places", {
        body: { service_location_id: locationId },
      });
      if (error) throw error;
      toast({
        title: "Places fetched!",
        description: `Found ${data.total_found} places, ${data.inserted} new added (${data.duplicates_skipped} duplicates skipped)`,
      });
    } catch (err: any) {
      toast({ title: "Error fetching places", description: err.message, variant: "destructive" });
    } finally {
      setFetchingPlaces(null);
    }
  };

  const handleSubmit = async () => {
    if (!form.name || !form.lat || !form.lng) {
      toast({ title: "Please provide name and set center point on the map", variant: "destructive" });
      return;
    }
    const payload: any = {
      name: form.name,
      address: form.address,
      description: form.description,
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      polygon: polygonPoints.length >= 3 ? polygonPoints : null,
    };

    let savedId = editingId;
    if (editingId) {
      const { error } = await supabase.from("service_locations").update(payload).eq("id", editingId);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
    } else {
      const { data: inserted, error } = await supabase.from("service_locations").insert(payload).select("id").single();
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      savedId = inserted.id;
    }

    toast({ title: editingId ? "Service area updated!" : "Service area added!" });
    resetForm();
    fetchLocations();

    // Auto-fetch Google Places for this area
    if (savedId && polygonPoints.length >= 3) {
      fetchPlacesForArea(savedId);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this service area?")) return;
    const { error } = await supabase.from("service_locations").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Service area deleted" });
      fetchLocations();
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("service_locations").update({ is_active: !current }).eq("id", id);
    toast({ title: current ? "Area deactivated" : "Area activated" });
    fetchLocations();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Service Areas</h2>
        <button
          onClick={() => { showForm ? resetForm() : setShowForm(true); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "Add Area"}
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">{editingId ? "Edit Service Area" : "New Service Area"}</h3>

          <div className="rounded-xl overflow-hidden border border-border" style={{ height: 400 }}>
            {isLoaded ? (
              <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
            ) : (
              <div className="w-full h-full bg-surface flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setDrawingMode(!drawingMode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                drawingMode
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted-foreground hover:border-muted-foreground"
              }`}
            >
              <MapPin className="w-4 h-4" />
              {drawingMode ? "Drawing Polygon…" : "Draw Area Polygon"}
            </button>
            {!drawingMode && (
              <span className="text-xs text-muted-foreground">Click map to set center point</span>
            )}
            {drawingMode && (
              <>
                <span className="text-xs text-muted-foreground">
                  Click map to add polygon vertices ({polygonPoints.length} points)
                  {polygonPoints.length < 3 && " — need at least 3"}
                </span>
                <button type="button" onClick={undoLastPoint} disabled={polygonPoints.length === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
                  <Undo2 className="w-3.5 h-3.5" /> Undo
                </button>
                <button type="button" onClick={clearPolygon} disabled={polygonPoints.length === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-destructive disabled:opacity-40">
                  <Trash className="w-3.5 h-3.5" /> Clear
                </button>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Area Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Malé City" className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Address / Area</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="e.g. Greater Malé Region" className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description of this service area" className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Center Latitude</label>
              <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="4.1755" type="number" step="any" className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Center Longitude</label>
              <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="73.5093" type="number" step="any" className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <button onClick={handleSubmit} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">
            {editingId ? "Update Area" : "Save Area"}
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Name</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Address</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Polygon</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : locations.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No service areas</td></tr>
            ) : (
              locations.map((loc) => {
                const hasPoly = loc.polygon && Array.isArray(loc.polygon) && loc.polygon.length >= 3;
                return (
                  <tr key={loc.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm font-medium text-foreground flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary shrink-0" />
                      <div>
                        <p>{loc.name}</p>
                        {loc.description && <p className="text-xs text-muted-foreground">{loc.description}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{loc.address || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        hasPoly ? "bg-blue-100 text-blue-700" : "bg-muted text-muted-foreground"
                      }`}>
                        {hasPoly ? `${loc.polygon.length} vertices` : "Point only"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${loc.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {loc.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => fetchPlacesForArea(loc.id)}
                          disabled={fetchingPlaces === loc.id}
                          className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50 flex items-center gap-1"
                          title="Fetch all Google Places within this area"
                        >
                          {fetchingPlaces === loc.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          {fetchingPlaces === loc.id ? "Fetching…" : "Fetch Places"}
                        </button>
                        <button onClick={() => toggleActive(loc.id, loc.is_active)} className="text-xs font-medium text-primary hover:underline">
                          {loc.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button onClick={() => openEdit(loc)} className="text-muted-foreground hover:text-primary">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(loc.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#212121" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#757575" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#292929" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#383838" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212121" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#484848" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f2f2f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#3d3d3d" }] },
];

export default AdminLocations;
