import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Clock, Shield, Plus, Trash2, Save, ToggleLeft, ToggleRight } from "lucide-react";

const AdminDutyHours = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("today");

  // IP Allowlist
  const [ipEnabled, setIpEnabled] = useState(false);
  const [allowedIps, setAllowedIps] = useState<string[]>([]);
  const [newIp, setNewIp] = useState("");
  const [ipLoading, setIpLoading] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    let query = supabase
      .from("dispatch_duty_sessions")
      .select("*")
      .order("clock_in", { ascending: false })
      .limit(200);

    const now = new Date();
    if (dateFilter === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      query = query.gte("clock_in", start.toISOString());
    } else if (dateFilter === "week") {
      const start = new Date(now.getTime() - 7 * 86400000);
      query = query.gte("clock_in", start.toISOString());
    } else if (dateFilter === "month") {
      const start = new Date(now.getTime() - 30 * 86400000);
      query = query.gte("clock_in", start.toISOString());
    }

    const { data } = await query;

    // Enrich with dispatcher names
    const ids = [...new Set((data || []).map((s: any) => s.dispatcher_id))];
    let profileMap: Record<string, any> = {};
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone_number")
        .in("id", ids);
      (profiles || []).forEach((p: any) => {
        profileMap[p.id] = p;
      });
    }

    setSessions(
      (data || []).map((s: any) => ({
        ...s,
        dispatcher: profileMap[s.dispatcher_id] || null,
      }))
    );
    setLoading(false);
  };

  const fetchIpSettings = async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "dispatch_allowed_ips")
      .single();
    if (data?.value) {
      const config = data.value as any;
      setIpEnabled(config?.enabled === true);
      setAllowedIps(Array.isArray(config?.ips) ? config.ips : []);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchIpSettings();
  }, [dateFilter]);

  const saveIpSettings = async () => {
    setIpLoading(true);
    const value = { enabled: ipEnabled, ips: allowedIps };
    const { data: existing } = await supabase
      .from("system_settings")
      .select("id")
      .eq("key", "dispatch_allowed_ips")
      .single();

    if (existing) {
      await supabase
        .from("system_settings")
        .update({ value: value as any, updated_at: new Date().toISOString() })
        .eq("key", "dispatch_allowed_ips");
    } else {
      await supabase.from("system_settings").insert({
        key: "dispatch_allowed_ips",
        value: value as any,
        description: "Allowed IP addresses for dispatch dashboard access",
      });
    }
    toast({ title: "IP settings saved" });
    setIpLoading(false);
  };

  const addIp = () => {
    const ip = newIp.trim();
    if (!ip) return;
    if (allowedIps.includes(ip)) {
      toast({ title: "IP already in list", variant: "destructive" });
      return;
    }
    setAllowedIps([...allowedIps, ip]);
    setNewIp("");
  };

  const formatDuration = (clockIn: string, clockOut: string | null) => {
    const start = new Date(clockIn).getTime();
    const end = clockOut ? new Date(clockOut).getTime() : Date.now();
    const diff = end - start;
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  // Group sessions by dispatcher
  const dispatcherSummary = sessions.reduce((acc: any, s: any) => {
    const id = s.dispatcher_id;
    if (!acc[id]) {
      acc[id] = {
        dispatcher: s.dispatcher,
        totalMs: 0,
        sessionCount: 0,
      };
    }
    const start = new Date(s.clock_in).getTime();
    const end = s.clock_out ? new Date(s.clock_out).getTime() : Date.now();
    acc[id].totalMs += end - start;
    acc[id].sessionCount++;
    return acc;
  }, {} as Record<string, any>);

  return (
    <div className="space-y-6">
      {/* IP Restriction Settings */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Dispatch IP Restriction
          </h3>
          <button
            onClick={() => setIpEnabled(!ipEnabled)}
            className="flex items-center gap-1.5 text-xs font-medium"
          >
            {ipEnabled ? (
              <ToggleRight className="w-6 h-6 text-primary" />
            ) : (
              <ToggleLeft className="w-6 h-6 text-muted-foreground" />
            )}
            {ipEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        {ipEnabled && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
                placeholder="Enter IP address (e.g. 203.0.113.5)"
                className="flex-1 px-3 py-2 text-xs bg-surface border border-border rounded-lg text-foreground placeholder:text-muted-foreground"
                onKeyDown={(e) => e.key === "Enter" && addIp()}
              />
              <button onClick={addIp} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {allowedIps.length > 0 && (
              <div className="space-y-1">
                {allowedIps.map((ip, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-surface rounded-lg">
                    <code className="text-xs text-foreground">{ip}</code>
                    <button
                      onClick={() => setAllowedIps(allowedIps.filter((_, j) => j !== i))}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={saveIpSettings}
          disabled={ipLoading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          Save IP Settings
        </button>
      </div>

      {/* Duty Hours Summary */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Dispatcher Duty Hours
          </h3>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="text-xs bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
        </div>

        {/* Summary cards */}
        {Object.keys(dispatcherSummary).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {Object.entries(dispatcherSummary).map(([id, info]: [string, any]) => {
              const hrs = Math.floor(info.totalMs / 3600000);
              const mins = Math.floor((info.totalMs % 3600000) / 60000);
              return (
                <div key={id} className="bg-surface rounded-lg p-3 text-center">
                  <p className="text-xs font-semibold text-foreground">
                    {info.dispatcher ? `${info.dispatcher.first_name} ${info.dispatcher.last_name}` : "Unknown"}
                  </p>
                  <p className="text-lg font-bold text-primary">{hrs}h {mins}m</p>
                  <p className="text-[10px] text-muted-foreground">{info.sessionCount} session{info.sessionCount !== 1 ? "s" : ""}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Session list */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-2 font-medium">Dispatcher</th>
                <th className="text-left py-2 px-2 font-medium">Clock In</th>
                <th className="text-left py-2 px-2 font-medium">Clock Out</th>
                <th className="text-left py-2 px-2 font-medium">Duration</th>
                <th className="text-left py-2 px-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Loading...</td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No duty sessions found</td></tr>
              ) : sessions.map((s: any) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-surface/50">
                  <td className="py-2 px-2 font-medium text-foreground">
                    {s.dispatcher ? `${s.dispatcher.first_name} ${s.dispatcher.last_name}` : s.dispatcher_id.slice(0, 8)}
                  </td>
                  <td className="py-2 px-2 text-muted-foreground">
                    {new Date(s.clock_in).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                  </td>
                  <td className="py-2 px-2">
                    {s.clock_out ? (
                      <span className="text-muted-foreground">
                        {new Date(s.clock_out).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                      </span>
                    ) : (
                      <span className="text-success font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                        Active
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 font-semibold text-foreground">{formatDuration(s.clock_in, s.clock_out)}</td>
                  <td className="py-2 px-2 text-muted-foreground font-mono text-[10px]">{s.ip_address || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDutyHours;
