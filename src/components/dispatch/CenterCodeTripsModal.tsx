import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, MapPin, Clock, User, Phone, Car, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  centerCode: string;
  vehicleIds: string[];
  onClose: () => void;
}

type Trip = any;

const sourceLabel = (t: Trip) => {
  if (t.dispatch_type === "operator") {
    if (t.driver_id && t.target_driver_id === t.driver_id) return { label: "Assigned", color: "text-primary bg-primary/10" };
    if (t.booking_notes?.includes("No Vehicle")) return { label: "No Vehicle", color: "text-orange-500 bg-orange-500/10" };
    return { label: "Sent to App", color: "text-blue-500 bg-blue-500/10" };
  }
  return { label: "Customer Request", color: "text-emerald-500 bg-emerald-500/10" };
};

const statusBadge = (t: Trip) => {
  if (t.is_loss) return { label: "LOSS", color: "bg-destructive text-destructive-foreground" };
  switch (t.status) {
    case "completed": return { label: "Completed", color: "bg-success text-success-foreground" };
    case "cancelled": return { label: "Cancelled", color: "bg-warning text-warning-foreground" };
    case "started": return { label: "In Progress", color: "bg-primary text-primary-foreground" };
    case "accepted": return { label: "Accepted", color: "bg-blue-500 text-white" };
    case "arrived": return { label: "Arrived", color: "bg-purple-500 text-white" };
    case "requested": return { label: "Pending", color: "bg-muted text-muted-foreground" };
    case "expired": return { label: "Expired", color: "bg-muted text-muted-foreground" };
    default: return { label: t.status?.toUpperCase() || "—", color: "bg-muted text-muted-foreground" };
  }
};

export function CenterCodeTripsModal({ centerCode, vehicleIds, onClose }: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"today" | "all">("today");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        if (vehicleIds.length === 0) {
          setTrips([]);
          return;
        }

        let q = supabase
          .from("trips")
          .select(
            "id, status, is_loss, dispatch_type, pickup_address, dropoff_address, customer_name, customer_phone, " +
            "driver_id, target_driver_id, vehicle_id, booking_notes, created_at, accepted_at, started_at, completed_at, cancelled_at, " +
            "estimated_fare, actual_fare, cancel_reason, cancelled_by, cancelled_by_type, cancelled_by_name, passenger_id, " +
            "driver:profiles!trips_driver_id_fkey(first_name, last_name, phone_number), " +
            "vehicle:vehicles!trips_vehicle_id_fkey(plate_number, center_code, color)"
          )
          .in("vehicle_id", vehicleIds)
          .order("created_at", { ascending: false })
          .limit(500);

        if (scope === "today") {
          const nowUtc = Date.now();
          const mald = new Date(nowUtc + 5 * 3600000);
          const yy = mald.getUTCFullYear();
          const mm = String(mald.getUTCMonth() + 1).padStart(2, "0");
          const dd = String(mald.getUTCDate()).padStart(2, "0");
          q = q.gte("created_at", `${yy}-${mm}-${dd}T00:00:00+05:00`);
        }

        const { data } = await q;
        if (cancelled) return;
        setTrips(data || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [centerCode, vehicleIds.join(","), scope]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.96, y: 8 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 8 }}
          transition={{ duration: 0.15 }}
          className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 text-primary font-bold px-2.5 py-1 rounded text-sm">{centerCode}</div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Center Code Trips</h3>
                <p className="text-[11px] text-muted-foreground">{loading ? "Loading…" : `${trips.length} trip${trips.length === 1 ? "" : "s"} ${scope === "today" ? "today" : "all-time"}`}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-muted rounded p-0.5">
                <button
                  onClick={() => setScope("today")}
                  className={`text-[10px] font-semibold px-2 py-1 rounded transition-colors ${scope === "today" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >Today</button>
                <button
                  onClick={() => setScope("all")}
                  className={`text-[10px] font-semibold px-2 py-1 rounded transition-colors ${scope === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >All-time</button>
              </div>
              <button onClick={onClose} className="p-1 hover:bg-muted rounded transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : trips.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted-foreground">No trips found.</div>
            ) : (
              trips.map((t) => {
                const src = sourceLabel(t);
                const stat = statusBadge(t);
                const driverName = t.driver ? `${t.driver.first_name || ""} ${t.driver.last_name || ""}`.trim() : "—";
                return (
                  <div key={t.id} className="border border-border rounded-lg p-2.5 bg-card hover:bg-muted/30 transition-colors">
                    {/* Top row: badges + time */}
                    <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${stat.color}`}>
                        {stat.label}
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${src.color}`}>
                        {src.label}
                      </span>
                      {t.is_loss && <AlertTriangle className="w-3 h-3 text-destructive" />}
                      <div className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(t.created_at).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>

                    {/* Route */}
                    <div className="space-y-0.5 mb-1.5">
                      <div className="flex items-start gap-1.5 text-[11px]">
                        <MapPin className="w-3 h-3 text-success mt-0.5 shrink-0" />
                        <span className="text-foreground line-clamp-1">{t.pickup_address || "—"}</span>
                      </div>
                      <div className="flex items-start gap-1.5 text-[11px]">
                        <MapPin className="w-3 h-3 text-destructive mt-0.5 shrink-0" />
                        <span className="text-foreground line-clamp-1">{t.dropoff_address || "—"}</span>
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                      {t.customer_name && (
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{t.customer_name}</span>
                      )}
                      {t.customer_phone && (
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{t.customer_phone}</span>
                      )}
                      {t.driver_id && (
                        <span className="flex items-center gap-1"><Car className="w-3 h-3" />{driverName} {t.vehicle?.plate_number ? `(${t.vehicle.plate_number})` : ""}</span>
                      )}
                      {(t.actual_fare || t.estimated_fare) && (
                        <span className="font-semibold text-foreground">MVR {t.actual_fare || t.estimated_fare}</span>
                      )}
                    </div>

                    {/* Cancellation details */}
                    {t.status === "cancelled" && (
                      <div className="mt-1.5 pt-1.5 border-t border-border/60 text-[10px]">
                        <div className="flex items-center gap-1 text-warning">
                          <XCircle className="w-3 h-3" />
                          <span className="font-semibold">Cancelled</span>
                          {t.cancelled_at && <span className="text-muted-foreground">at {new Date(t.cancelled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                        </div>
                        {t.cancel_reason && <div className="text-foreground mt-0.5">Reason: {t.cancel_reason}</div>}
                        {(t.cancelled_by_name || t.cancelled_by_type) && (
                          <div className="text-muted-foreground mt-0.5">
                            By: <span className="font-semibold text-foreground">{t.cancelled_by_name || "Unknown"}</span>
                            {t.cancelled_by_type && <span className="text-muted-foreground/80"> ({t.cancelled_by_type})</span>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Loss/notes */}
                    {t.booking_notes && (
                      <div className="mt-1.5 pt-1.5 border-t border-border/60 text-[10px] text-muted-foreground">
                        <span className="font-semibold">Notes:</span> {t.booking_notes}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
