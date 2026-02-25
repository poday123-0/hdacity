import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Car, MapPin, DollarSign, TrendingUp, Clock, ExternalLink, Navigation, UserCheck, AlertTriangle, X, MessageSquare, Star, User, PackageX } from "lucide-react";
import MaldivesMap from "@/components/MaldivesMap";

interface TripRoute {
  id: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  pickupAddress: string;
  dropoffAddress: string;
  driverName?: string;
  status: string;
}

interface RecentTrip {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  created_at: string;
  actual_fare: number | null;
  estimated_fare: number | null;
  driver?: { first_name: string; last_name: string } | null;
  passenger?: { first_name: string; last_name: string } | null;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    drivers: 0, vehicles: 0, trips: 0, activeTrips: 0,
    passengers: 0, onlineDrivers: 0, completedToday: 0, cancelledToday: 0,
    todayRevenue: 0,
  });
  const [vehicleMarkers, setVehicleMarkers] = useState<any[]>([]);
  const [tripRoutes, setTripRoutes] = useState<TripRoute[]>([]);
  const [recentTrips, setRecentTrips] = useState<RecentTrip[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [drivers, vehicles, trips, activeTrips, passengers, onlineDrivers, completedToday, cancelledToday, todayRevenueData] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).ilike("user_type", "%Driver%"),
        supabase.from("vehicles").select("id", { count: "exact", head: true }),
        supabase.from("trips").select("id", { count: "exact", head: true }),
        supabase.from("trips").select("id", { count: "exact", head: true }).in("status", ["requested", "accepted", "in_progress"]),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("user_type", "Passenger"),
        supabase.from("driver_locations").select("id", { count: "exact", head: true }).eq("is_online", true),
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "completed").gte("completed_at", todayStart.toISOString()),
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("status", "cancelled").gte("cancelled_at", todayStart.toISOString()),
        supabase.from("trips").select("actual_fare").eq("status", "completed").gte("completed_at", todayStart.toISOString()),
      ]);

      const revenue = (todayRevenueData.data || []).reduce((sum: number, t: any) => sum + (t.actual_fare || 0), 0);

      setStats({
        drivers: drivers.count || 0,
        vehicles: vehicles.count || 0,
        trips: trips.count || 0,
        activeTrips: activeTrips.count || 0,
        passengers: passengers.count || 0,
        onlineDrivers: onlineDrivers.count || 0,
        completedToday: completedToday.count || 0,
        cancelledToday: cancelledToday.count || 0,
        todayRevenue: revenue,
      });
    };
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  // Fetch live driver locations
  useEffect(() => {
    const fetchLocations = async () => {
      const { data } = await supabase
        .from("driver_locations")
        .select("id, lat, lng, driver_id, is_on_trip, vehicle_type_id, vehicle_types:vehicle_type_id(name, image_url, icon, map_icon_url)")
        .eq("is_online", true);
      if (data) {
        setVehicleMarkers(data.map((d: any) => ({
          id: d.id,
          lat: d.lat,
          lng: d.lng,
          name: d.vehicle_types?.name || "Driver",
          imageUrl: d.vehicle_types?.map_icon_url || undefined,
          isOnTrip: d.is_on_trip,
          driverId: d.driver_id,
        })));
      }
    };
    fetchLocations();
    const interval = setInterval(fetchLocations, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch active trip routes
  useEffect(() => {
    const fetchTrips = async () => {
      const { data } = await supabase
        .from("trips")
        .select("id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_address, dropoff_address, status, driver_id, profiles:driver_id(first_name, last_name)")
        .in("status", ["accepted", "in_progress"]);
      if (data) {
        setTripRoutes(data.filter((t: any) => t.pickup_lat && t.dropoff_lat).map((t: any) => ({
          id: t.id,
          pickupLat: t.pickup_lat,
          pickupLng: t.pickup_lng,
          dropoffLat: t.dropoff_lat,
          dropoffLng: t.dropoff_lng,
          pickupAddress: t.pickup_address,
          dropoffAddress: t.dropoff_address,
          driverName: t.profiles ? `${t.profiles.first_name} ${t.profiles.last_name}` : undefined,
          status: t.status,
        })));
      }
    };
    fetchTrips();
    const interval = setInterval(fetchTrips, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch recent trips (with driver/passenger info)
  useEffect(() => {
    const fetchRecent = async () => {
      const { data } = await supabase
        .from("trips")
        .select("*, passenger:profiles!trips_passenger_id_fkey(first_name, last_name), driver:profiles!trips_driver_id_fkey(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setRecentTrips(data as any[]);
    };
    fetchRecent();
  }, []);

  // Trip detail state
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [tripMessages, setTripMessages] = useState<any[]>([]);
  const [tripLostItems, setTripLostItems] = useState<any[]>([]);

  const viewTripDetail = async (trip: any) => {
    setSelectedTrip(trip);
    const [{ data: msgs }, { data: items }] = await Promise.all([
      supabase.from("trip_messages").select("*").eq("trip_id", trip.id).order("created_at", { ascending: true }),
      supabase.from("lost_item_reports").select("*").eq("trip_id", trip.id).order("created_at", { ascending: false }),
    ]);
    setTripMessages((msgs as any[]) || []);
    setTripLostItems((items as any[]) || []);
  };

  const cards = [
    { label: "Online Drivers", value: stats.onlineDrivers, icon: Navigation, color: "text-primary" },
    { label: "Active Trips", value: stats.activeTrips, icon: MapPin, color: "text-primary" },
    { label: "Completed Today", value: stats.completedToday, icon: TrendingUp, color: "text-primary" },
    { label: "Today Revenue", value: `MVR ${stats.todayRevenue.toFixed(0)}`, icon: DollarSign, color: "text-primary" },
    { label: "Total Drivers", value: stats.drivers, icon: Users, color: "text-muted-foreground" },
    { label: "Passengers", value: stats.passengers, icon: UserCheck, color: "text-muted-foreground" },
    { label: "Vehicles", value: stats.vehicles, icon: Car, color: "text-muted-foreground" },
    { label: "Cancelled Today", value: stats.cancelledToday, icon: AlertTriangle, color: "text-destructive" },
  ];

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: "bg-primary/10 text-primary",
      in_progress: "bg-accent text-foreground",
      accepted: "bg-accent text-foreground",
      requested: "bg-accent text-foreground",
      cancelled: "bg-destructive/10 text-destructive",
    };
    return styles[status] || "bg-muted text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <a
          href="/live-map"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <ExternalLink className="w-4 h-4" />
          Open Live Map
        </a>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-2xl font-bold text-foreground mt-0.5">{card.value}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Live Map */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Live Map</h3>
            <p className="text-xs text-muted-foreground">
              {vehicleMarkers.length} driver{vehicleMarkers.length !== 1 ? "s" : ""} online
              {tripRoutes.length > 0 && ` · ${tripRoutes.length} active trip${tripRoutes.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <a href="/live-map" target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
            <ExternalLink className="w-3 h-3" /> Fullscreen / TV
          </a>
        </div>
        <div className="h-[400px]">
          <MaldivesMap vehicleMarkers={vehicleMarkers} tripRoutes={tripRoutes} />
        </div>
      </div>

      {/* Recent Trips */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Recent Trips</h3>
        </div>
        <div className="divide-y divide-border">
          {recentTrips.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">No trips yet</div>
          )}
          {recentTrips.map((trip) => (
            <div key={trip.id} onClick={() => viewTripDetail(trip)} className="px-5 py-3 flex items-center gap-4 cursor-pointer hover:bg-surface transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{trip.pickup_address}</p>
                <p className="text-xs text-muted-foreground truncate">→ {trip.dropoff_address}</p>
              </div>
              <div className="text-right shrink-0">
                <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadge(trip.status)}`}>
                  {trip.status.replace("_", " ")}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {trip.actual_fare ? `MVR ${trip.actual_fare}` : trip.estimated_fare ? `~MVR ${trip.estimated_fare}` : ""}
                </p>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">
                <Clock className="w-3 h-3 inline mr-1" />
                {new Date(trip.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trip detail modal */}
      {selectedTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm" onClick={() => setSelectedTrip(null)}>
          <div className="bg-card rounded-2xl shadow-2xl mx-4 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Trip Details</h3>
              <button onClick={() => setSelectedTrip(null)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Trip info */}
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
                  <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{selectedTrip.pickup_address} → {selectedTrip.dropoff_address}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <DollarSign className="w-3 h-3" />
                    <span>Fare: <span className="text-foreground font-medium">{selectedTrip.actual_fare ? `MVR ${selectedTrip.actual_fare}` : selectedTrip.estimated_fare ? `~MVR ${selectedTrip.estimated_fare}` : "—"}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{selectedTrip.duration_minutes ? `${selectedTrip.duration_minutes} min` : "—"} • {selectedTrip.distance_km ? `${selectedTrip.distance_km} km` : "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Users className="w-3 h-3" />
                    <span>{selectedTrip.passenger_count} pax • {selectedTrip.luggage_count} bags</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(selectedTrip.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadge(selectedTrip.status)}`}>{selectedTrip.status.replace("_", " ")}</span>
                  {selectedTrip.dispatch_type && <span className="text-[10px] text-muted-foreground">via {selectedTrip.dispatch_type}</span>}
                  {selectedTrip.fare_type && <span className="text-[10px] text-muted-foreground">• {selectedTrip.fare_type}</span>}
                </div>
                {selectedTrip.rating && (
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <div className="flex items-center gap-0.5">
                      {[1,2,3,4,5].map(s => (
                        <Star key={s} className={`w-3.5 h-3.5 ${s <= selectedTrip.rating ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
                      ))}
                    </div>
                    {selectedTrip.feedback_text && <p className="text-xs text-muted-foreground italic">"{selectedTrip.feedback_text}"</p>}
                  </div>
                )}
                {selectedTrip.cancel_reason && (
                  <div className="pt-1 border-t border-border">
                    <p className="text-xs text-destructive">Cancel reason: {selectedTrip.cancel_reason}</p>
                  </div>
                )}
              </div>

              {/* Lost items */}
              {tripLostItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1"><PackageX className="w-3.5 h-3.5" /> Lost Item Reports</p>
                  {tripLostItems.map((item: any) => (
                    <div key={item.id} className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
                      <p className="text-sm text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">Status: <span className="font-medium">{item.status}</span> • {new Date(item.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Chat history */}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chat History ({tripMessages.length})</p>
              {tripMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No messages in this trip</p>
              ) : (
                tripMessages.map((msg: any) => (
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

export default AdminDashboard;
