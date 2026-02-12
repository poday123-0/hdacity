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

type AppPhase = "splash" | "auth" | "passenger" | "driver";
type PassengerScreen = "home" | "ride-options" | "searching" | "driver-matching";

const Index = () => {
  const [phase, setPhase] = useState<AppPhase>("splash");
  const [passengerScreen, setPassengerScreen] = useState<PassengerScreen>("home");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isDriver, setIsDriver] = useState(false);

  const handleSplashComplete = useCallback(() => setPhase("auth"), []);
  const handleLogin = useCallback((profile: UserProfile | null, isDriverUser: boolean) => {
    setUserProfile(profile);
    setIsDriver(isDriverUser);
    setPhase("passenger");
  }, []);

  if (phase === "splash") {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (phase === "auth") {
    return <AuthScreen onLogin={handleLogin} />;
  }

  if (phase === "driver") {
    return <DriverApp onSwitchToPassenger={() => setPhase("passenger")} />;
  }

  // Passenger mode
  return (
    <div className="relative w-full h-screen max-w-md mx-auto overflow-hidden bg-background">
      {/* Map Background */}
      <div className="absolute inset-0">
        <MaldivesMap />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/60 pointer-events-none z-[401]" />
      </div>

      {/* Top Bar - only show driver mode button if user is also a driver */}
      <div className="relative z-[500]">
        <TopBar 
          onDriverMode={isDriver ? () => setPhase("driver") : undefined} 
          userName={userProfile?.first_name}
        />
      </div>

      {/* Bottom Sheets */}
      <div className="relative z-[500]">
      <AnimatePresence mode="wait">
        {passengerScreen === "home" && (
          <LocationInput key="home" onSearch={() => setPassengerScreen("ride-options")} />
        )}
        {passengerScreen === "ride-options" && (
          <RideOptions
            key="ride-options"
            onBack={() => setPassengerScreen("home")}
            onConfirm={() => setPassengerScreen("searching")}
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
