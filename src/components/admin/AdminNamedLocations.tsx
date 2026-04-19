import React, { useEffect, useState, useRef, useCallback } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, MapPin, Search, Check, XCircle, Clock, Layers, FolderOpen, Tag, ChevronRight, ChevronDown, ChevronUp, Download, Globe, AlertTriangle } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { reverseGeocodeLocation } from "@/lib/geocode";

const MALE_CENTER = { lat: 4.1755, lng: 73.5093 };
const emptyForm = { name: "", address: "", description: "", lat: "", lng: "" };

type BatchPin = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  address: string;
  description: string;
  marker?: any;
};

const AdminNamedLocations = () => {
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEdit, setInlineEdit] = useState({ name: "", address: "", group_name: "", road_name: "" });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "pending" | "rejected">("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [bulkGroupName, setBulkGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingCollapsed, setPendingCollapsed] = useState(false);
  const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const locationMarkersRef = useRef<any[]>([]);
  const formRef = useRef<HTMLDivElement>(null);

  // Batch mode state
  const [batchMode, setBatchMode] = useState(false);
  const [batchPins, setBatchPins] = useState<BatchPin[]>([]);
  const [savingBatch, setSavingBatch] = useState(false);
  const [osmImporting, setOsmImporting] = useState(false);
  const batchMapRef = useRef<HTMLDivElement>(null);
  const batchMapInstance = useRef<any>(null);
  const batchPinsRef = useRef<BatchPin[]>([]);

  // Keep ref in sync
  useEffect(() => { batchPinsRef.current = batchPins; }, [batchPins]);

  const fetchLocations = async () => {
    setLoading(true);
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from("named_locations")
        .select("*, profiles!named_locations_suggested_by_fkey(first_name, last_name, user_type)")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (!data || data.length === 0) break;
      allData = allData.concat(data);
      hasMore = data.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }
    setLocations(allData);
    setLoading(false);
  };

  useEffect(() => { fetchLocations(); }, []);

  const getTileUrl = () => document.documentElement.classList.contains("dark") ? DARK_TILES : LIGHT_TILES;

  const greenIcon = L.divIcon({
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `<div style="background:#22c55e;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
    </div>`,
  });

  const renderMarkers = useCallback(() => {
    if (!mapInstance.current) return;
    locationMarkersRef.current.forEach(m => m.remove());
    locationMarkersRef.current = [];

    locations.filter(l => l.status === "approved" && l.is_active).forEach(loc => {
      const m = L.marker([loc.lat, loc.lng], { icon: greenIcon, title: loc.name }).addTo(mapInstance.current!);
      locationMarkersRef.current.push(m);
    });
  }, [locations]);

  // Init main map (re-init each time the form opens so it always renders fresh)
  useEffect(() => {
    if (!showForm || !mapRef.current) return;
    if (mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [MALE_CENTER.lat, MALE_CENTER.lng],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });
    L.tileLayer(getTileUrl(), { maxZoom: 19 }).addTo(map);
    mapInstance.current = map;

    // Force size recalculation after the panel mounts so tiles paint instantly
    requestAnimationFrame(() => {
      map.invalidateSize();
      // If editing, jump straight to the existing pin
      const lat = parseFloat(form.lat);
      const lng = parseFloat(form.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        map.setView([lat, lng], 17);
        const icon = L.divIcon({
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          html: `<div style="background:#ef4444;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>`,
        });
        markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        markerRef.current.on("dragend", () => {
          const pos = markerRef.current!.getLatLng();
          setForm(prev => ({ ...prev, lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6), address: "" }));
          autoFetchAddress(pos.lat, pos.lng);
        });
      }
    });

    return () => {
      map.remove();
      mapInstance.current = null;
      markerRef.current = null;
      locationMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, editingId]);

  useEffect(() => { renderMarkers(); }, [locations, renderMarkers]);

  // Init batch map
  useEffect(() => {
    if (!batchMode || !batchMapRef.current) return;
    if (batchMapInstance.current) return;
    const map = L.map(batchMapRef.current, {
      center: [MALE_CENTER.lat, MALE_CENTER.lng],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });
    L.tileLayer(getTileUrl(), { maxZoom: 19 }).addTo(map);
    batchMapInstance.current = map;

    // Show existing approved locations as green pins
    locations.filter(l => l.status === "approved" && l.is_active).forEach(loc => {
      L.marker([loc.lat, loc.lng], { icon: greenIcon, title: loc.name }).addTo(map);
    });
  }, [batchMode, locations]);

  // Batch map click listener
  useEffect(() => {
    if (!batchMapInstance.current || !batchMode) return;

    const onClick = async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const pinId = crypto.randomUUID();

      const icon = L.divIcon({
        className: "",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="background:#ef4444;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);color:white;font-size:11px;font-weight:bold;">${batchPinsRef.current.length + 1}</div>`,
      });
      const marker = L.marker([lat, lng], { icon }).addTo(batchMapInstance.current!);

      // Auto-fetch address via Nominatim
      let roadName = "";
      try {
        const result = await reverseGeocodeLocation(lat, lng, { skipAdminLocations: true });
        roadName = result?.address?.split(",")[0] || result?.name || "";
      } catch {}

      const newPin: BatchPin = { id: pinId, lat, lng, name: "", address: roadName, description: "", marker };
      setBatchPins(prev => [...prev, newPin]);
    };

    batchMapInstance.current.on("click", onClick);
    return () => { batchMapInstance.current?.off("click", onClick); };
  }, [batchMode]);

  const removeBatchPin = (id: string) => {
    setBatchPins(prev => {
      const pin = prev.find(p => p.id === id);
      if (pin?.marker) pin.marker.remove();
      return prev.filter(p => p.id !== id);
    });
  };

  const updateBatchPin = (id: string, field: string, value: string) => {
    setBatchPins(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const saveBatch = async () => {
    const valid = batchPins.filter(p => p.name.trim());
    if (valid.length === 0) {
      toast({ title: "Please name at least one location", variant: "destructive" });
      return;
    }
    setSavingBatch(true);
    const payload = valid.map(p => ({
      name: p.name.trim(), address: p.address, description: p.description,
      lat: p.lat, lng: p.lng, status: "approved", suggested_by_type: "admin",
    }));
    const { error } = await supabase.from("named_locations").insert(payload);
    setSavingBatch(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${valid.length} location${valid.length > 1 ? "s" : ""} added!` });
      closeBatchMode();
      fetchLocations();
    }
  };

  const closeBatchMode = () => {
    batchPins.forEach(p => { if (p.marker) p.marker.remove(); });
    setBatchPins([]);
    setBatchMode(false);
    if (batchMapInstance.current) {
      batchMapInstance.current.remove();
      batchMapInstance.current = null;
    }
  };

  const autoFetchAddress = useCallback(async (lat: number, lng: number) => {
    try {
      const result = await reverseGeocodeLocation(lat, lng, { skipAdminLocations: true });
      const roadName = result?.address?.split(",")[0] || result?.name || "";
      setForm(prev => ({ ...prev, address: roadName }));
    } catch {}
  }, []);

  // Single add form map click listener
  useEffect(() => {
    if (!mapInstance.current || !showForm) return;

    const onClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setForm(prev => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6), address: "" }));
      autoFetchAddress(lat, lng);
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const icon = L.divIcon({
          className: "",
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          html: `<div style="background:#ef4444;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>`,
        });
        markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(mapInstance.current!);
        markerRef.current.on("dragend", () => {
          const pos = markerRef.current!.getLatLng();
          setForm(prev => ({ ...prev, lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6), address: "" }));
          autoFetchAddress(pos.lat, pos.lng);
        });
      }
    };

    mapInstance.current.on("click", onClick);
    return () => { mapInstance.current?.off("click", onClick); };
  }, [showForm, autoFetchAddress]);

  const resetForm = () => {
    setForm(emptyForm); setEditingId(null); setShowForm(false);
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
  };

  const openEdit = (loc: any) => {
    // Close form first so the map effect re-runs cleanly with the new pin
    setShowForm(false);
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
    setTimeout(() => {
      setForm({ name: loc.name || "", address: loc.address || "", description: loc.description || "", lat: String(loc.lat), lng: String(loc.lng) });
      setEditingId(loc.id);
      setShowForm(true);
      // Scroll into view after the form mounts
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }, 30);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.lat || !form.lng) {
      toast({ title: "Please provide name and location", variant: "destructive" }); return;
    }
    const payload = {
      name: form.name, address: form.address, description: form.description,
      lat: parseFloat(form.lat), lng: parseFloat(form.lng),
      status: "approved", suggested_by_type: "admin",
    };
    const { error } = editingId
      ? await supabase.from("named_locations").update(payload).eq("id", editingId)
      : await supabase.from("named_locations").insert(payload);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: editingId ? "Location updated!" : "Location added!" }); resetForm(); fetchLocations(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this location?")) return;
    await supabase.from("named_locations").delete().eq("id", id);
    toast({ title: "Location deleted" }); fetchLocations();
  };

  const approveLocation = async (id: string) => {
    await supabase.from("named_locations").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", id);
    toast({ title: "Location approved ✅" }); fetchLocations();
  };

  const rejectLocation = async (id: string) => {
    await supabase.from("named_locations").update({ status: "rejected" }).eq("id", id);
    toast({ title: "Location rejected" }); fetchLocations();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("named_locations").update({ is_active: !current }).eq("id", id);
    toast({ title: current ? "Deactivated" : "Activated" }); fetchLocations();
  };

  const importFromOSM = async () => {
    setOsmImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-osm-places", {
        body: { import_all: true },
      });
      if (error) throw error;
      toast({
        title: "OSM Import Complete",
        description: data?.message || `Imported ${data?.total_imported || 0} places`,
      });
      fetchLocations();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setOsmImporting(false);
    }
  };

  const q = search.toLowerCase();
  const filtered = locations.filter(loc => {
    if (statusFilter !== "all" && loc.status !== statusFilter) return false;
    if (groupFilter !== "all") {
      if (groupFilter === "__none__") { if (loc.group_name) return false; }
      else if (loc.group_name !== groupFilter) return false;
    }
    if (q && !loc.name.toLowerCase().includes(q) && !loc.address.toLowerCase().includes(q) && !(loc.group_name || "").toLowerCase().includes(q)) return false;
    return true;
  });

  const groups = [...new Set(locations.map(l => l.group_name).filter(Boolean))].sort();
  const pendingCount = locations.filter(l => l.status === "pending").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
            <MapPin className="w-6 h-6 text-primary" />
            Named Locations
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} of {locations.length} locations
            {pendingCount > 0 && <> · <span className="text-yellow-600 dark:text-yellow-400 font-semibold">{pendingCount} pending</span></>}
          </p>
        </div>

        {/* Primary actions */}
        {!batchMode && !showForm && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:opacity-90 active:scale-[0.97] transition-all"
            >
              <Plus className="w-4 h-4" /> Add Location
            </button>
            <button
              onClick={() => { resetForm(); setBatchMode(true); }}
              className="flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-secondary/80 active:scale-[0.97] transition-all"
              title="Drop multiple pins at once"
            >
              <Layers className="w-4 h-4" /> Batch Add
            </button>

            {/* Overflow menu */}
            <div className="relative group">
              <button className="p-2.5 rounded-xl bg-surface border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="More actions">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/></svg>
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-20 w-56 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                <button
                  onClick={importFromOSM}
                  disabled={osmImporting}
                  className="w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted flex items-center gap-2 disabled:opacity-50"
                >
                  <Globe className="w-4 h-4 text-emerald-600" />
                  {osmImporting ? "Importing…" : "Import from OSM (Free)"}
                </button>
                {locations.length > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2 border-t border-border">
                        <Trash2 className="w-4 h-4" /> Delete All Locations
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete All Locations?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete all {locations.length} named locations. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                          const { error } = await supabase.from("named_locations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                          if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
                          else { toast({ title: "All locations deleted" }); fetchLocations(); }
                        }}>Delete All</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </div>
        )}

        {(batchMode || showForm) && (
          <button
            onClick={() => { batchMode ? closeBatchMode() : resetForm(); }}
            className="flex items-center gap-2 bg-muted text-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-muted/70"
          >
            <X className="w-4 h-4" /> Close
          </button>
        )}
      </div>

      {/* Batch mode */}
      {batchMode && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Batch Add Locations</h3>
              <p className="text-xs text-muted-foreground">Click the map to drop multiple pins, then name each one</p>
            </div>
            <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-full">{batchPins.length} pin{batchPins.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="rounded-xl overflow-hidden border border-border" style={{ height: 350 }}>
            <div ref={batchMapRef} style={{ width: "100%", height: "100%" }} />
          </div>

          {batchPins.length > 0 && (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {batchPins.map((pin, idx) => (
                <div key={pin.id} className="flex items-start gap-3 bg-surface border border-border rounded-xl p-3">
                  <div className="w-7 h-7 rounded-full bg-destructive text-white flex items-center justify-center text-xs font-bold shrink-0 mt-1">{idx + 1}</div>
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <input
                      value={pin.name}
                      onChange={(e) => updateBatchPin(pin.id, "name", e.target.value)}
                      placeholder="Name *"
                      className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <input
                      value={pin.address}
                      onChange={(e) => updateBatchPin(pin.id, "address", e.target.value)}
                      placeholder="Address"
                      className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <input
                      value={pin.description}
                      onChange={(e) => updateBatchPin(pin.id, "description", e.target.value)}
                      placeholder="Description"
                      className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <button onClick={() => removeBatchPin(pin.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 mt-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {batchPins.length > 0 && (
            <button onClick={saveBatch} disabled={savingBatch} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold disabled:opacity-50">
              {savingBatch ? "Saving..." : `Save ${batchPins.filter(p => p.name.trim()).length} Location${batchPins.filter(p => p.name.trim()).length !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      )}

      {/* Single add form */}
      {showForm && !batchMode && (
        <div ref={formRef} className="bg-card border border-border rounded-xl p-5 space-y-4 scroll-mt-4">
          <h3 className="font-semibold text-foreground">{editingId ? "Edit Location" : "New Named Location"}</h3>
          <div className="rounded-xl overflow-hidden border border-border" style={{ height: 350 }}>
            <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
          </div>
          <p className="text-xs text-muted-foreground">Click the map to set the location pin</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. ADK Hospital" className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Address</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="e.g. Sosun Magu, Malé" className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional description" className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Latitude</label>
              <input value={form.lat} readOnly className="w-full mt-1 px-3 py-2 bg-muted border border-border rounded-xl text-sm text-muted-foreground" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Longitude</label>
              <input value={form.lng} readOnly className="w-full mt-1 px-3 py-2 bg-muted border border-border rounded-xl text-sm text-muted-foreground" />
            </div>
          </div>
          <button onClick={handleSubmit} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">
            {editingId ? "Update" : "Save Location"}
          </button>
        </div>
      )}

      {/* Pending approvals (collapsible) */}
      {pendingCount > 0 && (() => {
        // Build duplicate name index across ALL locations (case-insensitive, trimmed)
        const nameCounts = new Map<string, number>();
        locations.forEach(l => {
          const k = (l.name || "").trim().toLowerCase();
          if (k) nameCounts.set(k, (nameCounts.get(k) || 0) + 1);
        });
        const pending = locations.filter(l => l.status === "pending");
        const duplicateCount = pending.filter(l => (nameCounts.get((l.name || "").trim().toLowerCase()) || 0) > 1).length;
        return (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <button
              onClick={() => setPendingCollapsed(c => !c)}
              className="w-full px-4 py-3 border-b border-border bg-surface/50 flex items-center gap-2 hover:bg-surface transition-colors"
            >
              <Clock className="w-4 h-4 text-yellow-600" />
              <p className="text-sm font-bold text-foreground">Pending Suggestions</p>
              <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400 px-2 py-0.5 rounded-full">{pendingCount}</span>
              {duplicateCount > 0 && (
                <span className="text-[10px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {duplicateCount} duplicate{duplicateCount > 1 ? "s" : ""}
                </span>
              )}
              <span className="ml-auto text-muted-foreground">
                {pendingCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </span>
            </button>
            {!pendingCollapsed && (
              <div className="divide-y divide-border">
                {pending.map(loc => {
                  const isDup = (nameCounts.get((loc.name || "").trim().toLowerCase()) || 0) > 1;
                  return (
                    <div key={loc.id} className={`px-4 py-3 flex items-center gap-4 ${isDup ? "bg-orange-50/50 dark:bg-orange-500/5" : ""}`}>
                      <MapPin className={`w-4 h-4 shrink-0 ${isDup ? "text-orange-500" : "text-yellow-500"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate flex items-center gap-2">
                          {loc.name}
                          {isDup && (
                            <span className="text-[9px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" /> DUPLICATE
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {loc.address} · Suggested by {loc.profiles ? `${loc.profiles.first_name} ${loc.profiles.last_name}` : "Unknown"} ({loc.suggested_by_type})
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => openEdit(loc)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-surface text-foreground border border-border hover:bg-muted">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => approveLocation(loc.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-green-600 text-white hover:bg-green-700">
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button onClick={() => rejectLocation(loc.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-destructive/10 text-destructive hover:bg-destructive/20">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Search and filters */}
      <div className="bg-card border border-border rounded-2xl p-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, address, or group…"
            className="w-full pl-12 pr-4 py-3 bg-surface border border-border rounded-xl text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "approved", "pending", "rejected"] as const).map(s => {
            const count = s === "all" ? locations.length : locations.filter(l => l.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${statusFilter === s ? "bg-primary text-primary-foreground shadow-sm" : "bg-surface text-muted-foreground border border-border hover:text-foreground"}`}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusFilter === s ? "bg-primary-foreground/20" : "bg-muted/60"}`}>{count}</span>
              </button>
            );
          })}
          <div className="flex-1 min-w-[8px]" />
          <select
            value={groupFilter}
            onChange={e => setGroupFilter(e.target.value)}
            className="px-3 py-2 bg-surface border border-border rounded-xl text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Groups</option>
            <option value="__none__">Ungrouped</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </div>

      {/* Bulk group assignment */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <input
            value={bulkGroupName}
            onChange={e => setBulkGroupName(e.target.value)}
            placeholder="Group name..."
            list="group-suggestions"
            className="px-3 py-1.5 bg-surface border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary w-48"
          />
          <datalist id="group-suggestions">
            {groups.map(g => <option key={g} value={g} />)}
          </datalist>
          <button
            onClick={async () => {
              if (!bulkGroupName.trim()) { toast({ title: "Enter a group name", variant: "destructive" }); return; }
              const ids = [...selectedIds];
              const { error } = await supabase.from("named_locations").update({ group_name: bulkGroupName.trim() } as any).in("id", ids);
              if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
              else { toast({ title: `${ids.length} locations grouped as "${bulkGroupName.trim()}"` }); setSelectedIds(new Set()); setBulkGroupName(""); fetchLocations(); }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-semibold"
          >
            <Tag className="w-3.5 h-3.5" /> Assign Group
          </button>
          <button
            onClick={async () => {
              const ids = [...selectedIds];
              const { error } = await supabase.from("named_locations").update({ group_name: null } as any).in("id", ids);
              if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
              else { toast({ title: `${ids.length} locations ungrouped` }); setSelectedIds(new Set()); fetchLocations(); }
            }}
            className="px-3 py-1.5 bg-muted text-muted-foreground rounded-xl text-xs font-semibold hover:text-foreground"
          >
            Remove Group
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* Locations table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-3 py-3 w-8">
                <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={e => {
                  if (e.target.checked) setSelectedIds(new Set(filtered.map(l => l.id)));
                  else setSelectedIds(new Set());
                }} className="rounded" />
              </th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Name</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Group</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Address</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Source</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                <div className="inline-flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Loading locations…
                </div>
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-16 text-center">
                <MapPin className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-base font-semibold text-foreground mb-1">
                  {locations.length === 0 ? "No locations yet" : "No locations match your filters"}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {locations.length === 0
                    ? "Add your first named location to help passengers and drivers find places quickly."
                    : "Try clearing the search or changing the status filter."}
                </p>
                {locations.length === 0 && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-bold"
                  >
                    <Plus className="w-4 h-4" /> Add First Location
                  </button>
                )}
              </td></tr>
            ) : (() => {
              // Group locations by group_name
              const grouped: Record<string, typeof filtered> = {};
              const ungrouped: typeof filtered = [];
              filtered.forEach(loc => {
                if (loc.group_name) {
                  if (!grouped[loc.group_name]) grouped[loc.group_name] = [];
                  grouped[loc.group_name].push(loc);
                } else {
                  ungrouped.push(loc);
                }
              });
              const groupNames = Object.keys(grouped).sort();
              const toggleGroup = (name: string) => {
                setExpandedGroups(prev => {
                  const next = new Set(prev);
                  next.has(name) ? next.delete(name) : next.add(name);
                  return next;
                });
              };
              const renderRow = (loc: any) => {
                const isInlineEditing = inlineEditId === loc.id;
                return (
                  <tr key={loc.id} className={`border-b border-border last:border-0 ${selectedIds.has(loc.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selectedIds.has(loc.id)} onChange={e => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(loc.id); else next.delete(loc.id);
                        setSelectedIds(next);
                      }} className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      {isInlineEditing ? (
                        <input value={inlineEdit.name} onChange={e => setInlineEdit(p => ({ ...p, name: e.target.value }))} className="w-full px-2 py-1 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                      ) : (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-primary shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-foreground">{loc.name}</p>
                            {loc.road_name && <p className="text-[10px] text-primary/70 font-medium">{loc.road_name}</p>}
                            {loc.description && <p className="text-[10px] text-muted-foreground">{loc.description}</p>}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isInlineEditing ? (
                        <div className="space-y-1">
                          <input value={inlineEdit.group_name} onChange={e => setInlineEdit(p => ({ ...p, group_name: e.target.value }))} list="group-suggestions" placeholder="Group..." className="w-full px-2 py-1 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                          <input value={inlineEdit.road_name} onChange={e => setInlineEdit(p => ({ ...p, road_name: e.target.value }))} placeholder="Road name..." className="w-full px-2 py-1 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      ) : (
                        <div>
                          {loc.group_name ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground">{loc.group_name}</span> : <span className="text-[10px] text-muted-foreground">—</span>}
                          {loc.road_name && <p className="text-[10px] text-muted-foreground mt-0.5">🛣️ {loc.road_name}</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isInlineEditing ? (
                        <input value={inlineEdit.address} onChange={e => setInlineEdit(p => ({ ...p, address: e.target.value }))} className="w-full px-2 py-1 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                      ) : (
                        <span className="text-sm text-muted-foreground">{loc.address || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        loc.suggested_by_type === "admin" ? "bg-primary/10 text-primary" :
                        loc.suggested_by_type === "driver" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" :
                        "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
                      }`}>
                        {loc.suggested_by_type === "admin" ? "Admin" : loc.suggested_by_type === "driver" ? "Driver" : "Passenger"}
                      </span>
                      {loc.profiles && <p className="text-[10px] text-muted-foreground mt-0.5">{loc.profiles.first_name} {loc.profiles.last_name}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        loc.status === "approved" ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" :
                        loc.status === "pending" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400" :
                        "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                      }`}>{loc.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isInlineEditing ? (
                          <>
                            <button onClick={async () => {
                              const { error } = await supabase.from("named_locations").update({ name: inlineEdit.name, address: inlineEdit.address, group_name: inlineEdit.group_name || null, road_name: inlineEdit.road_name || "" } as any).eq("id", loc.id);
                              if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
                              else { toast({ title: "Updated" }); setInlineEditId(null); fetchLocations(); }
                            }} className="p-1.5 rounded-lg text-green-600 hover:bg-green-100 dark:hover:bg-green-500/20" title="Save"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setInlineEditId(null)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <>
                            {loc.status === "pending" && (
                              <>
                                <button onClick={() => approveLocation(loc.id)} className="p-1.5 rounded-lg text-green-600 hover:bg-green-100 dark:hover:bg-green-500/20" title="Approve"><Check className="w-3.5 h-3.5" /></button>
                                <button onClick={() => rejectLocation(loc.id)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10" title="Reject"><XCircle className="w-3.5 h-3.5" /></button>
                              </>
                            )}
                            <button onClick={() => { setInlineEditId(loc.id); setInlineEdit({ name: loc.name, address: loc.address || "", group_name: loc.group_name || "", road_name: loc.road_name || "" }); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface" title="Quick Edit"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => openEdit(loc)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface" title="Full Edit"><MapPin className="w-3.5 h-3.5" /></button>
                            <button onClick={() => toggleActive(loc.id, loc.is_active)} className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${loc.is_active ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                              {loc.is_active ? "Active" : "Inactive"}
                            </button>
                            <button onClick={() => handleDelete(loc.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              };
              return (
                <>
                  {groupNames.map(groupName => {
                    const items = grouped[groupName];
                    const isExpanded = expandedGroups.has(groupName);
                    return (
                      <React.Fragment key={`group-${groupName}`}>
                        <tr
                          className="border-b border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => toggleGroup(groupName)}
                        >
                          <td className="px-3 py-2.5">
                            <input type="checkbox" checked={items.every(l => selectedIds.has(l.id))} onChange={e => {
                              e.stopPropagation();
                              const next = new Set(selectedIds);
                              if (e.target.checked) items.forEach(l => next.add(l.id));
                              else items.forEach(l => next.delete(l.id));
                              setSelectedIds(next);
                            }} onClick={e => e.stopPropagation()} className="rounded" />
                          </td>
                          <td colSpan={6} className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                              <FolderOpen className="w-4 h-4 text-primary" />
                              <span className="text-sm font-semibold text-foreground">{groupName}</span>
                              <span className="text-[10px] text-muted-foreground font-medium">({items.length})</span>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && items.map(renderRow)}
                      </React.Fragment>
                    );
                  })}
                  {ungrouped.map(renderRow)}
                </>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminNamedLocations;
