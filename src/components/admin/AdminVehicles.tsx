import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Pencil, Trash2, Upload, Image, FileText, Check, XCircle, Search, Filter, Car, Download, CheckSquare, Square, Building2, Loader2, ShieldCheck, Clock, Eye, User, Ban, ShieldOff, Lock, Timer } from "lucide-react";
import * as XLSX from "xlsx";
import { DEFAULT_VEHICLE_IMAGE } from "@/lib/default-images";

const emptyForm = { plate_number: "", make: "", model: "", color: "", year: "", driver_id: "", vehicle_type_id: "", registration_url: "", insurance_url: "", image_url: "", center_code: "" };
type VehicleForm = typeof emptyForm;

type VehicleStatusFilter = "all" | "approved" | "pending" | "rejected" | "online";

const statusChips: { value: VehicleStatusFilter; label: string; color: string }[] = [
  { value: "all", label: "All", color: "bg-surface text-foreground" },
  { value: "online", label: "Online", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" },
  { value: "approved", label: "Approved", color: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" },
  { value: "pending", label: "Pending", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400" },
  { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" },
];

const AdminVehicles = () => {
  const VEHICLES_PAGE_SIZE = 150;
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VehicleStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [importing, setImporting] = useState(false);
  const [driverSearch, setDriverSearch] = useState("");
  const [onlineDriverIds, setOnlineDriverIds] = useState<Set<string>>(new Set());

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkCompanyId, setBulkCompanyId] = useState("");
  const [bulkCenterCodeStart, setBulkCenterCodeStart] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [visibleVehicleCount, setVisibleVehicleCount] = useState(VEHICLES_PAGE_SIZE);

  const handleDocUpload = async (file: File, target: string) => {
    setUploading(target);
    const ext = file.name.split(".").pop();
    const path = `vehicles/${Date.now()}_${target}.${ext}`;
    const { error } = await supabase.storage.from("vehicle-images").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); setUploading(null); return; }
    const { data: urlData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
    setForm(prev => ({ ...prev, [target]: `${urlData.publicUrl}?t=${Date.now()}` }));
    setUploading(null);
  };

  const fetchAll = async () => {
    setLoading(true);
    const [v, vt, d, c, ol] = await Promise.all([
      supabase.from("vehicles").select("*, vehicle_types(name), profiles!vehicles_driver_id_fkey(first_name, last_name, company_id, company_name)").order("center_code", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
      supabase.from("vehicle_types").select("*").eq("is_active", true),
      supabase.from("profiles").select("id, first_name, last_name, phone_number, country_code").ilike("user_type", "%Driver%"),
      supabase.from("companies").select("*").eq("is_active", true).order("name"),
      supabase.from("driver_locations").select("driver_id").eq("is_online", true),
    ]);
    setVehicles(v.data || []);
    setVehicleTypes(vt.data || []);
    setDrivers(d.data || []);
    setCompanies(c.data || []);
    setOnlineDriverIds(new Set((ol.data || []).map((d: any) => d.driver_id)));
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const openEdit = (v: any) => {
    setForm({
      plate_number: v.plate_number || "", make: v.make || "", model: v.model || "",
      color: v.color || "", year: v.year?.toString() || "", driver_id: v.driver_id || "",
      vehicle_type_id: v.vehicle_type_id || "", registration_url: v.registration_url || "",
      insurance_url: v.insurance_url || "", image_url: v.image_url || "",
      center_code: v.center_code || "",
    });
    setEditingId(v.id);
    setShowForm(true);
    setTimeout(() => {
      document.getElementById("admin-vehicles-edit-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const resetForm = () => { setForm(emptyForm); setEditingId(null); setShowForm(false); };

  const handleSubmit = async () => {
    if (!form.plate_number) return;
    if (form.center_code) {
      const { data: existingCode } = await supabase.from("vehicles").select("id, plate_number").eq("center_code", form.center_code).maybeSingle();
      if (existingCode && existingCode.id !== editingId) {
        toast({ title: "Duplicate center code", description: `Center code "${form.center_code}" is already assigned to vehicle ${existingCode.plate_number}.`, variant: "destructive" });
        return;
      }
    }
    const payload: any = {
      plate_number: form.plate_number, make: form.make, model: form.model, color: form.color,
      year: form.year ? parseInt(form.year) : null, driver_id: form.driver_id || null,
      vehicle_type_id: form.vehicle_type_id || null, registration_url: form.registration_url || null,
      insurance_url: form.insurance_url || null, image_url: form.image_url || null,
      center_code: form.center_code || null,
    };
    const { error } = editingId
      ? await supabase.from("vehicles").update(payload).eq("id", editingId)
      : await supabase.from("vehicles").insert(payload);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: editingId ? "Vehicle updated!" : "Vehicle added!" }); resetForm(); fetchAll(); }
  };

  const handleCsvImport = async (file: File) => {
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (rows.length === 0) { toast({ title: "Empty file", variant: "destructive" }); setImporting(false); return; }

      const vtMap: Record<string, string> = {};
      vehicleTypes.forEach(vt => { vtMap[vt.name.toLowerCase()] = vt.id; });

      let imported = 0, skipped = 0;
      for (const row of rows) {
        const plateNumber = String(row.plate_number || row.PlateNumber || "").trim();
        if (!plateNumber) { skipped++; continue; }

        let driverId: string | null = null;
        const driverPhone = String(row.driver_phone || row.DriverPhone || "").trim().replace(/\D/g, "");
        if (driverPhone) {
          const cleanPhone = driverPhone.slice(-7);
          const { data: prof } = await supabase.from("profiles").select("id").ilike("user_type", "%Driver%").ilike("phone_number", `%${cleanPhone}`).maybeSingle();
          if (prof) driverId = prof.id;
        }

        const vtName = String(row.vehicle_type || row.VehicleType || "").trim().toLowerCase();
        const vtId = vtMap[vtName] || null;
        const centerCode = String(row.center_code || row.CenterCode || "").trim() || null;

        const { data: existing } = await supabase.from("vehicles").select("id").eq("plate_number", plateNumber).maybeSingle();
        if (existing) {
          if (driverId || vtId || centerCode) {
            const upd: any = {};
            if (driverId) upd.driver_id = driverId;
            if (vtId) upd.vehicle_type_id = vtId;
            if (centerCode) upd.center_code = centerCode;
            await supabase.from("vehicles").update(upd).eq("id", existing.id);
          }
          skipped++;
          continue;
        }

        const { error } = await supabase.from("vehicles").insert({
          plate_number: plateNumber,
          make: String(row.make || row.Make || "").trim(),
          model: String(row.model || row.Model || "").trim(),
          color: String(row.color || row.Color || "").trim(),
          year: parseInt(row.year || row.Year) || null,
          driver_id: driverId,
          vehicle_type_id: vtId,
          center_code: centerCode,
          vehicle_status: "approved",
          is_active: true,
        });
        if (error) skipped++; else imported++;
      }

      toast({ title: "Import complete", description: `${imported} imported, ${skipped} skipped` });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    }
    setImporting(false);
  };

  const downloadSampleCsv = () => {
    const sample = "plate_number,make,model,color,year,vehicle_type,driver_phone,center_code\nP-1234,Toyota,Yaris,White,2023,Car,9991234,101";
    const blob = new Blob([sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sample-vehicles-import.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this vehicle?")) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Vehicle deleted" }); fetchAll(); }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("vehicles").update({ is_active: !current }).eq("id", id);
    toast({ title: current ? "Vehicle deactivated" : "Vehicle activated" });
    fetchAll();
  };

  const approveVehicle = async (id: string) => {
    await supabase.from("vehicles").update({ vehicle_status: "approved", rejection_reason: null } as any).eq("id", id);
    toast({ title: "Vehicle approved ✅" });
    const vehicle = vehicles.find(v => v.id === id);
    if (vehicle?.driver_id) {
      const driver = drivers.find(d => d.id === vehicle.driver_id);
      if (driver) {
        try {
          await supabase.functions.invoke("notify-vehicle-update", {
            body: {
              driver_name: `${driver.first_name} ${driver.last_name}`,
              phone_number: driver.phone_number,
              country_code: driver.country_code || "960",
              plate_number: vehicle.plate_number,
              update_type: "approved",
              notify_driver: true,
            },
          });
        } catch (e) { console.error("Notify driver failed", e); }
      }
    }
    fetchAll();
  };

  const rejectVehicle = async (id: string, reason: string) => {
    await supabase.from("vehicles").update({ vehicle_status: "rejected", rejection_reason: reason || "Documents not acceptable" } as any).eq("id", id);
    toast({ title: "Vehicle rejected", description: reason || "Documents not acceptable" });
    const vehicle = vehicles.find(v => v.id === id);
    if (vehicle?.driver_id) {
      const driver = drivers.find(d => d.id === vehicle.driver_id);
      if (driver) {
        try {
          await supabase.functions.invoke("notify-vehicle-update", {
            body: {
              driver_name: `${driver.first_name} ${driver.last_name}`,
              phone_number: driver.phone_number,
              country_code: driver.country_code || "960",
              plate_number: vehicle.plate_number,
              update_type: "rejected",
              rejection_reason: reason || "Documents not acceptable",
              notify_driver: true,
            },
          });
        } catch (e) { console.error("Notify driver failed", e); }
      }
    }
    setRejectingId(null);
    setRejectReason("");
    fetchAll();
  };

  // Bulk selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === visibleVehicles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleVehicles.map(v => v.id)));
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedIds.size === 0) return;
    if (!bulkCompanyId && !bulkCenterCodeStart) {
      toast({ title: "Select at least one field to update", variant: "destructive" });
      return;
    }

    setBulkApplying(true);
    const ids = Array.from(selectedIds);
    const selectedCompany = companies.find(c => c.id === bulkCompanyId);
    let centerCode = bulkCenterCodeStart ? parseInt(bulkCenterCodeStart) : null;
    let updated = 0;
    let errors = 0;

    for (const id of ids) {
      const payload: any = {};
      if (bulkCompanyId && selectedCompany) {
        // Update the driver's company on their profile
        const vehicle = vehicles.find(v => v.id === id);
        if (vehicle?.driver_id) {
          await supabase.from("profiles").update({
            company_id: bulkCompanyId,
            company_name: selectedCompany.name,
          }).eq("id", vehicle.driver_id);
        }
      }
      if (centerCode !== null) {
        payload.center_code = String(centerCode);
        centerCode++;
      }

      if (Object.keys(payload).length > 0) {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", id);
        if (error) errors++; else updated++;
      } else {
        updated++;
      }
    }

    setBulkApplying(false);
    setShowBulkModal(false);
    setSelectedIds(new Set());
    setBulkCompanyId("");
    setBulkCenterCodeStart("");
    toast({ title: "Bulk update complete", description: `${updated} vehicles updated${errors > 0 ? `, ${errors} failed` : ""}` });
    fetchAll();
  };

  const formFields = [
    { key: "plate_number", label: "Plate Number", placeholder: "P-1234" },
    { key: "make", label: "Make", placeholder: "Toyota" },
    { key: "model", label: "Model", placeholder: "Yaris" },
    { key: "color", label: "Color", placeholder: "White" },
    { key: "year", label: "Year", placeholder: "2023" },
  ];

  // Filter vehicles
  const filtered = vehicles.filter(v => {
    const q = search.toLowerCase();
    const matchesSearch = !q || v.plate_number?.toLowerCase().includes(q) || v.make?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) || (v.profiles ? `${v.profiles.first_name} ${v.profiles.last_name}`.toLowerCase().includes(q) : false) || v.center_code?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || (statusFilter === "online" ? (v.driver_id && onlineDriverIds.has(v.driver_id)) : v.vehicle_status === statusFilter);
    const matchesType = !typeFilter || v.vehicle_type_id === typeFilter;
    const driverCompanyId = v.profiles?.company_id || null;
    const matchesCompany = !companyFilter || driverCompanyId === companyFilter;
    return matchesSearch && matchesStatus && matchesType && matchesCompany;
  }).sort((a, b) => {
    const codeA = a.center_code ? parseInt(a.center_code, 10) : NaN;
    const codeB = b.center_code ? parseInt(b.center_code, 10) : NaN;
    if (isNaN(codeA) && isNaN(codeB)) return 0;
    if (isNaN(codeA)) return 1;
    if (isNaN(codeB)) return -1;
    return codeA - codeB;
  });

  const visibleVehicles = useMemo(() => filtered.slice(0, visibleVehicleCount), [filtered, visibleVehicleCount]);

  useEffect(() => {
    setVisibleVehicleCount(VEHICLES_PAGE_SIZE);
  }, [search, statusFilter, typeFilter, companyFilter]);

  return (
    <div className="space-y-5">
      {/* Document preview modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewDoc(null)}>
          <div className="relative max-w-2xl max-h-[80vh]">
            <button onClick={() => setPreviewDoc(null)} className="absolute -top-3 -right-3 bg-card rounded-full p-1.5 shadow-lg"><X className="w-5 h-5" /></button>
            <img src={previewDoc} alt="Document" className="max-w-full max-h-[80vh] rounded-xl" />
          </div>
        </div>
      )}

      {/* Rejection reason modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => { setRejectingId(null); setRejectReason(""); }}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl border border-border" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground">Reject Vehicle</h3>
            <p className="text-sm text-muted-foreground">Provide a reason so the driver knows what to fix.</p>
            <div className="space-y-2">
              {["Blurry or unreadable document", "Wrong document uploaded", "Expired document", "Missing required document"].map((r) => (
                <button key={r} onClick={() => setRejectReason(r)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${rejectReason === r ? "bg-primary/10 text-primary font-semibold border border-primary/30" : "bg-surface text-foreground hover:bg-surface/80 border border-border"}`}>
                  {r}
                </button>
              ))}
            </div>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Or type a custom reason..." className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" rows={2} />
            <div className="flex gap-3">
              <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-surface text-foreground border border-border">Cancel</button>
              <button onClick={() => rejectVehicle(rejectingId, rejectReason)} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-destructive text-destructive-foreground">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk update modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowBulkModal(false)}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Bulk Update</h3>
                <p className="text-sm text-muted-foreground">{selectedIds.size} vehicle{selectedIds.size !== 1 ? "s" : ""} selected</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Set Company (updates driver's profile)</label>
                <select value={bulkCompanyId} onChange={(e) => setBulkCompanyId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">— Don't change —</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Set Center Code (auto-increment from start)</label>
                <input
                  type="number"
                  value={bulkCenterCodeStart}
                  onChange={(e) => setBulkCenterCodeStart(e.target.value)}
                  placeholder="e.g. 100 → assigns 100, 101, 102..."
                  className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {bulkCenterCodeStart && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Will assign codes {bulkCenterCodeStart} through {parseInt(bulkCenterCodeStart) + selectedIds.size - 1}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowBulkModal(false)} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-surface text-foreground border border-border">Cancel</button>
              <button onClick={handleBulkUpdate} disabled={bulkApplying || (!bulkCompanyId && !bulkCenterCodeStart)}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50">
                {bulkApplying ? "Applying..." : "Apply Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">All Vehicles</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {vehicles.length} vehicles</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <button onClick={() => setShowBulkModal(true)} className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-xl text-xs font-semibold">
              <Building2 className="w-3.5 h-3.5" /> Bulk Update ({selectedIds.size})
            </button>
          )}
          <input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvImport(f); e.target.value = ""; }} />
          <button onClick={downloadSampleCsv} className="flex items-center gap-1.5 bg-surface text-foreground border border-border px-3 py-2 rounded-xl text-xs font-semibold hover:bg-muted transition-colors">
            <Download className="w-3.5 h-3.5" /> Sample
          </button>
          <button onClick={() => csvInputRef.current?.click()} disabled={importing} className="flex items-center gap-1.5 bg-surface text-foreground border border-border px-3 py-2 rounded-xl text-xs font-semibold hover:bg-muted transition-colors">
            <Upload className="w-3.5 h-3.5" /> {importing ? "Importing..." : "Import CSV"}
          </button>
          <button onClick={() => { showForm ? resetForm() : setShowForm(true); }} className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-xl text-xs font-semibold">
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showForm ? "Cancel" : "Add Vehicle"}
          </button>
        </div>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div id="admin-vehicles-edit-form" className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">{editingId ? "Edit Vehicle" : "New Vehicle"}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {formFields.map((f) => (
              <div key={f.key}>
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <input value={(form as any)[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} className="w-full mt-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            ))}
            <div>
              <label className="text-xs font-medium text-muted-foreground">Center Code</label>
              <input value={form.center_code} onChange={(e) => setForm({ ...form, center_code: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 1, 2, 3..." className="w-full mt-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vehicle Type</label>
              <select value={form.vehicle_type_id} onChange={(e) => setForm({ ...form, vehicle_type_id: e.target.value })} className="w-full mt-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select type</option>
                {vehicleTypes.map((vt) => (<option key={vt.id} value={vt.id}>{vt.name}</option>))}
              </select>
            </div>
            <div className="relative">
              <label className="text-xs font-medium text-muted-foreground">Assign Driver</label>
              <input
                value={form.driver_id ? (() => { const d = drivers.find(d => d.id === form.driver_id); return d ? `${d.first_name} ${d.last_name} (${d.phone_number})` : ""; })() : driverSearch}
                onChange={(e) => { setDriverSearch(e.target.value); setForm({ ...form, driver_id: "" }); }}
                placeholder="Search by name or number..."
                className="w-full mt-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {driverSearch.length > 0 && !form.driver_id && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  <button onClick={() => { setForm({ ...form, driver_id: "" }); setDriverSearch(""); }} className="w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-surface border-b border-border">Unassigned</button>
                  {drivers.filter(d => {
                    const q = driverSearch.toLowerCase();
                    return `${d.first_name} ${d.last_name}`.toLowerCase().includes(q) || (d.phone_number || "").includes(q);
                  }).slice(0, 20).map((d) => (
                    <button key={d.id} onClick={() => { setForm({ ...form, driver_id: d.id }); setDriverSearch(""); }} className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-surface border-b border-border last:border-0">
                      {d.first_name} {d.last_name} <span className="text-muted-foreground">({d.phone_number})</span>
                    </button>
                  ))}
                </div>
              )}
              {form.driver_id && (
                <button onClick={() => { setForm({ ...form, driver_id: "" }); setDriverSearch(""); }} className="absolute right-3 top-[calc(50%+4px)] text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
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
                <button key={key} type="button" onClick={() => { setUploadTarget(key); setTimeout(() => fileInputRef.current?.click(), 50); }} disabled={uploading === key} className="flex flex-col items-center gap-1.5 p-3 bg-surface border border-border rounded-xl hover:border-primary/50 transition-colors">
                  {(form as any)[key] ? (
                    <img src={(form as any)[key]} alt={label} className="w-14 h-10 object-cover rounded-lg" />
                  ) : (
                    <div className="w-14 h-10 rounded-lg bg-muted flex items-center justify-center"><Icon className="w-4 h-4 text-muted-foreground" /></div>
                  )}
                  <span className="text-[10px] font-medium text-muted-foreground text-center">{uploading === key ? "Uploading..." : label}</span>
                </button>
              ))}
              {/* Use Default button for empty fields */}
              {["registration_url", "insurance_url", "image_url"].some(k => !(form as any)[k]) && (
                <button type="button" onClick={() => {
                  const updated = { ...form };
                  if (!updated.registration_url) updated.registration_url = DEFAULT_VEHICLE_IMAGE;
                  if (!updated.insurance_url) updated.insurance_url = DEFAULT_VEHICLE_IMAGE;
                  if (!updated.image_url) updated.image_url = DEFAULT_VEHICLE_IMAGE;
                  setForm(updated);
                  toast({ title: "Default image applied to empty fields" });
                }} className="flex flex-col items-center gap-1.5 p-3 bg-accent/30 border border-dashed border-primary/30 rounded-xl hover:bg-accent/50 transition-colors col-span-3">
                  <Image className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-semibold text-primary">Use Default for Empty</span>
                </button>
              )}
            </div>
          </div>
          <button onClick={handleSubmit} className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-semibold">{editingId ? "Update Vehicle" : "Save Vehicle"}</button>
        </div>
      )}

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by plate, make, model, driver, or center code..." className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {statusChips.map((s) => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                statusFilter === s.value ? `${s.color} ring-2 ring-primary/30 shadow-sm` : "bg-surface text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}>
              {s.label}
              {s.value !== "all" && <span className="ml-1.5 text-[10px] opacity-70">({vehicles.filter(v => s.value === "online" ? (v.driver_id && onlineDriverIds.has(v.driver_id)) : v.vehicle_status === s.value).length})</span>}
            </button>
          ))}
          <span className="text-muted-foreground text-[10px] mx-1">|</span>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-1.5 bg-surface border border-border rounded-full text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">All Types</option>
            {vehicleTypes.map(vt => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
          </select>
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="px-3 py-1.5 bg-surface border border-border rounded-full text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">All Companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button onClick={() => setShowBulkModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-xl text-xs font-semibold hover:bg-primary/20 transition-colors">
            <Building2 className="w-3.5 h-3.5" /> Assign Company & Code
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* Vehicle Table */}
      <div className="bg-card border border-border rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-surface/50">
              <th className="px-4 py-3 w-10">
                <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
                {selectedIds.size === visibleVehicles.length && visibleVehicles.length > 0 ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                </button>
              </th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Vehicle</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Type</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Driver</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Code</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Company</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Docs</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Status</th>
              <th className="text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center">
                <Car className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No vehicles found</p>
              </td></tr>
            ) : (
              visibleVehicles.map((v) => {
                const driverName = v.profiles ? `${v.profiles.first_name} ${v.profiles.last_name}` : null;
                const driverInitials = v.profiles ? `${v.profiles.first_name?.[0] || ""}${v.profiles.last_name?.[0] || ""}` : null;
                const companyName = v.profiles?.company_name || companies.find(c => c.id === v.profiles?.company_id)?.name || "—";
                const docCount = [v.registration_url, v.insurance_url, v.image_url].filter(Boolean).length;

                return (
                  <tr key={v.id} className={`border-b border-border hover:bg-surface/30 transition-colors ${selectedIds.has(v.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelect(v.id)} className="text-muted-foreground hover:text-foreground">
                        {selectedIds.has(v.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-8 rounded-xl bg-surface border border-border overflow-hidden shrink-0 flex items-center justify-center">
                          <img src={v.image_url || DEFAULT_VEHICLE_IMAGE} alt="Vehicle" className="w-full h-full object-cover cursor-pointer" onClick={() => v.image_url && setPreviewDoc(v.image_url)} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-foreground">{v.plate_number}</p>
                          <p className="text-[10px] text-muted-foreground">{[v.make, v.model, v.color].filter(Boolean).join(" · ") || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/50 text-accent-foreground">{v.vehicle_types?.name || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      {driverName ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-[9px] font-bold text-primary">{driverInitials}</span>
                          </div>
                          <span className="text-sm text-foreground">{driverName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {v.center_code ? (
                        <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-surface border border-border text-foreground">{v.center_code}</span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{companyName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {v.registration_url && <button onClick={() => setPreviewDoc(v.registration_url)} className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 rounded-md hover:opacity-80 font-semibold">Reg</button>}
                        {v.insurance_url && <button onClick={() => setPreviewDoc(v.insurance_url)} className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400 rounded-md hover:opacity-80 font-semibold">Ins</button>}
                        {v.image_url && <button onClick={() => setPreviewDoc(v.image_url)} className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 rounded-md hover:opacity-80 font-semibold">Img</button>}
                        {docCount === 0 && <span className="text-[10px] text-muted-foreground">0/3</span>}
                        {docCount > 0 && docCount < 3 && <span className="text-[10px] text-muted-foreground ml-0.5">{docCount}/3</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                        v.vehicle_status === "approved" ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" :
                        v.vehicle_status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" :
                        "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400"
                      }`}>
                        {v.vehicle_status === "approved" ? <ShieldCheck className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {v.vehicle_status === "approved" ? "Approved" : v.vehicle_status === "rejected" ? "Rejected" : "Pending"}
                      </span>
                      {v.vehicle_status === "rejected" && v.rejection_reason && (
                        <p className="text-[9px] text-muted-foreground italic mt-0.5 max-w-[120px] truncate" title={v.rejection_reason}>{v.rejection_reason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {(v.vehicle_status === "pending" || v.vehicle_status === "rejected") && (
                          <button onClick={() => approveVehicle(v.id)} className="text-[11px] font-bold text-primary-foreground bg-green-600 px-2.5 py-1.5 rounded-xl hover:bg-green-700 transition-colors">Approve</button>
                        )}
                        {v.vehicle_status === "pending" && (
                          <button onClick={() => { setRejectingId(v.id); setRejectReason(""); }} className="text-[11px] font-medium text-destructive hover:underline">Reject</button>
                        )}
                        {v.blocked_until && new Date(v.blocked_until) > new Date() ? (
                          <button
                            title="Unblock vehicle"
                            onClick={async () => {
                              const { error } = await supabase.from("vehicles").update({ blocked_until: null } as any).eq("id", v.id);
                              if (!error) {
                                toast({ title: "Vehicle unblocked", description: `${v.center_code || v.plate_number} unblocked` });
                                fetchAll();
                              }
                            }}
                            className="w-7 h-7 rounded-lg bg-green-600/15 flex items-center justify-center text-green-600 hover:bg-green-600/25"
                          >
                            <ShieldOff className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <>
                            <button
                              title="Block for 3 hours"
                              onClick={async () => {
                                const blockedUntil = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
                                const { error } = await supabase.from("vehicles").update({ blocked_until: blockedUntil } as any).eq("id", v.id);
                                if (!error) {
                                  toast({ title: "Vehicle blocked", description: `${v.center_code || v.plate_number} blocked for 3 hours` });
                                  fetchAll();
                                } else {
                                  toast({ title: "Block failed", variant: "destructive" });
                                }
                              }}
                              className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center text-muted-foreground hover:text-warning"
                            >
                              <Timer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Block permanently"
                              onClick={async () => {
                                if (!confirm(`Permanently block ${v.center_code || v.plate_number}? It won't receive any requests until manually unblocked.`)) return;
                                const blockedUntil = "9999-12-31T23:59:59.999Z";
                                const { error } = await supabase.from("vehicles").update({ blocked_until: blockedUntil } as any).eq("id", v.id);
                                if (!error) {
                                  toast({ title: "Vehicle permanently blocked", description: `${v.center_code || v.plate_number} blocked until unblocked` });
                                  fetchAll();
                                } else {
                                  toast({ title: "Block failed", variant: "destructive" });
                                }
                              }}
                              className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center text-muted-foreground hover:text-destructive"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <button onClick={() => openEdit(v)} className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center text-muted-foreground hover:text-primary"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(v.id)} className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {!loading && filtered.length > visibleVehicles.length && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Showing {visibleVehicles.length} of {filtered.length} vehicles</p>
            <button
              onClick={() => setVisibleVehicleCount((prev) => prev + VEHICLES_PAGE_SIZE)}
              className="px-4 py-2 rounded-xl bg-surface text-foreground text-xs font-semibold hover:bg-muted transition-colors"
            >
              Load more vehicles
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminVehicles;
