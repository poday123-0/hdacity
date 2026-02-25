import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Plus, Trash2, Shield, Radio, X } from "lucide-react";

const AdminUsers = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "dispatcher">("dispatcher");
  const [adding, setAdding] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("id, user_id, role, created_at")
      .in("role", ["admin", "dispatcher"] as any)
      .order("created_at", { ascending: false });

    if (roles && roles.length > 0) {
      const userIds = roles.map((r: any) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone_number, email")
        .in("id", userIds);

      const merged = roles.map((r: any) => {
        const p = profiles?.find((p: any) => p.id === r.user_id);
        return { ...r, profile: p };
      });
      setUsers(merged);
    } else {
      setUsers([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const addUser = async () => {
    if (!addPhone || addPhone.length < 7) {
      toast({ title: "Enter a valid phone number", variant: "destructive" });
      return;
    }
    setAdding(true);

    // Find profile by phone
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("phone_number", addPhone);

    if (!profiles || profiles.length === 0) {
      toast({ title: "Profile not found", description: "No user found with this phone number. They need to register first.", variant: "destructive" });
      setAdding(false);
      return;
    }

    const profile = profiles[0];

    // Check if already has this role
    const { data: existing } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", profile.id)
      .eq("role", addRole as any);

    if (existing && existing.length > 0) {
      toast({ title: "Already assigned", description: `${profile.first_name} already has the ${addRole} role`, variant: "destructive" });
      setAdding(false);
      return;
    }

    const { error } = await supabase.from("user_roles").insert({
      user_id: profile.id,
      role: addRole,
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "User added!", description: `${profile.first_name} ${profile.last_name} is now a ${addRole}` });
      setShowAdd(false);
      setAddPhone("");
      fetchUsers();
    }
    setAdding(false);
  };

  const removeRole = async (roleId: string, userName: string) => {
    if (!confirm(`Remove role from ${userName}?`)) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Role removed" });
      fetchUsers();
    }
  };

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.profile?.first_name?.toLowerCase().includes(q) ||
      u.profile?.last_name?.toLowerCase().includes(q) ||
      u.profile?.phone_number?.includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Admins & Dispatchers</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> Add User
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-10 pr-4 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
      </div>

      {/* Add user form */}
      {showAdd && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Add Admin or Dispatcher</h3>
            <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-sm text-muted-foreground">The user must already have a registered profile (as driver or passenger).</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
              <input
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value.replace(/\D/g, "").slice(0, 7))}
                placeholder="7XXXXXX"
                className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as "admin" | "dispatcher")}
                className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="dispatcher">Dispatcher / Operator</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={addUser} disabled={adding} className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50">
                {adding ? "Adding..." : "Add User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Name</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Phone</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Role</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Added</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No users found</td></tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {u.profile?.first_name} {u.profile?.last_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    +960 {u.profile?.phone_number}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                      u.role === "admin" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"
                    }`}>
                      {u.role === "admin" ? <Shield className="w-3 h-3" /> : <Radio className="w-3 h-3" />}
                      {u.role === "admin" ? "Admin" : "Dispatcher"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => removeRole(u.id, `${u.profile?.first_name} ${u.profile?.last_name}`)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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

export default AdminUsers;
