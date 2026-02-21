import { useState, useCallback } from "react";
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

const Index = () => {
  const [phase, setPhase] = useState<AppPhase>("splash");
  const [passengerScreen, setPassengerScreen] = useState<PassengerScreen>("home");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isDriver, setIsDriver] = useState(false);
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [pickup, setPickup] = useState<SelectedLocation | null>(null);
  const [dropoff, setDropoff] = useState<SelectedLocation | null>(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [selectedVehicleType, setSelectedVehicleType] = useState<any>(null);
  const [estimatedFare, setEstimatedFare] = useState(0);

  const handleSplashComplete = useCallback(() => setPhase("auth"), []);
  const handleLogin = useCallback((profile: UserProfile | null, isDriverUser: boolean) => {
    setUserProfile(profile);
    setIsDriver(isDriverUser);
    setPhase("passenger");
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

  if (phase === "splash") return <SplashScreen onComplete={handleSplashComplete} />;
  if (phase === "auth") return <AuthScreen onLogin={handleLogin} />;
  if (phase === "driver") return <DriverApp onSwitchToPassenger={() => setPhase("passenger")} userProfile={userProfile} />;

  return (
    <div className="relative w-full h-screen max-w-md mx-auto overflow-hidden bg-background">
      <div className="absolute inset-0">
        <MaldivesMap />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/60 pointer-events-none z-[401]" />
      </div>

      <div className="relative z-[500]">
        <TopBar 
          onDriverMode={isDriver ? () => setPhase("driver") : undefined} 
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
