import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, UserCheck, UserX, Pencil, Trash2, X, Upload, Eye } from "lucide-react";

const AdminDrivers = () => {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
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

  const fetchAll = async () => {
    setLoading(true);
    const [driversRes, banksRes, companiesRes] = await Promise.all([
      (() => {
        let q = supabase.from("profiles").select("*").ilike("user_type", "%Driver%").order("created_at", { ascending: false });
        if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
        return q;
      })(),
      supabase.from("banks").select("*").eq("is_active", true).order("name"),
      supabase.from("companies").select("*").eq("is_active", true).order("name"),
    ]);
    setDrivers(driversRes.data || []);
    setBanks(banksRes.data || []);
    setCompanies(companiesRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [search]);

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
    await supabase.from("profiles").update({ status: newStatus }).eq("id", id);
    toast({ title: `Driver ${newStatus === "Active" ? "activated" : "deactivated"}` });
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
        <h2 className="text-2xl font-bold text-foreground">Drivers</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search drivers..." className="pl-10 pr-4 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
      </div>

      {editingId && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Edit Driver</h3>
            <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">First Name</label>
              <input value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Last Name</label>
              <input value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <input value={editForm.phone_number} onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })} className={inputCls} />
            </div>
          </div>

          {/* Company & Fee */}
          <h4 className="text-sm font-semibold text-foreground pt-2">Company & Monthly Fee</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company / Taxi Center</label>
              <select value={editForm.company_id} onChange={(e) => setEditForm({ ...editForm, company_id: e.target.value })} className={selectCls}>
                <option value="">— Select Company —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Monthly Fee (MVR)</label>
              <input type="number" value={editForm.monthly_fee} onChange={(e) => setEditForm({ ...editForm, monthly_fee: e.target.value })} className={inputCls} />
            </div>
          </div>

          {/* Bank Account */}
          <h4 className="text-sm font-semibold text-foreground pt-2">Bank Account</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Bank</label>
              <select value={editForm.bank_id} onChange={(e) => setEditForm({ ...editForm, bank_id: e.target.value })} className={selectCls}>
                <option value="">— Select Bank —</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Account Number</label>
              <input value={editForm.bank_account_number} onChange={(e) => setEditForm({ ...editForm, bank_account_number: e.target.value })} placeholder="7730000000000" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Account Name</label>
              <input value={editForm.bank_account_name} onChange={(e) => setEditForm({ ...editForm, bank_account_name: e.target.value })} placeholder="Full name on account" className={inputCls} />
            </div>
          </div>

          {/* Documents */}
          <h4 className="text-sm font-semibold text-foreground pt-2">Driver Documents</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <DocUpload field="license_front_url" label="License Front" />
            <DocUpload field="license_back_url" label="License Back" />
            <DocUpload field="id_card_front_url" label="ID Card Front" />
            <DocUpload field="id_card_back_url" label="ID Card Back" />
          </div>

          <button onClick={saveEdit} className="bg-primary text-primary-foreground px-6 py-2 rounded-xl text-sm font-semibold">
            Save Changes
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Name</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Phone</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Company</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Monthly Fee</th>
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
                return (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{d.first_name} {d.last_name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">+960 {d.phone_number}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{companyName}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{d.monthly_fee > 0 ? `${d.monthly_fee} MVR` : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${docCount === 4 ? "bg-green-100 text-green-700" : docCount > 0 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                        {docCount}/4
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${d.status === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {d.status === "Active" ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleStatus(d.id, d.status)} className="text-xs font-medium text-primary hover:underline">
                          {d.status === "Active" ? "Deactivate" : "Activate"}
                        </button>
                        <button onClick={() => openEdit(d)} className="text-muted-foreground hover:text-primary"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => deleteDriver(d.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
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
