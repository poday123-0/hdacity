import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { motion } from "framer-motion";
import { Car, MapPin, Clock, CheckCircle, Download, ExternalLink } from "lucide-react";
import SystemLogo from "@/components/SystemLogo";

const Track = () => {
  const { tripId } = useParams<{ tripId: string }>();
  const { isLoaded: mapsLoaded } = useGoogleMaps();
  const [trip, setTrip] = useState<any>(null);
  const [driver, setDriver] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const routeRendererRef = useRef<any>(null);

  const isCompleted = trip?.status === "completed";
  const isCancelled = trip?.status === "cancelled";
  const isEnded = isCompleted || isCancelled;

  // Detect if app is installed (PWA)
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;

  useEffect(() => {
    if (!tripId) { setError("Invalid tracking link"); setLoading(false); return; }

    const loadTrip = async () => {
      const { data: tripData, error: tripErr } = await supabase
        .from("trips")
        .select("id, status, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, driver_id, vehicle_id, estimated_fare, actual_fare, accepted_at, started_at, completed_at")
        .eq("id", tripId)
        .single();

      if (tripErr || !tripData) { setError("Trip not found"); setLoading(false); return; }
      setTrip(tripData);

      if (tripData.driver_id) {
        const [{ data: driverData }, { data: vehicleData }, { data: locData }] = await Promise.all([
          supabase.from("profiles").select("first_name, last_name, phone_number, avatar_url").eq("id", tripData.driver_id).single(),
          tripData.vehicle_id
            ? supabase.from("vehicles").select("plate_number, make, model, color, center_code").eq("id", tripData.vehicle_id).single()
            : supabase.from("driver_locations").select("vehicle_id").eq("driver_id", tripData.driver_id).single().then(async ({ data }) => {
                if (data?.vehicle_id) return supabase.from("vehicles").select("plate_number, make, model, color, center_code").eq("id", data.vehicle_id).single();
                return { data: null };
              }),
          supabase.from("driver_locations").select("lat, lng").eq("driver_id", tripData.driver_id).single(),
        ]);
        setDriver(driverData);
        setVehicle(vehicleData);
        if (locData) setDriverLocation({ lat: locData.lat, lng: locData.lng });
      }
      setLoading(false);
    };

    loadTrip();
  }, [tripId]);

  // Realtime updates
  useEffect(() => {
    if (!tripId || !trip?.driver_id) return;

    const tripChannel = supabase
      .channel(`track-trip-${tripId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${tripId}` }, (payload) => {
        setTrip((prev: any) => ({ ...prev, ...payload.new }));
      })
      .subscribe();

    const locChannel = supabase
      .channel(`track-driver-loc-${trip.driver_id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "driver_locations", filter: `driver_id=eq.${trip.driver_id}` }, (payload) => {
        const loc = payload.new as any;
        setDriverLocation({ lat: loc.lat, lng: loc.lng });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tripChannel);
      supabase.removeChannel(locChannel);
    };
  }, [tripId, trip?.driver_id]);

  // Initialize map using shared hook
  useEffect(() => {
    if (!mapRef.current || !mapsLoaded || isEnded || !trip?.pickup_lat) return;
    if (mapInstanceRef.current) return;

    const g = (window as any).google;
    if (!g?.maps) return;

    const center = driverLocation || { lat: Number(trip.pickup_lat), lng: Number(trip.pickup_lng) };
    const map = new g.maps.Map(mapRef.current, {
      center,
      zoom: 15,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "greedy",
    });
    mapInstanceRef.current = map;

    // Pickup marker
    pickupMarkerRef.current = new g.maps.Marker({
      map,
      position: { lat: Number(trip.pickup_lat), lng: Number(trip.pickup_lng) },
      icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#22c55e", fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
      zIndex: 1000,
    });

    // Dropoff marker
    if (trip.dropoff_lat && trip.dropoff_lng) {
      new g.maps.Marker({
        map,
        position: { lat: Number(trip.dropoff_lat), lng: Number(trip.dropoff_lng) },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
        zIndex: 999,
      });

      // Draw route
      const ds = new g.maps.DirectionsService();
      ds.route({
        origin: { lat: Number(trip.pickup_lat), lng: Number(trip.pickup_lng) },
        destination: { lat: Number(trip.dropoff_lat), lng: Number(trip.dropoff_lng) },
        travelMode: g.maps.TravelMode.DRIVING,
      }).then((result: any) => {
        if (mapInstanceRef.current) {
          routeRendererRef.current = new g.maps.DirectionsRenderer({
            map: mapInstanceRef.current,
            directions: result,
            suppressMarkers: true,
            preserveViewport: false,
            polylineOptions: { strokeColor: "#4285F4", strokeWeight: 4, strokeOpacity: 0.8 },
          });
        }
      }).catch(() => {});

      // Fit bounds
      const bounds = new g.maps.LatLngBounds();
      bounds.extend({ lat: Number(trip.pickup_lat), lng: Number(trip.pickup_lng) });
      bounds.extend({ lat: Number(trip.dropoff_lat), lng: Number(trip.dropoff_lng) });
      if (driverLocation) bounds.extend(driverLocation);
      map.fitBounds(bounds, 40);
    }

    // Driver marker
    if (driverLocation) {
      driverMarkerRef.current = new g.maps.Marker({
        map,
        position: driverLocation,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 12, fillColor: "#3b82f6", fillOpacity: 1, strokeColor: "white", strokeWeight: 3 },
        zIndex: 1001,
      });
    }
  }, [trip?.pickup_lat, mapsLoaded, isEnded]);

  // Update driver marker position
  useEffect(() => {
    if (!driverMarkerRef.current || !driverLocation) return;
    driverMarkerRef.current.position = driverLocation;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo(driverLocation);
    }
  }, [driverLocation]);

  const statusLabel = trip?.status === "accepted" ? "Driver on the way" :
    trip?.status === "arrived" ? "Driver arrived" :
    trip?.status === "in_progress" || trip?.status === "started" ? "Trip in progress" :
    trip?.status === "completed" ? "Trip completed" :
    trip?.status === "cancelled" ? "Trip cancelled" : "Loading...";

  const statusColor = trip?.status === "completed" ? "text-green-500" :
    trip?.status === "cancelled" ? "text-destructive" : "text-primary";

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
          <Car className="w-8 h-8 text-primary" />
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <SystemLogo className="w-16 h-16 mx-auto" />
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  // App install section
  const appInstallSection = (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <SystemLogo className="w-10 h-10" />
        <div>
          <h3 className="font-bold text-foreground text-sm">Get the HDA App</h3>
          <p className="text-xs text-muted-foreground">Book rides faster with the app</p>
        </div>
      </div>
      <div className="flex gap-2">
        <a
          href="/install-passenger"
          className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-xl text-sm font-semibold"
        >
          <Download className="w-4 h-4" />
          Install App
        </a>
      </div>
    </div>
  );

  // If trip ended, show completion + app install
  if (isEnded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center space-y-3">
            <SystemLogo className="w-16 h-16 mx-auto" />
            <div className={`flex items-center justify-center gap-2 ${statusColor}`}>
              <CheckCircle className="w-5 h-5" />
              <span className="font-bold text-lg">{statusLabel}</span>
            </div>
            {trip.actual_fare && (
              <p className="text-2xl font-bold text-foreground">{trip.actual_fare} MVR</p>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <p className="text-sm text-foreground">{trip.pickup_address}</p>
            </div>
            <div className="ml-1 w-0.5 h-3 bg-border" />
            <div className="flex items-center gap-2">
              <MapPin className="w-2.5 h-2.5 text-foreground" />
              <p className="text-sm text-foreground">{trip.dropoff_address}</p>
            </div>
          </div>

          {!isStandalone && appInstallSection}
        </div>
      </div>
    );
  }

  // Active trip tracking
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Map */}
      <div ref={mapRef} className="flex-1 min-h-[50vh]" />

      {/* Info panel */}
      <div className="bg-card border-t border-border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SystemLogo className="w-8 h-8" />
            <div>
              <p className={`font-bold text-sm ${statusColor}`}>{statusLabel}</p>
              {driver && <p className="text-xs text-muted-foreground">{driver.first_name} {driver.last_name}</p>}
            </div>
          </div>
          {driver?.phone_number && (
            <a href={`tel:+960${driver.phone_number}`} className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            </a>
          )}
        </div>

        {vehicle && (
          <div className="bg-muted/50 rounded-xl p-3 flex items-center gap-3">
            <Car className="w-5 h-5 text-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {vehicle.color && `${vehicle.color} `}{vehicle.make} {vehicle.model}
              </p>
              <p className="text-xs text-muted-foreground font-mono">{vehicle.plate_number}</p>
            </div>
          </div>
        )}

        <div className="bg-muted/50 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <p className="text-xs text-foreground">{trip.pickup_address}</p>
          </div>
          <div className="ml-1 w-0.5 h-3 bg-border" />
          <div className="flex items-center gap-2">
            <MapPin className="w-2.5 h-2.5 text-foreground" />
            <p className="text-xs text-foreground">{trip.dropoff_address}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Track;
