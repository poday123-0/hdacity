import { useState, useCallback } from "react";
import AuthScreen, { UserProfile } from "@/components/AuthScreen";
import DriverApp from "@/components/DriverApp";
import DriverRegistration from "@/components/DriverRegistration";
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

  const [phase, setPhase] = useState<"splash" | "auth" | "register" | "pending" | "app">(
    () => savedSession ? "app" : "splash"
  );
  const [userProfile, setUserProfile] = useState<UserProfile | null>(
    savedSession?.profile || null
  );
  const [loginPhone, setLoginPhone] = useState("");

  const handleSplashComplete = useCallback(() => {
    if (savedSession) setPhase("app");
    else setPhase("auth");
  }, [savedSession]);

  const handleLogin = useCallback(async (profile: UserProfile | null, _isDriver: boolean, phoneNumber?: string) => {
    const phone = profile?.phone_number || phoneNumber || "";

    // Look up the Driver profile specifically for this phone number
    const { data: driverProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("phone_number", phone)
      .eq("user_type", "Driver")
      .single();

    if (!driverProfile) {
      // No driver profile — show registration
      setLoginPhone(phone);
      setPhase("register");
      return;
    }

    // Check if driver is pending approval
    if (driverProfile.status === "Pending Review") {
      toast({
        title: "Registration pending",
        description: "Your account is awaiting admin approval. You'll be notified once approved.",
      });
      setPhase("pending");
      return;
    }

    // Check if driver is suspended/inactive
    if (driverProfile.status !== "Active") {
      toast({
        title: "Account inactive",
        description: `Your account status is "${driverProfile.status}". Please contact admin.`,
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
  if (phase === "register") {
    return (
      <DriverRegistration
        phoneNumber={loginPhone}
        onComplete={() => setPhase("pending")}
        onBack={() => setPhase("auth")}
      />
    );
  }
  if (phase === "pending") {
    return (
      <div className="fixed inset-0 z-40 bg-background flex flex-col items-center justify-center max-w-lg mx-auto px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Registration Under Review</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Your driver registration has been submitted and is awaiting admin approval. You'll be able to log in once your account is approved.
        </p>
        <button
          onClick={() => setPhase("auth")}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold"
        >
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <DriverApp
      onSwitchToPassenger={() => {
        window.location.href = "/";
      }}
      userProfile={userProfile}
      onLogout={handleLogout}
    />
  );
};

export default Driver;
