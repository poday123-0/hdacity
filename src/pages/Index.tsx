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

  const handleSplashComplete = useCallback(() => setPhase("auth"), []);
  const handleLogin = useCallback((profile: UserProfile | null, isDriverUser: boolean) => {
    setUserProfile(profile);
    setIsDriver(isDriverUser);
    setPhase("passenger");
  }, []);

  const handleLocationSearch = useCallback((p: SelectedLocation, d: SelectedLocation) => {
    setPickup(p);
    setDropoff(d);
    setPassengerScreen("ride-options");
  }, []);

  const handleConfirmRide = useCallback(async (vehicleType: any) => {
    if (!pickup || !dropoff) return;
    try {
      const { data, error } = await supabase.from("trips").insert({
        pickup_address: pickup.name,
        dropoff_address: dropoff.name,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
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
  }, [pickup, dropoff]);

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
            <LocationInput key="home" onSearch={handleLocationSearch} />
          )}
          {passengerScreen === "ride-options" && (
            <RideOptions
              key="ride-options"
              onBack={() => setPassengerScreen("home")}
              onConfirm={handleConfirmRide}
              pickup={pickup}
              dropoff={dropoff}
            />
          )}
          {passengerScreen === "searching" && (
            <SearchingDriver
              key="searching"
              onDriverFound={() => setPassengerScreen("driver-matching")}
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
      </div>
    </div>
  );
};

export default Index;
