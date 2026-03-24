import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Pencil, Trash2, X, FileUp, Upload, Loader2, UserCheck, UserX, CheckSquare, Square } from "lucide-react";

type StatusFilter = "all" | "Active" | "Inactive";

const statusChips: { value: StatusFilter; label: string; color: string }[] = [
  { value: "all", label: "All", color: "bg-surface text-foreground" },
  { value: "Active", label: "Active", color: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" },
  { value: "Inactive", label: "Inactive", color: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" },
];

const AdminPassengers = () => {
  const [passengers, setPassengers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: "", last_name: "", phone_number: "", email: "", country_code: "960", gender: "1",
  });
  const [showImport, setShowImport] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<any>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchPassengers = async () => {
    setLoading(true);
    let all: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data } = await supabase.from("profiles").select("*").eq("user_type", "Rider").order("created_at", { ascending: false }).range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    setPassengers(all);
    setLoading(false);
  };

  useEffect(() => { fetchPassengers(); }, []);

  const filtered = passengers.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || p.first_name?.toLowerCase().includes(q) || p.last_name?.toLowerCase().includes(q) || p.phone_number?.includes(q) || p.email?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  };

  const bulkSetStatus = async (status: string) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("profiles").update({ status }).in("id", ids);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: `${ids.length} passenger(s) set to ${status}` }); setSelected(new Set()); fetchPassengers(); }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} passenger(s)? This cannot be undone.`)) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("profiles").delete().in("id", ids);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: `${ids.length} passenger(s) deleted` }); setSelected(new Set()); fetchPassengers(); }
  };

  const openEdit = (p: any) => {
    setEditForm({
      first_name: p.first_name || "", last_name: p.last_name || "",
      phone_number: p.phone_number || "", email: p.email || "",
      country_code: p.country_code || "960", gender: p.gender || "1",
    });
    setEditingId(p.id);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("profiles").update({
      first_name: editForm.first_name, last_name: editForm.last_name,
      phone_number: editForm.phone_number, email: editForm.email || null,
      country_code: editForm.country_code, gender: editForm.gender,
    }).eq("id", editingId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Passenger updated!" }); setEditingId(null); fetchPassengers(); }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
    await supabase.from("profiles").update({ status: newStatus }).eq("id", id);
    toast({ title: `Passenger ${newStatus === "Active" ? "activated" : "deactivated"}` });
    fetchPassengers();
  };

  const deletePassenger = async (id: string) => {
    if (!confirm("Delete this passenger? This cannot be undone.")) return;
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); }
    else { toast({ title: "Passenger deleted" }); fetchPassengers(); }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setCsvResult(null);
    try {
      const text = await file.text();
      const { data, error } = await supabase.functions.invoke("import-passengers-csv", { body: { csv: text } });
      if (error) { toast({ title: "Import failed", description: error.message, variant: "destructive" }); setCsvResult({ error: error.message }); }
      else { setCsvResult(data); toast({ title: "Import complete", description: `${data.created} passengers created` }); fetchPassengers(); }
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); setCsvResult({ error: err.message }); }
    setCsvImporting(false);
    e.target.value = "";
  };

  const inputCls = "w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-5">
      {/* Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditingId(null)}>
          <div className="bg-card rounded-2xl p-6 w-full max-w-md space-y-4 border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">Edit Passenger</h3>
              <button onClick={() => setEditingId(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">First Name</label>
                <input className={inputCls} value={editForm.first_name} onChange={(e) => setEditForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Last Name</label>
                <input className={inputCls} value={editForm.last_name} onChange={(e) => setEditForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Country Code</label>
                <input className={inputCls} value={editForm.country_code} onChange={(e) => setEditForm(f => ({ ...f, country_code: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <input className={inputCls} value={editForm.phone_number} onChange={(e) => setEditForm(f => ({ ...f, phone_number: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <input className={inputCls} value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Gender</label>
                <select className={inputCls} value={editForm.gender} onChange={(e) => setEditForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="1">Male</option>
                  <option value="2">Female</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-surface border border-border rounded-xl text-sm font-semibold text-foreground hover:bg-muted">Cancel</button>
              <button onClick={saveEdit} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-extrabold text-foreground">Passengers</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} of {passengers.length} passengers</p>
        </div>
        <button onClick={() => setShowImport(!showImport)} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity">
          <FileUp className="w-3.5 h-3.5" /> Import CSV
        </button>
      </div>

      {/* CSV Import Panel */}
      {showImport && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Import Passengers from CSV</h3>
            <button onClick={() => { setShowImport(false); setCsvResult(null); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-sm text-muted-foreground">Upload a CSV with passenger data. Existing passengers (by phone) will be skipped.</p>
          <div className="flex items-center gap-3">
            <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-all ${csvImporting ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
              {csvImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {csvImporting ? "Importing..." : "Upload CSV"}
              <input type="file" accept=".csv" className="hidden" onChange={handleCsvImport} disabled={csvImporting} />
            </label>
          </div>
          <div className="bg-surface rounded-lg p-3">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Expected CSV columns:</p>
            <p className="text-xs text-muted-foreground font-mono">first_name, last_name, phone_number, email, gender, country_code, status</p>
          </div>
          {csvResult && !csvResult.error && (
            <div className="bg-surface rounded-lg p-4 space-y-1">
              <p className="text-sm font-semibold text-foreground">✅ Import Complete</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <span className="text-muted-foreground">Total rows:</span><span className="font-medium text-foreground">{csvResult.total_rows}</span>
                <span className="text-muted-foreground">Created:</span><span className="font-medium text-foreground">{csvResult.created}</span>
                <span className="text-muted-foreground">Skipped:</span><span className="font-medium text-foreground">{csvResult.skipped}</span>
              </div>
              {csvResult.errors?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-destructive">Errors:</p>
                  {csvResult.errors.map((err: string, i: number) => <p key={i} className="text-xs text-destructive">{err}</p>)}
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or email..."
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5">
        {statusChips.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              statusFilter === s.value
                ? `${s.color} ring-2 ring-primary/30 shadow-sm`
                : "bg-surface text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {s.label}
            {s.value !== "all" && (
              <span className="ml-1.5 text-[10px] opacity-70">
                ({passengers.filter(p => p.status === s.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
          <span className="text-sm font-semibold text-foreground">{selected.size} selected</span>
          <div className="flex-1" />
          <button onClick={() => bulkSetStatus("Active")} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-xl text-xs font-semibold hover:bg-primary/20 transition-colors">
            <UserCheck className="w-3.5 h-3.5" /> Activate
          </button>
          <button onClick={() => bulkSetStatus("Inactive")} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground rounded-xl text-xs font-semibold hover:bg-muted/80 transition-colors">
            <UserX className="w-3.5 h-3.5" /> Deactivate
          </button>
          <button onClick={bulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 text-destructive rounded-xl text-xs font-semibold hover:bg-destructive/20 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 w-10">
                    <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground">
                      {selected.size === filtered.length && filtered.length > 0 ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Passenger</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Phone</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Gender</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Joined</th>
                  <th className="text-right px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No passengers found</td></tr>
                ) : filtered.map((p) => (
                  <tr key={p.id} className={`hover:bg-muted/20 transition-colors ${selected.has(p.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelect(p.id)} className="text-muted-foreground hover:text-foreground">
                        {selected.has(p.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {p.first_name?.[0]}{p.last_name?.[0]}
                        </div>
                        <span className="font-medium text-foreground">{p.first_name} {p.last_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">+{p.country_code} {p.phone_number}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.email || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.gender === "1" ? "Male" : p.gender === "2" ? "Female" : p.gender || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        p.status === "Active" ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => toggleStatus(p.id, p.status)} className="p-1.5 rounded-lg hover:bg-surface transition-colors" title={p.status === "Active" ? "Deactivate" : "Activate"}>
                          {p.status === "Active" ? <UserX className="w-4 h-4 text-muted-foreground" /> : <UserCheck className="w-4 h-4 text-primary" />}
                        </button>
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-surface transition-colors"><Pencil className="w-4 h-4 text-muted-foreground" /></button>
                        <button onClick={() => deletePassenger(p.id)} className="p-1.5 rounded-lg hover:bg-surface transition-colors"><Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPassengers;
