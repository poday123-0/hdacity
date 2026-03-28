import { useEffect, useState, useRef, useCallback } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, MapPin, Search, Check, XCircle, Clock, Layers, FolderOpen, Tag } from "lucide-react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
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
  const [inlineEdit, setInlineEdit] = useState({ name: "", address: "", group_name: "" });
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "pending" | "rejected">("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [bulkGroupName, setBulkGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { isLoaded } = useGoogleMaps();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const locationMarkersRef = useRef<any[]>([]);

  // Batch mode state
  const [batchMode, setBatchMode] = useState(false);
  const [batchPins, setBatchPins] = useState<BatchPin[]>([]);
  const [savingBatch, setSavingBatch] = useState(false);
  const batchMapRef = useRef<HTMLDivElement>(null);
  const batchMapInstance = useRef<any>(null);
  const batchPinsRef = useRef<BatchPin[]>([]);

  // Keep ref in sync
  useEffect(() => { batchPinsRef.current = batchPins; }, [batchPins]);

  const fetchLocations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("named_locations")
      .select("*, profiles!named_locations_suggested_by_fkey(first_name, last_name, user_type)")
      .order("created_at", { ascending: false });
    setLocations(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLocations(); }, []);

  const renderMarkers = useCallback(() => {
    const g = (window as any).google;
    if (!mapInstance.current || !g?.maps) return;
    locationMarkersRef.current.forEach(m => m.setMap(null));
    locationMarkersRef.current = [];

    locations.filter(l => l.status === "approved" && l.is_active).forEach(loc => {
      const el = document.createElement("div");
      el.innerHTML = `<div style="background:#22c55e;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>`;
      const m = new g.maps.marker.AdvancedMarkerElement({
        map: mapInstance.current,
        position: { lat: loc.lat, lng: loc.lng },
        content: el,
        title: loc.name,
      });
      locationMarkersRef.current.push(m);
    });
  }, [locations]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;
    mapInstance.current = new g.maps.Map(mapRef.current, {
      center: MALE_CENTER, zoom: 14, mapId: "hda_named_loc_map",
    });
  }, [isLoaded, showForm]);

  useEffect(() => { renderMarkers(); }, [locations, renderMarkers, isLoaded]);

  // -- Batch map init --
  useEffect(() => {
    if (!isLoaded || !batchMode || !batchMapRef.current) return;
    const g = (window as any).google;
    if (!g?.maps) return;
    if (batchMapInstance.current) return;
    batchMapInstance.current = new g.maps.Map(batchMapRef.current, {
      center: MALE_CENTER, zoom: 14, mapId: "hda_batch_loc_map",
    });

    // Show existing approved locations as green pins
    locations.filter(l => l.status === "approved" && l.is_active).forEach(loc => {
      const el = document.createElement("div");
      el.innerHTML = `<div style="background:#22c55e;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>`;
      new g.maps.marker.AdvancedMarkerElement({
        map: batchMapInstance.current,
        position: { lat: loc.lat, lng: loc.lng },
        content: el,
        title: loc.name,
      });
    });
  }, [isLoaded, batchMode, locations]);

  // -- Batch map click listener --
  useEffect(() => {
    const g = (window as any).google;
    if (!batchMapInstance.current || !batchMode || !g?.maps) return;

    const listener = batchMapInstance.current.addListener("click", async (e: any) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      const pinId = crypto.randomUUID();

      // Create marker
      const el = document.createElement("div");
      el.innerHTML = `<div style="background:#ef4444;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);color:white;font-size:11px;font-weight:bold;">${batchPinsRef.current.length + 1}</div>`;
      const marker = new g.maps.marker.AdvancedMarkerElement({
        map: batchMapInstance.current, position: { lat, lng }, content: el,
      });

      // Auto-fetch address
      let roadName = "";
      try {
        if (g?.maps?.Geocoder) {
          const geocoder = new g.maps.Geocoder();
          const res = await new Promise<any[]>((resolve) => {
            geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
              resolve(status === "OK" ? results || [] : []);
            });
          });
          for (const r of res) {
            const types: string[] = r.types || [];
            if (types.includes("route") || types.includes("street_address")) {
              const route = (r.address_components || []).find((c: any) => c.types?.includes("route"));
              if (route) { roadName = route.long_name; break; }
            }
          }
          if (!roadName && res.length > 0) {
            const route = (res[0].address_components || []).find((c: any) => c.types?.includes("route"));
            if (route) roadName = route.long_name;
          }
        }
        if (!roadName) {
          const result = await reverseGeocodeLocation(lat, lng, { skipAdminLocations: true });
          roadName = result?.address?.split(",")[0] || result?.name || "";
        }
      } catch {}

      const newPin: BatchPin = { id: pinId, lat, lng, name: "", address: roadName, description: "", marker };
      setBatchPins(prev => [...prev, newPin]);
    });

    return () => { if (listener) (window as any).google?.maps?.event?.removeListener(listener); };
  }, [batchMode]);

  const removeBatchPin = (id: string) => {
    setBatchPins(prev => {
      const pin = prev.find(p => p.id === id);
      if (pin?.marker) pin.marker.map = null;
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
    batchPins.forEach(p => { if (p.marker) p.marker.map = null; });
    setBatchPins([]);
    setBatchMode(false);
    batchMapInstance.current = null;
  };

  const autoFetchAddress = useCallback(async (lat: number, lng: number) => {
    try {
      const g = (window as any).google;
      let roadName = "";
      if (g?.maps?.Geocoder) {
        const geocoder = new g.maps.Geocoder();
        const res = await new Promise<any[]>((resolve) => {
          geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
            resolve(status === "OK" ? results || [] : []);
          });
        });
        for (const r of res) {
          const types: string[] = r.types || [];
          if (types.includes("route") || types.includes("street_address")) {
            const route = (r.address_components || []).find((c: any) => c.types?.includes("route"));
            if (route) { roadName = route.long_name; break; }
          }
        }
        if (!roadName && res.length > 0) {
          const route = (res[0].address_components || []).find((c: any) => c.types?.includes("route"));
          if (route) roadName = route.long_name;
        }
      }
      if (!roadName) {
        const result = await reverseGeocodeLocation(lat, lng, { skipAdminLocations: true });
        roadName = result?.address?.split(",")[0] || result?.name || "";
      }
      setForm(prev => ({ ...prev, address: roadName }));
    } catch {}
  }, []);

  useEffect(() => {
    const g = (window as any).google;
    if (!mapInstance.current || !showForm || !g?.maps) return;
    const listener = mapInstance.current.addListener("click", (e: any) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      setForm(prev => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6), address: "" }));
      autoFetchAddress(lat, lng);
      if (markerRef.current) {
        markerRef.current.position = { lat, lng };
      } else {
        const el = document.createElement("div");
        el.innerHTML = `<div style="background:#ef4444;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>`;
        markerRef.current = new g.maps.marker.AdvancedMarkerElement({
          map: mapInstance.current, position: { lat, lng }, content: el, gmpDraggable: true,
        });
        markerRef.current.addListener("dragend", () => {
          const pos = markerRef.current.position;
          setForm(prev => ({ ...prev, lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6), address: "" }));
          autoFetchAddress(pos.lat, pos.lng);
        });
      }
    });
    return () => { if (listener) (window as any).google?.maps?.event?.removeListener(listener); };
  }, [showForm, autoFetchAddress]);

  const resetForm = () => {
    setForm(emptyForm); setEditingId(null); setShowForm(false);
    if (markerRef.current) { markerRef.current.map = null; markerRef.current = null; }
  };

  const openEdit = (loc: any) => {
    setForm({ name: loc.name || "", address: loc.address || "", description: loc.description || "", lat: String(loc.lat), lng: String(loc.lng) });
    setEditingId(loc.id); setShowForm(true);
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-foreground">Named Locations</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} of {locations.length} locations{pendingCount > 0 && ` · ${pendingCount} pending approval`}</p>
        </div>
        <div className="flex items-center gap-2">
          {locations.length > 0 && !batchMode && !showForm && (
            <button onClick={async () => {
              if (!confirm(`Delete ALL ${locations.length} named locations? This cannot be undone.`)) return;
              const { error } = await supabase.from("named_locations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
              if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
              else { toast({ title: "All locations deleted" }); fetchLocations(); }
            }} className="flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-xl text-sm font-semibold">
              <Trash2 className="w-4 h-4" /> Delete All
            </button>
          )}
          <button onClick={() => { if (batchMode) closeBatchMode(); else { resetForm(); setBatchMode(true); } }} className="flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
            {batchMode ? <X className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
            {batchMode ? "Cancel Batch" : "Batch Add"}
          </button>
          {!batchMode && (
            <button onClick={() => showForm ? resetForm() : setShowForm(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
              {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showForm ? "Cancel" : "Add Location"}
            </button>
          )}
        </div>
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
            {isLoaded ? <div ref={batchMapRef} style={{ width: "100%", height: "100%" }} /> : (
              <div className="w-full h-full bg-surface flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
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
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">{editingId ? "Edit Location" : "New Named Location"}</h3>
          <div className="rounded-xl overflow-hidden border border-border" style={{ height: 350 }}>
            {isLoaded ? <div ref={mapRef} style={{ width: "100%", height: "100%" }} /> : (
              <div className="w-full h-full bg-surface flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
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

      {/* Pending approvals */}
      {pendingCount > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-surface/50 flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-600" />
            <p className="text-sm font-bold text-foreground">Pending Suggestions</p>
            <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400 px-2 py-0.5 rounded-full">{pendingCount}</span>
          </div>
          <div className="divide-y divide-border">
            {locations.filter(l => l.status === "pending").map(loc => (
              <div key={loc.id} className="px-4 py-3 flex items-center gap-4">
                <MapPin className="w-4 h-4 text-yellow-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{loc.name}</p>
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
            ))}
          </div>
        </div>
      )}

      {/* Search and filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search locations..." className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="flex gap-1.5">
          {(["all", "approved", "pending", "rejected"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground border border-border hover:text-foreground"}`}>
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="all">All Groups</option>
          <option value="__none__">Ungrouped</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
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
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No locations found</td></tr>
            ) : filtered.map(loc => {
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
                      {loc.description && <p className="text-[10px] text-muted-foreground">{loc.description}</p>}
                    </div>
                  </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isInlineEditing ? (
                    <input value={inlineEdit.group_name} onChange={e => setInlineEdit(p => ({ ...p, group_name: e.target.value }))} list="group-suggestions" placeholder="Group..." className="w-full px-2 py-1 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                  ) : (
                    loc.group_name ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground">{loc.group_name}</span> : <span className="text-[10px] text-muted-foreground">—</span>
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
                          const { error } = await supabase.from("named_locations").update({ name: inlineEdit.name, address: inlineEdit.address, group_name: inlineEdit.group_name || null } as any).eq("id", loc.id);
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
                    <button onClick={() => { setInlineEditId(loc.id); setInlineEdit({ name: loc.name, address: loc.address || "", group_name: loc.group_name || "" }); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface" title="Quick Edit"><Pencil className="w-3.5 h-3.5" /></button>
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminNamedLocations;
