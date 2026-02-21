import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Plus, Pencil, Trash2, X, Upload, Building } from "lucide-react";

const AdminCompanies = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", logo_url: "", monthly_fee: "0", discount_pct: "0", fee_free: false });
  const [uploading, setUploading] = useState(false);

  const fetchCompanies = async () => {
    setLoading(true);
    let query = supabase.from("companies").select("*").order("name");
    if (search) query = query.ilike("name", `%${search}%`);
    const { data } = await query;
    setCompanies(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchCompanies(); }, [search]);

  const uploadLogo = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `company-logos/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("driver-documents").upload(path, file);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("driver-documents").getPublicUrl(path);
    setForm({ ...form, logo_url: urlData.publicUrl });
    setUploading(false);
  };

  const openEdit = (c: any) => {
    setForm({ name: c.name, logo_url: c.logo_url || "", monthly_fee: c.monthly_fee?.toString() || "0", discount_pct: c.discount_pct?.toString() || "0", fee_free: c.fee_free || false });
    setEditingId(c.id);
    setShowForm(true);
  };

  const openNew = () => {
    setForm({ name: "", logo_url: "", monthly_fee: "0", discount_pct: "0", fee_free: false });
    setEditingId(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    const payload = { name: form.name, logo_url: form.logo_url || null, monthly_fee: parseFloat(form.monthly_fee) || 0, discount_pct: parseFloat(form.discount_pct) || 0, fee_free: form.fee_free };
    if (editingId) {
      const { error } = await supabase.from("companies").update(payload).eq("id", editingId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Company updated" });
    } else {
      const { error } = await supabase.from("companies").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Company added" });
    }
    setShowForm(false);
    setEditingId(null);
    fetchCompanies();
  };

  const deleteCompany = async (id: string) => {
    if (!confirm("Delete this company?")) return;
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Company deleted" });
    fetchCompanies();
  };

  const inputCls = "w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Companies / Taxi Centers</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies..." className="pl-10 pr-4 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <button onClick={openNew} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
            <Plus className="w-4 h-4" /> Add Company
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{editingId ? "Edit" : "Add"} Company</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Male Taxi Center" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Logo</label>
              <div className="flex items-center gap-3 mt-1">
                {form.logo_url && <img src={form.logo_url} alt="Logo" className="w-10 h-10 object-contain rounded-lg border border-border" />}
                <label className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                  <Upload className="w-4 h-4" />
                  {uploading ? "Uploading..." : "Upload Logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} disabled={uploading} />
                </label>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Monthly Fee (MVR)</label>
              <input type="number" value={form.monthly_fee} onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })} className={inputCls} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Discount %</label>
              <input type="number" min="0" max="100" value={form.discount_pct} onChange={(e) => setForm({ ...form, discount_pct: e.target.value })} className={inputCls} placeholder="0" />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.fee_free} onChange={(e) => setForm({ ...form, fee_free: e.target.checked })} className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                <span className="text-sm font-medium text-foreground">Fee Free (no monthly fee for drivers in this company)</span>
              </label>
            </div>
          </div>
          <button onClick={save} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">Save</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <p className="text-muted-foreground col-span-full text-center py-8">Loading...</p>
        ) : companies.length === 0 ? (
          <p className="text-muted-foreground col-span-full text-center py-8">No companies added yet</p>
        ) : companies.map((c) => (
          <div key={c.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center overflow-hidden shrink-0">
              {c.logo_url ? <img src={c.logo_url} alt={c.name} className="w-full h-full object-contain" /> : <Building className="w-6 h-6 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{c.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {c.fee_free ? (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">Fee Free</span>
                ) : c.monthly_fee > 0 ? (
                  <span className="text-xs text-muted-foreground">{c.monthly_fee} MVR/mo</span>
                ) : null}
                {c.discount_pct > 0 && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{c.discount_pct}% discount</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => openEdit(c)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => deleteCompany(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminCompanies;
