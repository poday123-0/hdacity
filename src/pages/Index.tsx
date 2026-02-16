import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import MaldivesMap from "@/components/MaldivesMap";
import SplashScreen from "@/components/SplashScreen";
import AuthScreen, { UserProfile } from "@/components/AuthScreen";
import TopBar from "@/components/TopBar";
import LocationInput from "@/components/LocationInput";
import RideOptions from "@/components/RideOptions";
import SearchingDriver from "@/components/SearchingDriver";
import DriverMatching from "@/components/DriverMatching";
import DriverApp from "@/components/DriverApp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type AppPhase = "splash" | "auth" | "passenger" | "driver";
type PassengerScreen = "home" | "ride-options" | "searching" | "driver-matching";

const Index = () => {
  const [phase, setPhase] = useState<AppPhase>("splash");
  const [passengerScreen, setPassengerScreen] = useState<PassengerScreen>("home");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isDriver, setIsDriver] = useState(false);
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);

  const handleSplashComplete = useCallback(() => setPhase("auth"), []);
  const handleLogin = useCallback((profile: UserProfile | null, isDriverUser: boolean) => {
    setUserProfile(profile);
    setIsDriver(isDriverUser);
    setPhase("passenger");
  }, []);

  const handleConfirmRide = useCallback(async (vehicleType: any) => {
    // Create a trip in the database
    try {
      const { data, error } = await supabase.from("trips").insert({
        pickup_address: "Malé City Centre",
        dropoff_address: "Velana International Airport",
        pickup_lat: 4.1755,
        pickup_lng: 73.5093,
        dropoff_lat: 4.1918,
        dropoff_lng: 73.5291,
        vehicle_type_id: vehicleType.id,
        estimated_fare: vehicleType.base_fare,
        fare_type: "distance",
        status: "requested",
      }).select().single();

      if (error) throw error;
      setCurrentTripId(data.id);
      setPassengerScreen("searching");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
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

      <div className="relative z-[500]">
        <AnimatePresence mode="wait">
          {passengerScreen === "home" && (
            <LocationInput key="home" onSearch={() => setPassengerScreen("ride-options")} />
          )}
          {passengerScreen === "ride-options" && (
            <RideOptions
              key="ride-options"
              onBack={() => setPassengerScreen("home")}
              onConfirm={handleConfirmRide}
            />
          )}
          {passengerScreen === "searching" && (
            <SearchingDriver
              key="searching"
              onDriverFound={() => setPassengerScreen("driver-matching")}
            />
          )}
          {passengerScreen === "driver-matching" && (
            <DriverMatching
              key="driver-matching"
              onCancel={() => setPassengerScreen("home")}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Index;
