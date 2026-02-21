import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, MapPin } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MALE_CENTER = { lat: 4.1755, lng: 73.5093 };
const emptyForm = { name: "", address: "", lat: "", lng: "" };

const AdminLocations = () => {
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const locationMarkersRef = useRef<L.LayerGroup | null>(null);

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

  // Show all locations on the map
  const renderLocationMarkers = useCallback(() => {
    if (!mapInstance.current) return;
    if (locationMarkersRef.current) {
      locationMarkersRef.current.clearLayers();
    } else {
      locationMarkersRef.current = L.layerGroup().addTo(mapInstance.current);
    }
    locations.forEach((loc) => {
      const icon = L.divIcon({
        className: "custom-loc-marker",
        html: `<div style="background:hsl(var(--primary));width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([parseFloat(loc.lat), parseFloat(loc.lng)], { icon })
        .bindTooltip(loc.name, { direction: "top", offset: [0, -14] })
        .addTo(locationMarkersRef.current!);
    });
  }, [locations]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, {
      center: [MALE_CENTER.lat, MALE_CENTER.lng],
      zoom: 14,
      zoomControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [showForm]);

  // Update markers when locations change
  useEffect(() => {
    renderLocationMarkers();
  }, [locations, renderLocationMarkers]);

  // Handle map clicks when form is open
  useEffect(() => {
    if (!mapInstance.current || !showForm) return;
    const map = mapInstance.current;

    const onClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setForm((prev) => ({ ...prev, lat: lat.toFixed(6), lng: lng.toFixed(6) }));

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const icon = L.divIcon({
          className: "custom-pick-marker",
          html: `<div style="background:hsl(var(--destructive, 0 84% 60%));width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.4);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });
        markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
        markerRef.current.on("dragend", () => {
          const pos = markerRef.current!.getLatLng();
          setForm((prev) => ({ ...prev, lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6) }));
        });
      }
    };

    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [showForm]);

  // Pan to marker when editing
  useEffect(() => {
    if (showForm && form.lat && form.lng && mapInstance.current) {
      const lat = parseFloat(form.lat);
      const lng = parseFloat(form.lng);
      mapInstance.current.setView([lat, lng], 16);
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const icon = L.divIcon({
          className: "custom-pick-marker",
          html: `<div style="background:hsl(0 84% 60%);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.4);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });
        markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(mapInstance.current);
        markerRef.current.on("dragend", () => {
          const pos = markerRef.current!.getLatLng();
          setForm((prev) => ({ ...prev, lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6) }));
        });
      }
    }
  }, [editingId]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    if (markerRef.current && mapInstance.current) {
      mapInstance.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
  };

  const openEdit = (loc: any) => {
    setForm({
      name: loc.name || "",
      address: loc.address || "",
      lat: loc.lat?.toString() || "",
      lng: loc.lng?.toString() || "",
    });
    setEditingId(loc.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name || !form.lat || !form.lng) {
      toast({ title: "Please provide name and select location on the map", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name,
      address: form.address,
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
    };
    const { error } = editingId
      ? await supabase.from("service_locations").update(payload).eq("id", editingId)
      : await supabase.from("service_locations").insert(payload);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Location updated!" : "Location added!" });
      resetForm();
      fetchLocations();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this service location?")) return;
    const { error } = await supabase.from("service_locations").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Location deleted" });
      fetchLocations();
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("service_locations").update({ is_active: !current }).eq("id", id);
    toast({ title: current ? "Location deactivated" : "Location activated" });
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

          {/* Map */}
          <div className="rounded-xl overflow-hidden border border-border" style={{ height: 350 }}>
            <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
          </div>
          <p className="text-xs text-muted-foreground">Click on the map to select area, or drag the marker to adjust</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Area Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Velana Airport"
                className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Address</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="e.g. Hulhulé Island"
                className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Latitude</label>
              <input
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
                placeholder="4.1755"
                type="number"
                step="any"
                className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Longitude</label>
              <input
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
                placeholder="73.5093"
                type="number"
                step="any"
                className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <button onClick={handleSubmit} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">
            {editingId ? "Update Area" : "Save Area"}
          </button>
        </div>
      )}

      {/* Locations table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Name</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Address</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Coordinates</th>
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
              locations.map((loc) => (
                <tr key={loc.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary shrink-0" />
                    {loc.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{loc.address || "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground font-mono text-xs">
                    {parseFloat(loc.lat).toFixed(4)}, {parseFloat(loc.lng).toFixed(4)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${loc.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {loc.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminLocations;
