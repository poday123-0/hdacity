import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Plus, Trash2, Shield, Radio, X, UserCheck, Loader2, UserPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const AVAILABLE_PERMISSIONS = [
  { key: "dispatch_trips", label: "Dispatch Trips" },
  { key: "manage_trips", label: "Manage Trips" },
  { key: "manage_drivers", label: "Manage Drivers" },
  { key: "manage_vehicles", label: "Manage Vehicles" },
  { key: "manage_passengers", label: "Manage Passengers" },
  { key: "manage_fares", label: "Manage Fares" },
  { key: "manage_billing", label: "Manage Billing" },
  { key: "manage_locations", label: "Manage Locations" },
  { key: "manage_companies", label: "Manage Companies" },
  { key: "manage_lost_items", label: "Manage Lost Items" },
  { key: "manage_notifications", label: "Manage Notifications" },
  { key: "manage_sos", label: "Manage SOS Alerts" },
  { key: "manage_settings", label: "Manage Settings" },
  { key: "view_live_map", label: "View Live Map" },
  { key: "view_dashboard", label: "View Dashboard" },
  { key: "manage_wallets", label: "Manage Wallets" },
  { key: "manage_banks", label: "Manage Banks" },
];

const AdminUsers = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "dispatcher">("dispatcher");
  const [adding, setAdding] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [lookedUpProfile, setLookedUpProfile] = useState<any>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [editingPermissions, setEditingPermissions] = useState<string | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [editBypassOtp, setEditBypassOtp] = useState<string>("");
  const [notFound, setNotFound] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [bypassOtp, setBypassOtp] = useState<string>("");

  const getCallerId = () => {
    try {
      const stored = localStorage.getItem("hda_admin");
      if (stored) return JSON.parse(stored).id;
    } catch {}
    return null;
  };

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("manage-user-role", {
      body: { action: "list", caller_id: getCallerId() },
    });
    if (error) {
      console.error("Fetch users error:", error);
      setUsers([]);
    } else {
      setUsers(data?.data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const lookupPhone = async () => {
    if (!addPhone || addPhone.length < 7) return;
    setLookingUp(true);
    setLookedUpProfile(null);
    setNotFound(false);
    const { data, error } = await supabase.functions.invoke("lookup-profile", {
      body: { phone_number: addPhone },
    });
    if (error || !data || data.error || !data.found || !data.profile) {
      setLookedUpProfile(null);
      setNotFound(true);
    } else {
      setLookedUpProfile(data.profile);
      setNotFound(false);
    }
    setLookingUp(false);
  };

  useEffect(() => {
    setLookedUpProfile(null);
    setNotFound(false);
    setNewFirstName("");
    setNewLastName("");
    if (addPhone.length === 7) {
      lookupPhone();
    }
  }, [addPhone]);

  const resetForm = () => {
    setShowAdd(false);
    setAddPhone("");
    setLookedUpProfile(null);
    setNotFound(false);
    setNewFirstName("");
    setNewLastName("");
    setSelectedPermissions([]);
    setBypassOtp("");
  };

  const addUser = async () => {
    // If no existing profile, require name fields
    if (!lookedUpProfile && notFound) {
      if (!newFirstName.trim() || !newLastName.trim()) {
        toast({ title: "Enter first and last name", variant: "destructive" });
        return;
      }
    } else if (!lookedUpProfile) {
      toast({ title: "Look up a user first", variant: "destructive" });
      return;
    }

    setAdding(true);

    const body: any = {
      action: "add",
      phone_number: addPhone,
      role: addRole,
      permissions: selectedPermissions,
      bypass_otp: bypassOtp.trim() || null,
    };

    // If creating new user
    if (!lookedUpProfile && notFound) {
      body.first_name = newFirstName.trim();
      body.last_name = newLastName.trim();
    }

    const { data, error } = await supabase.functions.invoke("manage-user-role", { body: { ...body, caller_id: getCallerId() } });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "User added!", description: `${data.profile.first_name} ${data.profile.last_name} is now a ${addRole}` });
      resetForm();
      fetchUsers();
    }
    setAdding(false);
  };

  const removeRole = async (roleId: string, userName: string) => {
    if (!confirm(`Remove role from ${userName}?`)) return;

    const { data, error } = await supabase.functions.invoke("manage-user-role", {
      body: { action: "remove", role_id: roleId, caller_id: getCallerId() },
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Role removed" });
      fetchUsers();
    }
  };

  const updatePermissions = async (roleId: string) => {
    const { data, error } = await supabase.functions.invoke("manage-user-role", {
      body: { action: "update_permissions", role_id: roleId, permissions: editPermissions, bypass_otp: editBypassOtp.trim() || null, caller_id: getCallerId() },
    });
    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Updated" });
      setEditingPermissions(null);
      fetchUsers();
    }
  };

  const togglePermission = (key: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(key) ? list.filter(p => p !== key) : [...list, key]);
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

  const canAdd = lookedUpProfile || (notFound && newFirstName.trim() && newLastName.trim());

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

      {showAdd && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Add Admin or Dispatcher</h3>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-sm text-muted-foreground">Enter a phone number. If the user doesn't exist, you can create a new profile.</p>

          {/* Phone + Role row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
              <div className="relative">
                <input
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value.replace(/\D/g, "").slice(0, 7))}
                  placeholder="7XXXXXX"
                  className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {lookingUp && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              </div>
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
              <button onClick={addUser} disabled={adding || !canAdd} className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50">
                {adding ? "Adding..." : "Add User"}
              </button>
            </div>
          </div>

          {/* Looked-up profile display */}
          {lookedUpProfile && (
            <div className="flex items-center gap-3 p-3 bg-accent/30 border border-accent rounded-lg">
              <UserCheck className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">{lookedUpProfile.first_name} {lookedUpProfile.last_name}</p>
                <p className="text-xs text-muted-foreground">+960 {lookedUpProfile.phone_number} · Existing user</p>
              </div>
            </div>
          )}

          {/* Not found — create new user form */}
          {notFound && !lookedUpProfile && addPhone.length === 7 && (
            <div className="p-4 bg-muted/50 border border-border rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <UserPlus className="w-4 h-4 text-primary" />
                No user found — create a new profile
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">First Name</label>
                  <input
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Last Name</label>
                  <input
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">A new account will be created with phone +960 {addPhone}</p>
            </div>
          )}

          {/* Permissions */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Permissions</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {AVAILABLE_PERMISSIONS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-foreground cursor-pointer p-2 rounded-lg hover:bg-muted/50">
                  <Checkbox
                    checked={selectedPermissions.includes(p.key)}
                    onCheckedChange={() => togglePermission(p.key, selectedPermissions, setSelectedPermissions)}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Name</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Phone</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Role</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Permissions</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Added</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No users found</td></tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {u.profile ? (
                      <div>
                        <span>{u.profile.first_name} {u.profile.last_name}</span>
                        {u.profile.user_type && (
                          <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            u.profile.user_type === "Driver" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                          }`}>
                            {u.profile.user_type}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">No profile</span>
                    )}
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
                  <td className="px-4 py-3">
                    {editingPermissions === u.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-1">
                          {AVAILABLE_PERMISSIONS.map((p) => (
                            <label key={p.key} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                              <Checkbox
                                checked={editPermissions.includes(p.key)}
                                onCheckedChange={() => togglePermission(p.key, editPermissions, setEditPermissions)}
                              />
                              {p.label}
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => updatePermissions(u.id)} className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded">Save</button>
                          <button onClick={() => setEditingPermissions(null)} className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingPermissions(u.id); setEditPermissions(u.permissions || []); }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {(u.permissions && u.permissions.length > 0)
                          ? u.permissions.map((p: string) => AVAILABLE_PERMISSIONS.find(ap => ap.key === p)?.label || p).join(", ")
                          : "No permissions set — click to edit"
                        }
                      </button>
                    )}
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
