import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Plus, Pencil, Trash2, X, Upload, Building2 } from "lucide-react";
import { compressImage } from "@/lib/image-compress";

const AdminBanks = () => {
  const [banks, setBanks] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", logo_url: "" });
  const [uploading, setUploading] = useState(false);
  const [favaraLogoUrl, setFavaraLogoUrl] = useState<string | null>(null);
  const [swipeLogoUrl, setSwipeLogoUrl] = useState<string | null>(null);

  const fetchBanks = async () => {
    setLoading(true);
    let query = supabase.from("banks").select("*").order("name");
    if (search) query = query.ilike("name", `%${search}%`);
    const { data } = await query;
    setBanks(data || []);
    setLoading(false);
  };

  const fetchFavaraLogo = async () => {
    const { data } = await supabase.from("system_settings").select("value").eq("key", "favara_logo_url").single();
    if (data?.value) setFavaraLogoUrl(data.value as string);
  };

  useEffect(() => { fetchBanks(); fetchFavaraLogo(); }, [search]);

  const uploadLogo = async (rawFile: File) => {
    setUploading(true);
    const file = await compressImage(rawFile);
    const ext = file.name.split(".").pop();
    const path = `bank-logos/${Date.now()}.${ext}`;
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

  const openEdit = (b: any) => {
    setForm({ name: b.name, logo_url: b.logo_url || "" });
    setEditingId(b.id);
    setShowForm(true);
  };

  const openNew = () => {
    setForm({ name: "", logo_url: "" });
    setEditingId(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (editingId) {
      const { error } = await supabase.from("banks").update({ name: form.name, logo_url: form.logo_url || null }).eq("id", editingId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Bank updated" });
    } else {
      const { error } = await supabase.from("banks").insert({ name: form.name, logo_url: form.logo_url || null });
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Bank added" });
    }
    setShowForm(false);
    setEditingId(null);
    fetchBanks();
  };

  const deleteBank = async (id: string) => {
    if (!confirm("Delete this bank?")) return;
    const { error } = await supabase.from("banks").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Bank deleted" });
    fetchBanks();
  };

  const inputCls = "w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Banks</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search banks..." className="pl-10 pr-4 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <button onClick={openNew} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold">
            <Plus className="w-4 h-4" /> Add Bank
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{editingId ? "Edit" : "Add"} Bank</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Bank Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. BML, MIB" />
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
          </div>
          <button onClick={save} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">Save</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <p className="text-muted-foreground col-span-full text-center py-8">Loading...</p>
        ) : banks.length === 0 ? (
          <p className="text-muted-foreground col-span-full text-center py-8">No banks added yet</p>
        ) : banks.map((b) => (
          <div key={b.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center overflow-hidden shrink-0">
              {b.logo_url ? <img src={b.logo_url} alt={b.name} className="w-full h-full object-contain" /> : <Building2 className="w-6 h-6 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{b.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => openEdit(b)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => deleteBank(b.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>

      {/* Favara Logo */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-primary" /> Favara Logo
        </h3>
        <p className="text-xs text-muted-foreground mb-3">Shown next to driver Favara accounts</p>
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-xl bg-surface border-2 border-border flex items-center justify-center overflow-hidden shrink-0">
            {favaraLogoUrl ? <img src={favaraLogoUrl} alt="Favara" className="w-12 h-12 object-contain" /> : <Building2 className="w-8 h-8 text-muted-foreground" />}
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-sm text-foreground font-medium">{favaraLogoUrl ? "Logo uploaded ✓" : "No logo set"}</p>
            <input id="favara-logo-input" type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const path = `branding/favara_${Date.now()}.${file.name.split(".").pop()}`;
              const { error } = await supabase.storage.from("vehicle-images").upload(path, file, { upsert: true });
              if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); return; }
              const { data: urlData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
              // Save to system_settings
              const { data: existing } = await supabase.from("system_settings").select("id").eq("key", "favara_logo_url").single();
              if (existing) {
                await supabase.from("system_settings").update({ value: urlData.publicUrl as any, updated_at: new Date().toISOString() }).eq("key", "favara_logo_url");
              } else {
                await supabase.from("system_settings").insert({ key: "favara_logo_url", value: urlData.publicUrl as any, description: "Favara logo URL" });
              }
              setFavaraLogoUrl(urlData.publicUrl);
              toast({ title: "Favara logo updated!" }); e.target.value = "";
            }} />
            <button onClick={() => (document.getElementById("favara-logo-input") as HTMLInputElement)?.click()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all">
              <Upload className="w-3.5 h-3.5" /> Upload Logo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminBanks;
