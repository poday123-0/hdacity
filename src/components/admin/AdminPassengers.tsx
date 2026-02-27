import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Pencil, Trash2, X, FileUp, Upload, Download, Loader2, UserCheck, UserX } from "lucide-react";

const AdminPassengers = () => {
  const [passengers, setPassengers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: "", last_name: "", phone_number: "", email: "", country_code: "960", gender: "1",
  });
  const [showImport, setShowImport] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<any>(null);

  const fetchPassengers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_type", "Rider")
      .order("created_at", { ascending: false });
    setPassengers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchPassengers(); }, []);

  const filtered = passengers.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.first_name?.toLowerCase().includes(q) ||
      p.last_name?.toLowerCase().includes(q) ||
      p.phone_number?.includes(q) ||
      p.email?.toLowerCase().includes(q)
    );
  });

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
      first_name: editForm.first_name,
      last_name: editForm.last_name,
      phone_number: editForm.phone_number,
      email: editForm.email || null,
      country_code: editForm.country_code,
      gender: editForm.gender,
    }).eq("id", editingId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Passenger updated!" });
      setEditingId(null);
      fetchPassengers();
    }
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
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Passenger deleted" });
      fetchPassengers();
    }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setCsvResult(null);
    try {
      const text = await file.text();
      // Parse CSV locally and insert as Riders
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { throw new Error("No data rows found"); }
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
      let created = 0, skipped = 0;
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ""; });

        const phone = (row.phone_number || row.phone || row.mobile || "").replace(/\D/g, "");
        const firstName = row.first_name || row.firstname || "";
        if (!phone || !firstName) { skipped++; errors.push(`Row ${i}: missing phone or name`); continue; }

        // Check if exists
        const { data: existing } = await supabase.from("profiles").select("id").eq("phone_number", phone).eq("user_type", "Rider").maybeSingle();
        if (existing) { skipped++; continue; }

        const { error } = await supabase.from("profiles").insert({
          phone_number: phone,
          first_name: firstName,
          last_name: row.last_name || row.lastname || "",
          email: row.email || null,
          country_code: row.country_code || "960",
          gender: row.gender || "1",
          user_type: "Rider",
          status: row.status || "Active",
        });
        if (error) { skipped++; errors.push(`Row ${i}: ${error.message}`); }
        else { created++; }
      }

      setCsvResult({ total_rows: lines.length - 1, created, skipped, errors: errors.slice(0, 20) });
      toast({ title: "Import complete", description: `${created} passengers created, ${skipped} skipped` });
      fetchPassengers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setCsvResult({ error: err.message });
    }
    setCsvImporting(false);
    e.target.value = "";
  };

  const inputCls = "w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-6">
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

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Passengers</h2>
          <p className="text-sm text-muted-foreground">{passengers.length} total passengers</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowImport(!showImport)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
            <FileUp className="w-4 h-4" />Import CSV
          </button>
        </div>
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by name, phone, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-surface rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Passenger</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Phone</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Gender</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Joined</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-surface/50">
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
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        p.status === "Active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
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
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-surface transition-colors" title="Edit">
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button onClick={() => deletePassenger(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      No passengers found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPassengers;