import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import MaldivesMap from "@/components/MaldivesMap";
import SplashScreen from "@/components/SplashScreen";
import AuthScreen, { UserProfile } from "@/components/AuthScreen";
import PassengerRegistration from "@/components/PassengerRegistration";
import TopBar from "@/components/TopBar";
import LocationInput from "@/components/LocationInput";
import RideOptions from "@/components/RideOptions";
import RideConfirmation from "@/components/RideConfirmation";
import SearchingDriver from "@/components/SearchingDriver";
import DriverMatching from "@/components/DriverMatching";
import RideFeedback from "@/components/RideFeedback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import SOSButton from "@/components/SOSButton";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";

type AppPhase = "splash" | "auth" | "register" | "passenger";
type PassengerScreen = "home" | "ride-options" | "confirmation" | "searching" | "driver-matching" | "feedback";

interface SelectedLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface StopLocation extends SelectedLocation {}

const SESSION_KEY = "hda_user_session";

const Index = () => {
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
  usePushNotifications(userProfile?.id, "passenger");
  const [pendingPhone, setPendingPhone] = useState("");
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [pickup, setPickup] = useState<SelectedLocation | null>(null);
  const [dropoff, setDropoff] = useState<SelectedLocation | null>(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [intermediateStops, setIntermediateStops] = useState<StopLocation[]>([]);
  const [selectedVehicleType, setSelectedVehicleType] = useState<any>(null);
  const [estimatedFare, setEstimatedFare] = useState(0);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [matchedDriver, setMatchedDriver] = useState<any>(null);
  const [tripStatus, setTripStatus] = useState<string>("accepted");

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

  // Fetch actual online driver locations
  const [vehicleMarkers, setVehicleMarkers] = useState<Array<{ id: string; lat: number; lng: number; name: string; imageUrl?: string; icon?: string }>>([]);

  const fetchOnlineDrivers = useCallback(async () => {
    const { data } = await supabase
      .from("driver_locations")
      .select(`id, lat, lng, driver_id, vehicle_type_id, vehicle_types:vehicle_type_id (name, image_url, icon, map_icon_url)`)
      .eq("is_online", true)
      .eq("is_on_trip", false);

    if (data) {
      const markers = data.map((dl: any) => ({
        id: dl.id,
        lat: dl.lat,
        lng: dl.lng,
        name: dl.vehicle_types?.name || "Driver",
        imageUrl: dl.vehicle_types?.map_icon_url || dl.vehicle_types?.image_url || undefined,
        icon: dl.vehicle_types?.icon || undefined,
      }));
      setVehicleMarkers(markers);
    }
  }, []);

  useEffect(() => {
    fetchOnlineDrivers();
    const channel = supabase
      .channel("driver-locations-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" }, () => {
        fetchOnlineDrivers();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchOnlineDrivers]);

  // Live track driver location when trip is accepted
  useEffect(() => {
    if (!currentTripId || passengerScreen !== "driver-matching") return;

    const trackDriver = async () => {
      // Get trip to find driver_id
      const { data: trip } = await supabase.from("trips").select("driver_id").eq("id", currentTripId).single();
      if (!trip?.driver_id) return;

      // Fetch current position
      const fetchPos = async () => {
        const { data: loc } = await supabase
          .from("driver_locations")
          .select("lat, lng")
          .eq("driver_id", trip.driver_id)
          .single();
        if (loc) setDriverLocation({ lat: loc.lat, lng: loc.lng });
      };
      fetchPos();

      // Subscribe to realtime updates
      const channel = supabase
        .channel(`driver-track-${trip.driver_id}`)
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "driver_locations",
          filter: `driver_id=eq.${trip.driver_id}`,
        }, (payload) => {
          const loc = payload.new as any;
          setDriverLocation({ lat: loc.lat, lng: loc.lng });
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    };

    const cleanup = trackDriver();
    return () => { cleanup.then(fn => fn?.()); };
  }, [currentTripId, passengerScreen]);

  const handleSplashComplete = useCallback(() => {
    if (savedSession) setPhase("passenger");
    else setPhase("auth");
  }, [savedSession]);

  const handleLogin = useCallback((profile: UserProfile | null, _isDriverUser: boolean, phoneNumber?: string) => {
    if (!profile) {
      // No profile found — show registration
      setPendingPhone(phoneNumber || "");
      setPhase("register");
      return;
    }
    setUserProfile(profile);
    setPhase("passenger");
    if (profile) localStorage.setItem(SESSION_KEY, JSON.stringify({ profile, isDriver: false }));
  }, []);

  const handleRegistrationComplete = useCallback((profile: UserProfile) => {
    setUserProfile(profile);
    setPhase("passenger");
    localStorage.setItem(SESSION_KEY, JSON.stringify({ profile, isDriver: false }));
  }, []);

  const handleLocationSearch = useCallback((p: SelectedLocation, d: SelectedLocation, passengers: number, luggage: number, stops?: StopLocation[]) => {
    setPickup(p);
    setDropoff(d);
    setPassengerCount(passengers);
    setLuggageCount(luggage);
    setIntermediateStops(stops || []);
    setPassengerScreen("ride-options");
  }, []);

  const handleSelectVehicle = useCallback((vehicleType: any, fare: number) => {
    setSelectedVehicleType(vehicleType);
    setEstimatedFare(fare);
    setPassengerScreen("confirmation");
  }, []);

  const handleConfirmRide = useCallback(async () => {
    if (!pickup || !dropoff || !selectedVehicleType) return;

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
      if (userProfile?.id) {
        const { data: existingRequestedTrip } = await supabase
          .from("trips")
          .select("id")
          .eq("passenger_id", userProfile.id)
          .eq("status", "requested")
          .order("requested_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingRequestedTrip?.id) {
          setCurrentTripId(existingRequestedTrip.id);
          setPassengerScreen("searching");
          toast({ title: "Request already active", description: "You already have a pending trip request." });
          return;
        }
      }

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

      // Save intermediate stops
      if (intermediateStops.length > 0) {
        const stopInserts = intermediateStops.map((s, i) => ({
          trip_id: data.id,
          stop_order: i + 1,
          address: s.name,
          lat: s.lat,
          lng: s.lng,
        }));
        await supabase.from("trip_stops").insert(stopInserts);
      }

      setCurrentTripId(data.id);
      setPassengerScreen("searching");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [pickup, dropoff, passengerCount, luggageCount, selectedVehicleType, estimatedFare, userProfile?.id, intermediateStops]);

  // Passenger notification sounds
  const [passengerSounds, setPassengerSounds] = useState<Record<string, string>>({});
  const passengerAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const fetchSounds = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["passenger_sound_accepted", "passenger_sound_arrived", "passenger_sound_started", "passenger_sound_completed", "passenger_sound_cancelled", "passenger_sound_message"]);
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

  // Subscribe to trip status changes
  useEffect(() => {
    if (!currentTripId) return;

    const channel = supabase
      .channel(`passenger-trip-${currentTripId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "trips",
        filter: `id=eq.${currentTripId}`,
      }, async (payload) => {
        const trip = payload.new as any;
        const status = trip.status;
        setTripStatus(status);

        const notifications: Record<string, { title: string; description: string }> = {
          accepted: { title: "🎉 Driver Accepted!", description: "Your driver is on the way to pick you up." },
          arrived: { title: "📍 Driver Arrived!", description: "Your driver has arrived at the pickup location." },
          in_progress: { title: "🚗 Trip Started!", description: "Your trip is now in progress. Enjoy the ride!" },
          completed: { title: "✅ Trip Completed!", description: `Fare: ${trip.actual_fare || trip.estimated_fare} MVR. Thank you for riding!` },
          cancelled: { title: "❌ Trip Cancelled", description: trip.cancel_reason || "The trip has been cancelled." },
        };

        const soundKey = status === "in_progress" ? "started" : status;
        const soundUrl = passengerSounds[soundKey];
        if (soundUrl) {
          try {
            if (passengerAudioRef.current) { passengerAudioRef.current.pause(); passengerAudioRef.current.currentTime = 0; }
            passengerAudioRef.current = new Audio(soundUrl);
            passengerAudioRef.current.play().catch(() => {});
          } catch {}
        }

        const notif = notifications[status];
        if (notif) toast({ title: notif.title, description: notif.description });

        if (status === "accepted") {
          if (trip.driver_id) {
            const [profileRes, banksRes, vehicleRes] = await Promise.all([
              supabase.from("profiles").select("first_name, last_name, phone_number, avatar_url, country_code").eq("id", trip.driver_id).single(),
              supabase.from("driver_bank_accounts").select("*").eq("driver_id", trip.driver_id).eq("is_active", true).order("is_primary", { ascending: false }),
              trip.vehicle_id
                ? supabase.from("vehicles").select("make, model, plate_number, color").eq("id", trip.vehicle_id).single()
                : Promise.resolve({ data: null }),
            ]);
            const p = profileRes.data;
            const v = vehicleRes.data;
            setMatchedDriver({
              name: p ? `${p.first_name} ${p.last_name}` : "Driver",
              initials: p ? `${p.first_name?.[0] || ""}${p.last_name?.[0] || ""}` : "D",
              phone: p ? `+${p.country_code || "960"} ${p.phone_number}` : "",
              avatar_url: p?.avatar_url || null,
              vehicle: v ? `${v.make} ${v.model}` : "",
              plate: v?.plate_number || "",
              bank_accounts: banksRes.data || [],
            });
          }
          setPassengerScreen("driver-matching");
        } else if (status === "arrived") {
          // Stay on driver-matching but update status
        } else if (status === "in_progress") {
          // Stay on driver-matching, show bank details
        } else if (status === "completed") {
          setPassengerScreen("feedback");
        } else if (status === "cancelled") {
          setPassengerScreen("home");
          setCurrentTripId(null);
          setMatchedDriver(null);
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
    setMatchedDriver(null);
    setTripStatus("accepted");
    setDriverLocation(null);
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
  if (phase === "register") return <PassengerRegistration phoneNumber={pendingPhone} onComplete={handleRegistrationComplete} />;

  return (
    <div className="relative w-full h-[100dvh] max-w-screen-sm mx-auto overflow-hidden bg-background">
      <div className="absolute inset-0">
        <MaldivesMap rideData={rideMapData} vehicleMarkers={vehicleMarkers} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/60 pointer-events-none z-[401]" />
      </div>

      <TopBar onLogout={handleLogout} userName={userProfile?.first_name} userProfile={userProfile} />

      {/* Passenger SOS - visible during active trip */}
      {userProfile?.id && (tripStatus === "in_progress" || tripStatus === "accepted" || tripStatus === "arrived") && currentTripId && (
        <div className="absolute top-20 right-4 z-[600]">
          <SOSButton
            userId={userProfile.id}
            userType="passenger"
            userName={`${userProfile.first_name} ${userProfile.last_name}`}
            userPhone={userProfile.phone_number || ""}
            tripId={currentTripId}
          />
        </div>
      )}

      <div className="absolute inset-0 z-[500] pointer-events-none [&>*]:pointer-events-auto">
        <AnimatePresence mode="wait">
          {passengerScreen === "home" && <LocationInput key="home" onSearch={handleLocationSearch} userId={userProfile?.id} />}
          {passengerScreen === "ride-options" && (
            <RideOptions key="ride-options" onBack={() => setPassengerScreen("home")} onConfirm={handleSelectVehicle} pickup={pickup} dropoff={dropoff} passengerCount={passengerCount} luggageCount={luggageCount} stops={intermediateStops} />
          )}
          {passengerScreen === "confirmation" && pickup && dropoff && selectedVehicleType && (
            <RideConfirmation key="confirmation" pickup={pickup} dropoff={dropoff} vehicleType={selectedVehicleType} estimatedFare={estimatedFare} passengerCount={passengerCount} luggageCount={luggageCount} userId={userProfile?.id} onConfirm={handleConfirmRide} onBack={() => setPassengerScreen("ride-options")} stops={intermediateStops} />
          )}
          {passengerScreen === "searching" && (
            <SearchingDriver key="searching" tripId={currentTripId} pickupLat={pickup?.lat} pickupLng={pickup?.lng} onCancel={() => {
              if (currentTripId) supabase.from("trips").update({ status: "cancelled", cancel_reason: "Cancelled by passenger", cancelled_at: new Date().toISOString() }).eq("id", currentTripId);
              setCurrentTripId(null);
              setPassengerScreen("home");
            }} onRetry={() => {
              setCurrentTripId(null);
              setPassengerScreen("confirmation");
            }} pickupName={pickup?.name || "Pickup"} dropoffName={dropoff?.name || "Destination"} />
          )}
          {passengerScreen === "driver-matching" && (
            <DriverMatching
              key="driver-matching"
              onCancel={() => setPassengerScreen("home")}
              driver={matchedDriver || undefined}
              tripId={currentTripId || undefined}
              userId={userProfile?.id}
              tripStatus={tripStatus}
              showBankDetails={tripStatus === "in_progress"}
            />
          )}
        </AnimatePresence>

        {passengerScreen === "feedback" && currentTripId && (
          <RideFeedback tripId={currentTripId} fare={estimatedFare} userId={userProfile?.id} onComplete={handleFeedbackComplete} />
        )}
      </div>

      <PWAInstallPrompt />
    </div>
  );
};

export default Index;
