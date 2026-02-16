import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Save } from "lucide-react";

const AdminFares = () => {
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [fareZones, setFareZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [zoneForm, setZoneForm] = useState({ name: "", from_area: "", to_area: "", vehicle_type_id: "", fixed_fare: "" });

  const fetchAll = async () => {
    setLoading(true);
    const [vt, fz] = await Promise.all([
      supabase.from("vehicle_types").select("*").order("sort_order"),
      supabase.from("fare_zones").select("*, vehicle_types(name)").order("created_at", { ascending: false }),
    ]);
    setVehicleTypes(vt.data || []);
    setFareZones(fz.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const updateVehicleType = async (id: string, field: string, value: string) => {
    await supabase.from("vehicle_types").update({ [field]: parseFloat(value) || 0 }).eq("id", id);
    toast({ title: "Fare updated" });
    fetchAll();
  };

  const addZone = async () => {
    if (!zoneForm.name || !zoneForm.from_area || !zoneForm.to_area || !zoneForm.fixed_fare) return;
    const { error } = await supabase.from("fare_zones").insert({
      name: zoneForm.name,
      from_area: zoneForm.from_area,
      to_area: zoneForm.to_area,
      vehicle_type_id: zoneForm.vehicle_type_id || null,
      fixed_fare: parseFloat(zoneForm.fixed_fare),
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Zone fare added!" });
      setShowZoneForm(false);
      setZoneForm({ name: "", from_area: "", to_area: "", vehicle_type_id: "", fixed_fare: "" });
      fetchAll();
    }
  };

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-foreground">Fare Settings</h2>

      {/* Distance-based fares */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Distance-Based Fares (per vehicle type)</h3>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Type</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Base Fare (MVR)</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Per KM (MVR)</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Minimum (MVR)</th>
              </tr>
            </thead>
            <tbody>
              {vehicleTypes.map((vt) => (
                <tr key={vt.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{vt.name}</td>
                  {["base_fare", "per_km_rate", "minimum_fare"].map((field) => (
                    <td key={field} className="px-4 py-3">
                      <input
                        type="number"
                        defaultValue={vt[field]}
                        onBlur={(e) => updateVehicleType(vt.id, field, e.target.value)}
                        className="w-24 px-2 py-1 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zone-based fares */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Zone-Based Fares (fixed routes)</h3>
          <button onClick={() => setShowZoneForm(!showZoneForm)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
            {showZoneForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showZoneForm ? "Cancel" : "Add Zone"}
          </button>
        </div>

        {showZoneForm && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "name", label: "Zone Name", placeholder: "Malé to Airport" },
                { key: "from_area", label: "From", placeholder: "Malé" },
                { key: "to_area", label: "To", placeholder: "Velana Airport" },
                { key: "fixed_fare", label: "Fixed Fare (MVR)", placeholder: "70" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  <input
                    value={(zoneForm as any)[f.key]}
                    onChange={(e) => setZoneForm({ ...zoneForm, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Vehicle Type (optional)</label>
                <select
                  value={zoneForm.vehicle_type_id}
                  onChange={(e) => setZoneForm({ ...zoneForm, vehicle_type_id: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All types</option>
                  {vehicleTypes.map((vt) => (
                    <option key={vt.id} value={vt.id}>{vt.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <button onClick={addZone} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">
              Save Zone
            </button>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Zone</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">From</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">To</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Type</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Fare (MVR)</th>
              </tr>
            </thead>
            <tbody>
              {fareZones.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No zone fares configured</td></tr>
              ) : (
                fareZones.map((fz) => (
                  <tr key={fz.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{fz.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{fz.from_area}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{fz.to_area}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{fz.vehicle_types?.name || "All"}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{fz.fixed_fare} MVR</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminFares;
