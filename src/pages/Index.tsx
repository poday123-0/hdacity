import { useState, useCallback, useEffect, useMemo } from "react";
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
import DriverApp from "@/components/DriverApp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type AppPhase = "splash" | "auth" | "passenger" | "driver";
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
  // Restore persisted session
  const savedSession = (() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw) as { profile: UserProfile; isDriver: boolean };
    } catch {}
    return null;
  })();

  const [phase, setPhase] = useState<AppPhase>(savedSession ? "passenger" : "splash");
  const [passengerScreen, setPassengerScreen] = useState<PassengerScreen>("home");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(savedSession?.profile || null);
  const [isDriver, setIsDriver] = useState(savedSession?.isDriver || false);
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [pickup, setPickup] = useState<SelectedLocation | null>(null);
  const [dropoff, setDropoff] = useState<SelectedLocation | null>(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [selectedVehicleType, setSelectedVehicleType] = useState<any>(null);
  const [estimatedFare, setEstimatedFare] = useState(0);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Simulate driver approaching during searching/driver-matching
  useEffect(() => {
    if (passengerScreen !== "searching" && passengerScreen !== "driver-matching") {
      setDriverLocation(null);
      return;
    }
    if (!pickup) return;

    // Simulate driver starting nearby and moving toward pickup
    const startLat = pickup.lat + 0.005;
    const startLng = pickup.lng + 0.003;
    setDriverLocation({ lat: startLat, lng: startLng });

    const steps = 20;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step >= steps) { clearInterval(interval); return; }
      const progress = step / steps;
      setDriverLocation({
        lat: startLat + (pickup.lat - startLat) * progress,
        lng: startLng + (pickup.lng - startLng) * progress,
      });
    }, 500);

    return () => clearInterval(interval);
  }, [passengerScreen, pickup]);

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

  const handleSplashComplete = useCallback(() => {
    if (savedSession) {
      setPhase("passenger");
    } else {
      setPhase("auth");
    }
  }, [savedSession]);

  const handleLogin = useCallback((profile: UserProfile | null, isDriverUser: boolean) => {
    setUserProfile(profile);
    setIsDriver(isDriverUser);
    setPhase("passenger");
    // Persist session
    if (profile) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ profile, isDriver: isDriverUser }));
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

  const handleRideComplete = useCallback(() => {
    setPassengerScreen("feedback");
  }, []);

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
    setIsDriver(false);
    setPhase("auth");
    setPassengerScreen("home");
    setCurrentTripId(null);
    setPickup(null);
    setDropoff(null);
  }, []);

  if (phase === "splash") return <SplashScreen onComplete={handleSplashComplete} />;
  if (phase === "auth") return <AuthScreen onLogin={handleLogin} />;
  if (phase === "driver") return <DriverApp onSwitchToPassenger={() => setPhase("passenger")} userProfile={userProfile} />;

  return (
    <div className="relative w-full h-screen max-w-md mx-auto overflow-hidden bg-background">
      <div className="absolute inset-0">
        <MaldivesMap rideData={rideMapData} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/60 pointer-events-none z-[401]" />
      </div>

      <div className="relative z-[500]">
        <TopBar 
          onDriverMode={isDriver ? () => setPhase("driver") : undefined} 
          onLogout={handleLogout}
          userName={userProfile?.first_name}
          userProfile={userProfile}
        />
      </div>

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
              onDriverFound={handleRideComplete}
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
