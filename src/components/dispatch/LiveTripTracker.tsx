import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MaldivesMap from "@/components/MaldivesMap";
import { Navigation } from "lucide-react";

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

interface Props {
  tripId: string;
}

const LiveTripTracker = ({ tripId }: Props) => {
  const [vehicleMarkers, setVehicleMarkers] = useState<any[]>([]);
  const [tripRoute, setTripRoute] = useState<TripRoute | null>(null);
  const [tripEnded, setTripEnded] = useState(false);

  // Fetch trip data
  useEffect(() => {
    const fetchTrip = async () => {
      const { data } = await supabase
        .from("trips")
        .select("id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_address, dropoff_address, status, driver_id, profiles:driver_id(first_name, last_name)")
        .eq("id", tripId)
        .single();

      if (!data) { setTripEnded(true); return; }

      const endedStatuses = ["completed", "cancelled", "expired"];
      if (endedStatuses.includes(data.status)) { setTripEnded(true); return; }

      if (data.pickup_lat && data.dropoff_lat) {
        setTripRoute({
          id: data.id,
          pickupLat: data.pickup_lat,
          pickupLng: data.pickup_lng,
          dropoffLat: data.dropoff_lat,
          dropoffLng: data.dropoff_lng,
          pickupAddress: data.pickup_address,
          dropoffAddress: data.dropoff_address,
          driverName: data.profiles ? `${(data.profiles as any).first_name} ${(data.profiles as any).last_name}` : undefined,
          status: data.status,
        });
      }

      // Fetch driver location
      if (data.driver_id) {
        const { data: loc } = await supabase
          .from("driver_locations")
          .select("id, lat, lng, driver_id, vehicle_type_id, vehicle_types:vehicle_type_id(name, map_icon_url)")
          .eq("driver_id", data.driver_id)
          .single();
        if (loc) {
          setVehicleMarkers([{
            id: loc.id,
            lat: loc.lat,
            lng: loc.lng,
            name: (loc as any).vehicle_types?.name || "Driver",
            imageUrl: (loc as any).vehicle_types?.map_icon_url || undefined,
            isOnTrip: true,
            driverId: loc.driver_id,
          }]);
        }
      }
    };

    fetchTrip();
    const interval = setInterval(fetchTrip, 5000);
    return () => clearInterval(interval);
  }, [tripId]);

  // Realtime driver location
  useEffect(() => {
    if (!tripRoute) return;
    const getDriverId = async () => {
      const { data } = await supabase.from("trips").select("driver_id").eq("id", tripId).single();
      if (!data?.driver_id) return;

      const channel = supabase
        .channel(`tracker-loc-${data.driver_id}`)
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "driver_locations",
          filter: `driver_id=eq.${data.driver_id}`,
        }, (payload) => {
          const newLoc = payload.new as any;
          setVehicleMarkers(prev => prev.map(v =>
            v.driverId === data.driver_id ? { ...v, lat: newLoc.lat, lng: newLoc.lng } : v
          ));
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    };

    let cleanup: (() => void) | undefined;
    getDriverId().then(fn => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [tripId, tripRoute]);

  // Realtime trip status
  useEffect(() => {
    const channel = supabase
      .channel(`tracker-trip-${tripId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "trips",
        filter: `id=eq.${tripId}`,
      }, (payload) => {
        const newStatus = (payload.new as any).status;
        if (["completed", "cancelled", "expired"].includes(newStatus)) {
          setTripEnded(true);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tripId]);

  if (tripEnded) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Navigation className="w-6 h-6 text-primary" />
        </div>
        <p className="text-sm font-bold text-foreground">Trip Completed</p>
        <p className="text-xs text-muted-foreground text-center">This trip has ended. You can close this window.</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <MaldivesMap
        vehicleMarkers={vehicleMarkers}
        tripRoutes={tripRoute ? [tripRoute] : []}
      />
      {tripRoute && (
        <div className="absolute bottom-3 left-3 right-3 bg-card/95 backdrop-blur border border-border rounded-xl p-3 space-y-1.5">
          {tripRoute.driverName && (
            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Navigation className="w-3 h-3 text-primary" /> {tripRoute.driverName}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground truncate">📍 {tripRoute.pickupAddress}</p>
          <p className="text-[10px] text-muted-foreground truncate">📌 {tripRoute.dropoffAddress}</p>
          <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${
            tripRoute.status === "in_progress" || tripRoute.status === "started" ? "bg-primary/10 text-primary" : "bg-accent text-foreground"
          }`}>
            {tripRoute.status === "in_progress" || tripRoute.status === "started" ? "Trip in progress" : tripRoute.status === "accepted" ? "Driver on the way" : tripRoute.status}
          </span>
        </div>
      )}
    </div>
  );
};

export default LiveTripTracker;
