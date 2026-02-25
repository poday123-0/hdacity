import { useState, useCallback, useEffect } from "react";
import AuthScreen, { UserProfile } from "@/components/AuthScreen";
import DriverApp from "@/components/DriverApp";
import SplashScreen from "@/components/SplashScreen";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const DRIVER_SESSION_KEY = "hda_driver_session";

const Driver = () => {
  const [savedSession] = useState<{ profile: UserProfile } | null>(() => {
    try {
      const raw = localStorage.getItem(DRIVER_SESSION_KEY);
      if (raw) return JSON.parse(raw) as { profile: UserProfile };
    } catch {}
    return null;
  });

  const [phase, setPhase] = useState<"splash" | "auth" | "app">(
    () => savedSession ? "app" : "splash"
  );
  const [userProfile, setUserProfile] = useState<UserProfile | null>(
    savedSession?.profile || null
  );

  const handleSplashComplete = useCallback(() => {
    if (savedSession) setPhase("app");
    else setPhase("auth");
  }, [savedSession]);

  const handleLogin = useCallback(async (profile: UserProfile | null, _isDriver: boolean) => {
    if (!profile) {
      toast({ title: "Error", description: "Profile not found", variant: "destructive" });
      return;
    }

    // Look up the Driver profile specifically for this phone number
    const { data: driverProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("phone_number", profile.phone_number)
      .eq("user_type", "Driver")
      .single();

    if (!driverProfile) {
      toast({
        title: "No driver account",
        description: "No driver profile found for this number. Please contact admin.",
        variant: "destructive",
      });
      return;
    }

    const dProfile: UserProfile = {
      id: driverProfile.id,
      first_name: driverProfile.first_name,
      last_name: driverProfile.last_name,
      email: driverProfile.email,
      phone_number: driverProfile.phone_number,
      gender: driverProfile.gender || "1",
      status: driverProfile.status,
    };

    setUserProfile(dProfile);
    setPhase("app");
    localStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify({ profile: dProfile }));
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(DRIVER_SESSION_KEY);
    setUserProfile(null);
    setPhase("auth");
  }, []);

  if (phase === "splash") return <SplashScreen onComplete={handleSplashComplete} />;
  if (phase === "auth") return <AuthScreen onLogin={handleLogin} mode="driver" />;

  return (
    <DriverApp
      onSwitchToPassenger={() => {
        // Navigate to passenger app
        window.location.href = "/";
      }}
      userProfile={userProfile}
      onLogout={handleLogout}
    />
  );
};

export default Driver;
