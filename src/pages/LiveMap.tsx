import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MaldivesMap from "@/components/MaldivesMap";
import { useTheme } from "@/hooks/use-theme";
import hdaLogo from "@/assets/hda-logo.png";
import { Users, Navigation, Maximize2, Minimize2 } from "lucide-react";

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

const LiveMap = () => {
  useTheme();
  const [vehicleMarkers, setVehicleMarkers] = useState<any[]>([]);
  const [activeTrips, setActiveTrips] = useState<TripRoute[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Fetch online driver locations
  useEffect(() => {
    const fetchLocations = async () => {
      const { data } = await supabase
        .from("driver_locations")
        .select("id, lat, lng, driver_id, is_on_trip, vehicle_type_id, vehicle_types:vehicle_type_id(name, map_icon_url)")
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
        setLastUpdated(new Date());
      }
    };
    fetchLocations();
    const interval = setInterval(fetchLocations, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fetch active trips with coordinates
  useEffect(() => {
    const fetchTrips = async () => {
      const { data } = await supabase
        .from("trips")
        .select("id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_address, dropoff_address, status, driver_id, profiles:driver_id(first_name, last_name)")
        .in("status", ["accepted", "in_progress"]);
      if (data) {
        setActiveTrips(data.filter((t: any) => t.pickup_lat && t.dropoff_lat).map((t: any) => ({
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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const onlineCount = vehicleMarkers.length;
  const onTripCount = vehicleMarkers.filter(v => v.isOnTrip).length;

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <img src={hdaLogo} alt="HDA" className="w-8 h-8 object-contain" />
          <div>
            <h1 className="text-base font-extrabold text-foreground">
              HDA <span className="text-primary">LIVE MAP</span>
            </h1>
            <p className="text-[10px] text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-primary">{onlineCount} online</span>
          </div>
          <div className="flex items-center gap-2 bg-accent/50 px-3 py-1.5 rounded-full">
            <Navigation className="w-4 h-4 text-foreground" />
            <span className="text-xs font-bold text-foreground">{onTripCount} on trip</span>
          </div>
          <button onClick={toggleFullscreen} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MaldivesMap vehicleMarkers={vehicleMarkers} tripRoutes={activeTrips} />

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur border border-border rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">Legend</p>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#4285F4]" />
            <span className="text-[10px] text-muted-foreground">Online Driver</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
            <span className="text-[10px] text-muted-foreground">Pickup Point</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
            <span className="text-[10px] text-muted-foreground">Dropoff Point</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-1 bg-[#4285F4] rounded" />
            <span className="text-[10px] text-muted-foreground">Active Trip Route</span>
          </div>
        </div>

        {/* Active trips sidebar */}
        {activeTrips.length > 0 && (
          <div className="absolute top-4 right-4 w-64 max-h-[calc(100%-2rem)] overflow-y-auto bg-card/90 backdrop-blur border border-border rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">{activeTrips.length} Active Trip{activeTrips.length !== 1 ? "s" : ""}</p>
            {activeTrips.map(trip => (
              <div key={trip.id} className="bg-surface rounded-lg p-2 space-y-1">
                {trip.driverName && (
                  <p className="text-[11px] font-semibold text-foreground">{trip.driverName}</p>
                )}
                <p className="text-[10px] text-muted-foreground truncate">📍 {trip.pickupAddress}</p>
                <p className="text-[10px] text-muted-foreground truncate">📌 {trip.dropoffAddress}</p>
                <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  trip.status === "in_progress" ? "bg-primary/10 text-primary" : "bg-accent text-foreground"
                }`}>
                  {trip.status === "in_progress" ? "In Progress" : "Accepted"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveMap;
