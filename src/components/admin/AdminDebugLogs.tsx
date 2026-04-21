import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Loader2, Trash2, Smartphone, Globe, AlertTriangle, CheckCircle2, Clock, Filter } from "lucide-react";

type LogRow = {
  id: string;
  created_at: string;
  source: string;
  event: string;
  driver_id: string | null;
  trip_id: string | null;
  device: string | null;
  platform: string | null;
  app_version: string | null;
  details: any;
};

type SearchMode = "driver" | "trip" | "phone" | "recent";

const eventStyle = (event: string) => {
  if (event.startsWith("handleNewTrip:reject")) return "bg-destructive/10 text-destructive border-destructive/20";
  if (event === "handleNewTrip:show_screen") return "bg-success/10 text-success border-success/20";
  if (event === "handleNewTrip:enter") return "bg-primary/10 text-primary border-primary/20";
  return "bg-muted text-foreground border-border";
};

const eventIcon = (event: string) => {
  if (event.startsWith("handleNewTrip:reject")) return <AlertTriangle className="w-3.5 h-3.5" />;
  if (event === "handleNewTrip:show_screen") return <CheckCircle2 className="w-3.5 h-3.5" />;
  return <Clock className="w-3.5 h-3.5" />;
};

const platformBadge = (p: string | null) => {
  if (!p) return null;
  const isNative = p === "ios" || p === "android";
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface text-[10px] font-semibold text-muted-foreground border border-border">
      {isNative ? <Smartphone className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
      {p}
    </span>
  );
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { hour12: false });
};

const AdminDebugLogs = () => {
  const [mode, setMode] = useState<SearchMode>("recent");
  const [query, setQuery] = useState("");
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [hours, setHours] = useState(24);

  const search = async () => {
    setLoading(true);
    try {
      let driverId: string | null = null;
      let tripId: string | null = null;

      if (mode === "phone" && query.trim()) {
        const phone = query.trim().replace(/\D/g, "");
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .eq("phone_number", phone)
          .maybeSingle();
        if (!prof) {
          toast({ title: "No driver found", description: `No profile with phone ${phone}`, variant: "destructive" });
          setLogs([]);
          setLoading(false);
          return;
        }
        driverId = prof.id;
        toast({ title: "Found driver", description: `${prof.first_name} ${prof.last_name}` });
      } else if (mode === "driver" && query.trim()) {
        driverId = query.trim();
      } else if (mode === "trip" && query.trim()) {
        tripId = query.trim();
      }

      let q = supabase
        .from("debug_logs")
        .select("*")
        .gte("created_at", new Date(Date.now() - hours * 3600 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(500);

      if (driverId) q = q.eq("driver_id", driverId);
      if (tripId) q = q.eq("trip_id", tripId);

      const { data, error } = await q;
      if (error) throw error;
      setLogs((data as LogRow[]) || []);
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const clearOld = async () => {
    if (!confirm("Delete debug logs older than 7 days?")) return;
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { error } = await supabase.from("debug_logs").delete().lt("created_at", cutoff);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Old logs cleared" });
    }
  };

  const eventOptions = Array.from(new Set(logs.map((l) => l.event))).sort();
  const filtered = eventFilter === "all" ? logs : logs.filter((l) => l.event === eventFilter);

  // Aggregate quick stats
  const stats = filtered.reduce(
    (acc, l) => {
      if (l.event.startsWith("handleNewTrip:reject")) acc.rejected += 1;
      else if (l.event === "handleNewTrip:show_screen") acc.shown += 1;
      else if (l.event === "handleNewTrip:enter") acc.entered += 1;
      return acc;
    },
    { entered: 0, shown: 0, rejected: 0 }
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground">Driver App Debug Logs</h3>
            <p className="text-xs text-muted-foreground">Trace why a driver did or didn't see a trip request screen</p>
          </div>
          <button
            onClick={clearOld}
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear &gt; 7d
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex flex-wrap gap-1 p-1 bg-surface rounded-xl">
          {([
            { id: "recent" as SearchMode, label: "Recent (all)" },
            { id: "phone" as SearchMode, label: "By phone #" },
            { id: "driver" as SearchMode, label: "By driver ID" },
            { id: "trip" as SearchMode, label: "By trip ID" },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => { setMode(t.id); setQuery(""); }}
              className={`flex-1 min-w-[100px] text-xs font-semibold py-2 px-3 rounded-lg transition ${
                mode === t.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search row */}
        <div className="flex flex-wrap gap-2 items-center">
          {mode !== "recent" && (
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder={
                  mode === "phone" ? "Driver phone (e.g. 7771234)" :
                  mode === "driver" ? "Driver UUID" :
                  "Trip UUID"
                }
                className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground"
          >
            <option value={1}>Last 1h</option>
            <option value={6}>Last 6h</option>
            <option value={24}>Last 24h</option>
            <option value={72}>Last 3d</option>
            <option value={168}>Last 7d</option>
          </select>
          <button
            onClick={search}
            disabled={loading || (mode !== "recent" && !query.trim())}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </div>
      </div>

      {/* Stats */}
      {logs.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Entered</p>
            <p className="text-xl font-bold text-primary">{stats.entered}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Shown</p>
            <p className="text-xl font-bold text-success">{stats.shown}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Rejected</p>
            <p className="text-xl font-bold text-destructive">{stats.rejected}</p>
          </div>
        </div>
      )}

      {/* Event filter */}
      {logs.length > 0 && eventOptions.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <button
            onClick={() => setEventFilter("all")}
            className={`text-xs px-2 py-1 rounded-md border ${eventFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
          >
            all ({logs.length})
          </button>
          {eventOptions.map((ev) => (
            <button
              key={ev}
              onClick={() => setEventFilter(ev)}
              className={`text-xs px-2 py-1 rounded-md border ${eventFilter === ev ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}
            >
              {ev.replace("handleNewTrip:", "")}
            </button>
          ))}
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-2">
        {!loading && filtered.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
            {logs.length === 0 ? "Run a search to see logs." : "No logs match the current filter."}
          </div>
        )}

        {filtered.map((log, idx) => {
          const prev = filtered[idx + 1];
          const gapMs = prev ? new Date(log.created_at).getTime() - new Date(prev.created_at).getTime() : 0;
          return (
            <div key={log.id} className="bg-card border border-border rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${eventStyle(log.event)}`}>
                  {eventIcon(log.event)}
                  {log.event}
                </span>
                {platformBadge(log.platform)}
                {log.app_version && log.app_version !== "unknown" && (
                  <span className="px-1.5 py-0.5 rounded-md bg-surface text-[10px] font-semibold text-muted-foreground border border-border">
                    v{log.app_version}
                  </span>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                  {fmtTime(log.created_at)}
                  {prev && ` (+${(gapMs / 1000).toFixed(1)}s)`}
                </span>
              </div>

              {(log.driver_id || log.trip_id) && (
                <div className="flex flex-wrap gap-3 text-[11px] font-mono text-muted-foreground">
                  {log.driver_id && <span>👤 {log.driver_id.slice(0, 8)}…</span>}
                  {log.trip_id && <span>🧾 {log.trip_id.slice(0, 8)}…</span>}
                </div>
              )}

              {log.details && Object.keys(log.details).length > 0 && (
                <pre className="text-[11px] bg-surface border border-border rounded-lg p-2 overflow-x-auto text-muted-foreground">
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              )}

              {log.device && (
                <p className="text-[10px] text-muted-foreground/70 truncate" title={log.device}>
                  {log.device}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminDebugLogs;
