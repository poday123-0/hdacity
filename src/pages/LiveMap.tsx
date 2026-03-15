import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import MaldivesMap from "@/components/MaldivesMap";
import { useTheme } from "@/hooks/use-theme";
import SystemLogo from "@/components/SystemLogo";
import { Users, Navigation, Maximize2, Minimize2 } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";

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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sharedTripId = searchParams.get("trip");

  const [vehicleMarkers, setVehicleMarkers] = useState<any[]>([]);
  const [activeTrips, setActiveTrips] = useState<TripRoute[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [sharedTripEnded, setSharedTripEnded] = useState(false);

  // Fetch online driver locations
  useEffect(() => {
    const fetchLocations = async () => {
      const { data } = await supabase
        .from("driver_locations")
        .select("id, lat, lng, driver_id, is_on_trip, vehicle_type_id, vehicle_id, vehicle_types:vehicle_type_id(name, map_icon_url)")
        .eq("is_online", true);

      // Filter out drivers with inactive vehicles
      let activeData = data;
      if (data && data.length > 0) {
        const vehicleIds = [...new Set(data.map(d => (d as any).vehicle_id).filter(Boolean))] as string[];
        if (vehicleIds.length > 0) {
          const { data: activeVehicles } = await supabase
            .from("vehicles")
            .select("id")
            .in("id", vehicleIds)
            .eq("is_active", true);
          const activeVehicleIds = new Set((activeVehicles || []).map((v: any) => v.id));
          activeData = data.filter(d => !(d as any).vehicle_id || activeVehicleIds.has((d as any).vehicle_id));
        }
      }
      if (activeData) {
        setVehicleMarkers(activeData.map((d: any) => ({
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

  // Fetch active trips — if shared trip mode, only track that trip
  useEffect(() => {
    const fetchTrips = async () => {
      if (sharedTripId) {
        // Shared trip mode: fetch only this trip
        const { data } = await supabase
          .from("trips")
          .select("id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_address, dropoff_address, status, driver_id, profiles:driver_id(first_name, last_name)")
          .eq("id", sharedTripId)
          .single();

        if (!data) {
          setSharedTripEnded(true);
          return;
        }

        const endedStatuses = ["completed", "cancelled", "expired"];
        if (endedStatuses.includes(data.status)) {
          setSharedTripEnded(true);
          return;
        }

        if (data.pickup_lat && data.dropoff_lat) {
          setActiveTrips([{
            id: data.id,
            pickupLat: data.pickup_lat,
            pickupLng: data.pickup_lng,
            dropoffLat: data.dropoff_lat,
            dropoffLng: data.dropoff_lng,
            pickupAddress: data.pickup_address,
            dropoffAddress: data.dropoff_address,
            driverName: data.profiles ? `${(data.profiles as any).first_name} ${(data.profiles as any).last_name}` : undefined,
            status: data.status,
          }]);
        }
      } else {
        // Admin live map mode: fetch all active trips
        const { data } = await supabase
          .from("trips")
          .select("id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_address, dropoff_address, status, driver_id, profiles:driver_id(first_name, last_name)")
          .in("status", ["accepted", "in_progress", "started"]);
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
      }
    };
    fetchTrips();
    const interval = setInterval(fetchTrips, 3000);
    return () => clearInterval(interval);
  }, [sharedTripId]);

  // Redirect when shared trip ends
  useEffect(() => {
    if (!sharedTripEnded) return;
    const timer = setTimeout(() => {
      navigate("/", { replace: true });
    }, 3000);
    return () => clearTimeout(timer);
  }, [sharedTripEnded, navigate]);

  // Subscribe to realtime trip status changes for shared trip
  useEffect(() => {
    if (!sharedTripId) return;
    const channel = supabase
      .channel(`shared-trip-${sharedTripId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "trips",
        filter: `id=eq.${sharedTripId}`,
      }, (payload) => {
        const newStatus = (payload.new as any).status;
        if (["completed", "cancelled", "expired"].includes(newStatus)) {
          setSharedTripEnded(true);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sharedTripId]);

  // Subscribe to realtime driver location updates for shared trip
  useEffect(() => {
    if (!sharedTripId) return;
    // Get the driver_id for this trip to subscribe to their location
    const subscribeToDriver = async () => {
      const { data: trip } = await supabase.from("trips").select("driver_id").eq("id", sharedTripId).single();
      if (!trip?.driver_id) return;

      const channel = supabase
        .channel(`driver-loc-${trip.driver_id}`)
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "driver_locations",
          filter: `driver_id=eq.${trip.driver_id}`,
        }, (payload) => {
          const newLoc = payload.new as any;
          setVehicleMarkers(prev => prev.map(v => 
            v.driverId === trip.driver_id ? { ...v, lat: newLoc.lat, lng: newLoc.lng } : v
          ));
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    };
    
    let cleanup: (() => void) | undefined;
    subscribeToDriver().then(fn => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [sharedTripId]);

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

  // Trip ended overlay for shared links
  if (sharedTripEnded) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background gap-4">
        <SystemLogo className="w-16 h-16 object-contain" alt="HDA" />
        <h1 className="text-xl font-bold text-foreground">Trip has ended</h1>
        <p className="text-sm text-muted-foreground">This ride tracking link is no longer active.</p>
        <p className="text-xs text-muted-foreground animate-pulse">Redirecting to home page...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <SystemLogo className="w-8 h-8 object-contain" alt="HDA" />
          <div>
            <h1 className="text-base font-extrabold text-foreground">
              HDA <span className="text-primary">{sharedTripId ? "TRIP TRACKING" : "LIVE MAP"}</span>
            </h1>
            <p className="text-[10px] text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!sharedTripId && (
            <>
              <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-xs font-bold text-primary">{onlineCount} online</span>
              </div>
              <div className="flex items-center gap-2 bg-accent/50 px-3 py-1.5 rounded-full">
                <Navigation className="w-4 h-4 text-foreground" />
                <span className="text-xs font-bold text-foreground">{onTripCount} on trip</span>
              </div>
            </>
          )}
          <button onClick={toggleFullscreen} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MaldivesMap vehicleMarkers={sharedTripId ? vehicleMarkers.filter(v => activeTrips.some(t => t.driverName)) : vehicleMarkers} tripRoutes={activeTrips} />

        {/* Legend - hide for shared trip */}
        {!sharedTripId && (
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
        )}

        {/* Shared trip info card */}
        {sharedTripId && activeTrips.length > 0 && (
          <div className="absolute bottom-4 left-4 right-4 bg-card/95 backdrop-blur border border-border rounded-2xl p-4 space-y-2">
            {activeTrips[0].driverName && (
              <p className="text-sm font-bold text-foreground">🚕 {activeTrips[0].driverName}</p>
            )}
            <p className="text-xs text-muted-foreground truncate">📍 {activeTrips[0].pickupAddress}</p>
            <p className="text-xs text-muted-foreground truncate">📌 {activeTrips[0].dropoffAddress}</p>
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
              activeTrips[0].status === "in_progress" ? "bg-primary/10 text-primary" : "bg-accent text-foreground"
            }`}>
              {activeTrips[0].status === "in_progress" ? "Trip in progress" : activeTrips[0].status === "arrived" ? "Driver arrived" : "Driver on the way"}
            </span>
          </div>
        )}

        {/* Active trips sidebar - admin view only */}
        {!sharedTripId && activeTrips.length > 0 && (
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