import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { X, DollarSign, Navigation, Clock, ChevronLeft, ChevronRight, Calendar, TrendingUp } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths, addDays, addWeeks, addMonths } from "date-fns";

type Period = "day" | "week" | "month" | "custom";

interface TripRecord {
  id: string;
  actual_fare: number | null;
  estimated_fare: number | null;
  duration_minutes: number | null;
  status: string;
  created_at: string;
  pickup_address: string;
  dropoff_address: string;
  completed_at: string | null;
}

interface DriverEarningsProps {
  driverId: string;
  isOpen: boolean;
  onClose: () => void;
}

const DriverEarnings = ({ driverId, isOpen, onClose }: DriverEarningsProps) => {
  const [period, setPeriod] = useState<Period>("day");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const dateRange = useMemo(() => {
    if (period === "custom" && customFrom && customTo) {
      return { from: startOfDay(new Date(customFrom)), to: endOfDay(new Date(customTo)) };
    }
    if (period === "day") return { from: startOfDay(currentDate), to: endOfDay(currentDate) };
    if (period === "week") return { from: startOfWeek(currentDate, { weekStartsOn: 1 }), to: endOfWeek(currentDate, { weekStartsOn: 1 }) };
    return { from: startOfMonth(currentDate), to: endOfMonth(currentDate) };
  }, [period, currentDate, customFrom, customTo]);

  const navigate = (dir: -1 | 1) => {
    if (period === "day") setCurrentDate(prev => dir === -1 ? subDays(prev, 1) : addDays(prev, 1));
    else if (period === "week") setCurrentDate(prev => dir === -1 ? subWeeks(prev, 1) : addWeeks(prev, 1));
    else if (period === "month") setCurrentDate(prev => dir === -1 ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const periodLabel = useMemo(() => {
    if (period === "custom" && customFrom && customTo) {
      return `${format(new Date(customFrom), "MMM d")} – ${format(new Date(customTo), "MMM d, yyyy")}`;
    }
    if (period === "day") return format(currentDate, "EEEE, MMM d, yyyy");
    if (period === "week") return `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}`;
    return format(currentDate, "MMMM yyyy");
  }, [period, currentDate, dateRange, customFrom, customTo]);

  useEffect(() => {
    if (!isOpen || !driverId) return;
    const fetchTrips = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("trips")
        .select("id, actual_fare, estimated_fare, duration_minutes, status, created_at, pickup_address, dropoff_address, completed_at")
        .eq("driver_id", driverId)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString())
        .order("created_at", { ascending: false });
      setTrips((data as TripRecord[]) || []);
      setLoading(false);
    };
    fetchTrips();
  }, [isOpen, driverId, dateRange]);

  const completedTrips = trips.filter(t => t.status === "completed");
  const totalEarnings = completedTrips.reduce((sum, t) => sum + (Number(t.actual_fare) || Number(t.estimated_fare) || 0), 0);
  const totalMinutes = completedTrips.reduce((sum, t) => sum + (Number(t.duration_minutes) || 0), 0);
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  const timeStr = h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}` : `${m}m`;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[800] flex items-end justify-center bg-foreground/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-foreground">Earnings</h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>

          {/* Period tabs */}
          <div className="px-4 pt-3">
            <div className="flex bg-surface rounded-xl p-1 gap-1">
              {(["day", "week", "month", "custom"] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); setCurrentDate(new Date()); }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${period === p ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  {p === "custom" ? "Custom" : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Date navigator */}
          <div className="px-4 pt-3">
            {period !== "custom" ? (
              <div className="flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform">
                  <ChevronLeft className="w-4 h-4 text-foreground" />
                </button>
                <p className="text-sm font-medium text-foreground text-center">{periodLabel}</p>
                <button onClick={() => navigate(1)} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform">
                  <ChevronRight className="w-4 h-4 text-foreground" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase">From</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface text-sm text-foreground border-none focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase">To</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface text-sm text-foreground border-none focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Summary cards */}
          <div className="px-4 pt-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-primary/10 rounded-xl p-3 text-center">
                <DollarSign className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="text-lg font-bold text-foreground">{totalEarnings.toFixed(0)}</p>
                <p className="text-[10px] text-muted-foreground">MVR Earned</p>
              </div>
              <div className="bg-surface rounded-xl p-3 text-center">
                <Navigation className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="text-lg font-bold text-foreground">{completedTrips.length}</p>
                <p className="text-[10px] text-muted-foreground">Rides</p>
              </div>
              <div className="bg-surface rounded-xl p-3 text-center">
                <Clock className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="text-lg font-bold text-foreground">{timeStr}</p>
                <p className="text-[10px] text-muted-foreground">Time</p>
              </div>
            </div>
          </div>

          {/* Trip list */}
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6 space-y-2 min-h-[120px]">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Trip History ({trips.length})
            </p>

            {loading ? (
              <div className="text-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : trips.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No trips for this period</p>
              </div>
            ) : (
              trips.map(trip => {
                const fare = Number(trip.actual_fare) || Number(trip.estimated_fare) || 0;
                const isCancelled = trip.status === "cancelled";
                return (
                  <div key={trip.id} className="bg-surface rounded-xl p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isCancelled ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                        {trip.status}
                      </span>
                      <span className="text-sm font-bold text-foreground">{fare > 0 ? `${fare} MVR` : "—"}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="mt-1 space-y-1">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <div className="w-0.5 h-3 bg-border mx-auto" />
                        <div className="w-2 h-2 rounded-sm bg-foreground" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-xs text-foreground truncate">{trip.pickup_address || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate">{trip.dropoff_address || "—"}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(trip.created_at), "h:mm a")}
                      {trip.duration_minutes ? ` • ${Math.round(Number(trip.duration_minutes))}min` : ""}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default DriverEarnings;
