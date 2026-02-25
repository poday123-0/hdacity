import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import MaldivesMap from "@/components/MaldivesMap";
import SplashScreen from "@/components/SplashScreen";
import AuthScreen, { UserProfile } from "@/components/AuthScreen";
import TopBar from "@/components/TopBar";
import LocationInput from "@/components/LocationInput";
import RideOptions from "@/components/RideOptions";
import RideConfirmation from "@/components/RideConfirmation";
import SearchingDriver from "@/components/SearchingDriver";
import DriverMatching from "@/components/DriverMatching";
import RideFeedback from "@/components/RideFeedback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type AppPhase = "splash" | "auth" | "passenger";
type PassengerScreen = "home" | "ride-options" | "confirmation" | "searching" | "driver-matching" | "feedback";

interface SelectedLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const SESSION_KEY = "hda_user_session";

const Index = () => {
  // Restore persisted session (only once on mount)
  const [savedSession] = useState<{ profile: UserProfile; isDriver: boolean } | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw) as { profile: UserProfile; isDriver: boolean };
    } catch {}
    return null;
  });

  const [phase, setPhase] = useState<AppPhase>(() => savedSession ? "passenger" : "splash");
  const [passengerScreen, setPassengerScreen] = useState<PassengerScreen>("home");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(savedSession?.profile || null);
  const [isDriver] = useState(false);
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [pickup, setPickup] = useState<SelectedLocation | null>(null);
  const [dropoff, setDropoff] = useState<SelectedLocation | null>(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [selectedVehicleType, setSelectedVehicleType] = useState<any>(null);
  const [estimatedFare, setEstimatedFare] = useState(0);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Driver location will be fetched from realtime when a driver accepts

  // Build ride data for the map
  const rideMapData = useMemo(() => {
    const isRiding = ["searching", "driver-matching", "feedback"].includes(passengerScreen);
    if (!isRiding || !pickup || !dropoff) return undefined;
    return {
      pickup: { lat: pickup.lat, lng: pickup.lng, name: pickup.name },
      dropoff: { lat: dropoff.lat, lng: dropoff.lng, name: dropoff.name },
      driverLat: driverLocation?.lat,
      driverLng: driverLocation?.lng,
      showRoute: true,
    };
  }, [passengerScreen, pickup, dropoff, driverLocation]);

  // Fetch actual online driver locations from driver_locations table
  const [vehicleMarkers, setVehicleMarkers] = useState<Array<{ id: string; lat: number; lng: number; name: string; imageUrl?: string; icon?: string }>>([]);

  const fetchOnlineDrivers = useCallback(async () => {
    // Join driver_locations with vehicle_types to get icons
    const { data } = await supabase
      .from("driver_locations")
      .select(`
        id, lat, lng, driver_id, vehicle_type_id,
        vehicle_types:vehicle_type_id (name, image_url, icon)
      `)
      .eq("is_online", true)
      .eq("is_on_trip", false);

    if (data) {
      const markers = data.map((dl: any) => ({
        id: dl.id,
        lat: dl.lat,
        lng: dl.lng,
        name: dl.vehicle_types?.name || "Driver",
        imageUrl: dl.vehicle_types?.image_url || undefined,
        icon: dl.vehicle_types?.icon || undefined,
      }));
      setVehicleMarkers(markers);
    }
  }, []);

  useEffect(() => {
    fetchOnlineDrivers();

    // Subscribe to realtime changes on driver_locations
    const channel = supabase
      .channel("driver-locations-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" }, () => {
        fetchOnlineDrivers();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchOnlineDrivers]);

  const handleSplashComplete = useCallback(() => {
    if (savedSession) {
      setPhase("passenger");
    } else {
      setPhase("auth");
    }
  }, [savedSession]);

  const handleLogin = useCallback((profile: UserProfile | null, _isDriverUser: boolean) => {
    setUserProfile(profile);
    setPhase("passenger");
    if (profile) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ profile, isDriver: false }));
    }
  }, []);

  const handleLocationSearch = useCallback((p: SelectedLocation, d: SelectedLocation, passengers: number, luggage: number) => {
    setPickup(p);
    setDropoff(d);
    setPassengerCount(passengers);
    setLuggageCount(luggage);
    setPassengerScreen("ride-options");
  }, []);

  const handleSelectVehicle = useCallback((vehicleType: any, fare: number) => {
    setSelectedVehicleType(vehicleType);
    setEstimatedFare(fare);
    setPassengerScreen("confirmation");
  }, []);

  const handleConfirmRide = useCallback(async () => {
    if (!pickup || !dropoff || !selectedVehicleType) return;

    // Guard: check if any drivers are online AND fresh (updated within last 2 minutes)
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("driver_locations")
      .select("id", { count: "exact", head: true })
      .eq("is_online", true)
      .eq("is_on_trip", false)
      .gte("updated_at", twoMinAgo);

    if (!count || count === 0) {
      toast({ title: "No drivers available", description: "There are no drivers online right now. Please try again later.", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase.from("trips").insert({
        pickup_address: pickup.name,
        dropoff_address: dropoff.name,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        vehicle_type_id: selectedVehicleType.id,
        estimated_fare: estimatedFare,
        fare_type: "distance",
        status: "requested",
        passenger_count: passengerCount,
        luggage_count: luggageCount,
        passenger_id: userProfile?.id || null,
      }).select().single();

      if (error) throw error;
      setCurrentTripId(data.id);
      setPassengerScreen("searching");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [pickup, dropoff, passengerCount, luggageCount, selectedVehicleType, estimatedFare, userProfile?.id]);

  // Fetch passenger notification sounds from settings
  const [passengerSounds, setPassengerSounds] = useState<Record<string, string>>({});
  const passengerAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const fetchSounds = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["passenger_sound_accepted", "passenger_sound_arrived", "passenger_sound_started", "passenger_sound_completed", "passenger_sound_cancelled"]);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((s: any) => {
          const status = s.key.replace("passenger_sound_", "");
          const url = typeof s.value === "string" ? s.value : String(s.value);
          if (url) map[status] = url;
        });
        setPassengerSounds(map);
      }
    };
    fetchSounds();
  }, []);

  // Subscribe to trip status changes for passenger notifications
  useEffect(() => {
    if (!currentTripId) return;

    const channel = supabase
      .channel(`passenger-trip-${currentTripId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "trips",
        filter: `id=eq.${currentTripId}`,
      }, (payload) => {
        const trip = payload.new as any;
        const status = trip.status;

        const notifications: Record<string, { title: string; description: string }> = {
          accepted: { title: "🎉 Driver Accepted!", description: "Your driver is on the way to pick you up." },
          arrived: { title: "📍 Driver Arrived!", description: "Your driver has arrived at the pickup location." },
          in_progress: { title: "🚗 Trip Started!", description: "Your trip is now in progress. Enjoy the ride!" },
          completed: { title: "✅ Trip Completed!", description: `Fare: ${trip.actual_fare || trip.estimated_fare} MVR. Thank you for riding!` },
          cancelled: { title: "❌ Trip Cancelled", description: trip.cancel_reason || "The trip has been cancelled." },
        };

        // Map status to sound key
        const soundKey = status === "in_progress" ? "started" : status;
        const soundUrl = passengerSounds[soundKey];
        if (soundUrl) {
          try {
            if (passengerAudioRef.current) {
              passengerAudioRef.current.pause();
              passengerAudioRef.current.currentTime = 0;
            }
            passengerAudioRef.current = new Audio(soundUrl);
            passengerAudioRef.current.play().catch(() => {});
          } catch {}
        }

        const notif = notifications[status];
        if (notif) {
          toast({ title: notif.title, description: notif.description });
        }

        // Transition screens based on real trip status
        if (status === "accepted") {
          setPassengerScreen("driver-matching");
        } else if (status === "completed") {
          setPassengerScreen("feedback");
        } else if (status === "cancelled") {
          setPassengerScreen("home");
          setCurrentTripId(null);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentTripId, passengerSounds]);




  const handleFeedbackComplete = useCallback(() => {
    setCurrentTripId(null);
    setPickup(null);
    setDropoff(null);
    setPassengerCount(1);
    setLuggageCount(0);
    setSelectedVehicleType(null);
    setEstimatedFare(0);
    setPassengerScreen("home");
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUserProfile(null);
    setPhase("auth");
    setPassengerScreen("home");
    setCurrentTripId(null);
    setPickup(null);
    setDropoff(null);
  }, []);

  if (phase === "splash") return <SplashScreen onComplete={handleSplashComplete} />;
  if (phase === "auth") return <AuthScreen onLogin={handleLogin} mode="passenger" />;

  return (
    <div className="relative w-full h-screen max-w-md mx-auto overflow-hidden bg-background">
      <div className="absolute inset-0">
        <MaldivesMap rideData={rideMapData} vehicleMarkers={vehicleMarkers} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/60 pointer-events-none z-[401]" />
      </div>

      <TopBar 
        onLogout={handleLogout}
        userName={userProfile?.first_name}
        userProfile={userProfile}
      />

      <div className="absolute inset-0 z-[500] pointer-events-none [&>*]:pointer-events-auto">
        <AnimatePresence mode="wait">
          {passengerScreen === "home" && (
            <LocationInput key="home" onSearch={handleLocationSearch} />
          )}
          {passengerScreen === "ride-options" && (
            <RideOptions
              key="ride-options"
              onBack={() => setPassengerScreen("home")}
              onConfirm={handleSelectVehicle}
              pickup={pickup}
              dropoff={dropoff}
              passengerCount={passengerCount}
              luggageCount={luggageCount}
            />
          )}
          {passengerScreen === "confirmation" && pickup && dropoff && selectedVehicleType && (
            <RideConfirmation
              key="confirmation"
              pickup={pickup}
              dropoff={dropoff}
              vehicleType={selectedVehicleType}
              estimatedFare={estimatedFare}
              passengerCount={passengerCount}
              luggageCount={luggageCount}
              userId={userProfile?.id}
              onConfirm={handleConfirmRide}
              onBack={() => setPassengerScreen("ride-options")}
            />
          )}
          {passengerScreen === "searching" && (
            <SearchingDriver
              key="searching"
              onCancel={() => {
                // Cancel the trip in the database
                if (currentTripId) {
                  supabase.from("trips").update({ status: "cancelled", cancel_reason: "Cancelled by passenger", cancelled_at: new Date().toISOString() }).eq("id", currentTripId);
                }
                setCurrentTripId(null);
                setPassengerScreen("home");
              }}
              pickupName={pickup?.name || "Pickup"}
              dropoffName={dropoff?.name || "Destination"}
            />
          )}
          {passengerScreen === "driver-matching" && (
            <DriverMatching
              key="driver-matching"
              onCancel={() => setPassengerScreen("home")}
            />
          )}
        </AnimatePresence>

        {/* Feedback overlay */}
        {passengerScreen === "feedback" && currentTripId && (
          <RideFeedback
            tripId={currentTripId}
            fare={estimatedFare}
            onComplete={handleFeedbackComplete}
          />
        )}
      </div>
    </div>
  );
};

export default Index;
