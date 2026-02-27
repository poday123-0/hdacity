import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, X, PackageX, Star, MapPin, Clock, DollarSign, User, Users, Luggage, CalendarClock, Timer, Phone } from "lucide-react";

const statusColors: Record<string, string> = {
  requested: "bg-yellow-100 text-yellow-700",
  scheduled: "bg-purple-100 text-purple-700",
  accepted: "bg-blue-100 text-blue-700",
  arrived: "bg-indigo-100 text-indigo-700",
  in_progress: "bg-primary/10 text-primary",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const bookingTypeLabels: Record<string, string> = {
  now: "Instant",
  scheduled: "📅 Scheduled",
  hourly: "⏱ Hourly",
};

const AdminTrips = () => {
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedTripMessages, setSelectedTripMessages] = useState<any[] | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [lostItems, setLostItems] = useState<any[]>([]);

  const fetchTrips = async () => {
    setLoading(true);
    let query = supabase
      .from("trips")
      .select("*, passenger:profiles!trips_passenger_id_fkey(first_name, last_name, phone_number), driver:profiles!trips_driver_id_fkey(first_name, last_name, phone_number)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (filter !== "all") query = query.eq("status", filter);
    const { data } = await query;
    setTrips(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchTrips(); }, [filter]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-trips")
      .on("postgres_changes", { event: "*", schema: "public", table: "trips" }, () => fetchTrips())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [filter]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Trips</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="all">All Trips</option>
          <option value="requested">Requested</option>
          <option value="scheduled">Scheduled</option>
          <option value="accepted">Accepted</option>
          <option value="arrived">Arrived</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Passenger</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Driver</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Route</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Fare</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Type</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Pax</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Time</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : trips.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No trips found</td></tr>
            ) : (
              trips.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm text-foreground">{t.passenger ? `${t.passenger.first_name} ${t.passenger.last_name}` : t.customer_name || "—"}</p>
                    <p className="text-[10px] text-muted-foreground">{t.passenger?.phone_number || t.customer_phone || ""}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-muted-foreground">{t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : "—"}</p>
                    <p className="text-[10px] text-muted-foreground">{t.driver?.phone_number || ""}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="text-xs text-foreground truncate">{t.pickup_address || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">→ {t.dropoff_address || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">
                    {t.actual_fare ? `${t.actual_fare} MVR` : t.estimated_fare ? `~${t.estimated_fare} MVR` : "—"}
                    {t.fare_type === "hourly" && <span className="text-[10px] text-muted-foreground">/hr</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-surface text-muted-foreground whitespace-nowrap">
                      {bookingTypeLabels[t.booking_type] || t.booking_type || "—"}
                    </span>
                    {t.dispatch_type === "operator" && (
                      <span className="ml-1 text-[10px] font-bold text-accent-foreground bg-accent px-1.5 py-0.5 rounded-full">Dispatch</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[t.status] || "bg-muted text-muted-foreground"}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.passenger_count || 1}</span>
                    <span className="flex items-center gap-1"><Luggage className="w-3 h-3" />{t.luggage_count || 0}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(t.created_at).toLocaleString()}
                    {t.booking_type === "scheduled" && t.scheduled_at && (
                      <p className="text-[10px] text-primary font-medium">📅 {new Date(t.scheduled_at).toLocaleString()}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => viewMessages(t.id)} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-primary hover:bg-primary/10 transition-colors">
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
                      <span>Fare: <span className="text-foreground font-medium">{selectedTrip.actual_fare ? `MVR ${selectedTrip.actual_fare}` : selectedTrip.estimated_fare ? `~MVR ${selectedTrip.estimated_fare}` : "—"}{selectedTrip.fare_type === "hourly" ? "/hr" : ""}</span></span>
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
                    {selectedTrip.dispatch_type && selectedTrip.dispatch_type !== "passenger" && (
                      <div className="flex items-center gap-1.5 text-accent-foreground">
                        <span className="text-[10px] font-bold bg-accent px-1.5 py-0.5 rounded-full">Dispatched by operator</span>
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
