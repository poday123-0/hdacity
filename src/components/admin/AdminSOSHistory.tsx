import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, MapPin, Phone, Clock, CheckCircle, Search, Filter } from "lucide-react";

interface SOSAlert {
  id: string;
  user_id: string;
  user_type: string;
  user_name: string;
  user_phone: string;
  trip_id: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  notes: string | null;
}

const AdminSOSHistory = () => {
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAlerts = async () => {
    setLoading(true);
    let query = supabase
      .from("sos_alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (filter === "active") query = query.eq("status", "active");
    if (filter === "resolved") query = query.eq("status", "resolved");

    const { data } = await query;
    setAlerts((data as SOSAlert[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAlerts();
  }, [filter]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("sos-history-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_alerts" }, () => {
        fetchAlerts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filter]);

  const resolveAlert = async (alertId: string) => {
    await supabase.from("sos_alerts").update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    }).eq("id", alertId);
    fetchAlerts();
  };

  const filtered = alerts.filter(a => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return a.user_name.toLowerCase().includes(q) || a.user_phone.includes(q);
  });

  const activeCount = alerts.filter(a => a.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-destructive" />
            SOS Alerts
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {activeCount > 0 ? (
              <span className="text-destructive font-semibold">{activeCount} active alert{activeCount > 1 ? "s" : ""}</span>
            ) : (
              "No active alerts"
            )}
            {" · "}{alerts.length} total
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "active", "resolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold capitalize transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No SOS alerts found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => (
            <div
              key={alert.id}
              className={`bg-card border rounded-xl overflow-hidden transition-colors ${
                alert.status === "active"
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-border"
              }`}
            >
              <div
                className="p-4 cursor-pointer"
                onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      alert.status === "active" ? "bg-destructive/10" : "bg-muted"
                    }`}>
                      <AlertTriangle className={`w-5 h-5 ${
                        alert.status === "active" ? "text-destructive" : "text-muted-foreground"
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          alert.user_type === "driver"
                            ? "bg-primary/10 text-primary"
                            : "bg-accent text-accent-foreground"
                        }`}>
                          {alert.user_type === "driver" ? "Driver" : "Passenger"}
                        </span>
                        <span className="text-sm font-bold text-foreground">{alert.user_name || "Unknown"}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          alert.status === "active"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {alert.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          +960 {alert.user_phone}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(alert.created_at).toLocaleString()}
                        </span>
                        {alert.lat && alert.lng && (
                          <span className="flex items-center gap-1 text-primary">
                            <MapPin className="w-3 h-3" />
                            GPS
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {alert.status === "active" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); resolveAlert(alert.id); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:opacity-90"
                    >
                      <CheckCircle className="w-3 h-3" /> Resolve
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {expandedId === alert.id && (
                <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                  {alert.lat && alert.lng && (
                    <div className="space-y-2">
                      <div className="rounded-lg overflow-hidden border border-border h-48">
                        <iframe
                          src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyCxO9qqVIyDU5C-ZKfS3Cwa3LaKaHSwNS0&q=${alert.lat},${alert.lng}&zoom=16&maptype=roadmap`}
                          width="100%"
                          height="100%"
                          style={{ border: 0 }}
                          allowFullScreen
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${alert.lat},${alert.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        <MapPin className="w-4 h-4" />
                        Open in Google Maps ({alert.lat.toFixed(6)}, {alert.lng.toFixed(6)})
                      </a>
                    </div>
                  )}

                  {!alert.lat && !alert.lng && (
                    <div className="bg-muted rounded-lg px-4 py-3 text-xs text-muted-foreground">
                      📍 Location not available for this alert
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-surface rounded-lg p-3">
                      <p className="text-muted-foreground">Trip ID</p>
                      <p className="font-mono text-foreground mt-1">{alert.trip_id ? alert.trip_id.slice(0, 8) + "..." : "None"}</p>
                    </div>
                    <div className="bg-surface rounded-lg p-3">
                      <p className="text-muted-foreground">Resolved</p>
                      <p className="text-foreground mt-1">
                        {alert.resolved_at ? new Date(alert.resolved_at).toLocaleString() : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2">
                    <a
                      href={`tel:+960${alert.user_phone}`}
                      className="flex-1 flex items-center justify-center gap-1 bg-primary/10 text-primary rounded-lg py-2 text-xs font-semibold hover:bg-primary/20"
                    >
                      <Phone className="w-3 h-3" /> Call
                    </a>
                    <a
                      href={`sms:+960${alert.user_phone}?body=HDA Emergency: We received your SOS. Help is on the way.`}
                      className="flex-1 flex items-center justify-center gap-1 bg-accent text-accent-foreground rounded-lg py-2 text-xs font-semibold hover:bg-accent/80"
                    >
                      Send SMS
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminSOSHistory;
