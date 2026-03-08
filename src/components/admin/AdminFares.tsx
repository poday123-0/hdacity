import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, Upload, Download, Loader2 } from "lucide-react";

const emptyZoneForm = { from_area: "", to_area: "", vehicle_type_id: "", fixed_fare: "" };
const emptySurchargeForm = { name: "", surcharge_type: "time_based", amount: "", start_time: "", end_time: "", luggage_threshold: "3" };

/** Parse a CSV line handling quoted fields */
const parseCSVLine = (line: string, delimiter = ","): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === delimiter) { result.push(current.trim()); current = ""; }
      else { current += ch; }
    }
  }
  result.push(current.trim());
  return result;
};

/** Detect CSV delimiter */
const detectDelimiter = (header: string): string => {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const ch of header) { if (ch in counts) counts[ch as keyof typeof counts]++; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
};

/** Build column map from headers */
const buildColumnMap = (headers: string[]): Record<string, number> => {
  const map: Record<string, number> = {};
  const aliases: Record<string, string[]> = {
    from_area: ["from_area", "from", "origin", "pickup", "from area"],
    to_area: ["to_area", "to", "destination", "dropoff", "to area"],
    vehicle_type: ["vehicle_type", "vehicle type", "type", "vehicle"],
    fixed_fare: ["fixed_fare", "fare", "price", "amount", "fixed fare"],
  };
  headers.forEach((h, i) => {
    const lower = h.toLowerCase().replace(/['"]/g, "").trim();
    for (const [key, names] of Object.entries(aliases)) {
      if (names.includes(lower)) { map[key] = i; break; }
    }
  });
  return map;
};

const AdminFares = () => {
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [fareZones, setFareZones] = useState<any[]>([]);
  const [serviceLocations, setServiceLocations] = useState<any[]>([]);
  const [surcharges, setSurcharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState(emptyZoneForm);
  const [showSurchargeForm, setShowSurchargeForm] = useState(false);
  const [editingSurchargeId, setEditingSurchargeId] = useState<string | null>(null);
  const [surchargeForm, setSurchargeForm] = useState(emptySurchargeForm);

  const fetchAll = async () => {
    setLoading(true);
    const [vt, fz, sl, sc] = await Promise.all([
      supabase.from("vehicle_types").select("*").order("sort_order"),
      supabase.from("fare_zones").select("*, vehicle_types(name)").order("from_area"),
      supabase.from("service_locations").select("*").eq("is_active", true).order("name"),
      supabase.from("fare_surcharges").select("*").order("surcharge_type"),
    ]);
    setVehicleTypes(vt.data || []);
    setFareZones(fz.data || []);
    setServiceLocations(sl.data || []);
    setSurcharges(sc.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const updateVehicleType = async (id: string, field: string, value: string) => {
    await supabase.from("vehicle_types").update({ [field]: parseFloat(value) || 0 }).eq("id", id);
    toast({ title: "Fare updated" });
    fetchAll();
  };

  // --- Zone form ---
  const openEditZone = (fz: any) => {
    setZoneForm({ from_area: fz.from_area || "", to_area: fz.to_area || "", vehicle_type_id: fz.vehicle_type_id || "", fixed_fare: fz.fixed_fare?.toString() || "" });
    setEditingZoneId(fz.id);
    setShowZoneForm(true);
  };
  const resetZoneForm = () => { setZoneForm(emptyZoneForm); setEditingZoneId(null); setShowZoneForm(false); };
  const saveZone = async () => {
    if (!zoneForm.from_area || !zoneForm.to_area || !zoneForm.fixed_fare) return;
    const payload = { name: `${zoneForm.from_area} to ${zoneForm.to_area}`, from_area: zoneForm.from_area, to_area: zoneForm.to_area, vehicle_type_id: zoneForm.vehicle_type_id || null, fixed_fare: parseFloat(zoneForm.fixed_fare) };
    const { error } = editingZoneId ? await supabase.from("fare_zones").update(payload).eq("id", editingZoneId) : await supabase.from("fare_zones").insert(payload);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: editingZoneId ? "Route updated!" : "Route fare added!" }); resetZoneForm(); fetchAll(); }
  };
  const deleteZone = async (id: string) => {
    if (!confirm("Delete this route fare?")) return;
    const { error } = await supabase.from("fare_zones").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Route deleted" }); fetchAll(); }
  };

  // --- Surcharge form ---
  const openEditSurcharge = (s: any) => {
    setSurchargeForm({
      name: s.name || "",
      surcharge_type: s.surcharge_type || "time_based",
      amount: s.amount?.toString() || "",
      start_time: s.start_time || "",
      end_time: s.end_time || "",
      luggage_threshold: s.luggage_threshold?.toString() || "3",
    });
    setEditingSurchargeId(s.id);
    setShowSurchargeForm(true);
  };
  const resetSurchargeForm = () => { setSurchargeForm(emptySurchargeForm); setEditingSurchargeId(null); setShowSurchargeForm(false); };
  const saveSurcharge = async () => {
    if (!surchargeForm.name || !surchargeForm.amount) return;
    const payload: any = {
      name: surchargeForm.name,
      surcharge_type: surchargeForm.surcharge_type,
      amount: parseFloat(surchargeForm.amount),
      start_time: surchargeForm.surcharge_type === "time_based" ? surchargeForm.start_time || null : null,
      end_time: surchargeForm.surcharge_type === "time_based" ? surchargeForm.end_time || null : null,
      luggage_threshold: surchargeForm.surcharge_type === "luggage" ? parseInt(surchargeForm.luggage_threshold) || 3 : null,
    };
    const { error } = editingSurchargeId
      ? await supabase.from("fare_surcharges").update(payload).eq("id", editingSurchargeId)
      : await supabase.from("fare_surcharges").insert(payload);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: editingSurchargeId ? "Surcharge updated!" : "Surcharge added!" }); resetSurchargeForm(); fetchAll(); }
  };
  const deleteSurcharge = async (id: string) => {
    if (!confirm("Delete this surcharge?")) return;
    const { error } = await supabase.from("fare_surcharges").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Surcharge deleted" }); fetchAll(); }
  };

  const inputCls = "w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
  const thCls = "text-left text-xs font-semibold text-muted-foreground px-4 py-3";

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-foreground">Fare Settings</h2>

      {/* ─── Distance-based fares + Hourly rates ─── */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Vehicle Rates</h3>
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className={thCls}>Type</th>
                <th className={thCls}>Base (MVR)</th>
                <th className={thCls}>Per KM</th>
                <th className={thCls}>Per Min</th>
                <th className={thCls}>Per Hour</th>
                <th className={thCls}>Minimum</th>
                <th className={thCls}>Pax Tax %</th>
                <th className={thCls}>Driver Tax %</th>
              </tr>
            </thead>
            <tbody>
              {vehicleTypes.map((vt) => (
                <tr key={vt.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{vt.name}</td>
                  {["base_fare", "per_km_rate", "per_minute_rate", "per_hour_rate", "minimum_fare", "passenger_tax_pct", "driver_tax_pct"].map((field) => (
                    <td key={field} className="px-4 py-3">
                      <input type="number" key={`${vt.id}-${field}-${vt[field]}`} defaultValue={vt[field]} onBlur={(e) => updateVehicleType(vt.id, field, e.target.value)}
                        className="w-20 px-2 py-1 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Route-based fares ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Route-Based Fares</h3>
          <button onClick={() => { showZoneForm ? resetZoneForm() : setShowZoneForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
            {showZoneForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showZoneForm ? "Cancel" : "Add Route"}
          </button>
        </div>

        {showZoneForm && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-foreground">{editingZoneId ? "Edit Route" : "New Route"}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">From</label>
                <select value={zoneForm.from_area} onChange={(e) => setZoneForm({ ...zoneForm, from_area: e.target.value })} className={inputCls}>
                  <option value="">Select area</option>
                  {serviceLocations.map((loc) => (<option key={loc.id} value={loc.name}>{loc.name}</option>))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">To</label>
                <select value={zoneForm.to_area} onChange={(e) => setZoneForm({ ...zoneForm, to_area: e.target.value })} className={inputCls}>
                  <option value="">Select area</option>
                  {serviceLocations.map((loc) => (<option key={loc.id} value={loc.name}>{loc.name}</option>))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Fixed Fare (MVR)</label>
                <input type="number" value={zoneForm.fixed_fare} onChange={(e) => setZoneForm({ ...zoneForm, fixed_fare: e.target.value })} placeholder="70" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Vehicle Type (optional)</label>
                <select value={zoneForm.vehicle_type_id} onChange={(e) => setZoneForm({ ...zoneForm, vehicle_type_id: e.target.value })} className={inputCls}>
                  <option value="">All types</option>
                  {vehicleTypes.map((vt) => (<option key={vt.id} value={vt.id}>{vt.name}</option>))}
                </select>
              </div>
            </div>
            <button onClick={saveZone} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">
              {editingZoneId ? "Update Route" : "Save Route"}
            </button>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className={thCls}>Route</th>
                <th className={thCls}>Vehicle Type</th>
                <th className={thCls}>Fare (MVR)</th>
                <th className={thCls}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {fareZones.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No route fares configured</td></tr>
              ) : fareZones.map((fz) => (
                <tr key={fz.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{fz.from_area} → {fz.to_area}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{fz.vehicle_types?.name || "All"}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">{fz.fixed_fare} MVR</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEditZone(fz)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => deleteZone(fz.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Surcharges (Time-based & Luggage) ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Surcharges</h3>
          <button onClick={() => { showSurchargeForm ? resetSurchargeForm() : setShowSurchargeForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
            {showSurchargeForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showSurchargeForm ? "Cancel" : "Add Surcharge"}
          </button>
        </div>

        {showSurchargeForm && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-foreground">{editingSurchargeId ? "Edit Surcharge" : "New Surcharge"}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <input value={surchargeForm.name} onChange={(e) => setSurchargeForm({ ...surchargeForm, name: e.target.value })} placeholder="Night Surcharge" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <select value={surchargeForm.surcharge_type} onChange={(e) => setSurchargeForm({ ...surchargeForm, surcharge_type: e.target.value })} className={inputCls}>
                  <option value="time_based">Time-Based</option>
                  <option value="luggage">Luggage</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Amount (MVR)</label>
                <input type="number" value={surchargeForm.amount} onChange={(e) => setSurchargeForm({ ...surchargeForm, amount: e.target.value })} placeholder="5" className={inputCls} />
              </div>
              {surchargeForm.surcharge_type === "time_based" && (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">From Time</label>
                    <input type="time" value={surchargeForm.start_time} onChange={(e) => setSurchargeForm({ ...surchargeForm, start_time: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">To Time</label>
                    <input type="time" value={surchargeForm.end_time} onChange={(e) => setSurchargeForm({ ...surchargeForm, end_time: e.target.value })} className={inputCls} />
                  </div>
                </>
              )}
              {surchargeForm.surcharge_type === "luggage" && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Free Luggage Limit (pcs)</label>
                  <input type="number" value={surchargeForm.luggage_threshold} onChange={(e) => setSurchargeForm({ ...surchargeForm, luggage_threshold: e.target.value })} placeholder="3" className={inputCls} />
                </div>
              )}
            </div>
            <button onClick={saveSurcharge} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">
              {editingSurchargeId ? "Update Surcharge" : "Save Surcharge"}
            </button>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className={thCls}>Name</th>
                <th className={thCls}>Type</th>
                <th className={thCls}>Amount (MVR)</th>
                <th className={thCls}>Condition</th>
                <th className={thCls}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {surcharges.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No surcharges configured</td></tr>
              ) : surcharges.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{s.name}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground capitalize">{s.surcharge_type === "time_based" ? "Time-Based" : "Luggage"}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">{s.amount} MVR</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {s.surcharge_type === "time_based" && s.start_time && s.end_time
                      ? `${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}`
                      : s.surcharge_type === "luggage"
                        ? `Above ${s.luggage_threshold} pcs`
                        : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEditSurcharge(s)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => deleteSurcharge(s.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminFares;
