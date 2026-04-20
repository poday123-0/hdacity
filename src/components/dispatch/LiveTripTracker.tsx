import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MaldivesMap from "@/components/SmartMaldivesMap";
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
          .select("id, lat, lng, heading, driver_id, vehicle_type_id, vehicle_types:vehicle_type_id(name, map_icon_url)")
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
            heading: (loc as any).heading,
          }]);
        }
      }
    };

    fetchTrip();
    const interval = setInterval(fetchTrip, 3000);
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
            v.driverId === data.driver_id ? { ...v, lat: newLoc.lat, lng: newLoc.lng, heading: newLoc.heading } : v
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
        <div className="absolute bottom-3 left-3 right-3 z-[1000] bg-card/95 backdrop-blur-md border border-border rounded-2xl p-4 shadow-xl space-y-3 pointer-events-auto">
          {tripRoute.driverName && (
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
              <p className="text-sm font-bold text-foreground flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Navigation className="w-3.5 h-3.5 text-primary" />
                </span>
                {tripRoute.driverName}
              </p>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${
                tripRoute.status === "in_progress" || tripRoute.status === "started"
                  ? "bg-success/15 text-success"
                  : tripRoute.status === "accepted"
                    ? "bg-primary/15 text-primary"
                    : "bg-accent text-foreground"
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {tripRoute.status === "in_progress" || tripRoute.status === "started"
                  ? "On Trip"
                  : tripRoute.status === "accepted"
                    ? "On the way"
                    : tripRoute.status}
              </span>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="w-2 h-2 rounded-full bg-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Pickup</p>
                <p className="text-xs font-medium text-foreground break-words leading-snug">{tripRoute.pickupAddress}</p>
              </div>
            </div>
            <div className="ml-2.5 w-px h-2 bg-border" />
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <span className="w-2 h-2 rounded-sm bg-destructive" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Dropoff</p>
                <p className="text-xs font-medium text-foreground break-words leading-snug">{tripRoute.dropoffAddress}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveTripTracker;
