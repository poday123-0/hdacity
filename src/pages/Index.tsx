import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import mapBg from "@/assets/map-bg.png";
import TopBar from "@/components/TopBar";
import LocationInput from "@/components/LocationInput";
import RideOptions from "@/components/RideOptions";
import DriverMatching from "@/components/DriverMatching";

type Screen = "home" | "ride-options" | "driver-matching";

const Index = () => {
  const [screen, setScreen] = useState<Screen>("home");

  return (
    <div className="relative w-full h-screen max-w-md mx-auto overflow-hidden bg-background">
      {/* Map Background */}
      <div className="absolute inset-0">
        <img
          src={mapBg}
          alt="Carte"
          className="w-full h-full object-cover"
        />
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/60" />
      </div>

      {/* Top Bar */}
      <TopBar />

      {/* Bottom Sheets */}
      <AnimatePresence mode="wait">
        {screen === "home" && (
          <LocationInput key="home" onSearch={() => setScreen("ride-options")} />
        )}
        {screen === "ride-options" && (
          <RideOptions
            key="ride-options"
            onBack={() => setScreen("home")}
            onConfirm={() => setScreen("driver-matching")}
          />
        )}
        {screen === "driver-matching" && (
          <DriverMatching
            key="driver-matching"
            onCancel={() => setScreen("home")}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
