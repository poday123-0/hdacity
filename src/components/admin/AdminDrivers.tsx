import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, UserCheck, UserX, Pencil, Trash2, X } from "lucide-react";

const AdminDrivers = () => {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone_number: "" });

  const fetchDrivers = async () => {
    setLoading(true);
    let query = supabase.from("profiles").select("*").ilike("user_type", "%Driver%").order("created_at", { ascending: false });
    if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
    const { data } = await query;
    setDrivers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchDrivers(); }, [search]);

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
    await supabase.from("profiles").update({ status: newStatus }).eq("id", id);
    toast({ title: `Driver ${newStatus === "Active" ? "activated" : "deactivated"}` });
    fetchDrivers();
  };

  const openEdit = (d: any) => {
    setEditForm({
      first_name: d.first_name || "",
      last_name: d.last_name || "",
      email: d.email || "",
      phone_number: d.phone_number || "",
    });
    setEditingId(d.id);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("profiles").update({
      first_name: editForm.first_name,
      last_name: editForm.last_name,
      email: editForm.email || null,
    }).eq("id", editingId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Driver updated!" });
      setEditingId(null);
      fetchDrivers();
    }
  };

  const deleteDriver = async (id: string) => {
    if (!confirm("Remove this driver profile? This cannot be undone.")) return;
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Driver removed" });
      fetchDrivers();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Drivers</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drivers..."
            className="pl-10 pr-4 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Inline edit form */}
      {editingId && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Edit Driver</h3>
            <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "first_name", label: "First Name" },
              { key: "last_name", label: "Last Name" },
              { key: "email", label: "Email" },
              { key: "phone_number", label: "Phone (read-only)" },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <input
                  value={(editForm as any)[f.key]}
                  onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })}
                  disabled={f.key === "phone_number"}
                  className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                />
              </div>
            ))}
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
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Email</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : drivers.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No drivers found</td></tr>
            ) : (
              drivers.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{d.first_name} {d.last_name}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">+960 {d.phone_number}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{d.email || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                      d.status === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}>
                      {d.status === "Active" ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleStatus(d.id, d.status)} className="text-xs font-medium text-primary hover:underline">
                        {d.status === "Active" ? "Deactivate" : "Activate"}
                      </button>
                      <button onClick={() => openEdit(d)} className="text-muted-foreground hover:text-primary">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteDriver(d.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDrivers;
