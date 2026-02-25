import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Car, MapPin, DollarSign, TrendingUp, Clock, ExternalLink, Navigation, UserCheck, AlertTriangle } from "lucide-react";
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

  // Fetch recent trips
  useEffect(() => {
    const fetchRecent = async () => {
      const { data } = await supabase
        .from("trips")
        .select("id, pickup_address, dropoff_address, status, created_at, actual_fare, estimated_fare")
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setRecentTrips(data as RecentTrip[]);
    };
    fetchRecent();
  }, []);

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
            <div key={trip.id} className="px-5 py-3 flex items-center gap-4">
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
    </div>
  );
};

export default AdminDashboard;
