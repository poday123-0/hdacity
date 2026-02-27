import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, Upload, Image, FileText } from "lucide-react";

const emptyForm = { plate_number: "", make: "", model: "", color: "", year: "", driver_id: "", vehicle_type_id: "", registration_url: "", insurance_url: "", image_url: "" };

const AdminVehicles = () => {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState("");

  const handleDocUpload = async (file: File, target: string) => {
    setUploading(target);
    const ext = file.name.split(".").pop();
    const path = `vehicles/${Date.now()}_${target}.${ext}`;
    const { error } = await supabase.storage.from("vehicle-images").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(null);
      return;
    }
    const { data: urlData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
    setForm(prev => ({ ...prev, [target]: `${urlData.publicUrl}?t=${Date.now()}` }));
    setUploading(null);
  };

  const fetchAll = async () => {
    setLoading(true);
    const [v, vt, d] = await Promise.all([
      supabase.from("vehicles").select("*, vehicle_types(name), profiles!vehicles_driver_id_fkey(first_name, last_name)").order("created_at", { ascending: false }),
      supabase.from("vehicle_types").select("*").eq("is_active", true),
      supabase.from("profiles").select("id, first_name, last_name").ilike("user_type", "%Driver%"),
    ]);
    setVehicles(v.data || []);
    setVehicleTypes(vt.data || []);
    setDrivers(d.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openEdit = (v: any) => {
    setForm({
      plate_number: v.plate_number || "",
      make: v.make || "",
      model: v.model || "",
      color: v.color || "",
      year: v.year?.toString() || "",
      driver_id: v.driver_id || "",
      vehicle_type_id: v.vehicle_type_id || "",
      registration_url: v.registration_url || "",
      insurance_url: v.insurance_url || "",
      image_url: v.image_url || "",
    });
    setEditingId(v.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.plate_number) return;
    const payload: any = {
      plate_number: form.plate_number,
      make: form.make,
      model: form.model,
      color: form.color,
      year: form.year ? parseInt(form.year) : null,
      driver_id: form.driver_id || null,
      vehicle_type_id: form.vehicle_type_id || null,
      registration_url: form.registration_url || null,
      insurance_url: form.insurance_url || null,
      image_url: form.image_url || null,
    };

    const { error } = editingId
      ? await supabase.from("vehicles").update(payload).eq("id", editingId)
      : await supabase.from("vehicles").insert(payload);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Vehicle updated!" : "Vehicle added!" });
      resetForm();
      fetchAll();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this vehicle?")) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Vehicle deleted" });
      fetchAll();
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("vehicles").update({ is_active: !current }).eq("id", id);
    toast({ title: current ? "Vehicle deactivated" : "Vehicle activated" });
    fetchAll();
  };

  const formFields = [
    { key: "plate_number", label: "Plate Number", placeholder: "P-1234" },
    { key: "make", label: "Make", placeholder: "Toyota" },
    { key: "model", label: "Model", placeholder: "Yaris" },
    { key: "color", label: "Color", placeholder: "White" },
    { key: "year", label: "Year", placeholder: "2023" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Vehicles</h2>
        <button onClick={() => { showForm ? resetForm() : setShowForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "Add Vehicle"}
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">{editingId ? "Edit Vehicle" : "New Vehicle"}</h3>
          <div className="grid grid-cols-2 gap-4">
            {formFields.map((f) => (
              <div key={f.key}>
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <input
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ))}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vehicle Type</label>
              <select value={form.vehicle_type_id} onChange={(e) => setForm({ ...form, vehicle_type_id: e.target.value })} className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select type</option>
                {vehicleTypes.map((vt) => (<option key={vt.id} value={vt.id}>{vt.name}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assign Driver</label>
              <select value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })} className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Unassigned</option>
                {drivers.map((d) => (<option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>))}
              </select>
            </div>
          </div>
          {/* Document uploads */}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && uploadTarget) handleDocUpload(file, uploadTarget);
            e.target.value = "";
          }} />
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Vehicle Documents</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "registration_url", label: "Registration", icon: FileText },
                { key: "insurance_url", label: "Insurance", icon: FileText },
                { key: "image_url", label: "Vehicle Photo", icon: Image },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setUploadTarget(key); setTimeout(() => fileInputRef.current?.click(), 50); }}
                  disabled={uploading === key}
                  className="flex flex-col items-center gap-1.5 p-3 bg-surface border border-border rounded-xl hover:border-primary/50 transition-colors"
                >
                  {(form as any)[key] ? (
                    <img src={(form as any)[key]} alt={label} className="w-14 h-10 object-cover rounded-lg" />
                  ) : (
                    <div className="w-14 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <span className="text-[10px] font-medium text-muted-foreground text-center">
                    {uploading === key ? "Uploading..." : label}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleSubmit} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">
            {editingId ? "Update Vehicle" : "Save Vehicle"}
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Plate</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Vehicle</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Type</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Driver</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Docs</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : vehicles.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No vehicles</td></tr>
            ) : (
              vehicles.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{v.plate_number}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{v.make} {v.model} {v.color}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{v.vehicle_types?.name || "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {v.profiles ? `${v.profiles.first_name} ${v.profiles.last_name}` : "Unassigned"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {v.registration_url && <a href={v.registration_url} target="_blank" rel="noreferrer" className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Reg</a>}
                      {v.insurance_url && <a href={v.insurance_url} target="_blank" rel="noreferrer" className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Ins</a>}
                      {v.image_url && <a href={v.image_url} target="_blank" rel="noreferrer" className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">Img</a>}
                      {!v.registration_url && !v.insurance_url && !v.image_url && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${v.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {v.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleActive(v.id, v.is_active)} className="text-xs font-medium text-primary hover:underline">
                        {v.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => openEdit(v)} className="text-muted-foreground hover:text-primary">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(v.id)} className="text-muted-foreground hover:text-destructive">
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

export default AdminVehicles;
