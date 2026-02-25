import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, UserCheck, UserX, Pencil, Trash2, X, Upload, Eye, Download, FileUp, Loader2, Plus, ChevronDown, ChevronUp, Car } from "lucide-react";

const emptyVehicleForm = { plate_number: "", make: "", model: "", color: "", year: "", vehicle_type_id: "" };

const AdminDrivers = () => {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [driverVehicles, setDriverVehicles] = useState<Record<string, any[]>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({
    first_name: "", last_name: "", email: "", phone_number: "",
    company_id: "", monthly_fee: "", bank_id: "", bank_account_number: "", bank_account_name: "",
    license_front_url: "", license_back_url: "", id_card_front_url: "", id_card_back_url: "",
  });
  const [uploading, setUploading] = useState<string | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<any>(null);
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [driversRes, banksRes, companiesRes, vtRes, vehiclesRes] = await Promise.all([
      (() => {
        let q = supabase.from("profiles").select("*").ilike("user_type", "%Driver%").order("created_at", { ascending: false });
        if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
        return q;
      })(),
      supabase.from("banks").select("*").eq("is_active", true).order("name"),
      supabase.from("companies").select("*").eq("is_active", true).order("name"),
      supabase.from("vehicle_types").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("vehicles").select("*, vehicle_types(name)").order("created_at", { ascending: false }),
    ]);
    setDrivers(driversRes.data || []);
    setBanks(banksRes.data || []);
    setCompanies(companiesRes.data || []);
    setVehicleTypes(vtRes.data || []);

    // Group vehicles by driver_id
    const vMap: Record<string, any[]> = {};
    (vehiclesRes.data || []).forEach((v: any) => {
      if (v.driver_id) {
        if (!vMap[v.driver_id]) vMap[v.driver_id] = [];
        vMap[v.driver_id].push(v);
      }
    });
    setDriverVehicles(vMap);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [search]);

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
    if (newStatus === "Active") {
      const driver = drivers.find(d => d.id === id);
      const docCount = [driver?.license_front_url, driver?.license_back_url, driver?.id_card_front_url, driver?.id_card_back_url].filter(Boolean).length;
      if (docCount < 4) {
        toast({ title: "Cannot approve", description: `Driver has only ${docCount}/4 documents uploaded. All documents are required.`, variant: "destructive" });
        return;
      }
    }
    await supabase.from("profiles").update({ status: newStatus }).eq("id", id);
    toast({ title: `Driver ${newStatus === "Active" ? "approved ✅" : "deactivated"}` });
    fetchAll();
  };

  const openEdit = (d: any) => {
    setEditForm({
      first_name: d.first_name || "", last_name: d.last_name || "", email: d.email || "",
      phone_number: d.phone_number || "", company_id: d.company_id || "", monthly_fee: d.monthly_fee?.toString() || "0",
      bank_id: d.bank_id || "", bank_account_number: d.bank_account_number || "", bank_account_name: d.bank_account_name || "",
      license_front_url: d.license_front_url || "", license_back_url: d.license_back_url || "",
      id_card_front_url: d.id_card_front_url || "", id_card_back_url: d.id_card_back_url || "",
    });
    setEditingId(d.id);
  };

  const uploadDoc = async (field: string, file: File) => {
    setUploading(field);
    const ext = file.name.split(".").pop();
    const path = `driver-docs/${editingId}/${field}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("driver-documents").upload(path, file);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(null);
      return;
    }
    const { data: urlData } = supabase.storage.from("driver-documents").getPublicUrl(path);
    setEditForm((prev: any) => ({ ...prev, [field]: urlData.publicUrl }));
    setUploading(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const bankObj = banks.find((b) => b.id === editForm.bank_id);
    const { error } = await supabase.from("profiles").update({
      first_name: editForm.first_name, last_name: editForm.last_name, email: editForm.email || null, phone_number: editForm.phone_number,
      company_id: editForm.company_id || null, company_name: companies.find((c) => c.id === editForm.company_id)?.name || "",
      monthly_fee: parseFloat(editForm.monthly_fee) || 0,
      bank_id: editForm.bank_id || null, bank_name: bankObj?.name || "",
      bank_account_number: editForm.bank_account_number || "", bank_account_name: editForm.bank_account_name || "",
      license_front_url: editForm.license_front_url || null, license_back_url: editForm.license_back_url || null,
      id_card_front_url: editForm.id_card_front_url || null, id_card_back_url: editForm.id_card_back_url || null,
    }).eq("id", editingId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Driver updated!" });
      setEditingId(null);
      fetchAll();
    }
  };

  const deleteDriver = async (id: string) => {
    if (!confirm("Remove this driver profile? This cannot be undone.")) return;
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Driver removed" });
      fetchAll();
    }
  };

  // Vehicle CRUD
  const openVehicleForm = (driverId: string, v?: any) => {
    setExpandedDriver(driverId);
    setShowVehicleForm(true);
    if (v) {
      setEditingVehicleId(v.id);
      setVehicleForm({
        plate_number: v.plate_number || "", make: v.make || "", model: v.model || "",
        color: v.color || "", year: v.year?.toString() || "", vehicle_type_id: v.vehicle_type_id || "",
      });
    } else {
      setEditingVehicleId(null);
      setVehicleForm(emptyVehicleForm);
    }
  };

  const saveVehicle = async () => {
    if (!expandedDriver || !vehicleForm.plate_number) return;
    const payload = {
      plate_number: vehicleForm.plate_number,
      make: vehicleForm.make, model: vehicleForm.model, color: vehicleForm.color,
      year: vehicleForm.year ? parseInt(vehicleForm.year) : null,
      vehicle_type_id: vehicleForm.vehicle_type_id || null,
      driver_id: expandedDriver,
    };
    const { error } = editingVehicleId
      ? await supabase.from("vehicles").update(payload).eq("id", editingVehicleId)
      : await supabase.from("vehicles").insert(payload);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingVehicleId ? "Vehicle updated" : "Vehicle added" });
      setShowVehicleForm(false);
      setEditingVehicleId(null);
      setVehicleForm(emptyVehicleForm);
      fetchAll();
    }
  };

  const deleteVehicle = async (id: string) => {
    if (!confirm("Delete this vehicle?")) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Vehicle deleted" }); fetchAll(); }
  };

  const toggleVehicleActive = async (id: string, current: boolean) => {
    await supabase.from("vehicles").update({ is_active: !current }).eq("id", id);
    toast({ title: current ? "Vehicle deactivated" : "Vehicle activated" });
    fetchAll();
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setCsvResult(null);
    try {
      const text = await file.text();
      const { data, error } = await supabase.functions.invoke("import-drivers-csv", { body: { csv: text } });
      if (error) {
        toast({ title: "Import failed", description: error.message, variant: "destructive" });
        setCsvResult({ error: error.message });
      } else {
        setCsvResult(data);
        toast({ title: "Import complete", description: `${data.drivers_created} drivers, ${data.vehicles_created} vehicles created` });
        fetchAll();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setCsvResult({ error: err.message });
    }
    setCsvImporting(false);
    e.target.value = "";
  };

  const inputCls = "w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50";
  const selectCls = "w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

  const DocUpload = ({ field, label }: { field: string; label: string }) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        {editForm[field] ? (
          <button onClick={() => setPreviewImg(editForm[field])} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Eye className="w-3 h-3" /> View
          </button>
        ) : <span className="text-xs text-muted-foreground">Not uploaded</span>}
        <label className="flex items-center gap-1 px-2 py-1 bg-surface border border-border rounded-lg text-xs text-muted-foreground cursor-pointer hover:text-foreground">
          <Upload className="w-3 h-3" />
          {uploading === field ? "..." : "Upload"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadDoc(field, e.target.files[0])} disabled={uploading === field} />
        </label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Image preview modal */}
      {previewImg && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreviewImg(null)}>
          <div className="relative max-w-2xl max-h-[80vh]">
            <button onClick={() => setPreviewImg(null)} className="absolute -top-3 -right-3 bg-card rounded-full p-1"><X className="w-5 h-5" /></button>
            <img src={previewImg} alt="Document" className="max-w-full max-h-[80vh] rounded-xl" />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Drivers & Vehicles</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowImport(!showImport)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
            <FileUp className="w-4 h-4" />Import CSV
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search drivers..." className="pl-10 pr-4 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
      </div>

      {/* CSV Import Panel */}
      {showImport && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Import Drivers & Vehicles from CSV</h3>
            <button onClick={() => { setShowImport(false); setCsvResult(null); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-sm text-muted-foreground">Upload a CSV file with driver and vehicle data. Existing drivers (by phone number) will be skipped. Vehicles are linked automatically.</p>
          <div className="flex items-center gap-3">
            <a href="/sample-drivers-import.csv" download className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors">
              <Download className="w-4 h-4" />Download Sample CSV
            </a>
            <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-all ${csvImporting ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
              {csvImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {csvImporting ? "Importing..." : "Upload CSV"}
              <input type="file" accept=".csv" className="hidden" onChange={handleCsvImport} disabled={csvImporting} />
            </label>
          </div>
          <div className="bg-surface rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Expected CSV columns:</p>
            <p className="text-xs text-muted-foreground font-mono">first_name, last_name, phone_number, email, gender, country_code, status, company, monthly_fee, plate_number, vehicle_type, make, model, color, year</p>
          </div>
          {csvResult && !csvResult.error && (
            <div className="bg-surface rounded-lg p-4 space-y-1">
              <p className="text-sm font-semibold text-foreground">✅ Import Complete</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <span className="text-muted-foreground">Total rows:</span><span className="font-medium text-foreground">{csvResult.total_rows}</span>
                <span className="text-muted-foreground">Drivers created:</span><span className="font-medium text-foreground">{csvResult.drivers_created}</span>
                <span className="text-muted-foreground">Drivers skipped:</span><span className="font-medium text-foreground">{csvResult.drivers_skipped}</span>
                <span className="text-muted-foreground">Vehicles created:</span><span className="font-medium text-foreground">{csvResult.vehicles_created}</span>
                <span className="text-muted-foreground">Vehicles skipped:</span><span className="font-medium text-foreground">{csvResult.vehicles_skipped}</span>
              </div>
              {csvResult.errors?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-destructive">Errors:</p>
                  {csvResult.errors.map((err: string, i: number) => (
                    <p key={i} className="text-xs text-destructive">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          {csvResult?.error && (
            <div className="bg-destructive/10 rounded-lg p-3">
              <p className="text-sm text-destructive">❌ {csvResult.error}</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Driver Form */}
      {editingId && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Edit Driver</h3>
            <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-muted-foreground">First Name</label><input value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Last Name</label><input value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Email</label><input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Phone</label><input value={editForm.phone_number} onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })} className={inputCls} /></div>
          </div>
          <h4 className="text-sm font-semibold text-foreground pt-2">Company & Monthly Fee</h4>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-medium text-muted-foreground">Company / Taxi Center</label>
              <select value={editForm.company_id} onChange={(e) => setEditForm({ ...editForm, company_id: e.target.value })} className={selectCls}>
                <option value="">— Select Company —</option>
                {companies.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Monthly Fee (MVR)</label><input type="number" value={editForm.monthly_fee} onChange={(e) => setEditForm({ ...editForm, monthly_fee: e.target.value })} className={inputCls} /></div>
          </div>
          <h4 className="text-sm font-semibold text-foreground pt-2">Bank Account</h4>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="text-xs font-medium text-muted-foreground">Bank</label>
              <select value={editForm.bank_id} onChange={(e) => setEditForm({ ...editForm, bank_id: e.target.value })} className={selectCls}>
                <option value="">— Select Bank —</option>
                {banks.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>
            <div><label className="text-xs font-medium text-muted-foreground">Account Number</label><input value={editForm.bank_account_number} onChange={(e) => setEditForm({ ...editForm, bank_account_number: e.target.value })} placeholder="7730000000000" className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Account Name</label><input value={editForm.bank_account_name} onChange={(e) => setEditForm({ ...editForm, bank_account_name: e.target.value })} placeholder="Full name on account" className={inputCls} /></div>
          </div>
          <h4 className="text-sm font-semibold text-foreground pt-2">Driver Documents</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <DocUpload field="license_front_url" label="License Front" />
            <DocUpload field="license_back_url" label="License Back" />
            <DocUpload field="id_card_front_url" label="ID Card Front" />
            <DocUpload field="id_card_back_url" label="ID Card Back" />
          </div>
          <button onClick={saveEdit} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">Save Changes</button>
        </div>
      )}

      {/* Drivers Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Name</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Phone</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Company</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Vehicles</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Docs</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : drivers.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No drivers found</td></tr>
            ) : (
              drivers.map((d) => {
                const docCount = [d.license_front_url, d.license_back_url, d.id_card_front_url, d.id_card_back_url].filter(Boolean).length;
                const companyName = companies.find((c) => c.id === d.company_id)?.name || d.company_name || "—";
                const vehicles = driverVehicles[d.id] || [];
                const isExpanded = expandedDriver === d.id;
                return (
                  <>
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{d.first_name} {d.last_name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">+960 {d.phone_number}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{companyName}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedDriver(isExpanded ? null : d.id)}
                          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                        >
                          <Car className="w-3.5 h-3.5" />
                          {vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${docCount === 4 ? "bg-green-100 text-green-700" : docCount > 0 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                            {docCount}/4
                          </span>
                          {docCount > 0 && <button onClick={() => openEdit(d)} className="text-xs text-primary hover:underline ml-1">View</button>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                          d.status === "Active" ? "bg-green-100 text-green-700" : 
                          d.status === "Pending" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                        }`}>
                          {d.status === "Active" ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {d.status !== "Active" && docCount === 4 ? (
                            <button onClick={() => toggleStatus(d.id, d.status)} className="text-xs font-semibold text-primary-foreground bg-primary px-3 py-1.5 rounded-lg hover:opacity-90">Approve</button>
                          ) : d.status === "Active" ? (
                            <button onClick={() => toggleStatus(d.id, d.status)} className="text-xs font-medium text-destructive hover:underline">Deactivate</button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Docs incomplete</span>
                          )}
                          <button onClick={() => openEdit(d)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => deleteDriver(d.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                    {/* Expanded vehicles row */}
                    {isExpanded && (
                      <tr key={`${d.id}-vehicles`} className="border-b border-border bg-surface/50">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vehicles for {d.first_name}</p>
                              <button onClick={() => openVehicleForm(d.id)} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                                <Plus className="w-3 h-3" /> Add Vehicle
                              </button>
                            </div>

                            {/* Vehicle form */}
                            {showVehicleForm && expandedDriver === d.id && (
                              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                                <p className="text-xs font-semibold text-foreground">{editingVehicleId ? "Edit Vehicle" : "New Vehicle"}</p>
                                <div className="grid grid-cols-3 gap-3">
                                  <div>
                                    <label className="text-xs text-muted-foreground">Plate *</label>
                                    <input value={vehicleForm.plate_number} onChange={(e) => setVehicleForm({ ...vehicleForm, plate_number: e.target.value })} placeholder="P-1234" className={inputCls} />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Type</label>
                                    <select value={vehicleForm.vehicle_type_id} onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_type_id: e.target.value })} className={selectCls}>
                                      <option value="">Select</option>
                                      {vehicleTypes.map((vt) => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Make</label>
                                    <input value={vehicleForm.make} onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })} placeholder="Toyota" className={inputCls} />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Model</label>
                                    <input value={vehicleForm.model} onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })} placeholder="Yaris" className={inputCls} />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Color</label>
                                    <input value={vehicleForm.color} onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })} placeholder="White" className={inputCls} />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Year</label>
                                    <input value={vehicleForm.year} onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value })} placeholder="2023" className={inputCls} />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => { setShowVehicleForm(false); setEditingVehicleId(null); }} className="px-4 py-2 bg-surface text-foreground rounded-lg text-xs font-semibold">Cancel</button>
                                  <button onClick={saveVehicle} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold">{editingVehicleId ? "Update" : "Add"}</button>
                                </div>
                              </div>
                            )}

                            {/* Vehicle list */}
                            {vehicles.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">No vehicles assigned to this driver</p>
                            ) : (
                              <div className="grid gap-2">
                                {vehicles.map((v) => (
                                  <div key={v.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-3">
                                      <Car className="w-4 h-4 text-primary" />
                                      <div>
                                        <p className="text-sm font-medium text-foreground">{v.plate_number} — {v.make} {v.model} {v.color}</p>
                                        <p className="text-xs text-muted-foreground">{v.vehicle_types?.name || "No type"} {v.year ? `• ${v.year}` : ""}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${v.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                        {v.is_active ? "Active" : "Inactive"}
                                      </span>
                                      <button onClick={() => toggleVehicleActive(v.id, v.is_active)} className="text-[10px] text-primary hover:underline">
                                        {v.is_active ? "Deactivate" : "Activate"}
                                      </button>
                                      <button onClick={() => openVehicleForm(d.id, v)} className="text-muted-foreground hover:text-primary"><Pencil className="w-3.5 h-3.5" /></button>
                                      <button onClick={() => deleteVehicle(v.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDrivers;
