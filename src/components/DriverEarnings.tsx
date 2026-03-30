import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { X, DollarSign, Navigation, Clock, ChevronLeft, ChevronRight, Calendar, TrendingUp, MapPin, Users, Luggage, Star, ChevronDown, MessageSquare, Download, Loader2 } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths, addDays, addWeeks, addMonths } from "date-fns";
import { toPng } from "html-to-image";
import { toast } from "@/hooks/use-toast";

import TripChat from "@/components/TripChat";

// Static map image for trip details (renders correctly in PNG export)
const TripRouteMapMini = ({ pickupLat, pickupLng, dropoffLat, dropoffLng }: {
  pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number;
}) => {
  const [mapsKey, setMapsKey] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  useEffect(() => {
    // Try cache first
    try {
      const cached = localStorage.getItem("hda_maps_key_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.key) { setMapsKey(parsed.key); return; }
      }
    } catch {}
    supabase.functions.invoke("get-maps-key").then(({ data }) => {
      if (data?.key) setMapsKey(data.key);
    });
  }, []);

  if (!mapsKey) {
    return (
      <div className="w-full h-[120px] rounded-lg bg-surface flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-primary animate-spin" />
      </div>
    );
  }

  const staticUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x240&scale=2&maptype=roadmap&markers=color:green%7Csize:small%7C${pickupLat},${pickupLng}&markers=color:red%7Csize:small%7C${dropoffLat},${dropoffLng}&path=color:0x3b82f6ff%7Cweight:3%7C${pickupLat},${pickupLng}%7C${dropoffLat},${dropoffLng}&key=${mapsKey}`;

  return (
    <div className="relative w-full h-[120px] rounded-lg overflow-hidden bg-surface">
      {!imgLoaded && <div className="absolute inset-0 flex items-center justify-center z-10"><Loader2 className="w-4 h-4 text-primary animate-spin" /></div>}
      <img
        src={staticUrl}
        alt="Trip route"
        className="w-full h-full object-cover"
        crossOrigin="anonymous"
        onLoad={() => setImgLoaded(true)}
      />
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded px-2 py-1">
        <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /><span className="text-[8px] font-medium text-foreground">Pickup</span></div>
        <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-[8px] font-medium text-foreground">Drop</span></div>
      </div>
    </div>
  );
};

type Period = "day" | "week" | "month" | "custom";

interface TripRecord {
  id: string;
  actual_fare: number | null;
  estimated_fare: number | null;
  duration_minutes: number | null;
  distance_km: number | null;
  status: string;
  created_at: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  completed_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  passenger_count: number;
  luggage_count: number;
  rating: number | null;
  feedback_text: string | null;
  customer_name: string | null;
  fare_type: string;
}

interface DriverEarningsProps {
  driverId: string;
  isOpen: boolean;
  onClose: () => void;
  vehicleId?: string | null;
  vehiclePlate?: string;
}

const DriverEarnings = ({ driverId, isOpen, onClose, vehicleId, vehiclePlate }: DriverEarningsProps) => {
  const [period, setPeriod] = useState<Period>("day");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [chatTripId, setChatTripId] = useState<string | null>(null);
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({});
  const [exporting, setExporting] = useState<string | null>(null);
  const tripDetailRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
      let query = supabase
        .from("trips")
        .select("id, actual_fare, estimated_fare, duration_minutes, distance_km, status, created_at, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, completed_at, accepted_at, started_at, passenger_count, luggage_count, rating, feedback_text, customer_name, fare_type")
        .eq("driver_id", driverId)
        .gte("created_at", dateRange.from.toISOString())
        .lte("created_at", dateRange.to.toISOString())
        .order("created_at", { ascending: false });
      if (vehicleId) query = query.eq("vehicle_id", vehicleId);
      const { data } = await query;
      const tripData = (data as TripRecord[]) || [];
      setTrips(tripData);
      // Fetch message counts
      if (tripData.length > 0) {
        const tripIds = tripData.map(t => t.id);
        const { data: msgs } = await supabase.from("trip_messages").select("trip_id").in("trip_id", tripIds);
        const counts: Record<string, number> = {};
        (msgs || []).forEach((m: any) => { counts[m.trip_id] = (counts[m.trip_id] || 0) + 1; });
        setMessageCounts(counts);
      } else {
        setMessageCounts({});
      }
      setLoading(false);
    };
    fetchTrips();
  }, [isOpen, driverId, dateRange, vehicleId]);

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
              <div>
                <h3 className="font-bold text-foreground">Earnings</h3>
                {vehiclePlate && <p className="text-[10px] text-muted-foreground">Vehicle: {vehiclePlate}</p>}
              </div>
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
                const isExpanded = expandedTripId === trip.id;
                return (
                  <button
                    key={trip.id}
                    onClick={() => setExpandedTripId(isExpanded ? null : trip.id)}
                    className="w-full text-left bg-surface rounded-xl p-3 space-y-1 active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isCancelled ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                          {trip.status}
                        </span>
                        {trip.rating && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-500">
                            <Star className="w-3 h-3 fill-amber-500" />{trip.rating}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-foreground">{fare > 0 ? `${fare} MVR` : "—"}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
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
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(trip.created_at), "h:mm a")}
                        {trip.duration_minutes ? ` • ${Math.round(Number(trip.duration_minutes))}min` : ""}
                      </p>
                      {(messageCounts[trip.id] || 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-primary font-medium">
                          <MessageSquare className="w-3 h-3" />{messageCounts[trip.id]}
                        </span>
                      )}
                    </div>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div ref={(el) => { tripDetailRefs.current[trip.id] = el; }} style={{ background: "#ffffff", borderRadius: "16px", padding: "20px", fontFamily: "'Inter', system-ui, sans-serif" }}>
                            {/* Branded header */}
                            <div style={{ textAlign: "center", marginBottom: "16px" }}>
                              <p style={{ fontSize: "18px", fontWeight: "800", color: "#1a1a2e", letterSpacing: "0.05em" }}>TRIP RECEIPT</p>
                              <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{format(new Date(trip.created_at), "dd MMM yyyy • h:mm a")}</p>
                            </div>

                            {/* Route Map */}
                            {trip.pickup_lat && trip.pickup_lng && trip.dropoff_lat && trip.dropoff_lng && (
                              <div style={{ marginBottom: "16px", borderRadius: "12px", overflow: "hidden" }}>
                                <TripRouteMapMini
                                  pickupLat={trip.pickup_lat}
                                  pickupLng={trip.pickup_lng}
                                  dropoffLat={trip.dropoff_lat}
                                  dropoffLng={trip.dropoff_lng}
                                />
                              </div>
                            )}

                            {/* Route addresses */}
                            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", paddingTop: "4px" }}>
                                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e" }} />
                                <div style={{ width: "2px", height: "24px", background: "#e2e8f0" }} />
                                <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#ef4444" }} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <p style={{ fontSize: "11px", color: "#94a3b8", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Pickup</p>
                                <p style={{ fontSize: "13px", color: "#1e293b", fontWeight: "500", marginBottom: "8px" }}>{trip.pickup_address || "—"}</p>
                                <p style={{ fontSize: "11px", color: "#94a3b8", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>Dropoff</p>
                                <p style={{ fontSize: "13px", color: "#1e293b", fontWeight: "500" }}>{trip.dropoff_address || "—"}</p>
                              </div>
                            </div>

                            {/* Fare highlight */}
                            <div style={{ background: "linear-gradient(135deg, #40A3DB, #2d8abf)", borderRadius: "14px", padding: "16px", textAlign: "center", marginBottom: "16px" }}>
                              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.8)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.1em" }}>Total Fare</p>
                              <p style={{ fontSize: "32px", fontWeight: "800", color: "#ffffff", lineHeight: "1.1", marginTop: "4px" }}>{Number(trip.actual_fare || trip.estimated_fare || 0)} <span style={{ fontSize: "16px", fontWeight: "600" }}>MVR</span></p>
                            </div>

                            {/* Passenger */}
                            {trip.customer_name && (
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", padding: "10px 12px", background: "#f8fafc", borderRadius: "10px" }}>
                                <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <span style={{ fontSize: "12px" }}>👤</span>
                                </div>
                                <p style={{ fontSize: "13px", color: "#1e293b", fontWeight: "600" }}>{trip.customer_name}</p>
                              </div>
                            )}

                            {/* Details grid */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                              {[
                                { label: "Passengers", value: String(trip.passenger_count) },
                                { label: "Luggage", value: String(trip.luggage_count) },
                                ...(trip.distance_km ? [{ label: "Distance", value: `${Number(trip.distance_km).toFixed(1)} km` }] : []),
                                { label: "Fare Type", value: trip.fare_type.charAt(0).toUpperCase() + trip.fare_type.slice(1) },
                              ].map((item) => (
                                <div key={item.label} style={{ background: "#f8fafc", borderRadius: "10px", padding: "10px 12px" }}>
                                  <p style={{ fontSize: "10px", color: "#94a3b8", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</p>
                                  <p style={{ fontSize: "14px", color: "#1e293b", fontWeight: "700", marginTop: "2px" }}>{item.value}</p>
                                </div>
                              ))}
                            </div>

                            {/* Timeline */}
                            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "12px", marginBottom: "12px" }}>
                              <p style={{ fontSize: "10px", color: "#94a3b8", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Timeline</p>
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                {[
                                  { label: "Requested", time: trip.created_at },
                                  ...(trip.accepted_at ? [{ label: "Accepted", time: trip.accepted_at }] : []),
                                  ...(trip.started_at ? [{ label: "Started", time: trip.started_at }] : []),
                                  ...(trip.completed_at ? [{ label: "Completed", time: trip.completed_at }] : []),
                                ].map((t) => (
                                  <div key={t.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                                    <span style={{ color: "#64748b" }}>{t.label}</span>
                                    <span style={{ color: "#1e293b", fontWeight: "600" }}>{format(new Date(t.time), "h:mm:ss a")}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Fare breakdown */}
                            {(trip.estimated_fare || trip.actual_fare) && (
                              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "12px", marginBottom: "12px" }}>
                                <p style={{ fontSize: "10px", color: "#94a3b8", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Fare Breakdown</p>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                                  <span style={{ color: "#64748b" }}>Estimated</span>
                                  <span style={{ color: "#1e293b", fontWeight: "500" }}>{Number(trip.estimated_fare) || 0} MVR</span>
                                </div>
                                {trip.actual_fare && (
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                                    <span style={{ color: "#64748b" }}>Actual</span>
                                    <span style={{ color: "#1e293b", fontWeight: "700" }}>{Number(trip.actual_fare)} MVR</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Rating */}
                            {trip.rating && (
                              <div style={{ display: "flex", justifyContent: "center", gap: "4px", padding: "8px 0" }}>
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <span key={s} style={{ fontSize: "18px" }}>{s <= (trip.rating || 0) ? "⭐" : "☆"}</span>
                                ))}
                              </div>
                            )}

                            {/* Feedback */}
                            {trip.feedback_text && (
                              <div style={{ background: "#f0f9ff", borderRadius: "10px", padding: "12px", marginTop: "8px" }}>
                                <p style={{ fontSize: "10px", color: "#94a3b8", fontWeight: "600", marginBottom: "4px" }}>Passenger Feedback</p>
                                <p style={{ fontSize: "12px", color: "#1e293b", fontStyle: "italic" }}>"{trip.feedback_text}"</p>
                              </div>
                            )}

                            {/* Footer */}
                            <div style={{ textAlign: "center", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #f1f5f9" }}>
                              <p style={{ fontSize: "9px", color: "#cbd5e1", letterSpacing: "0.1em" }}>Trip ID: {trip.id.slice(0, 8).toUpperCase()}</p>
                            </div>
                          </div>

                            {/* Action buttons - outside receipt for export */}
                            <div className="flex gap-2 mt-2">
                              {(messageCounts[trip.id] || 0) > 0 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setChatTripId(trip.id); }}
                                  className="flex-1 py-2 rounded-lg bg-primary/10 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                                  <span className="text-[10px] font-semibold text-primary">{messageCounts[trip.id]} msgs</span>
                                </button>
                              )}
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const el = tripDetailRefs.current[trip.id];
                                  if (!el) return;
                                  setExporting(trip.id);
                                  try {
                                    const dataUrl = await toPng(el, { pixelRatio: 3, backgroundColor: "#ffffff" });
                                    const isNative = !!(window as any).Capacitor?.isNativePlatform?.();
                                    if (isNative) {
                                      const res = await fetch(dataUrl);
                                      const blob = await res.blob();
                                      const file = new File([blob], `trip-${trip.id.slice(0, 8)}.png`, { type: "image/png" });
                                      if (navigator.share && navigator.canShare?.({ files: [file] })) {
                                        await navigator.share({ files: [file], title: "Trip Receipt" });
                                      } else {
                                        const w = window.open();
                                        if (w) { w.document.write(`<img src="${dataUrl}" style="max-width:100%"/>`); }
                                      }
                                    } else {
                                      const link = document.createElement("a");
                                      link.download = `trip-${trip.id.slice(0, 8)}.png`;
                                      link.href = dataUrl;
                                      link.click();
                                    }
                                    toast({ title: "Receipt exported ✅" });
                                  } catch { toast({ title: "Export failed", variant: "destructive" }); }
                                  finally { setExporting(null); }
                                }}
                                className="flex-1 py-2 rounded-lg bg-surface border border-border flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                              >
                                {exporting === trip.id ? <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" /> : <Download className="w-3.5 h-3.5 text-primary" />}
                                <span className="text-[10px] font-semibold text-foreground">Export PNG</span>
                              </button>
                            </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
      {chatTripId && (
        <TripChat tripId={chatTripId} senderId={driverId} senderType="driver" isOpen={true} onClose={() => setChatTripId(null)} readOnly />
      )}
    </AnimatePresence>
  );
};

export default DriverEarnings;
