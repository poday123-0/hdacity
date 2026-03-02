import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Trash2, Power, PowerOff, Send } from "lucide-react";

type DeviceToken = {
  id: string;
  user_id: string;
  user_type: string;
  device_type: string;
  token: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ProfileLite = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
};

const maskToken = (token: string) => {
  if (!token) return "";
  if (token.length <= 16) return token;
  return `${token.slice(0, 12)}...${token.slice(-8)}`;
};

const AdminDeviceTokens = () => {
  const [tokens, setTokens] = useState<DeviceToken[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [userTypeFilter, setUserTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendingTestId, setSendingTestId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);

    const { data: tokenRows, error: tokenError } = await supabase
      .from("device_tokens")
      .select("id, user_id, user_type, device_type, token, is_active, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (tokenError) {
      toast({ title: "Failed to load tokens", description: tokenError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const safeTokens = (tokenRows as DeviceToken[]) || [];
    setTokens(safeTokens);

    const userIds = [...new Set(safeTokens.map((t) => t.user_id))];
    if (userIds.length === 0) {
      setProfilesById({});
      setLoading(false);
      return;
    }

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, phone_number")
      .in("id", userIds);

    const mapped: Record<string, ProfileLite> = {};
    (profileRows as ProfileLite[] | null)?.forEach((p) => {
      mapped[p.id] = p;
    });
    setProfilesById(mapped);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredTokens = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tokens.filter((t) => {
      if (userTypeFilter !== "all" && t.user_type !== userTypeFilter) return false;
      if (statusFilter === "active" && !t.is_active) return false;
      if (statusFilter === "inactive" && t.is_active) return false;

      if (!q) return true;

      const profile = profilesById[t.user_id];
      const fullName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim().toLowerCase();
      const phone = (profile?.phone_number || "").toLowerCase();
      return (
        fullName.includes(q) ||
        phone.includes(q) ||
        t.user_id.toLowerCase().includes(q) ||
        t.token.toLowerCase().includes(q)
      );
    });
  }, [profilesById, search, statusFilter, tokens, userTypeFilter]);

  const updateTokenStatus = async (id: string, nextActive: boolean) => {
    setBusyId(id);
    const { error } = await supabase
      .from("device_tokens")
      .update({ is_active: nextActive, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, is_active: nextActive } : t)));
      toast({ title: nextActive ? "Token activated" : "Token deactivated" });
    }
    setBusyId(null);
  };

  const deleteToken = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.from("device_tokens").delete().eq("id", id);

    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      setTokens((prev) => prev.filter((t) => t.id !== id));
      toast({ title: "Token deleted" });
    }
    setBusyId(null);
  };

  const sendTestPush = async (t: DeviceToken) => {
    setSendingTestId(t.id);
    try {
      const profile = profilesById[t.user_id];
      const name = `${profile?.first_name || "User"} ${profile?.last_name || ""}`.trim();
      const { data, error } = await supabase.functions.invoke("send-push-notification", {
        body: {
          user_ids: [t.user_id],
          title: "🔔 Test Push Notification",
          body: `Hi ${name}, this is a test notification from HDA Admin at ${new Date().toLocaleTimeString()}.`,
          data: { type: "trip_requested" },
        },
      });

      if (error) {
        toast({ title: "Failed to send", description: error.message, variant: "destructive" });
      } else {
        const sent = data?.sent ?? 0;
        const failed = data?.failed ?? 0;
        const details = data?.details || [];
        const detailStr = details.map((d: any) =>
          `${d.device_type}: ${d.ok ? "✅" : `❌ ${d.error || d.status}`}`
        ).join(", ");
        toast({
          title: sent > 0 ? "✅ Test push sent!" : "⚠️ No delivery",
          description: `Sent: ${sent}, Failed: ${failed}, Tokens: ${data?.total_tokens ?? 0}${detailStr ? ` — ${detailStr}` : ""}`,
          variant: sent > 0 ? "default" : "destructive",
        });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Unknown error", variant: "destructive" });
    }
    setSendingTestId(null);
  };

  const activeCount = filteredTokens.filter((t) => t.is_active).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Device Tokens</h2>
          <p className="text-sm text-muted-foreground">Debug push delivery by viewing, activating, deactivating, or deleting registered tokens.</p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-surface text-foreground text-sm border border-border hover:bg-muted transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, token, user id"
          className="md:col-span-2 w-full px-3 py-2.5 rounded-xl bg-surface border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={userTypeFilter}
            onChange={(e) => setUserTypeFilter(e.target.value)}
            className="w-full px-2 py-2.5 rounded-xl bg-surface border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All types</option>
            <option value="driver">Driver</option>
            <option value="passenger">Passenger</option>
            <option value="admin">Admin</option>
            <option value="dispatcher">Dispatcher</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-2 py-2.5 rounded-xl bg-surface border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Shown</p>
          <p className="text-xl font-bold text-foreground">{filteredTokens.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Active</p>
          <p className="text-xl font-bold text-foreground">{activeCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filteredTokens.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground bg-card border border-border rounded-xl">No tokens found</div>
      ) : (
        <div className="space-y-2">
          {filteredTokens.map((t) => {
            const profile = profilesById[t.user_id];
            const label = `${profile?.first_name || "Unknown"} ${profile?.last_name || ""}`.trim();
            const isBusy = busyId === t.id;

            return (
              <div key={t.id} className="bg-card border border-border rounded-xl p-3 md:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground text-sm">{label}</p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-muted-foreground uppercase">{t.user_type}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-muted-foreground uppercase">{t.device_type}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.is_active ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                        {t.is_active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground mt-1">Phone: {profile?.phone_number || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground mt-1 break-all">Token: {maskToken(t.token)}</p>
                    <p className="text-[11px] text-muted-foreground/80 mt-1">Updated: {new Date(t.updated_at).toLocaleString()}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      disabled={isBusy || sendingTestId === t.id}
                      onClick={() => sendTestPush(t)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 disabled:opacity-50"
                    >
                      {sendingTestId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Test Push
                    </button>
                    <button
                      disabled={isBusy}
                      onClick={() => updateTokenStatus(t.id, !t.is_active)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-surface border border-border text-xs text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      {t.is_active ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                      {t.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      disabled={isBusy}
                      onClick={() => deleteToken(t.id)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-destructive/10 text-destructive text-xs hover:opacity-80 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminDeviceTokens;
