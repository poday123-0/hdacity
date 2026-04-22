import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Loader2, Trash2, Smartphone, Globe, AlertTriangle, CheckCircle2, Clock, Filter, Phone, Car, User } from "lucide-react";

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

type ProfileInfo = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  avatar_url: string | null;
  user_type: string;
};

type VehicleInfo = {
  id: string;
  make: string | null;
  model: string | null;
  plate_number: string;
  color: string | null;
  year: number | null;
  image_url: string | null;
};

type TripInfo = {
  id: string;
  passenger_id: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  pickup_address: string;
  dropoff_address: string;
  status: string;
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

  // Lookup caches: id -> info
  const [profileMap, setProfileMap] = useState<Record<string, ProfileInfo>>({});
  const [vehicleMap, setVehicleMap] = useState<Record<string, VehicleInfo>>({});
  const [tripMap, setTripMap] = useState<Record<string, TripInfo>>({});

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

  // Resolve unique IDs that need lookup
  const { neededDriverIds, neededTripIds } = useMemo(() => {
    const dSet = new Set<string>();
    const tSet = new Set<string>();
    for (const l of logs) {
      if (l.driver_id) dSet.add(l.driver_id);
      if (l.trip_id) tSet.add(l.trip_id);
    }
    return { neededDriverIds: Array.from(dSet), neededTripIds: Array.from(tSet) };
  }, [logs]);

  // Fetch profiles + trips + vehicles when logs change
  useEffect(() => {
    const run = async () => {
      // 1. Drivers from log rows
      const missingDrivers = neededDriverIds.filter((id) => !profileMap[id]);
      // 2. Trips
      const missingTrips = neededTripIds.filter((id) => !tripMap[id]);

      let trips: TripInfo[] = [];
      if (missingTrips.length > 0) {
        const { data } = await supabase
          .from("trips")
          .select("id, passenger_id, driver_id, vehicle_id, customer_name, customer_phone, pickup_address, dropoff_address, status")
          .in("id", missingTrips);
        trips = (data as TripInfo[]) || [];
        if (trips.length > 0) {
          setTripMap((prev) => {
            const next = { ...prev };
            trips.forEach((t) => { next[t.id] = t; });
            return next;
          });
        }
      }

      // Collect extra profile / vehicle ids from trips
      const extraProfileIds = new Set<string>();
      const vehicleIds = new Set<string>();
      [...trips, ...Object.values(tripMap)].forEach((t) => {
        if (t.passenger_id) extraProfileIds.add(t.passenger_id);
        if (t.driver_id) extraProfileIds.add(t.driver_id);
        if (t.vehicle_id) vehicleIds.add(t.vehicle_id);
      });

      const allProfileIds = Array.from(new Set([...missingDrivers, ...Array.from(extraProfileIds)]))
        .filter((id) => !profileMap[id]);

      if (allProfileIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, phone_number, avatar_url, user_type")
          .in("id", allProfileIds);
        if (profs && profs.length > 0) {
          setProfileMap((prev) => {
            const next = { ...prev };
            (profs as ProfileInfo[]).forEach((p) => { next[p.id] = p; });
            return next;
          });
        }
      }

      const missingVehicles = Array.from(vehicleIds).filter((id) => !vehicleMap[id]);
      if (missingVehicles.length > 0) {
        const { data: vehs } = await supabase
          .from("vehicles")
          .select("id, make, model, plate_number, color, year, image_url")
          .in("id", missingVehicles);
        if (vehs && vehs.length > 0) {
          setVehicleMap((prev) => {
            const next = { ...prev };
            (vehs as VehicleInfo[]).forEach((v) => { next[v.id] = v; });
            return next;
          });
        }
      }
    };
    if (logs.length > 0) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs]);

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

              {(() => {
                const trip = log.trip_id ? tripMap[log.trip_id] : null;
                const driverProfile = log.driver_id ? profileMap[log.driver_id] : (trip?.driver_id ? profileMap[trip.driver_id] : null);
                const passengerProfile = trip?.passenger_id ? profileMap[trip.passenger_id] : null;
                const vehicle = trip?.vehicle_id ? vehicleMap[trip.vehicle_id] : null;

                const passengerName = passengerProfile
                  ? `${passengerProfile.first_name} ${passengerProfile.last_name}`.trim()
                  : (trip?.customer_name || null);
                const passengerPhone = passengerProfile?.phone_number || trip?.customer_phone || null;

                if (!driverProfile && !passengerName && !vehicle && !log.driver_id && !log.trip_id) return null;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Driver card */}
                    {(driverProfile || log.driver_id) && (
                      <div className="flex items-center gap-2 p-2 bg-surface border border-border rounded-lg">
                        {driverProfile?.avatar_url ? (
                          <img
                            src={driverProfile.avatar_url}
                            alt=""
                            className="w-9 h-9 rounded-full object-cover border border-border flex-shrink-0"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Driver</p>
                          <p className="text-xs font-semibold text-foreground truncate">
                            {driverProfile ? `${driverProfile.first_name} ${driverProfile.last_name}`.trim() || "Unnamed" : `${log.driver_id?.slice(0, 8)}…`}
                          </p>
                          {driverProfile?.phone_number && (
                            <p className="text-[11px] text-foreground flex items-center gap-1 truncate font-mono select-all">
                              <Phone className="w-2.5 h-2.5 text-muted-foreground" />
                              {driverProfile.phone_number}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Passenger card */}
                    {passengerName && (
                      <div className="flex items-center gap-2 p-2 bg-surface border border-border rounded-lg">
                        {passengerProfile?.avatar_url ? (
                          <img
                            src={passengerProfile.avatar_url}
                            alt=""
                            className="w-9 h-9 rounded-full object-cover border border-border flex-shrink-0"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-success" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Passenger</p>
                          <p className="text-xs font-semibold text-foreground truncate">{passengerName || "Guest"}</p>
                          {passengerPhone && (
                            <p className="text-[11px] text-foreground flex items-center gap-1 truncate font-mono select-all">
                              <Phone className="w-2.5 h-2.5 text-muted-foreground" />
                              {passengerPhone}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Vehicle card */}
                    {vehicle && (
                      <div className="flex items-center gap-2 p-2 bg-surface border border-border rounded-lg sm:col-span-2">
                        {vehicle.image_url ? (
                          <img
                            src={vehicle.image_url}
                            alt=""
                            className="w-12 h-9 rounded object-cover border border-border flex-shrink-0 bg-muted"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="w-12 h-9 rounded bg-muted flex items-center justify-center flex-shrink-0">
                            <Car className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vehicle</p>
                          <p className="text-xs font-semibold text-foreground truncate">
                            {[vehicle.year, vehicle.color, vehicle.make, vehicle.model].filter(Boolean).join(" ")} · <span className="font-mono">{vehicle.plate_number}</span>
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Trip ID fallback */}
                    {log.trip_id && (
                      <p className="text-[10px] font-mono text-muted-foreground sm:col-span-2">
                        🧾 trip {log.trip_id.slice(0, 8)}…
                        {trip && <span className="ml-2">· {trip.status}</span>}
                      </p>
                    )}
                  </div>
                );
              })()}


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
