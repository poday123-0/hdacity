import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Car, MapPin, DollarSign } from "lucide-react";
import MaldivesMap from "@/components/MaldivesMap";

const AdminDashboard = () => {
  const [stats, setStats] = useState({ drivers: 0, vehicles: 0, trips: 0, activeTrips: 0 });
  const [vehicleMarkers, setVehicleMarkers] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const [drivers, vehicles, trips, activeTrips] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).ilike("user_type", "%Driver%"),
        supabase.from("vehicles").select("id", { count: "exact", head: true }),
        supabase.from("trips").select("id", { count: "exact", head: true }),
        supabase.from("trips").select("id", { count: "exact", head: true }).in("status", ["requested", "accepted", "in_progress"]),
      ]);
      setStats({
        drivers: drivers.count || 0,
        vehicles: vehicles.count || 0,
        trips: trips.count || 0,
        activeTrips: activeTrips.count || 0,
      });
    };
    fetchStats();
  }, []);

  // Fetch live driver locations
  useEffect(() => {
    const fetchLocations = async () => {
      const { data } = await supabase
        .from("driver_locations")
        .select("id, lat, lng, driver_id, vehicle_type_id, vehicle_types:vehicle_type_id(name, image_url, icon, map_icon_url)")
        .eq("is_online", true);
      if (data) {
        setVehicleMarkers(data.map((d: any) => ({
          id: d.id,
          lat: d.lat,
          lng: d.lng,
          name: d.vehicle_types?.name || "Driver",
          imageUrl: d.vehicle_types?.map_icon_url || undefined,
        })));
      }
    };
    fetchLocations();
    const interval = setInterval(fetchLocations, 5000);
    return () => clearInterval(interval);
  }, []);

  const cards = [
    { label: "Total Drivers", value: stats.drivers, icon: Users, color: "text-primary" },
    { label: "Vehicles", value: stats.vehicles, icon: Car, color: "text-primary" },
    { label: "Total Trips", value: stats.trips, icon: MapPin, color: "text-primary" },
    { label: "Active Trips", value: stats.activeTrips, icon: DollarSign, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-3xl font-bold text-foreground mt-1">{card.value}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <card.icon className={`w-6 h-6 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Live Map */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Live Map</h3>
          <p className="text-xs text-muted-foreground">{vehicleMarkers.length} driver{vehicleMarkers.length !== 1 ? "s" : ""} online</p>
        </div>
        <div className="h-[400px]">
          <MaldivesMap vehicleMarkers={vehicleMarkers} />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
