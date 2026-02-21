import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, Car, Bike, Truck, Bus } from "lucide-react";

const ICON_OPTIONS = [
  { value: "car", label: "Car", Icon: Car },
  { value: "cycle", label: "Cycle", Icon: Bike },
  { value: "van", label: "Van", Icon: Bus },
  { value: "truck", label: "Pickup/Truck", Icon: Truck },
];

const iconMap: Record<string, typeof Car> = {
  car: Car,
  cycle: Bike,
  van: Bus,
  truck: Truck,
};

const emptyForm = {
  name: "",
  description: "",
  icon: "car",
  capacity: "4",
  base_fare: "25",
  per_km_rate: "10",
  minimum_fare: "25",
  sort_order: "0",
};

const AdminVehicleTypes = () => {
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase.from("vehicle_types").select("*").order("sort_order");
    setTypes(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openEdit = (vt: any) => {
    setForm({
      name: vt.name || "",
      description: vt.description || "",
      icon: vt.icon || "car",
      capacity: vt.capacity?.toString() || "4",
      base_fare: vt.base_fare?.toString() || "25",
      per_km_rate: vt.per_km_rate?.toString() || "10",
      minimum_fare: vt.minimum_fare?.toString() || "25",
      sort_order: vt.sort_order?.toString() || "0",
    });
    setEditingId(vt.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.name) return;
    const payload = {
      name: form.name,
      description: form.description,
      icon: form.icon,
      capacity: parseInt(form.capacity) || 4,
      base_fare: parseFloat(form.base_fare) || 25,
      per_km_rate: parseFloat(form.per_km_rate) || 10,
      minimum_fare: parseFloat(form.minimum_fare) || 25,
      sort_order: parseInt(form.sort_order) || 0,
    };

    const { error } = editingId
      ? await supabase.from("vehicle_types").update(payload).eq("id", editingId)
      : await supabase.from("vehicle_types").insert(payload);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Vehicle type updated!" : "Vehicle type added!" });
      resetForm();
      fetchAll();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this vehicle type? This may affect existing vehicles and fares.")) return;
    const { error } = await supabase.from("vehicle_types").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Vehicle type deleted" });
      fetchAll();
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("vehicle_types").update({ is_active: !current }).eq("id", id);
    toast({ title: current ? "Type deactivated" : "Type activated" });
    fetchAll();
  };

  const textFields = [
    { key: "name", label: "Name *", placeholder: "e.g. Standard Car" },
    { key: "description", label: "Description", placeholder: "Comfortable ride for up to 4" },
    { key: "capacity", label: "Capacity (seats)", placeholder: "4", type: "number" },
    { key: "sort_order", label: "Sort Order", placeholder: "0", type: "number" },
    { key: "base_fare", label: "Base Fare (MVR)", placeholder: "25", type: "number" },
    { key: "per_km_rate", label: "Per KM Rate (MVR)", placeholder: "10", type: "number" },
    { key: "minimum_fare", label: "Minimum Fare (MVR)", placeholder: "25", type: "number" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Vehicle / Service Types</h2>
        <button
          onClick={() => { showForm ? resetForm() : setShowForm(true); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "Add Type"}
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">{editingId ? "Edit Type" : "New Vehicle Type"}</h3>

          {/* Icon Picker */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Map Icon / Vehicle Icon</label>
            <div className="flex gap-3 flex-wrap">
              {ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, icon: opt.value })}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all min-w-[80px] ${
                    form.icon === opt.value
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface hover:border-muted-foreground"
                  }`}
                >
                  <opt.Icon className={`w-7 h-7 ${form.icon === opt.value ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`text-xs font-medium ${form.icon === opt.value ? "text-primary" : "text-muted-foreground"}`}>
                    {opt.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {textFields.map((f) => (
              <div key={f.key}>
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <input
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  type={f.type || "text"}
                  className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ))}
          </div>
          <button onClick={handleSubmit} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">
            {editingId ? "Update Type" : "Save Type"}
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Icon</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Name</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Capacity</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Base Fare</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Per KM</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : types.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No vehicle types</td></tr>
            ) : (
              types.map((vt) => {
                const IconComp = iconMap[vt.icon] || Car;
                return (
                  <tr key={vt.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <IconComp className="w-5 h-5 text-primary" />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{vt.name}</p>
                      <p className="text-xs text-muted-foreground">{vt.description}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{vt.capacity} seats</td>
                    <td className="px-4 py-3 text-sm text-foreground">{vt.base_fare} MVR</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{vt.per_km_rate} MVR</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${vt.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {vt.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleActive(vt.id, vt.is_active)} className="text-xs font-medium text-primary hover:underline">
                          {vt.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button onClick={() => openEdit(vt)} className="text-muted-foreground hover:text-primary">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(vt.id)} className="text-muted-foreground hover:text-destructive">
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

export default AdminVehicleTypes;
