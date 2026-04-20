import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { notifyTripRequested } from "@/lib/push-notifications";
import { MessageSquare, X, PackageX, Star, MapPin, Clock, DollarSign, User, Users, Luggage, CalendarClock, Timer, Phone, Search, Filter, Calendar, Send } from "lucide-react";

const statusOptions = [
  { value: "all", label: "All", color: "bg-surface text-foreground" },
  { value: "requested", label: "Requested", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400" },
  { value: "scheduled", label: "Scheduled", color: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400" },
  { value: "accepted", label: "Accepted", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" },
  { value: "arrived", label: "Arrived", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400" },
  { value: "in_progress", label: "In Progress", color: "bg-primary/10 text-primary" },
  { value: "completed", label: "Completed", color: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" },
];

const bookingTypeLabels: Record<string, string> = {
  now: "Instant",
  scheduled: "📅 Scheduled",
  hourly: "⏱ Hourly",
};

const dispatchTypeLabels: Record<string, { label: string; color: string }> = {
  passenger: { label: "🧑 Customer", color: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" },
  dispatch_broadcast: { label: "📡 Send to App", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" },
  operator: { label: "📋 Assign", color: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400" },
};

const AdminTrips = () => {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [bookingFilter, setBookingFilter] = useState("all");
  const [dispatchFilter, setDispatchFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTripMessages, setSelectedTripMessages] = useState<any[] | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [lostItems, setLostItems] = useState<any[]>([]);

  const fetchTrips = async () => {
    setLoading(true);
    // Default to the last 30 days when the user hasn't picked a date range.
    // Loading the entire trips table on every mount/realtime tick was the cause
    // of the slow loading.
    const hasDateRange = !!dateFrom || !!dateTo;
    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    let allTrips: any[] = [];
    const pageSize = 1000;
    // Cap unbounded pagination: only paginate when the user explicitly set a date range.
    const maxPages = hasDateRange ? 50 : 1;
    let from = 0;
    let hasMore = true;
    let page = 0;

    while (hasMore && page < maxPages) {
      let query = supabase
        .from("trips")
        .select("*, passenger:profiles!trips_passenger_id_fkey(first_name, last_name, phone_number), driver:profiles!trips_driver_id_fkey(first_name, last_name, phone_number)")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (filter !== "all") query = query.eq("status", filter);
      if (bookingFilter !== "all") query = query.eq("booking_type", bookingFilter);
      if (dispatchFilter !== "all") query = query.eq("dispatch_type", dispatchFilter);
      if (dateFrom) {
        query = query.gte("created_at", new Date(dateFrom).toISOString());
      } else if (!hasDateRange) {
        query = query.gte("created_at", defaultFrom.toISOString());
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        query = query.lte("created_at", endDate.toISOString());
      }
      const { data } = await query;
      if (data && data.length > 0) {
        allTrips = allTrips.concat(data);
        from += pageSize;
        page += 1;
        if (data.length < pageSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }
    setTrips(allTrips);
    setLoading(false);
  };

  useEffect(() => { fetchTrips(); }, [filter, bookingFilter, dispatchFilter, dateFrom, dateTo]);

  // Keep latest fetchTrips reachable from a stable realtime subscription
  const fetchTripsRef = useRef(fetchTrips);
  fetchTripsRef.current = fetchTrips;

  useEffect(() => {
    // Debounce rapid bursts of trip updates so the UI stays responsive
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("admin-trips-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => {
        if (debounceId) clearTimeout(debounceId);
        debounceId = setTimeout(() => fetchTripsRef.current(), 400);
      })
      .subscribe();
    return () => {
      if (debounceId) clearTimeout(debounceId);
      supabase.removeChannel(channel);
    };
  }, []);

  const viewMessages = async (tripId: string) => {
    setSelectedTripId(tripId);
    const [{ data: msgs }, { data: items }] = await Promise.all([
      supabase.from("trip_messages").select("*").eq("trip_id", tripId).order("created_at", { ascending: true }),
      supabase.from("lost_item_reports").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
    ]);
    setSelectedTripMessages((msgs as any[]) || []);
    setLostItems((items as any[]) || []);
  };

  const selectedTrip = trips.find(t => t.id === selectedTripId);

  // Client-side search filter
  const filteredTrips = trips.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    const passengerName = t.passenger ? `${t.passenger.first_name} ${t.passenger.last_name}`.toLowerCase() : (t.customer_name || "").toLowerCase();
    const driverName = t.driver ? `${t.driver.first_name} ${t.driver.last_name}`.toLowerCase() : "";
    const phone = t.passenger?.phone_number || t.customer_phone || "";
    return passengerName.includes(q) || driverName.includes(q) || phone.includes(q) || (t.pickup_address || "").toLowerCase().includes(q) || (t.dropoff_address || "").toLowerCase().includes(q);
  });

  const activeFilterCount = [bookingFilter !== "all", dispatchFilter !== "all", !!dateFrom, !!dateTo].filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-extrabold text-foreground">Trips</h2>
          <p className="text-sm text-muted-foreground">{filteredTrips.length} trip{filteredTrips.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${showFilters ? "bg-primary text-primary-foreground border-primary" : "bg-surface text-foreground border-border hover:bg-muted"}`}
        >
          <Filter className="w-3.5 h-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="w-4.5 h-4.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center ml-0.5">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by passenger, driver, phone, or address..."
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5">
        {statusOptions.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === s.value
                ? `${s.color} ring-2 ring-primary/30 shadow-sm`
                : "bg-surface text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="bg-card border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Booking Type</label>
            <select
              value={bookingFilter}
              onChange={(e) => setBookingFilter(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Types</option>
              <option value="now">Instant</option>
              <option value="scheduled">Scheduled</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Trip Source</label>
            <select
              value={dispatchFilter}
              onChange={(e) => setDispatchFilter(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Sources</option>
              <option value="passenger">🧑 Customer App</option>
              <option value="dispatch_broadcast">📡 Send to App</option>
              <option value="operator">📋 Assign</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          {activeFilterCount > 0 && (
            <div className="sm:col-span-4">
              <button onClick={() => { setBookingFilter("all"); setDispatchFilter("all"); setDateFrom(""); setDateTo(""); }} className="text-xs text-primary font-semibold hover:underline">
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Passenger</th>
                <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Driver</th>
                <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Route</th>
                <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Fare</th>
                <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Type</th>
                <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Pax</th>
                <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3">Time</th>
                <th className="text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Loading...</td></tr>
              ) : filteredTrips.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No trips found</td></tr>
              ) : (
                filteredTrips.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{t.passenger ? `${t.passenger.first_name} ${t.passenger.last_name}` : t.customer_name || "—"}</p>
                      <p className="text-[10px] text-muted-foreground">{t.passenger?.phone_number || t.customer_phone || ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-foreground">{t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : "—"}</p>
                      <p className="text-[10px] text-muted-foreground">{t.driver?.phone_number || ""}</p>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="text-xs text-foreground truncate">{t.pickup_address || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">→ {t.dropoff_address || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground whitespace-nowrap">
                      {t.actual_fare ? `${t.actual_fare} MVR` : t.estimated_fare ? `~${t.estimated_fare} MVR` : "—"}
                      {t.fare_type === "hourly" && <span className="text-[10px] text-muted-foreground">/hr</span>}
                      {(t as any).passenger_bonus > 0 && (
                        <span className="ml-1 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">+{(t as any).passenger_bonus}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface text-muted-foreground whitespace-nowrap">
                        {bookingTypeLabels[t.booking_type] || t.booking_type || "—"}
                      </span>
                      <div className="mt-0.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${dispatchTypeLabels[t.dispatch_type]?.color || "bg-muted text-muted-foreground"}`}>
                          {dispatchTypeLabels[t.dispatch_type]?.label || t.dispatch_type || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${statusOptions.find(s => s.value === t.status)?.color || "bg-muted text-muted-foreground"}`}>{t.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.passenger_count || 1}</span>
                    </td>
                    <td className="px-4 py-3 text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(t.created_at).toLocaleString()}
                      {t.booking_type === "scheduled" && t.scheduled_at && (
                        <p className="text-[10px] text-primary font-medium">📅 {new Date(t.scheduled_at).toLocaleString()}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {/* Send to drivers for scheduled trips without a driver */}
                        {t.booking_type === "scheduled" && t.status === "scheduled" && !t.driver_id && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Re-broadcast to all eligible online drivers (filtered by vehicle type)
                              let dlQuery = supabase
                                .from("driver_locations")
                                .select("driver_id")
                                .eq("is_online", true)
                                .eq("is_on_trip", false);
                              if (t.vehicle_type_id) dlQuery = dlQuery.eq("vehicle_type_id", t.vehicle_type_id);
                              const { data: onlineDrivers } = await dlQuery;
                              if (onlineDrivers && onlineDrivers.length > 0) {
                                const driverIds = onlineDrivers.map((d: any) => d.driver_id);
                                await notifyTripRequested(driverIds, t.id, t.pickup_address, t.vehicle_type_id || undefined, t.estimated_fare ?? null);
                                // Also change status to requested so drivers see it as a normal trip
                                await supabase.from("trips").update({ status: "requested" }).eq("id", t.id);
                                toast({ title: "Sent to drivers", description: `Notified ${driverIds.length} eligible driver(s)` });
                                fetchTrips();
                              } else {
                                toast({ title: "No eligible drivers online", description: "No drivers of the requested vehicle type are currently online.", variant: "destructive" });
                              }
                            }}
                            className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
                            title="Send to online drivers"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => viewMessages(t.id)} className="w-8 h-8 rounded-xl bg-surface flex items-center justify-center text-primary hover:bg-primary/10 transition-colors">
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trip detail modal */}
      {selectedTripMessages !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm" onClick={() => { setSelectedTripMessages(null); setSelectedTripId(null); }}>
          <div className="bg-card rounded-2xl shadow-2xl mx-4 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Trip Details</h3>
              <button onClick={() => { setSelectedTripMessages(null); setSelectedTripId(null); }} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Trip info */}
              {selectedTrip && (
                <div className="bg-surface rounded-xl p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <User className="w-3 h-3" />
                      <span>Passenger: <span className="text-foreground font-medium">{selectedTrip.passenger ? `${selectedTrip.passenger.first_name} ${selectedTrip.passenger.last_name}` : selectedTrip.customer_name || "—"}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <User className="w-3 h-3" />
                      <span>Driver: <span className="text-foreground font-medium">{selectedTrip.driver ? `${selectedTrip.driver.first_name} ${selectedTrip.driver.last_name}` : "—"}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{selectedTrip.pickup_address}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{selectedTrip.dropoff_address}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <DollarSign className="w-3 h-3" />
                      <span>Fare: <span className="text-foreground font-medium">{selectedTrip.actual_fare ? `MVR ${selectedTrip.actual_fare}` : selectedTrip.estimated_fare ? `~MVR ${selectedTrip.estimated_fare}` : "—"}{selectedTrip.fare_type === "hourly" ? "/hr" : ""}</span>{(selectedTrip as any).passenger_bonus > 0 && <span className="text-primary font-bold ml-1">(+{(selectedTrip as any).passenger_bonus} boost)</span>}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{selectedTrip.duration_minutes ? `${selectedTrip.duration_minutes} min` : "—"} • {selectedTrip.distance_km ? `${selectedTrip.distance_km} km` : "—"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="w-3 h-3" />
                      <span>{selectedTrip.passenger_count || 1} pax • {selectedTrip.luggage_count || 0} bags</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarClock className="w-3 h-3" />
                      <span className="text-foreground font-medium">{bookingTypeLabels[selectedTrip.booking_type] || selectedTrip.booking_type || "Instant"}</span>
                    </div>
                    {selectedTrip.booking_type === "scheduled" && selectedTrip.scheduled_at && (
                      <div className="col-span-2 flex items-center gap-1.5 text-primary">
                        <Timer className="w-3 h-3" />
                        <span className="font-medium">Scheduled: {new Date(selectedTrip.scheduled_at).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedTrip.customer_phone && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        <span>Customer: <span className="text-foreground font-medium">{selectedTrip.customer_phone}</span></span>
                      </div>
                    )}
                    {selectedTrip.dispatch_type && (
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${dispatchTypeLabels[selectedTrip.dispatch_type]?.color || "bg-muted text-muted-foreground"}`}>
                          Source: {dispatchTypeLabels[selectedTrip.dispatch_type]?.label || selectedTrip.dispatch_type}
                        </span>
                      </div>
                    )}
                    {selectedTrip.payment_method && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <DollarSign className="w-3 h-3" />
                        <span>Payment: <span className="text-foreground font-medium capitalize">{selectedTrip.payment_method}</span></span>
                      </div>
                    )}
                  </div>
                  {selectedTrip.booking_notes && (
                    <div className="pt-1 border-t border-border">
                      <p className="text-xs text-muted-foreground">Notes: <span className="text-foreground">{selectedTrip.booking_notes}</span></p>
                    </div>
                  )}
                  {/* Rating & feedback */}
                  {selectedTrip.rating && (
                    <div className="flex items-center gap-2 pt-1 border-t border-border">
                      <div className="flex items-center gap-0.5">
                        {[1,2,3,4,5].map(s => (
                          <Star key={s} className={`w-3.5 h-3.5 ${s <= selectedTrip.rating ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                        ))}
                      </div>
                      {selectedTrip.feedback_text && (
                        <p className="text-xs text-muted-foreground italic">"{selectedTrip.feedback_text}"</p>
                      )}
                    </div>
                  )}
                  {selectedTrip.cancel_reason && (
                    <div className="pt-1 border-t border-border">
                      <p className="text-xs text-destructive">Cancel reason: {selectedTrip.cancel_reason}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Lost items */}
              {lostItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1"><PackageX className="w-3.5 h-3.5" /> Lost Item Reports</p>
                  {lostItems.map((item: any) => (
                    <div key={item.id} className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
                      <p className="text-sm text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">Status: <span className="font-medium">{item.status}</span> • {new Date(item.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Messages */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chat History ({selectedTripMessages.length})</p>
              {selectedTripMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No messages in this trip</p>
              ) : (
                selectedTripMessages.map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.sender_type === "system" ? "justify-center" : msg.sender_type === "driver" ? "justify-end" : "justify-start"}`}>
                    {msg.sender_type === "system" ? (
                      <span className="text-[10px] text-muted-foreground bg-surface px-3 py-1 rounded-full">{msg.message}</span>
                    ) : (
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${msg.sender_type === "driver" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-surface text-foreground rounded-bl-md"}`}>
                        <p className="text-[10px] font-semibold opacity-70 mb-0.5">{msg.sender_type === "driver" ? "Driver" : "Passenger"}</p>
                        <p className="text-sm">{msg.message}</p>
                        <p className="text-[9px] mt-1 opacity-60">{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTrips;
