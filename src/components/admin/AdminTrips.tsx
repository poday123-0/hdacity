import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, X, PackageX, Star, MapPin, Clock, DollarSign, User } from "lucide-react";

const statusColors: Record<string, string> = {
  requested: "bg-yellow-100 text-yellow-700",
  accepted: "bg-blue-100 text-blue-700",
  arrived: "bg-indigo-100 text-indigo-700",
  in_progress: "bg-primary/10 text-primary",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
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
      .select("*, passenger:profiles!trips_passenger_id_fkey(first_name, last_name), driver:profiles!trips_driver_id_fkey(first_name, last_name)")
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
          <option value="accepted">Accepted</option>
          <option value="arrived">Arrived</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Passenger</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Driver</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Pickup</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Dropoff</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Fare</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Time</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Chat</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : trips.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No trips found</td></tr>
            ) : (
              trips.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-sm text-foreground">{t.passenger ? `${t.passenger.first_name} ${t.passenger.last_name}` : "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{t.driver ? `${t.driver.first_name} ${t.driver.last_name}` : "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[150px]">{t.pickup_address || "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[150px]">{t.dropoff_address || "—"}</td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{t.estimated_fare ? `${t.estimated_fare} MVR` : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[t.status] || "bg-muted text-muted-foreground"}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
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
                      <span>Fare: <span className="text-foreground font-medium">{selectedTrip.actual_fare ? `MVR ${selectedTrip.actual_fare}` : selectedTrip.estimated_fare ? `~MVR ${selectedTrip.estimated_fare}` : "—"}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{selectedTrip.duration_minutes ? `${selectedTrip.duration_minutes} min` : "—"} • {selectedTrip.distance_km ? `${selectedTrip.distance_km} km` : "—"}</span>
                    </div>
                  </div>
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
