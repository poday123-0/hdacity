import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";
import type { BookingType } from "@/components/LocationInput";
import { AnimatePresence, motion } from "framer-motion";
import { Car } from "lucide-react";
import MaldivesMap from "@/components/MaldivesMap";
import WatermelonMapOverlay from "@/components/WatermelonMapOverlay";
import SplashScreen from "@/components/SplashScreen";
import OnboardingScreens, { ONBOARDING_KEY } from "@/components/OnboardingScreens";
import AuthScreen, { UserProfile } from "@/components/AuthScreen";
import PassengerRegistration from "@/components/PassengerRegistration";
import DriverRegistration from "@/components/DriverRegistration";
import TopBar from "@/components/TopBar";
import LocationInput from "@/components/LocationInput";
import RideOptions from "@/components/RideOptions";
import RideConfirmation from "@/components/RideConfirmation";
import SearchingDriver from "@/components/SearchingDriver";
import DriverMatching from "@/components/DriverMatching";
import RideFeedback from "@/components/RideFeedback";
import DriverApp from "@/components/DriverApp";
import { supabase } from "@/integrations/supabase/client";
import { notifyTripRequested, notifyTripCancelled } from "@/lib/push-notifications";
import { toast } from "@/hooks/use-toast";
import { fetchSoundUrls, playSound } from "@/lib/sound-utils";
import SOSButton from "@/components/SOSButton";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import NotificationPanel from "@/components/DriverNotifications";
import NotificationPermissionPrompt from "@/components/NotificationPermissionPrompt";

type AppPhase = "splash" | "onboarding" | "auth" | "register" | "driver-register" | "driver-pending" | "passenger" | "driver";
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
const MODE_KEY = "hda_app_mode";
const REG_PHASE_KEY = "hda_reg_phase";

const Index = () => {
  // Determine initial mode from localStorage
  const initialMode = (() => {
    try { return localStorage.getItem(MODE_KEY) as "passenger" | "driver" || "passenger"; } catch { return "passenger" as const; }
  })();

  const [savedSession] = useState<{ profile: UserProfile; isDriver: boolean; driverProfile?: UserProfile } | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  });

  const [appMode, setAppMode] = useState<"passenger" | "driver">(
    savedSession?.driverProfile && initialMode === "driver" ? "driver" : 
    savedSession?.isDriver && initialMode === "driver" ? "driver" : "passenger"
  );
  const [phase, setPhase] = useState<AppPhase>(() => {
    // Restore registration phase if it was interrupted (e.g. by file picker on mobile)
    try {
      const savedRegPhase = localStorage.getItem(REG_PHASE_KEY);
      if (savedRegPhase && savedSession && (savedRegPhase === "driver-register" || savedRegPhase === "register")) {
        return savedRegPhase as AppPhase;
      }
    } catch {}
    if (!savedSession) return "splash";
    if (appMode === "driver" && savedSession.driverProfile) return "driver";
    return "passenger";
  });
  const [passengerScreen, setPassengerScreen] = useState<PassengerScreen>("home");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(savedSession?.profile || null);
  const [driverProfile, setDriverProfile] = useState<UserProfile | null>(savedSession?.driverProfile || null);
  const [hasDriverProfile, setHasDriverProfile] = useState(savedSession?.isDriver || false);
  const pushUserId = phase === "driver" ? driverProfile?.id : userProfile?.id;
  const pushUserType = phase === "driver" ? "driver" : "passenger";
  usePushNotifications(pushUserId, pushUserType);
  const [pendingPhone, setPendingPhone] = useState(() => {
    try { return localStorage.getItem("hda_pending_phone") || ""; } catch { return ""; }
  });
  const [showPassengerNotifs, setShowPassengerNotifs] = useState(false);
  const [currentTripId, setCurrentTripId] = useState<string | null>(null);
  const [passengerMapInstance, setPassengerMapInstance] = useState<google.maps.Map | null>(null);
  const [pickup, setPickup] = useState<SelectedLocation | null>(null);
  const [dropoff, setDropoff] = useState<SelectedLocation | null>(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [intermediateStops, setIntermediateStops] = useState<StopLocation[]>([]);
  const [selectedVehicleType, setSelectedVehicleType] = useState<any>(null);
  const [estimatedFare, setEstimatedFare] = useState(0);
  const [passengerBonus, setPassengerBonus] = useState(0);
  const [fareZoneId, setFareZoneId] = useState<string | null>(null);
  const [bookingType, setBookingType] = useState<BookingType>("now");
  const [scheduledAt, setScheduledAt] = useState<string | undefined>();
  const [bookingNotes, setBookingNotes] = useState<string | undefined>();
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "wallet">("cash");
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [driverIconUrl, setDriverIconUrl] = useState<string | null>(null);
  const [matchedDriver, setMatchedDriver] = useState<any>(null);
  const [tripStatus, setTripStatus] = useState<string>("accepted");
  const [showPassengerCancelConfirm, setShowPassengerCancelConfirm] = useState(false);
  const [showCancelledByDriverPopup, setShowCancelledByDriverPopup] = useState(false);
  const [cancelledByDriverReason, setCancelledByDriverReason] = useState("");
  const missingProfileChecksRef = useRef(0);

  // Passenger font size
  const [passengerTextSize, setPassengerTextSize] = useState<number>(() => {
    try {
      const v = localStorage.getItem("hda_passenger_text_size");
      return v ? parseFloat(v) : 1;
    } catch { return 1; }
  });

  // Load admin default passenger font size if no local preference
  useEffect(() => {
    try {
      if (localStorage.getItem("hda_passenger_text_size")) return;
    } catch { return; }
    supabase.from("system_settings").select("value").eq("key", "default_passenger_font_size").single().then(({ data }) => {
      if (data?.value) {
        const pct = typeof data.value === "number" ? data.value : parseFloat(String(data.value));
        if (pct && pct > 0) setPassengerTextSize(pct / 100);
      }
    });
  }, []);

  // Save mode preference
  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, appMode); } catch {}
  }, [appMode]);

  // Persist registration phase so file picker page reloads don't lose it
  useEffect(() => {
    try {
      if (phase === "driver-register" || phase === "register") {
        localStorage.setItem(REG_PHASE_KEY, phase);
      } else {
        localStorage.removeItem(REG_PHASE_KEY);
      }
    } catch {}
  }, [phase]);

  // Persist pending phone for registration survival across reloads
  useEffect(() => {
    try {
      if (pendingPhone) localStorage.setItem("hda_pending_phone", pendingPhone);
      else localStorage.removeItem("hda_pending_phone");
    } catch {}
  }, [pendingPhone]);

  // Check if user has a driver profile on login
  const checkDriverProfile = useCallback(async (phone: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("phone_number", phone)
      .eq("user_type", "Driver")
      .single();
    
    if (data && data.status === "Active") {
      const dp: UserProfile = {
        id: data.id,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone_number: data.phone_number,
        gender: data.gender || "1",
        status: data.status,
      };
      setDriverProfile(dp);
      setHasDriverProfile(true);
      // Sync to session so it persists
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) {
          const session = JSON.parse(raw);
          session.isDriver = true;
          session.driverProfile = dp;
          localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        }
      } catch {}
      return dp;
    }
    setHasDriverProfile(false);
    setDriverProfile(null);
    return null;
  }, []);

  // Re-check driver profile on mount if we have a session but driver info may be stale
  useEffect(() => {
    if (userProfile?.phone_number && phase !== "splash" && phase !== "onboarding" && phase !== "auth") {
      checkDriverProfile(userProfile.phone_number);
    }
  }, [userProfile?.phone_number, phase, checkDriverProfile]);

  // Switch between modes
  const handleSwitchMode = useCallback((mode: "passenger" | "driver") => {
    setAppMode(mode);
    // Also sync the session so on next load the mode + driver profile are available
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw);
        session.isDriver = !!driverProfile;
        session.driverProfile = driverProfile || undefined;
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }
    } catch {}
    if (mode === "driver" && driverProfile) {
      setPhase("driver");
    } else if (mode === "driver" && !driverProfile) {
      // User wants driver mode but has no driver profile — show driver registration
      setPendingPhone(userProfile?.phone_number || "");
      setPhase("driver-register");
    } else {
      setPhase("passenger");
    }
  }, [driverProfile, userProfile]);

  // Restore ongoing trip on app load
  useEffect(() => {
    if (!userProfile?.id || phase !== "passenger") return;

    const restoreTrip = async () => {
      // Find any active trip for this passenger
      const { data: activeTrip } = await supabase
        .from("trips")
        .select("*")
        .eq("passenger_id", userProfile.id)
        .in("status", ["requested", "scheduled", "accepted", "arrived", "in_progress"])
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!activeTrip) return;

      // Set the ref BEFORE setting state to prevent realtime from re-toasting
      lastPlayedStatusRef.current = activeTrip.status;

      setCurrentTripId(activeTrip.id);
      setTripStatus(activeTrip.status);
      setEstimatedFare(activeTrip.estimated_fare || 0);

      // Restore pickup/dropoff locations
      if (activeTrip.pickup_lat && activeTrip.pickup_lng) {
        setPickup({ id: "restored-pickup", name: activeTrip.pickup_address || "Pickup", address: activeTrip.pickup_address || "", lat: Number(activeTrip.pickup_lat), lng: Number(activeTrip.pickup_lng) });
      }
      if (activeTrip.dropoff_lat && activeTrip.dropoff_lng) {
        setDropoff({ id: "restored-dropoff", name: activeTrip.dropoff_address || "Dropoff", address: activeTrip.dropoff_address || "", lat: Number(activeTrip.dropoff_lat), lng: Number(activeTrip.dropoff_lng) });
      }

      if (activeTrip.status === "requested" || activeTrip.status === "scheduled") {
        setPassengerScreen("searching");
      } else if (["accepted", "arrived", "in_progress"].includes(activeTrip.status)) {
        // Fetch driver info
        if (activeTrip.driver_id) {
          const [profileRes, banksRes, favaraRes, vehicleRes] = await Promise.all([
            supabase.from("profiles").select("first_name, last_name, phone_number, avatar_url, country_code").eq("id", activeTrip.driver_id).single(),
            supabase.from("driver_bank_accounts").select("*").eq("driver_id", activeTrip.driver_id).eq("is_active", true).order("is_primary", { ascending: false }),
            supabase.from("driver_favara_accounts").select("*").eq("driver_id", activeTrip.driver_id).eq("is_active", true).order("is_primary", { ascending: false }),
            activeTrip.vehicle_id
              ? supabase.from("vehicles").select("make, model, plate_number, color").eq("id", activeTrip.vehicle_id).single()
              : Promise.resolve({ data: null }),
          ]);
          const p = profileRes.data;
          const v = vehicleRes.data;
          setMatchedDriver({
            id: activeTrip.driver_id,
            name: p ? `${p.first_name} ${p.last_name}` : "Driver",
            initials: p ? `${p.first_name?.[0] || ""}${p.last_name?.[0] || ""}` : "D",
            phone: p ? `+${p.country_code || "960"} ${p.phone_number}` : "",
            avatar_url: p?.avatar_url || null,
            vehicle: v ? `${v.make} ${v.model}` : "",
            plate: v?.plate_number || "",
            bank_accounts: banksRes.data || [],
            favara_accounts: favaraRes.data || [],
          });
        }
        // For scheduled+accepted trips, show driver-matching with scheduled info
        setPassengerScreen("driver-matching");
      }

      toast({ title: "Trip restored", description: "Your ongoing trip has been restored." });
    };

    restoreTrip();
  }, [userProfile?.id, phase]);

  // Build ride data for the map
  const rideMapData = useMemo(() => {
    const isRiding = ["searching", "driver-matching", "feedback"].includes(passengerScreen);
    if (!isRiding || !pickup || !dropoff) return undefined;
    return {
      pickup: { lat: pickup.lat, lng: pickup.lng, name: pickup.name },
      dropoff: { lat: dropoff.lat, lng: dropoff.lng, name: dropoff.name },
      driverLat: driverLocation?.lat,
      driverLng: driverLocation?.lng,
      driverIconUrl: driverIconUrl,
      showRoute: true,
    };
  }, [passengerScreen, pickup, dropoff, driverLocation, driverIconUrl]);

  // Fetch actual online driver locations
  const [vehicleMarkers, setVehicleMarkers] = useState<Array<{ id: string; lat: number; lng: number; name: string; imageUrl?: string; icon?: string }>>([]);

  const passengerPTR = usePullToRefresh({
    onRefresh: async () => {
      // Force SW to check for updates, then hard-reload to bypass cache
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update().catch(() => {});
      }
      window.location.reload();
    },
    disabled: passengerScreen !== "home",
  });

  const fetchOnlineDrivers = useCallback(async () => {
    // Only fetch drivers updated within the last 10 minutes (filters out stale/inactive)
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from("driver_locations")
      .select("id, lat, lng, driver_id, vehicle_type_id, updated_at")
      .eq("is_online", true)
      .eq("is_on_trip", false)
      .gte("updated_at", staleThreshold);

    if (data && data.length > 0) {
      // Get unique vehicle type IDs
      const vtIds = [...new Set(data.map(d => d.vehicle_type_id).filter(Boolean))] as string[];
      let vtMap: Record<string, { name: string; map_icon_url: string | null }> = {};

      if (vtIds.length > 0) {
        const { data: vtData } = await supabase
          .from("vehicle_types")
          .select("id, name, map_icon_url, image_url")
          .in("id", vtIds);
        vtData?.forEach((vt: any) => {
          vtMap[vt.id] = { name: vt.name, map_icon_url: vt.map_icon_url || vt.image_url };
        });
      }

      const markers = data.map((dl: any) => ({
        id: dl.driver_id,
        lat: dl.lat,
        lng: dl.lng,
        name: vtMap[dl.vehicle_type_id]?.name || "Driver",
        imageUrl: vtMap[dl.vehicle_type_id]?.map_icon_url || undefined,
        vehicleTypeId: dl.vehicle_type_id,
      }));

      // Deduplicate by driver_id
      const seen = new Set<string>();
      const uniqueMarkers = markers.filter((m: any) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      // Limit to ~8 vehicles per vehicle type for a cleaner map
      const MAX_PER_TYPE = 8;
      const byType: Record<string, typeof uniqueMarkers> = {};
      uniqueMarkers.forEach(m => {
        const key = m.vehicleTypeId || "unknown";
        if (!byType[key]) byType[key] = [];
        byType[key].push(m);
      });

      const limited: typeof uniqueMarkers = [];
      Object.values(byType).forEach(group => {
        // Shuffle then take up to MAX_PER_TYPE for variety
        const shuffled = group.sort(() => Math.random() - 0.5);
        limited.push(...shuffled.slice(0, MAX_PER_TYPE));
      });

      setVehicleMarkers(limited);
    } else {
      setVehicleMarkers([]);
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

  // Listen for admin force-refresh signal via realtime — show banner instead of instant reload
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel("force-refresh-listener")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "system_settings",
        filter: "key=eq.force_refresh",
      }, (payload) => {
        try {
          const val = payload.new as any;
          const parsed = typeof val.value === "string" ? JSON.parse(val.value) : val.value;
          const target = parsed?.target || "all";
          const triggeredAt = String(parsed?.triggered_at || "");
          const currentUserType = appMode === "driver" ? "drivers" : "passengers";

          if (!(target === "all" || target === currentUserType)) return;

          // Prevent reload loops: handle each triggered_at only once on this device
          const handledKey = `hda_force_refresh_handled_${currentUserType}`;
          if (triggeredAt) {
            const lastHandled = localStorage.getItem(handledKey);
            if (lastHandled === triggeredAt) return;
            localStorage.setItem(handledKey, triggeredAt);
          } else {
            const now = Date.now();
            const last = Number(localStorage.getItem(handledKey) || "0");
            if (now - last < 15000) return;
            localStorage.setItem(handledKey, String(now));
          }

          setShowUpdateBanner(true);
        } catch {}
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [appMode]);

  // Live track driver location when trip is accepted
  useEffect(() => {
    if (!currentTripId || passengerScreen !== "driver-matching") return;

    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const trackDriver = async () => {
      const { data: trip } = await supabase.from("trips").select("driver_id, vehicle_id, vehicle_type_id").eq("id", currentTripId).single();
      if (!trip?.driver_id) return;

      // Fetch vehicle map icon URL — try vehicle_id first, fall back to trip's vehicle_type_id
      let iconFound = false;
      if (trip.vehicle_id) {
        const { data: vehicle } = await supabase.from("vehicles").select("vehicle_type_id").eq("id", trip.vehicle_id).single();
        if (vehicle?.vehicle_type_id) {
          const { data: vt } = await supabase.from("vehicle_types").select("map_icon_url").eq("id", vehicle.vehicle_type_id).single();
          if (vt?.map_icon_url) { setDriverIconUrl(vt.map_icon_url); iconFound = true; }
        }
      }
      if (!iconFound && trip.vehicle_type_id) {
        const { data: vt } = await supabase.from("vehicle_types").select("map_icon_url").eq("id", trip.vehicle_type_id).single();
        if (vt?.map_icon_url) setDriverIconUrl(vt.map_icon_url);
      }

      const fetchPos = async () => {
        const { data: loc } = await supabase
          .from("driver_locations")
          .select("lat, lng, heading")
          .eq("driver_id", trip.driver_id!)
          .single();
        if (loc) setDriverLocation({ lat: loc.lat, lng: loc.lng });
      };
      fetchPos();

      // Poll every 5s as backup for realtime
      pollInterval = setInterval(fetchPos, 5000);

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
    return () => {
      cleanup.then(fn => fn?.());
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [currentTripId, passengerScreen]);

  // Broadcast passenger GPS location to trip (so driver can see passenger on map)
  useEffect(() => {
    if (!currentTripId || !["searching", "driver-matching"].includes(passengerScreen)) return;
    if (tripStatus === "in_progress" || tripStatus === "completed" || tripStatus === "cancelled") return;

    let watchId: number | null = null;
    let lastUpdate = 0;
    let throttleMs = 5000;

    // Fetch admin-configured passenger location interval
    supabase.from("system_settings").select("value").eq("key", "passenger_location_interval_ms").single().then(({ data }) => {
      if (data?.value) {
        const val = typeof data.value === "number" ? data.value : parseInt(String(data.value), 10);
        if (!isNaN(val) && val >= 1000) throttleMs = val;
      }
    });

    const updateLocation = (lat: number, lng: number) => {
      const now = Date.now();
      if (now - lastUpdate < throttleMs) return;
      lastUpdate = now;
      supabase.from("trips").update({
        passenger_lat: lat,
        passenger_lng: lng,
      } as any).eq("id", currentTripId).then(() => {});
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
      watchId = navigator.geolocation.watchPosition(
        (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { enableHighAccuracy: true, maximumAge: 3000 }
      );
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [currentTripId, passengerScreen, tripStatus]);

  const handleSplashComplete = useCallback(() => {
    // Check if onboarding was already seen
    const onboardingSeen = (() => { try { return localStorage.getItem(ONBOARDING_KEY) === "1"; } catch { return false; } })();
    if (!onboardingSeen && !savedSession) {
      setPhase("onboarding");
      return;
    }
    if (savedSession) {
      if (appMode === "driver" && savedSession.driverProfile) setPhase("driver");
      else setPhase("passenger");
    }
    else setPhase("auth");
  }, [savedSession, appMode]);

  const handleLogin = useCallback(async (profile: UserProfile | null, _isDriverUser: boolean, phoneNumber?: string) => {
    if (!profile) {
      // No profile found — show registration
      setPendingPhone(phoneNumber || "");
      setPhase("register");
      return;
    }
    setUserProfile(profile);
    
    // Check if this phone also has a driver profile
    const dp = await checkDriverProfile(profile.phone_number);
    
    // Save session with driver info
    const sessionData = { profile, isDriver: !!dp, driverProfile: dp || undefined };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));

    // If initial mode was driver and they have a driver profile, go to driver mode
    if (initialMode === "driver" && dp) {
      setAppMode("driver");
      setPhase("driver");
    } else {
      setPhase("passenger");
    }
  }, [checkDriverProfile, initialMode]);

  const handleRegistrationComplete = useCallback(async (profile: UserProfile) => {
    setUserProfile(profile);
    const dp = await checkDriverProfile(profile.phone_number);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ profile, isDriver: !!dp, driverProfile: dp || undefined }));
    setPhase("passenger");
  }, [checkDriverProfile]);

  const handleDriverRegistrationComplete = useCallback(() => {
    setPhase("driver-pending");
  }, []);

  const handleLocationSearch = useCallback((p: SelectedLocation, d: SelectedLocation, passengers: number, luggage: number, stops?: StopLocation[], bType?: BookingType, schedAt?: string, bNotes?: string) => {
    setPickup(p);
    setDropoff(d);
    setPassengerCount(passengers);
    setLuggageCount(luggage);
    setIntermediateStops(stops || []);
    setBookingType(bType || "now");
    setScheduledAt(schedAt);
    setBookingNotes(bNotes);
    setPassengerScreen("ride-options");
  }, []);

  const handleSelectVehicle = useCallback((vehicleType: any, fare: number, bonus: number = 0, zoneId?: string | null) => {
    setSelectedVehicleType(vehicleType);
    setEstimatedFare(fare);
    setPassengerBonus(bonus);
    setFareZoneId(zoneId || null);
    setPassengerScreen("confirmation");
  }, []);

  const handleConfirmRide = useCallback(async (selectedPaymentMethod?: "cash" | "transfer" | "wallet") => {
    const pm = selectedPaymentMethod || "cash";
    setPaymentMethod(pm);
    if (!pickup || !dropoff || !selectedVehicleType) return;

    // For scheduled rides, skip driver availability check (drivers will be notified immediately)
    if (bookingType !== "scheduled" && bookingType !== "hourly") {
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
        passenger_bonus: passengerBonus,
        fare_type: fareZoneId ? "zone" : (bookingType === "hourly" ? "hourly" : "distance"),
        fare_zone_id: fareZoneId || null,
        status: bookingType === "scheduled" ? "scheduled" : "requested",
        passenger_count: passengerCount,
        luggage_count: luggageCount,
        passenger_id: userProfile?.id || null,
        booking_type: bookingType,
        scheduled_at: scheduledAt || null,
        booking_notes: bookingNotes || null,
        payment_method: pm,
      } as any).select().single();

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

      // For scheduled rides, send push notification immediately to online drivers, then show confirmation
      if (bookingType === "scheduled") {
        // Notify online drivers immediately
        try {
          const { data: onlineDrivers } = await supabase
            .from("driver_locations")
            .select("driver_id")
            .eq("is_online", true);
          if (onlineDrivers && onlineDrivers.length > 0) {
            const driverIds = onlineDrivers.map((d: any) => d.driver_id);
            await notifyTripRequested(driverIds, data.id, pickup.name);
          }
        } catch (pushErr) {
          console.warn("Push notification failed:", pushErr);
        }

        toast({
          title: "📅 Ride Scheduled!",
          description: `Your ride has been scheduled for ${scheduledAt ? new Date(scheduledAt).toLocaleString() : "later"}. Drivers are being notified now.`,
        });
        // Go to searching screen so passenger can see when a driver accepts
        setPassengerScreen("searching");
        return;
      }

      setPassengerScreen("searching");

      // Send push notification to online drivers
      if (data.status === "requested") {
        try {
          const { data: onlineDrivers } = await supabase
            .from("driver_locations")
            .select("driver_id")
            .eq("is_online", true)
            .eq("is_on_trip", false);
          if (onlineDrivers && onlineDrivers.length > 0) {
            const driverIds = onlineDrivers.map((d: any) => d.driver_id);
            await notifyTripRequested(driverIds, data.id, pickup.name);
          }
        } catch (pushErr) {
          console.warn("Push notification failed:", pushErr);
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [pickup, dropoff, passengerCount, luggageCount, selectedVehicleType, estimatedFare, passengerBonus, userProfile?.id, intermediateStops, bookingType, scheduledAt, bookingNotes]);

  // Passenger notification sounds — fetch from notification_sounds table
  const [passengerSounds, setPassengerSounds] = useState<Record<string, string>>({});
  const passengerAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedStatusRef = useRef<string | null>(null);
  const passengerSoundsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const fetchSounds = async () => {
      const categories = [
        "passenger_accepted", "passenger_arrived", "passenger_started",
        "passenger_completed", "passenger_cancelled", "passenger_message_received"
      ];
      const { data } = await supabase
        .from("notification_sounds")
        .select("category, file_url")
        .in("category", categories)
        .eq("is_default", true)
        .eq("is_active", true);
      const map: Record<string, string> = {};
      data?.forEach((s: any) => {
        // Map category to short key: passenger_accepted -> accepted, passenger_started -> started, etc.
        const key = s.category.replace("passenger_", "").replace("_received", "");
        map[key] = s.file_url;
      });
      setPassengerSounds(map);
      passengerSoundsRef.current = map;
    };
    fetchSounds();
  }, []);

  // Handle passenger trip status update (shared by realtime + polling)
  const handlePassengerTripUpdate = useCallback(async (trip: any) => {
    const status = trip.status;
    setTripStatus(status);

    const statusChanged = lastPlayedStatusRef.current !== status;
    const isNoDriverCancel = status === "cancelled" && trip.cancel_reason === "No driver found";

    if (statusChanged && !isNoDriverCancel) {
      lastPlayedStatusRef.current = status;

      const notifications: Record<string, { title: string; description: string }> = {
        accepted: { title: "🎉 Driver Accepted!", description: "Your driver is on the way to pick you up." },
        arrived: { title: "📍 Driver Arrived!", description: "Your driver has arrived at the pickup location." },
        in_progress: { title: "🚗 Trip Started!", description: "Your trip is now in progress. Enjoy the ride!" },
        completed: { title: "✅ Trip Completed!", description: `Fare: ${trip.actual_fare || trip.estimated_fare} MVR. Thank you for riding!` },
        cancelled: { title: "❌ Trip Cancelled", description: trip.cancel_reason || "The trip has been cancelled." },
      };

      const soundKey = status === "in_progress" ? "started" : status;
      const soundUrl = passengerSoundsRef.current[soundKey];
      if (soundUrl) {
        if (passengerAudioRef.current) { passengerAudioRef.current.pause(); passengerAudioRef.current.currentTime = 0; }
        passengerAudioRef.current = playSound(soundUrl);
      }

      const notif = notifications[status];
      if (notif) toast({ title: notif.title, description: notif.description });
    }

    if (status === "accepted") {
      if (trip.driver_id) {
        const [profileRes, banksRes, favaraRes, vehicleRes] = await Promise.all([
          supabase.from("profiles").select("first_name, last_name, phone_number, avatar_url, country_code").eq("id", trip.driver_id).single(),
          supabase.from("driver_bank_accounts").select("*").eq("driver_id", trip.driver_id).eq("is_active", true).order("is_primary", { ascending: false }),
          supabase.from("driver_favara_accounts").select("*").eq("driver_id", trip.driver_id).eq("is_active", true).order("is_primary", { ascending: false }),
          trip.vehicle_id
            ? supabase.from("vehicles").select("make, model, plate_number, color, image_url").eq("id", trip.vehicle_id).single()
            : Promise.resolve({ data: null }),
        ]);
        const p = profileRes.data;
        const v = vehicleRes.data;
        setMatchedDriver({
          id: trip.driver_id,
          name: p ? `${p.first_name} ${p.last_name}` : "Driver",
          initials: p ? `${p.first_name?.[0] || ""}${p.last_name?.[0] || ""}` : "D",
          phone: p ? `+${p.country_code || "960"} ${p.phone_number}` : "",
          avatar_url: p?.avatar_url || null,
          vehicle: v ? `${v.make} ${v.model}` : "",
          plate: v?.plate_number || "",
          vehicle_color: v?.color || "",
          vehicle_image_url: v?.image_url || null,
          bank_accounts: banksRes.data || [],
          favara_accounts: favaraRes.data || [],
        });
      }
      setPassengerScreen("driver-matching");
    } else if (status === "arrived") {
      // Stay on driver-matching but update status
    } else if (status === "in_progress") {
      // Stay on driver-matching, show bank details
    } else if (status === "completed") {
      setPassengerScreen("feedback");
    } else if (status === "cancelled" && !isNoDriverCancel) {
      const cancelledByDriver = trip.cancel_reason?.includes("driver");
      if (cancelledByDriver) {
        setCancelledByDriverReason(trip.cancel_reason || "Your driver cancelled the trip.");
        setShowCancelledByDriverPopup(true);
      }
      setPassengerScreen("home");
      setCurrentTripId(null);
      setMatchedDriver(null);
      lastPlayedStatusRef.current = null;
    }
  }, []);

  // Subscribe to trip status changes (realtime + polling fallback)
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
        await handlePassengerTripUpdate(payload.new as any);
      })
      .subscribe();

    // Polling fallback every 5s in case realtime misses the event
    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("trips").select("*").eq("id", currentTripId).single();
      if (data) {
        await handlePassengerTripUpdate(data as any);
      }
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [currentTripId, handlePassengerTripUpdate]);

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
    setDriverIconUrl(null);
    lastPlayedStatusRef.current = null;
    setPassengerScreen("home");
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(MODE_KEY);
    // Also remove old driver session key
    localStorage.removeItem("hda_driver_session");
    setUserProfile(null);
    setDriverProfile(null);
    setHasDriverProfile(false);
    setPhase("auth");
    setAppMode("passenger");
    setPassengerScreen("home");
    setCurrentTripId(null);
    setPickup(null);
    setDropoff(null);
  }, []);

  // Profile existence check removed — users should only logout manually

  if (phase === "splash") return <SplashScreen onComplete={handleSplashComplete} />;
  if (phase === "onboarding") return <OnboardingScreens onComplete={() => setPhase("auth")} />;
  if (phase === "auth") return <AuthScreen onLogin={handleLogin} mode={initialMode} />;
  if (phase === "register") return <PassengerRegistration phoneNumber={pendingPhone} onComplete={handleRegistrationComplete} />;
  if (phase === "driver-register") {
    return (
      <DriverRegistration
        phoneNumber={pendingPhone || userProfile?.phone_number || ""}
        onComplete={handleDriverRegistrationComplete}
        onBack={() => { setPhase("passenger"); setAppMode("passenger"); }}
      />
    );
  }
  if (phase === "driver-pending") {
    return (
      <div className="fixed inset-0 z-40 bg-background flex flex-col items-center justify-center max-w-lg mx-auto px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Registration Under Review</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Your driver registration has been submitted and is awaiting admin approval. You'll be able to switch to driver mode once approved.
        </p>
        <button
          onClick={() => { setPhase("passenger"); setAppMode("passenger"); }}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold"
        >
          Continue as Passenger
        </button>
      </div>
    );
  }

  // DRIVER MODE
  if (phase === "driver" && driverProfile) {
    return (
      <>
        <DriverApp
          onSwitchToPassenger={() => handleSwitchMode("passenger")}
          userProfile={driverProfile}
          onLogout={handleLogout}
        />
        <AnimatePresence>
          {showUpdateBanner && (
            <motion.div
              initial={{ opacity: 0, y: -80 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -80 }}
              transition={{ type: "spring", damping: 22, stiffness: 260 }}
              className="fixed top-0 left-0 right-0 z-[99998] pt-[env(safe-area-inset-top,0px)]"
            >
              <div className="mx-3 mt-3 bg-card/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-border/50 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">Update Available</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">A new version is ready. Refresh to get the latest.</p>
                  </div>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl active:scale-95 transition-transform shrink-0 shadow-sm"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // PASSENGER MODE
  return (
    <div ref={passengerPTR.containerRef} className="relative w-full h-[100dvh] overflow-hidden bg-background" style={{ fontSize: `${passengerTextSize * 16}px` }}>
      <PullToRefreshIndicator pullDistance={passengerPTR.pullDistance} refreshing={passengerPTR.refreshing} progress={passengerPTR.progress} />
      <div className="absolute inset-0">
        <MaldivesMap rideData={rideMapData} vehicleMarkers={vehicleMarkers} onMapReady={setPassengerMapInstance} />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/60 pointer-events-none z-[401]" />
        {userProfile?.id && passengerScreen === "driver-matching" && (
          <WatermelonMapOverlay
            userType="passenger"
            userId={userProfile.id}
            userLat={null}
            userLng={null}
            mapInstance={passengerMapInstance}
          />
        )}
      </div>

      <TopBar 
        onLogout={handleLogout} 
        userName={userProfile?.first_name} 
        userProfile={userProfile} 
        onNotificationPress={() => setShowPassengerNotifs(true)}
        onDriverMode={hasDriverProfile ? () => handleSwitchMode("driver") : undefined}
        onRegisterDriver={!hasDriverProfile ? () => handleSwitchMode("driver") : undefined}
        onProfileUpdate={(updated) => {
          setUserProfile(updated);
          // Sync to localStorage session
          try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (raw) {
              const session = JSON.parse(raw);
              session.profile = updated;
              localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            }
          } catch {}
        }}
      />

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

      <div className="absolute inset-0 z-[500] pointer-events-none [&>*]:pointer-events-auto lg:left-0 lg:right-auto lg:w-[420px] lg:top-[4.5rem]">
        <AnimatePresence mode="wait">
          {passengerScreen === "home" && <LocationInput key="home" onSearch={handleLocationSearch} userId={userProfile?.id} />}
          {passengerScreen === "ride-options" && (
            <RideOptions key="ride-options" onBack={() => setPassengerScreen("home")} onConfirm={handleSelectVehicle} pickup={pickup} dropoff={dropoff} passengerCount={passengerCount} luggageCount={luggageCount} stops={intermediateStops} bookingType={bookingType} scheduledAt={scheduledAt} />
          )}
          {passengerScreen === "confirmation" && pickup && dropoff && selectedVehicleType && (
            <RideConfirmation key="confirmation" pickup={pickup} dropoff={dropoff} vehicleType={selectedVehicleType} estimatedFare={estimatedFare} passengerBonus={passengerBonus} passengerCount={passengerCount} luggageCount={luggageCount} userId={userProfile?.id} onConfirm={handleConfirmRide} onBack={() => setPassengerScreen("ride-options")} stops={intermediateStops} bookingType={bookingType} scheduledAt={scheduledAt} bookingNotes={bookingNotes} />
          )}
          {passengerScreen === "searching" && (
            <SearchingDriver key="searching" tripId={currentTripId} pickupLat={pickup?.lat} pickupLng={pickup?.lng}
              isScheduled={bookingType === "scheduled"}
              scheduledAt={scheduledAt}
              onCancel={async () => {
              if (currentTripId) {
                const { data: tripData } = await supabase.from("trips").select("driver_id, target_driver_id").eq("id", currentTripId).maybeSingle();
                await supabase.from("trips").update({ status: "cancelled", cancel_reason: "Cancelled by passenger", cancelled_at: new Date().toISOString(), target_driver_id: null }).eq("id", currentTripId);
                const driverId = tripData?.driver_id || tripData?.target_driver_id;
                if (driverId) notifyTripCancelled([driverId], "passenger", currentTripId);
              }
              setCurrentTripId(null);
              setPassengerScreen("home");
              lastPlayedStatusRef.current = null;
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
              pickupName={pickup?.name}
              dropoffName={dropoff?.name}
              onCancelTrip={() => setShowPassengerCancelConfirm(true)}
            />
          )}
        </AnimatePresence>

        {passengerScreen === "feedback" && currentTripId && (
          <RideFeedback tripId={currentTripId} fare={estimatedFare + passengerBonus} userId={userProfile?.id} onComplete={handleFeedbackComplete} />
        )}
      </div>

      <PWAInstallPrompt />
      <NotificationPermissionPrompt />
      <NotificationPanel userId={userProfile?.id} userType="passenger" visible={showPassengerNotifs} onClose={() => setShowPassengerNotifs(false)} />

      {/* Passenger Cancel Confirmation Popup */}
      <AnimatePresence>
        {showPassengerCancelConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 280 }}
              className="bg-card rounded-3xl shadow-2xl w-full max-w-[340px] overflow-hidden border border-border/40"
            >
              <div className="px-6 pt-8 pb-5 text-center">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                  <Car className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Cancel your ride?</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  Your driver will be notified immediately.
                </p>
              </div>
              <div className="px-6 pb-6 space-y-3">
                <button
                   onClick={async () => {
                    setShowPassengerCancelConfirm(false);
                    if (currentTripId) {
                      const { data: tripData } = await supabase.from("trips").select("driver_id").eq("id", currentTripId).maybeSingle();
                      await supabase.from("trips").update({
                        status: "cancelled",
                        cancel_reason: "Cancelled by passenger",
                        cancelled_at: new Date().toISOString(),
                      }).eq("id", currentTripId);
                      const driverId = tripData?.driver_id || matchedDriver?.id;
                      if (driverId) notifyTripCancelled([driverId], "passenger", currentTripId);
                    }
                    setCurrentTripId(null);
                    setMatchedDriver(null);
                    setPassengerScreen("home");
                    toast({ title: "Trip Cancelled", description: "Your ride has been cancelled." });
                  }}
                  className="w-full py-4 bg-destructive text-destructive-foreground rounded-2xl text-base font-bold active:scale-95 transition-transform"
                >
                  Yes, Cancel Ride
                </button>
                <button
                  onClick={() => setShowPassengerCancelConfirm(false)}
                  className="w-full py-3 text-sm font-medium text-muted-foreground hover:text-foreground rounded-2xl transition-colors"
                >
                  Go back
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancelled by Driver Popup */}
      <AnimatePresence>
        {showCancelledByDriverPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 280 }}
              className="bg-card rounded-3xl shadow-2xl w-full max-w-[340px] overflow-hidden border border-border/40"
            >
              <div className="px-6 pt-8 pb-5 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 18 }}
                  className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4"
                >
                  <Car className="w-8 h-8 text-destructive" />
                </motion.div>
                <h3 className="text-lg font-bold text-foreground">Driver Cancelled</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {cancelledByDriverReason}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  You can request a new ride anytime.
                </p>
              </div>
              <div className="px-6 pb-6">
                <button
                  onClick={() => setShowCancelledByDriverPopup(false)}
                  className="w-full py-4 bg-primary text-primary-foreground rounded-2xl text-base font-bold active:scale-95 transition-transform"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Push Update Banner */}
      <AnimatePresence>
        {showUpdateBanner && (
          <motion.div
            initial={{ opacity: 0, y: -80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -80 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            className="fixed top-0 left-0 right-0 z-[99998] pt-[env(safe-area-inset-top,0px)]"
          >
            <div className="mx-3 mt-3 bg-card/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-border/50 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">Update Available</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">A new version is ready. Refresh to get the latest.</p>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl active:scale-95 transition-transform shrink-0 shadow-sm"
                >
                  Refresh
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
