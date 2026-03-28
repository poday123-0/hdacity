import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, Upload, Download, Loader2, Search, ChevronDown, ChevronRight, Filter } from "lucide-react";

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
  const [importingCsv, setImportingCsv] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const zoneFormRef = useRef<HTMLDivElement>(null);
  const [routeSearch, setRouteSearch] = useState("");
  const [routeFromFilter, setRouteFromFilter] = useState("all");
  const [routeVtFilter, setRouteVtFilter] = useState("all");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showVehicleRates, setShowVehicleRates] = useState(false);

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
    setTimeout(() => zoneFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
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

  // --- CSV Import for Route-Based Fares ---
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingCsv(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");
      
      const delimiter = detectDelimiter(lines[0]);
      const headers = parseCSVLine(lines[0], delimiter);
      const colMap = buildColumnMap(headers);
      
      if (colMap.from_area === undefined || colMap.to_area === undefined || colMap.fixed_fare === undefined) {
        throw new Error("CSV must have columns: from_area (or origin), to_area (or destination), fixed_fare (or fare). Found: " + headers.join(", "));
      }

      const vtLookup: Record<string, string> = {};
      vehicleTypes.forEach(vt => { vtLookup[vt.name.toLowerCase()] = vt.id; });

      const rows: Array<{ name: string; from_area: string; to_area: string; vehicle_type_id: string | null; fixed_fare: number }> = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i], delimiter);
        const from = cols[colMap.from_area]?.replace(/^['"]|['"]$/g, "").trim();
        const to = cols[colMap.to_area]?.replace(/^['"]|['"]$/g, "").trim();
        const fareStr = cols[colMap.fixed_fare]?.replace(/[^0-9.,]/g, "");
        const fare = parseFloat(fareStr?.replace(",", ".") || "0");
        
        if (!from || !to) { errors.push(`Row ${i + 1}: Missing from/to area`); continue; }
        if (!fare || fare <= 0) { errors.push(`Row ${i + 1}: Invalid fare`); continue; }

        let vtId: string | null = null;
        if (colMap.vehicle_type !== undefined) {
          const vtName = cols[colMap.vehicle_type]?.trim().toLowerCase();
          if (vtName && vtName !== "" && vtName !== "all") {
            vtId = vtLookup[vtName] || null;
            if (!vtId) { errors.push(`Row ${i + 1}: Unknown vehicle type "${cols[colMap.vehicle_type]}"`); continue; }
          }
        }

        rows.push({ name: `${from} to ${to}`, from_area: from, to_area: to, vehicle_type_id: vtId, fixed_fare: Math.round(fare) });
      }

      if (rows.length === 0) throw new Error("No valid rows found.\n" + errors.join("\n"));

      const { error } = await supabase.from("fare_zones").insert(rows);
      if (error) throw error;

      toast({ title: `Imported ${rows.length} route fares`, description: errors.length > 0 ? `${errors.length} rows skipped` : undefined });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImportingCsv(false);
      if (csvFileRef.current) csvFileRef.current.value = "";
    }
  };

  const inputCls = "w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";
  const thCls = "text-left text-xs font-semibold text-muted-foreground px-4 py-3";

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-foreground">Fare Settings</h2>

      {/* ─── Distance-based fares + Hourly rates ─── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowVehicleRates(prev => !prev)}
          className="w-full flex items-center gap-3 px-4 py-3 bg-surface hover:bg-muted/50 transition-colors"
        >
          {showVehicleRates ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-bold text-foreground">Vehicle Rates</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{vehicleTypes.length} types</span>
        </button>
        {showVehicleRates && (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface/50">
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
        )}
      </div>

      {/* ─── Route-based fares ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-lg font-semibold text-foreground">Route-Based Fares</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <a href="/sample-route-fares.csv" download className="flex items-center gap-2 bg-surface border border-border text-foreground px-3 py-2 rounded-xl text-sm font-semibold hover:bg-muted transition-colors">
              <Download className="w-4 h-4" />
              Sample CSV
            </a>
            <input type="file" accept=".csv" ref={csvFileRef} onChange={handleCsvImport} className="hidden" />
            <button
              onClick={() => csvFileRef.current?.click()}
              disabled={importingCsv}
              className="flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              {importingCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importingCsv ? "Importing..." : "Import CSV"}
            </button>
            <button onClick={() => { showZoneForm ? resetZoneForm() : setShowZoneForm(true); }} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
              {showZoneForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showZoneForm ? "Cancel" : "Add Route"}
            </button>
          </div>
        </div>

        {showZoneForm && (
          <div ref={zoneFormRef} className="bg-card border-2 border-primary/30 rounded-xl p-5 space-y-4 shadow-lg">
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
            <div className="flex gap-2">
              <button onClick={saveZone} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">
                {editingZoneId ? "Update Route" : "Save Route"}
              </button>
              <button onClick={resetZoneForm} className="bg-muted text-muted-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}

        {/* Search & Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={routeSearch} onChange={e => setRouteSearch(e.target.value)} placeholder="Search routes..." className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <select value={routeFromFilter} onChange={e => setRouteFromFilter(e.target.value)} className="px-3 py-2 bg-card border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="all">All Origins</option>
            {[...new Set(fareZones.map(fz => fz.from_area))].sort().map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={routeVtFilter} onChange={e => setRouteVtFilter(e.target.value)} className="px-3 py-2 bg-card border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="all">All Vehicle Types</option>
            {vehicleTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
          </select>
        </div>

        {/* Grouped Route Table */}
        {(() => {
          const q = routeSearch.toLowerCase();
          const filtered = fareZones.filter(fz => {
            if (routeFromFilter !== "all" && fz.from_area !== routeFromFilter) return false;
            if (routeVtFilter !== "all" && fz.vehicle_type_id !== routeVtFilter) return false;
            if (q && !fz.from_area.toLowerCase().includes(q) && !fz.to_area.toLowerCase().includes(q) && !(fz.vehicle_types?.name || "").toLowerCase().includes(q)) return false;
            return true;
          });
          // Group by from_area
          const grouped: Record<string, typeof filtered> = {};
          filtered.forEach(fz => {
            const key = fz.from_area;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(fz);
          });
          const groupKeys = Object.keys(grouped).sort();

          const toggleGroup = (key: string) => {
            setExpandedGroups(prev => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key); else next.add(key);
              return next;
            });
          };

          return (
            <div className="space-y-3">
              {filtered.length === 0 ? (
                <div className="bg-card border border-border rounded-xl px-4 py-8 text-center text-muted-foreground">No route fares found</div>
              ) : groupKeys.map(fromArea => {
                const items = grouped[fromArea];
                const isExpanded = expandedGroups.has(fromArea);
                // Sub-group by to_area within each from_area
                const subGrouped: Record<string, typeof items> = {};
                items.forEach(fz => {
                  if (!subGrouped[fz.to_area]) subGrouped[fz.to_area] = [];
                  subGrouped[fz.to_area].push(fz);
                });
                const subKeys = Object.keys(subGrouped).sort();

                return (
                  <div key={fromArea} className="bg-card border border-border rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleGroup(fromArea)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-surface hover:bg-muted/50 transition-colors"
                    >
                      {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-sm font-bold text-foreground">From: {fromArea}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{items.length} routes</span>
                    </button>
                    {!isCollapsed && (
                      <div className="divide-y divide-border">
                        {subKeys.map(toArea => {
                          const routes = subGrouped[toArea];
                          return (
                            <div key={toArea} className="px-4 py-2">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-xs font-semibold text-muted-foreground">→ {toArea}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                                {routes.map(fz => (
                                  <div key={fz.id} className="flex items-center gap-2 bg-surface rounded-lg px-3 py-2 group">
                                    <span className="text-xs text-muted-foreground flex-1 truncate">{fz.vehicle_types?.name || "All Types"}</span>
                                    <span className="text-xs font-bold text-foreground whitespace-nowrap">{fz.fixed_fare} MVR</span>
                                    <button onClick={() => openEditZone(fz)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"><Pencil className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => deleteZone(fz.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-[10px] text-muted-foreground text-right">{filtered.length} route fares total</p>
            </div>
          );
        })()}
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
