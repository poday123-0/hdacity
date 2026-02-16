import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X } from "lucide-react";

const AdminVehicles = () => {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ plate_number: "", make: "", model: "", color: "", year: "", driver_id: "", vehicle_type_id: "" });

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

  const handleSubmit = async () => {
    if (!form.plate_number) return;
    const { error } = await supabase.from("vehicles").insert({
      plate_number: form.plate_number,
      make: form.make,
      model: form.model,
      color: form.color,
      year: form.year ? parseInt(form.year) : null,
      driver_id: form.driver_id || null,
      vehicle_type_id: form.vehicle_type_id || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Vehicle added!" });
      setShowForm(false);
      setForm({ plate_number: "", make: "", model: "", color: "", year: "", driver_id: "", vehicle_type_id: "" });
      fetchAll();
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("vehicles").update({ is_active: !current }).eq("id", id);
    toast({ title: current ? "Vehicle deactivated" : "Vehicle activated" });
    fetchAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Vehicles</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "Add Vehicle"}
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">New Vehicle</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "plate_number", label: "Plate Number", placeholder: "P-1234" },
              { key: "make", label: "Make", placeholder: "Toyota" },
              { key: "model", label: "Model", placeholder: "Yaris" },
              { key: "color", label: "Color", placeholder: "White" },
              { key: "year", label: "Year", placeholder: "2023" },
            ].map((f) => (
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
              <select
                value={form.vehicle_type_id}
                onChange={(e) => setForm({ ...form, vehicle_type_id: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select type</option>
                {vehicleTypes.map((vt) => (
                  <option key={vt.id} value={vt.id}>{vt.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Assign Driver</label>
              <select
                value={form.driver_id}
                onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Unassigned</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={handleSubmit} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">
            Save Vehicle
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
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : vehicles.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No vehicles</td></tr>
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
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${v.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {v.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(v.id, v.is_active)} className="text-xs font-medium text-primary hover:underline">
                      {v.is_active ? "Deactivate" : "Activate"}
                    </button>
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
