import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { X, DollarSign, Navigation, Clock, ChevronLeft, ChevronRight, Calendar, TrendingUp, MapPin, Users, Luggage, Star, ChevronDown, MessageSquare, Download, Loader2 } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths, addDays, addWeeks, addMonths } from "date-fns";
import { toPng } from "html-to-image";
import { toast } from "@/hooks/use-toast";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import TripChat from "@/components/TripChat";

// Mini route map for trip details
const TripRouteMapMini = ({ pickupLat, pickupLng, dropoffLat, dropoffLng }: {
  pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number;
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const { isLoaded, mapId } = useGoogleMaps();
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current || mapInstanceRef.current) return;
    try {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: pickupLat, lng: pickupLng });
      bounds.extend({ lat: dropoffLat, lng: dropoffLng });
      const map = new google.maps.Map(mapContainerRef.current, {
        mapId: mapId || undefined,
        disableDefaultUI: true,
        gestureHandling: "none",
        zoomControl: false,
        clickableIcons: false,
      });
      map.fitBounds(bounds, 30);
      mapInstanceRef.current = map;
      new google.maps.Marker({ position: { lat: pickupLat, lng: pickupLng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: "#22c55e", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 }, title: "Pickup" });
      new google.maps.Marker({ position: { lat: dropoffLat, lng: dropoffLng }, map, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 }, title: "Dropoff" });
      const ds = new google.maps.DirectionsService();
      const dr = new google.maps.DirectionsRenderer({ map, suppressMarkers: true, preserveViewport: true, polylineOptions: { strokeColor: "hsl(var(--primary))", strokeWeight: 3, strokeOpacity: 0.8 } });
      ds.route({ origin: { lat: pickupLat, lng: pickupLng }, destination: { lat: dropoffLat, lng: dropoffLng }, travelMode: google.maps.TravelMode.DRIVING }, (result, status) => { if (status === "OK" && result) dr.setDirections(result); });
      setMapReady(true);
    } catch (err) { console.error("TripRouteMapMini error:", err); }
  }, [isLoaded, mapId, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  return (
    <div className="relative w-full h-[120px] rounded-lg overflow-hidden bg-surface">
      {!mapReady && <div className="absolute inset-0 flex items-center justify-center z-10"><Loader2 className="w-4 h-4 text-primary animate-spin" /></div>}
      <div ref={mapContainerRef} className="w-full h-full" />
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
        .select("id, actual_fare, estimated_fare, duration_minutes, distance_km, status, created_at, pickup_address, dropoff_address, completed_at, accepted_at, started_at, passenger_count, luggage_count, rating, feedback_text, customer_name, fare_type")
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
                          <div className="pt-2 mt-2 border-t border-border space-y-2">
                            {/* Passenger */}
                            {trip.customer_name && (
                              <div className="flex items-center gap-2">
                                <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <p className="text-xs text-foreground">{trip.customer_name}</p>
                              </div>
                            )}

                            {/* Trip details grid */}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-card rounded-lg px-2.5 py-1.5">
                                <p className="text-[10px] text-muted-foreground">Passengers</p>
                                <p className="text-xs font-semibold text-foreground">{trip.passenger_count}</p>
                              </div>
                              <div className="bg-card rounded-lg px-2.5 py-1.5">
                                <p className="text-[10px] text-muted-foreground">Luggage</p>
                                <p className="text-xs font-semibold text-foreground">{trip.luggage_count}</p>
                              </div>
                              {trip.distance_km && (
                                <div className="bg-card rounded-lg px-2.5 py-1.5">
                                  <p className="text-[10px] text-muted-foreground">Distance</p>
                                  <p className="text-xs font-semibold text-foreground">{Number(trip.distance_km).toFixed(1)} km</p>
                                </div>
                              )}
                              <div className="bg-card rounded-lg px-2.5 py-1.5">
                                <p className="text-[10px] text-muted-foreground">Fare Type</p>
                                <p className="text-xs font-semibold text-foreground capitalize">{trip.fare_type}</p>
                              </div>
                            </div>

                            {/* Timeline */}
                            <div className="space-y-1">
                              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Timeline</p>
                              <div className="space-y-0.5 text-[10px] text-muted-foreground">
                                <p>Requested: {format(new Date(trip.created_at), "h:mm:ss a")}</p>
                                {trip.accepted_at && <p>Accepted: {format(new Date(trip.accepted_at), "h:mm:ss a")}</p>}
                                {trip.started_at && <p>Started: {format(new Date(trip.started_at), "h:mm:ss a")}</p>}
                                {trip.completed_at && <p>Completed: {format(new Date(trip.completed_at), "h:mm:ss a")}</p>}
                              </div>
                            </div>

                            {/* Fare breakdown */}
                            {(trip.estimated_fare || trip.actual_fare) && (
                              <div className="space-y-0.5">
                                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Fare</p>
                                <div className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">Estimated</span>
                                  <span className="text-foreground font-medium">{Number(trip.estimated_fare) || 0} MVR</span>
                                </div>
                                {trip.actual_fare && (
                                  <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Actual</span>
                                    <span className="text-foreground font-bold">{Number(trip.actual_fare)} MVR</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Feedback */}
                            {trip.feedback_text && (
                              <div className="bg-card rounded-lg p-2.5">
                                <p className="text-[10px] text-muted-foreground font-semibold mb-0.5">Passenger Feedback</p>
                                <p className="text-xs text-foreground italic">"{trip.feedback_text}"</p>
                              </div>
                            )}

                            {/* View Chat */}
                            {(messageCounts[trip.id] || 0) > 0 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setChatTripId(trip.id); }}
                                className="w-full py-2 rounded-lg bg-primary/10 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-primary" />
                                <span className="text-[10px] font-semibold text-primary">{messageCounts[trip.id]} messages</span>
                              </button>
                            )}
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
