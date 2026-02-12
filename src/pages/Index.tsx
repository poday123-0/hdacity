import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import mapBg from "@/assets/map-bg.png";
import SplashScreen from "@/components/SplashScreen";
import AuthScreen from "@/components/AuthScreen";
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

  const handleSplashComplete = useCallback(() => setPhase("auth"), []);
  const handleLogin = useCallback(() => setPhase("passenger"), []);

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
        <img src={mapBg} alt="Carte" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/60" />
      </div>

      {/* Top Bar */}
      <TopBar onDriverMode={() => setPhase("driver")} />

      {/* Bottom Sheets */}
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
  );
};

export default Index;
