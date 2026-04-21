import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Clock, Shield, Plus, Trash2, Save, ToggleLeft, ToggleRight, Pencil, X, Check, DollarSign, TrendingUp, Send, UserCheck, Radio, CheckCircle2, XCircle, Trophy, PackageX } from "lucide-react";

interface DispatcherStats {
  total: number;            // trips created by dispatcher
  assigned: number;         // direct-assigned to a specific driver
  broadcast: number;        // sent to app (broadcast wave)
  completed: number;        // ended successfully
  cancelled: number;        // cancelled or expired
  lostItems: number;        // lost item reports logged by dispatcher
}

interface AdminDutyHoursProps {
  /** When provided, restrict ALL data (sessions + performance stats) to this single dispatcher.
   * Also hides admin-only controls (IP allowlist, Add Session button, salary editing). */
  restrictToDispatcherId?: string;
}

const AdminDutyHours = ({ restrictToDispatcherId }: AdminDutyHoursProps = {}) => {
  const isSelfView = !!restrictToDispatcherId;
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [dispatcherStats, setDispatcherStats] = useState<Record<string, DispatcherStats>>({});

  // IP Allowlist
  const [ipEnabled, setIpEnabled] = useState(false);
  const [allowedIps, setAllowedIps] = useState<string[]>([]);
  const [newIp, setNewIp] = useState("");
  const [ipLoading, setIpLoading] = useState(false);

  // Editing session
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");

  // Salary config per dispatcher
  const [salaryRates, setSalaryRates] = useState<Record<string, number>>({});
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [editSalaryVal, setEditSalaryVal] = useState("");

  // Add session modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [dispatchers, setDispatchers] = useState<any[]>([]);
  const [addDispatcherId, setAddDispatcherId] = useState("");
  const [addDate, setAddDate] = useState("");
  const [addStartTime, setAddStartTime] = useState("");
  const [addEndTime, setAddEndTime] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  // Compute the active date range for filters
  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    if (dateFilter === "today") {
      start = new Date(now); start.setHours(0, 0, 0, 0);
    } else if (dateFilter === "week") {
      start = new Date(now); start.setHours(0, 0, 0, 0);
      const day = start.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diffToMonday);
    } else if (dateFilter === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    } else if (dateFilter === "custom" && customStart) {
      start = new Date(`${customStart}T00:00:00`);
      end = customEnd ? new Date(`${customEnd}T23:59:59`) : null;
    }
    return { start, end };
  }, [dateFilter, customStart, customEnd]);

  const fetchSessions = async () => {
    setLoading(true);

    // Paginate to bypass Supabase's default 1000-row limit so counts are accurate
    const PAGE = 1000;
    let all: any[] = [];
    let from = 0;
    // Hard safety cap: 20k sessions max per filter window (more than enough)
    while (from < 20000) {
      let query = supabase
        .from("dispatch_duty_sessions")
        .select("*")
        .order("clock_in", { ascending: false })
        .range(from, from + PAGE - 1);

      if (restrictToDispatcherId) query = query.eq("dispatcher_id", restrictToDispatcherId);
      if (dateRange.start) query = query.gte("clock_in", dateRange.start.toISOString());
      if (dateRange.end) query = query.lte("clock_in", dateRange.end.toISOString());

      const { data, error } = await query;
      if (error || !data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const ids = [...new Set(all.map((s: any) => s.dispatcher_id))];
    let profileMap: Record<string, any> = {};
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone_number, avatar_url")
        .in("id", ids);
      (profiles || []).forEach((p: any) => {
        profileMap[p.id] = p;
      });
    }

    setSessions(
      all.map((s: any) => ({
        ...s,
        dispatcher: profileMap[s.dispatcher_id] || null,
      }))
    );
    setLoading(false);

    // Now fetch trip-level performance for the same window + dispatchers
    fetchDispatcherStats(ids, dateRange.start, dateRange.end);
  };

  const fetchDispatcherStats = async (dispatcherIds: string[], start: Date | null, end: Date | null) => {
    if (dispatcherIds.length === 0) {
      setDispatcherStats({});
      return;
    }

    // Paginate trips to bypass Supabase's 1000-row default — guarantees accurate counts
    const PAGE = 1000;
    let allTrips: any[] = [];
    let from = 0;
    // Safety cap: 200k trips per query window
    while (from < 200000) {
      let q = supabase
        .from("trips")
        .select("created_by, dispatch_type, target_driver_id, driver_id, status")
        .in("created_by", dispatcherIds)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (start) q = q.gte("created_at", start.toISOString());
      if (end) q = q.lte("created_at", end.toISOString());

      const { data, error } = await q;
      if (error || !data || data.length === 0) break;
      allTrips = allTrips.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    const stats: Record<string, DispatcherStats> = {};
    dispatcherIds.forEach(id => {
      stats[id] = { total: 0, assigned: 0, broadcast: 0, completed: 0, cancelled: 0, lostItems: 0 };
    });
    allTrips.forEach((t: any) => {
      const s = stats[t.created_by];
      if (!s) return;
      s.total++;
      // Direct-assigned: dispatch_type explicitly says operator (or has a target_driver_id without broadcast)
      if (t.dispatch_type === "operator") s.assigned++;
      // Broadcast / sent to app
      else if (t.dispatch_type === "dispatch_broadcast") s.broadcast++;
      if (t.status === "completed") s.completed++;
      if (["cancelled", "expired", "no_show"].includes(t.status)) s.cancelled++;
    });

    // Fetch lost item reports created by these dispatchers in the same window (paginated)
    let allLost: any[] = [];
    let lostFrom = 0;
    while (lostFrom < 50000) {
      let lq = supabase
        .from("lost_item_reports")
        .select("created_by")
        .in("created_by", dispatcherIds)
        .order("created_at", { ascending: false })
        .range(lostFrom, lostFrom + PAGE - 1);
      if (start) lq = lq.gte("created_at", start.toISOString());
      if (end) lq = lq.lte("created_at", end.toISOString());
      const { data: lostData, error: lostErr } = await lq;
      if (lostErr || !lostData || lostData.length === 0) break;
      allLost = allLost.concat(lostData);
      if (lostData.length < PAGE) break;
      lostFrom += PAGE;
    }
    allLost.forEach((r: any) => {
      const s = stats[r.created_by];
      if (s) s.lostItems++;
    });

    setDispatcherStats(stats);
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

  const fetchSalaryRates = async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "dispatcher_salary_rates")
      .single();
    if (data?.value && typeof data.value === "object") {
      setSalaryRates(data.value as Record<string, number>);
    }
  };

  const fetchDispatchers = async () => {
    const { data } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "dispatcher");
    const ids = (data || []).map((r: any) => r.user_id);
    // Also include admins who might dispatch
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const allIds = [...new Set([...ids, ...(adminRoles || []).map((r: any) => r.user_id)])];
    if (allIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone_number")
        .in("id", allIds);
      setDispatchers(profiles || []);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchIpSettings();
    fetchSalaryRates();
    fetchDispatchers();
  }, [dateFilter, customStart, customEnd]);

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

  const getDurationMs = (clockIn: string, clockOut: string | null) => {
    const start = new Date(clockIn).getTime();
    const end = clockOut ? new Date(clockOut).getTime() : Date.now();
    return end - start;
  };

  // Edit session handlers
  const startEdit = (s: any) => {
    setEditingId(s.id);
    // Format for datetime-local input
    setEditClockIn(toLocalDatetime(s.clock_in));
    setEditClockOut(s.clock_out ? toLocalDatetime(s.clock_out) : "");
  };

  const toLocalDatetime = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const saveEdit = async (id: string) => {
    if (!editClockIn) {
      toast({ title: "Clock in time is required", variant: "destructive" });
      return;
    }
    const update: any = { clock_in: new Date(editClockIn).toISOString() };
    if (editClockOut) {
      update.clock_out = new Date(editClockOut).toISOString();
    } else {
      update.clock_out = null;
    }
    const { error } = await supabase
      .from("dispatch_duty_sessions")
      .update(update)
      .eq("id", id);
    if (error) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session updated" });
      setEditingId(null);
      fetchSessions();
    }
  };

  // Salary handlers
  const saveSalaryRate = async (dispatcherId: string) => {
    const rate = parseFloat(editSalaryVal);
    if (isNaN(rate) || rate < 0) {
      toast({ title: "Invalid salary rate", variant: "destructive" });
      return;
    }
    const newRates = { ...salaryRates, [dispatcherId]: rate };
    const { data: existing } = await supabase
      .from("system_settings")
      .select("id")
      .eq("key", "dispatcher_salary_rates")
      .single();

    if (existing) {
      await supabase
        .from("system_settings")
        .update({ value: newRates as any, updated_at: new Date().toISOString() })
        .eq("key", "dispatcher_salary_rates");
    } else {
      await supabase.from("system_settings").insert({
        key: "dispatcher_salary_rates",
        value: newRates as any,
        description: "Hourly salary rates per dispatcher",
      });
    }
    setSalaryRates(newRates);
    setEditingSalaryId(null);
    toast({ title: "Salary rate saved" });
  };

  const addSession = async () => {
    if (!addDispatcherId || !addDate || !addStartTime) {
      toast({ title: "Please fill dispatcher, date & start time", variant: "destructive" });
      return;
    }
    setAddSaving(true);
    const clockIn = new Date(`${addDate}T${addStartTime}`).toISOString();
    const clockOut = addEndTime ? new Date(`${addDate}T${addEndTime}`).toISOString() : null;
    const { error } = await supabase.from("dispatch_duty_sessions").insert({
      dispatcher_id: addDispatcherId,
      clock_in: clockIn,
      clock_out: clockOut,
    } as any);
    setAddSaving(false);
    if (error) {
      toast({ title: "Failed to add session", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session added" });
      setShowAddModal(false);
      setAddDispatcherId("");
      setAddDate("");
      setAddStartTime("");
      setAddEndTime("");
      fetchSessions();
    }
  };

  const deleteSession = async (id: string) => {
    if (!confirm("Delete this duty session?")) return;
    const { error } = await supabase.from("dispatch_duty_sessions").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Session deleted" });
      fetchSessions();
    }
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
    acc[id].totalMs += getDurationMs(s.clock_in, s.clock_out);
    acc[id].sessionCount++;
    return acc;
  }, {} as Record<string, any>);

  return (
    <div className="space-y-6">
      {/* IP Restriction Settings — admin only */}
      {!isSelfView && (
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
      )}

      {/* Duty Hours Summary */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            {isSelfView ? "My Duty Hours & Performance" : "Dispatcher Duty Hours"}
          </h3>
          <div className="flex items-center gap-2">
            {!isSelfView && (
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Session
              </button>
            )}
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="text-xs bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All Time</option>
              <option value="custom">Custom Range</option>
            </select>
            {dateFilter === "custom" && (
              <>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                  className="text-xs bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground" />
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                  className="text-xs bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground" />
              </>
            )}
          </div>
        </div>

        {/* Dispatcher Performance Leaderboard */}
        {Object.keys(dispatcherSummary).length > 0 && (() => {
          const ranked = Object.entries(dispatcherSummary)
            .map(([id, info]: [string, any]) => ({
              id, info,
              stats: dispatcherStats[id] || { total: 0, assigned: 0, broadcast: 0, completed: 0, cancelled: 0 },
            }))
            .sort((a, b) => b.stats.total - a.stats.total);
          const totals = ranked.reduce((acc, r) => {
            acc.total += r.stats.total;
            acc.assigned += r.stats.assigned;
            acc.broadcast += r.stats.broadcast;
            acc.completed += r.stats.completed;
            acc.cancelled += r.stats.cancelled;
            return acc;
          }, { total: 0, assigned: 0, broadcast: 0, completed: 0, cancelled: 0 });
          return (
            <div className="bg-gradient-to-br from-primary/5 via-card to-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Dispatcher Performance
                </h4>
                <p className="text-[10px] text-muted-foreground">Real trip data for selected period</p>
              </div>
              {/* Totals strip */}
              <div className="grid grid-cols-5 gap-2">
                {[
                  { label: "Total", value: totals.total, Icon: Send, color: "text-primary" },
                  { label: "Assigned", value: totals.assigned, Icon: UserCheck, color: "text-sky-500" },
                  { label: "Sent to App", value: totals.broadcast, Icon: Radio, color: "text-amber-500" },
                  { label: "Completed", value: totals.completed, Icon: CheckCircle2, color: "text-success" },
                  { label: "Cancelled", value: totals.cancelled, Icon: XCircle, color: "text-destructive" },
                ].map(s => {
                  const Icon = s.Icon;
                  return (
                    <div key={s.label} className="bg-surface rounded-lg p-2 text-center">
                      <Icon className={`w-3.5 h-3.5 mx-auto ${s.color}`} />
                      <p className="text-base font-bold text-foreground mt-0.5">{s.value}</p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
                    </div>
                  );
                })}
              </div>
              {/* Per-dispatcher rows */}
              <div className="space-y-1.5">
                {ranked.map(({ id, info, stats }, idx) => {
                  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                  const name = info.dispatcher ? `${info.dispatcher.first_name} ${info.dispatcher.last_name}` : "Unknown";
                  return (
                    <div key={id} className="bg-surface rounded-lg p-2.5 flex items-center gap-3">
                      <div className="flex items-center gap-2 w-32 shrink-0">
                        {idx === 0 && stats.total > 0 ? (
                          <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                        ) : (
                          <span className="w-4 text-center text-[10px] font-bold text-muted-foreground">#{idx + 1}</span>
                        )}
                        {info.dispatcher?.avatar_url ? (
                          <img src={info.dispatcher.avatar_url} alt={name} className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary">
                            {name.charAt(0)}
                          </div>
                        )}
                        <p className="text-xs font-semibold text-foreground truncate">{name}</p>
                      </div>
                      <div className="flex-1 grid grid-cols-5 gap-1 text-center">
                        <div><p className="text-sm font-bold text-foreground">{stats.total}</p><p className="text-[9px] text-muted-foreground">Total</p></div>
                        <div><p className="text-sm font-bold text-sky-500">{stats.assigned}</p><p className="text-[9px] text-muted-foreground">Assigned</p></div>
                        <div><p className="text-sm font-bold text-amber-500">{stats.broadcast}</p><p className="text-[9px] text-muted-foreground">Sent</p></div>
                        <div><p className="text-sm font-bold text-success">{stats.completed}</p><p className="text-[9px] text-muted-foreground">Done</p></div>
                        <div><p className="text-sm font-bold text-destructive">{stats.cancelled}</p><p className="text-[9px] text-muted-foreground">Cancel</p></div>
                      </div>
                      <div className="w-16 text-right shrink-0">
                        <p className="text-sm font-bold text-foreground">{completionRate}%</p>
                        <p className="text-[9px] text-muted-foreground">complete</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Summary cards with salary */}
        {Object.keys(dispatcherSummary).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {Object.entries(dispatcherSummary).map(([id, info]: [string, any]) => {
              const hrs = Math.floor(info.totalMs / 3600000);
              const mins = Math.floor((info.totalMs % 3600000) / 60000);
              const totalHours = info.totalMs / 3600000;
              const rate = salaryRates[id] || 0;
              const salary = rate > 0 ? (totalHours * rate).toFixed(2) : null;

              return (
                <div key={id} className="bg-surface rounded-lg p-3 text-center space-y-1">
                  <p className="text-xs font-semibold text-foreground">
                    {info.dispatcher ? `${info.dispatcher.first_name} ${info.dispatcher.last_name}` : "Unknown"}
                  </p>
                  <p className="text-lg font-bold text-primary">{hrs}h {mins}m</p>
                  <p className="text-[10px] text-muted-foreground">{info.sessionCount} session{info.sessionCount !== 1 ? "s" : ""}</p>

                  {/* Salary rate */}
                  {editingSalaryId === id ? (
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        type="number"
                        step="0.01"
                        value={editSalaryVal}
                        onChange={(e) => setEditSalaryVal(e.target.value)}
                        placeholder="Rate/hr"
                        className="w-16 px-1 py-0.5 text-[10px] bg-background border border-border rounded text-foreground text-center"
                        onKeyDown={(e) => e.key === "Enter" && saveSalaryRate(id)}
                      />
                      <button onClick={() => saveSalaryRate(id)} className="text-primary hover:text-primary/80">
                        <Check className="w-3 h-3" />
                      </button>
                      <button onClick={() => setEditingSalaryId(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1 mt-1">
                      {rate > 0 ? (
                        <p className="text-[10px] text-muted-foreground">
                          <DollarSign className="w-2.5 h-2.5 inline" />
                          {rate}/hr • <span className="font-semibold text-foreground">${salary}</span>
                        </p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground italic">No rate set</p>
                      )}
                      <button
                        onClick={() => {
                          setEditingSalaryId(id);
                          setEditSalaryVal(rate > 0 ? rate.toString() : "");
                        }}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
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
                <th className="text-left py-2 px-2 font-medium w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Loading...</td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No duty sessions found</td></tr>
              ) : sessions.map((s: any) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-surface/50">
                  <td className="py-2 px-2 font-medium text-foreground">
                    {s.dispatcher ? `${s.dispatcher.first_name} ${s.dispatcher.last_name}` : s.dispatcher_id.slice(0, 8)}
                  </td>
                  <td className="py-2 px-2">
                    {editingId === s.id ? (
                      <input
                        type="datetime-local"
                        value={editClockIn}
                        onChange={(e) => setEditClockIn(e.target.value)}
                        className="px-1 py-0.5 text-[10px] bg-background border border-border rounded text-foreground w-36"
                      />
                    ) : (
                      <span className="text-muted-foreground">
                        {new Date(s.clock_in).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {editingId === s.id ? (
                      <input
                        type="datetime-local"
                        value={editClockOut}
                        onChange={(e) => setEditClockOut(e.target.value)}
                        className="px-1 py-0.5 text-[10px] bg-background border border-border rounded text-foreground w-36"
                      />
                    ) : s.clock_out ? (
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
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1">
                      {editingId === s.id ? (
                        <>
                          <button onClick={() => saveEdit(s.id)} className="text-primary hover:text-primary/80">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(s)} className="text-muted-foreground hover:text-primary">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => deleteSession(s.id)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Session Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-foreground/50 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Add Duty Session
              </h3>
              <button onClick={() => setShowAddModal(false)} className="w-7 h-7 rounded-full bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Dispatcher</label>
                <select
                  value={addDispatcherId}
                  onChange={e => setAddDispatcherId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs bg-surface border border-border rounded-lg text-foreground"
                >
                  <option value="">Select dispatcher...</option>
                  {dispatchers.map(d => (
                    <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Date</label>
                <input
                  type="date"
                  value={addDate}
                  onChange={e => setAddDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs bg-surface border border-border rounded-lg text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Start Time</label>
                  <input
                    type="time"
                    value={addStartTime}
                    onChange={e => setAddStartTime(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-xs bg-surface border border-border rounded-lg text-foreground"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">End Time</label>
                  <input
                    type="time"
                    value={addEndTime}
                    onChange={e => setAddEndTime(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-xs bg-surface border border-border rounded-lg text-foreground"
                  />
                  <p className="text-[9px] text-muted-foreground mt-0.5">Leave empty for active session</p>
                </div>
              </div>
            </div>

            <button
              onClick={addSession}
              disabled={addSaving}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {addSaving ? "Adding..." : "Add Session"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDutyHours;
