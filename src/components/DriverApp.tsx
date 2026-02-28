import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { UserProfile } from "@/components/AuthScreen";
import DriverMap from "@/components/DriverMap";
import hdaLogo from "@/assets/hda-logo.png";
import DriverEarnings from "@/components/DriverEarnings";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import ThemeToggle from "@/components/ThemeToggle";
import { useTheme } from "@/hooks/use-theme";
import {
  MapPin,
  Navigation,
  Power,
  DollarSign,
  Clock,
  Star,
  CheckCircle,
  X,
  Phone,
  User,
  Eye,
  EyeOff,
  Radar,
  Users,
  Luggage,
  Camera,
  Plus,
  Trash2,
  Landmark,
  CreditCard,
  IdCard,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Crosshair,
  Locate,
  LocateOff,
  Car,
  Pencil,
  Save,
  Volume2,
  Play,
  Pause,
  MessageSquare,
  Share2,
  Type,
  Settings,
  Route,
  Gauge,
  Bell as BellIcon } from
"lucide-react";
import TripChat from "./TripChat";
import SOSButton from "./SOSButton";
import SlideToConfirm from "./SlideToConfirm";
import RideRequestMap from "./RideRequestMap";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import DriverNotifications from "@/components/DriverNotifications";
import { fetchSoundUrl, playSound, playFallbackBeep } from "@/lib/sound-utils";

type DriverScreen = "offline" | "online" | "ride-request" | "navigating" | "complete";
type DriverTripPhase = "heading_to_pickup" | "arrived" | "in_progress";
type ProfileTab = "info" | "documents" | "banks" | "vehicles" | "sounds" | "billing" | "messages" | "settings";
type TextSize = number; // 0.75 to 1.35 scale factor

interface TripRequest {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  estimated_fare: number | null;
  passenger_count: number;
  luggage_count: number;
  passenger_id: string | null;
  distance_km: number | null;
  vehicle_type_id: string | null;
  customer_name?: string;
  customer_phone?: string;
  dispatch_type?: string;
  booking_type?: string;
  scheduled_at?: string;
  booking_notes?: string;
  started_at?: string;
  accepted_at?: string;
}

interface BankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_primary: boolean;
}

interface DriverAppProps {
  onSwitchToPassenger: () => void;
  userProfile?: UserProfile | null;
  onLogout?: () => void;
}

const DriverApp = ({ onSwitchToPassenger, userProfile, onLogout }: DriverAppProps) => {
  const navigate = useNavigate();
  useTheme(); // Initialize theme
  usePushNotifications(userProfile?.id, "driver");
  const driverScreenKey = userProfile?.id ? `hda_driver_screen_${userProfile.id}` : "hda_driver_screen";
  const [screen, setScreen] = useState<DriverScreen>(() => {
    try {
      const saved = localStorage.getItem(driverScreenKey);
      if (saved === "online" || saved === "ride-request" || saved === "navigating") return "online";
    } catch {}
    return "offline";
  });
  const [showVehicleSwitcher, setShowVehicleSwitcher] = useState(false);
  const [driverTripPhase, setDriverTripPhase] = useState<DriverTripPhase>("heading_to_pickup");
  const [showDriverChat, setShowDriverChat] = useState(false);
  const [unreadDriverMessages, setUnreadDriverMessages] = useState(0);
  const showDriverChatRef = useRef(false);
  const [currentTrip, setCurrentTrip] = useState<TripRequest | null>(null);
  const [passengerProfile, setPassengerProfile] = useState<{first_name: string;last_name: string;phone_number?: string;avatar_url?: string | null;country_code?: string;} | null>(null);
  const [tripStops, setTripStops] = useState<Array<{id: string;stop_order: number;address: string;completed_at: string | null;}>>([]);
  const [passengerLiveLocation, setPassengerLiveLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [tripElapsed, setTripElapsed] = useState(0);
  const [showEarnings, setShowEarnings] = useState(true);
  const [showEarningsHistory, setShowEarningsHistory] = useState(false);
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [navPanelMinimized, setNavPanelMinimized] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTab>("info");
  const [tripRadius, setTripRadius] = useState(10);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [idCardFrontUrl, setIdCardFrontUrl] = useState<string | null>(null);
  const [idCardBackUrl, setIdCardBackUrl] = useState<string | null>(null);
  const [licenseFrontUrl, setLicenseFrontUrl] = useState<string | null>(null);
  const [licenseBackUrl, setLicenseBackUrl] = useState<string | null>(null);
  const [taxiPermitFrontUrl, setTaxiPermitFrontUrl] = useState<string | null>(null);
  const [taxiPermitBackUrl, setTaxiPermitBackUrl] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [showAddBank, setShowAddBank] = useState(false);
  const [newBank, setNewBank] = useState({ bank_name: "", account_number: "", account_name: "" });
  const [availableBanks, setAvailableBanks] = useState<Array<{id: string;name: string;logo_url: string | null;}>>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<{make: string;model: string;plate_number: string;color: string;vehicle_type_id?: string;} | null>(null);
  const [driverVehicles, setDriverVehicles] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ plate_number: "", make: "", model: "", color: "", vehicle_type_id: "" });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(() => {
    try {return localStorage.getItem("hda_last_vehicle_id");} catch {return null;}
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string>("");
  const [profileStatus, setProfileStatus] = useState<string>("Active");
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [adminBankInfo, setAdminBankInfo] = useState<any>(null);
  const [verificationIssues, setVerificationIssues] = useState<string[]>([]);
  const [driverStats, setDriverStats] = useState({ rides: 0, earnings: 0, hours: "0h", avgRating: 0, totalRatings: 0, declinedToday: 0 });
  const [acceptTimeoutSeconds, setAcceptTimeoutSeconds] = useState(30);
  const [rideRequestCountdown, setRideRequestCountdown] = useState(0);
  const rideRequestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone_number: "", gender: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [passengerMapIconUrl, setPassengerMapIconUrl] = useState<string | null>(null);
  const [recenterAvailable, setRecenterAvailable] = useState(false);
  const [sessionKicked, setSessionKicked] = useState(false);
  const [showTakeoverConfirm, setShowTakeoverConfirm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const recenterRef = useRef<(() => void) | null>(null);
  const followToggleRef = useRef<(() => void) | null>(null);
  const [isFollowingDriver, setIsFollowingDriver] = useState(true);
  const [driverSpeed, setDriverSpeed] = useState(0);
  const [navStepData, setNavStepData] = useState<{ instruction: string; distance: string; maneuver?: string; eta: string; totalDistance: string; nextInstruction?: string; nextManeuver?: string; nextDistance?: string } | null>(null);
  const locationWatchRef = useRef<number | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef = useRef<{lat: number;lng: number;} | null>(null);
  const deviceSessionId = useRef<string>(crypto.randomUUID());
  const textSizeKey = userProfile?.id ? `hda_driver_text_size_${userProfile.id}` : "hda_driver_text_size";
  const [textSize, setTextSize] = useState<TextSize>(() => {
    try {
      // Try user-specific key first, fall back to generic key
      const uid = userProfile?.id;
      if (uid) {
        const v = localStorage.getItem(`hda_driver_text_size_${uid}`);
        if (v) return parseFloat(v);
      }
      const v = localStorage.getItem("hda_driver_text_size");
      return v ? parseFloat(v) : 1;
    } catch {return 1;}
  });

  // Fetch unread notification count
  useEffect(() => {
    const lastSeen = localStorage.getItem("hda_driver_notif_seen") || "2000-01-01T00:00:00Z";
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .in("target_type", ["all", "drivers"])
      .gt("created_at", lastSeen)
      .then(({ count }) => setUnreadNotifCount(count || 0));
  }, [showNotifications]);

  useEffect(() => {
    if (showNotifications) {
      localStorage.setItem("hda_driver_notif_seen", new Date().toISOString());
      setUnreadNotifCount(0);
    }
  }, [showNotifications]);

  useEffect(() => {
    try { localStorage.setItem(driverScreenKey, screen); } catch {}
  }, [screen, driverScreenKey]);

  // Restore ongoing trip on app reload
  useEffect(() => {
    if (!userProfile?.id) return;
    const restoreTrip = async () => {
      const { data } = await supabase
        .from("trips")
        .select("*")
        .eq("driver_id", userProfile.id)
        .in("status", ["accepted", "arrived", "in_progress"])
        .order("accepted_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const trip = data[0] as any;
        setCurrentTrip(trip);

        // Determine trip phase from status
        if (trip.status === "in_progress") {
          setDriverTripPhase("in_progress");
        } else if (trip.status === "arrived") {
          setDriverTripPhase("arrived");
        } else {
          setDriverTripPhase("heading_to_pickup");
        }

        // Fetch passenger profile
        if (trip.passenger_id) {
          const { data: profile } = await supabase.from("profiles")
            .select("first_name, last_name, phone_number, avatar_url, country_code")
            .eq("id", trip.passenger_id).single();
          if (profile) setPassengerProfile(profile);
        }

        // Fetch trip stops
        const { data: stops } = await supabase.from("trip_stops")
          .select("id, stop_order, address, lat, lng, completed_at")
          .eq("trip_id", trip.id).order("stop_order");
        if (stops) setTripStops(stops as any[]);

        setScreen("navigating");
      }
    };
    restoreTrip();
  }, [userProfile?.id]);

  // Past trip messages state
  const [pastTripChats, setPastTripChats] = useState<Array<{trip_id: string;pickup: string;dropoff: string;date: string;message_count: number;}>>([]);
  const [selectedChatTripId, setSelectedChatTripId] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);

  // Load past trip chats when messages tab is opened
  useEffect(() => {
    if (profileTab !== "messages" || !userProfile?.id) return;
    setLoadingChats(true);
    const fetchChats = async () => {
      // Get trips with messages for this driver
      const { data: trips } = await supabase.
      from("trips").
      select("id, pickup_address, dropoff_address, completed_at, created_at").
      eq("driver_id", userProfile.id).
      in("status", ["completed", "cancelled"]).
      order("completed_at", { ascending: false }).
      limit(50);

      if (!trips || trips.length === 0) {setPastTripChats([]);setLoadingChats(false);return;}

      // Get message counts per trip
      const tripIds = trips.map((t) => t.id);
      const { data: msgs } = await supabase.
      from("trip_messages").
      select("trip_id").
      in("trip_id", tripIds);

      const countMap: Record<string, number> = {};
      (msgs || []).forEach((m) => {countMap[m.trip_id] = (countMap[m.trip_id] || 0) + 1;});

      // Only show trips that have messages
      const withMessages = trips.
      filter((t) => (countMap[t.id] || 0) > 0).
      map((t) => ({
        trip_id: t.id,
        pickup: t.pickup_address || "Unknown",
        dropoff: t.dropoff_address || "Unknown",
        date: t.completed_at || t.created_at,
        message_count: countMap[t.id] || 0
      }));

      setPastTripChats(withMessages);
      setLoadingChats(false);
    };
    fetchChats();
  }, [profileTab, userProfile?.id]);

  // Default fallback location (Male, Maldives) when GPS not available
  const FALLBACK_LAT = 4.1755;
  const FALLBACK_LNG = 73.5093;

  // Push driver location to driver_locations when online
  useEffect(() => {
    if (screen !== "online" || !userProfile?.id) {
      // Go offline: clear location watch and mark offline
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
      // Mark driver as offline
      if (userProfile?.id) {
        supabase.from("driver_locations").update({ is_online: false }).eq("driver_id", userProfile.id);
      }
      return;
    }

    // Fetch driver's vehicle to get vehicle_type_id
    const startTracking = async () => {
      // Use selected vehicle or first active vehicle
      let vehicle: any = null;
      if (selectedVehicleId) {
        const { data } = await supabase.from("vehicles").select("id, vehicle_type_id").eq("id", selectedVehicleId).single();
        vehicle = data;
      }
      if (!vehicle) {
        const { data } = await supabase.from("vehicles").select("id, vehicle_type_id").eq("driver_id", userProfile.id).eq("is_active", true).limit(1).single();
        vehicle = data;
      }

      const vehicleId = vehicle?.id || null;
      const vehicleTypeId = vehicle?.vehicle_type_id || null;

      const upsertLocation = async (lat: number, lng: number) => {
        lastPosRef.current = { lat, lng };
        const { error } = await supabase.from("driver_locations").upsert({
          driver_id: userProfile.id,
          vehicle_id: vehicleId,
          vehicle_type_id: vehicleTypeId,
          lat,
          lng,
          is_online: true,
          is_on_trip: false,
          updated_at: new Date().toISOString(),
          session_id: deviceSessionId.current
        } as any, { onConflict: "driver_id" });
        if (error) {
          console.error("Failed to upsert driver location:", error);
        }
      };

      // Immediately upsert with fallback location so driver is visible right away
      await upsertLocation(FALLBACK_LAT, FALLBACK_LNG);
      setGpsEnabled(false);

      // Try to watch GPS position — upgrade to real coords when available
      if (navigator.geolocation) {
        locationWatchRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            setGpsEnabled(true);
            upsertLocation(pos.coords.latitude, pos.coords.longitude);
          },
          (err) => {
            console.warn("GPS unavailable, using fallback location:", err.message);
            setGpsEnabled(false);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );
      }

      // Heartbeat every 10s
      locationIntervalRef.current = setInterval(async () => {
        // Check if another device took over this driver's session FIRST
        const { data: locRow } = await supabase
          .from("driver_locations")
          .select("session_id")
          .eq("driver_id", userProfile.id)
          .single();
        if (locRow && (locRow as any).session_id && (locRow as any).session_id !== deviceSessionId.current) {
          // Another device is now active — show alert and force offline
          if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
          if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current);
          try { navigator.vibrate?.([300, 100, 300, 100, 300]); } catch {}
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "square";
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
            osc.connect(gain).connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
          } catch {}
          setSessionKicked(true);
          setScreen("offline");
          return; // Don't upsert — this device is no longer active
        }
        // Only upsert location if session is still ours
        if (lastPosRef.current) {
          upsertLocation(lastPosRef.current.lat, lastPosRef.current.lng);
        }
      }, 10000);
    };

    startTracking();

    return () => {
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    };
  }, [screen, userProfile?.id, selectedVehicleId]);

  // Listen for new trip requests and play sound when online
  const tripSoundRef = useRef<HTMLAudioElement | null>(null);
  const [tripRequestSoundUrl, setTripRequestSoundUrl] = useState<string>("");
  const [availableSounds, setAvailableSounds] = useState<Array<{id: string;name: string;file_url: string;is_default: boolean;}>>([]);
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(null);
  const [previewSoundId, setPreviewSoundId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const loadSounds = async () => {
      // Fetch available trip request sounds
      const { data: soundsData } = await supabase.from("notification_sounds").select("id, name, file_url, is_default").eq("category", "trip_request").eq("is_active", true);
      const allSounds = soundsData as any[] || [];
      setAvailableSounds(allSounds);

      // Check if driver has a selected sound preference
      if (userProfile?.id) {
        const { data: profile } = await supabase.from("profiles").select("trip_sound_id").eq("id", userProfile.id).single();
        const driverSoundId = (profile as any)?.trip_sound_id;
        if (driverSoundId) {
          const selected = allSounds.find((s) => s.id === driverSoundId);
          if (selected) {
            setSelectedSoundId(driverSoundId);
            setTripRequestSoundUrl(selected.file_url);
            return;
          }
        }
      }

      // Fallback to default sound
      const defaultSound = allSounds.find((s) => s.is_default);
      if (defaultSound) {
        setTripRequestSoundUrl(defaultSound.file_url);
        setSelectedSoundId(defaultSound.id);
      } else {
        // Legacy fallback to system_settings URL
        const { data } = await supabase.from("system_settings").select("value").eq("key", "trip_request_sound_url").single();
        if (data?.value) {
          const url = typeof data.value === "string" ? data.value : String(data.value);
          setTripRequestSoundUrl(url);
        }
      }
    };
    loadSounds();
  }, [userProfile?.id]);

  const handleNewTrip = async (trip: TripRequest) => {
    // Block new trips if driver already has an active trip
    if (currentTrip) return;
    // Play sound
    if (tripRequestSoundUrl) {
      try {
        if (tripSoundRef.current) {
          tripSoundRef.current.pause();
          tripSoundRef.current.currentTime = 0;
        }
        tripSoundRef.current = new Audio(tripRequestSoundUrl);
        tripSoundRef.current.play().catch(() => {});
      } catch {}
    }

    // Fetch passenger profile, trip stops, and timeout in parallel
    const [pProfileRes, stopsRes, timeoutRes] = await Promise.all([
    trip.passenger_id ?
    supabase.from("profiles").select("first_name, last_name, phone_number, avatar_url, country_code").eq("id", trip.passenger_id).single() :
    Promise.resolve({ data: null }),
    supabase.from("trip_stops").select("id, stop_order, address, lat, lng, completed_at").eq("trip_id", trip.id).order("stop_order"),
    supabase.from("system_settings").select("value").eq("key", "driver_accept_timeout_seconds").single()]
    );

    const timeout = timeoutRes.data?.value ? Number(timeoutRes.data.value) : 30;
    setAcceptTimeoutSeconds(timeout);
    setRideRequestCountdown(timeout);

    toast({
      title: "🚗 New Ride Request!",
      description: `${trip.pickup_address} → ${trip.dropoff_address}`
    });

    setCurrentTrip(trip);
    setPassengerProfile(pProfileRes.data);
    setTripStops(stopsRes.data as any[] || []);
    setScreen("ride-request");

    // Start countdown timer
    if (rideRequestTimerRef.current) clearInterval(rideRequestTimerRef.current);
    let remaining = timeout;
    rideRequestTimerRef.current = setInterval(() => {
      remaining -= 1;
      setRideRequestCountdown(remaining);
      if (remaining <= 0) {
        if (rideRequestTimerRef.current) clearInterval(rideRequestTimerRef.current);
        rideRequestTimerRef.current = null;
        // Mark as declined so it won't come back
        declinedTripIdsRef.current.add(trip.id);
        if (userProfile?.id) {
          supabase.from("trip_declines").upsert({ driver_id: userProfile.id, trip_id: trip.id }, { onConflict: "driver_id,trip_id" });
        }
        // Auto-dismiss ride request
        setScreen("online");
        setCurrentTrip(null);
        setPassengerProfile(null);
        setTripStops([]);
        if (tripSoundRef.current) {
          tripSoundRef.current.pause();
          tripSoundRef.current.currentTime = 0;
        }
      }
    }, 1000);
  };

  // Track last seen trip id and declined trips to avoid duplicate handling
  const lastSeenTripRef = useRef<string | null>(null);
  const declinedTripIdsRef = useRef<Set<string>>(new Set());

  // Load declined trips from DB on mount
  useEffect(() => {
    if (!userProfile?.id) return;
    supabase.from("trip_declines").select("trip_id").eq("driver_id", userProfile.id).
    then(({ data }) => {
      if (data) data.forEach((r: any) => declinedTripIdsRef.current.add(r.trip_id));
    });
  }, [userProfile?.id]);

  useEffect(() => {
    if (screen !== "online" || !userProfile?.id) return;
    let isActive = true;

    // Primary: Realtime subscription for new trips
    const channel = supabase.
    channel("driver-trip-requests").
    on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "trips",
      filter: "status=eq.requested"
    }, async (payload) => {
      const trip = payload.new as any;
      if (trip.id !== lastSeenTripRef.current && !declinedTripIdsRef.current.has(trip.id)) {
        // In auto_nearest mode, only show if targeted at this driver
        if (trip.target_driver_id && trip.target_driver_id !== userProfile.id) return;
        lastSeenTripRef.current = trip.id;
        handleNewTrip(trip);
      }
    }).
    subscribe();

    // Listen for target_driver_id updates (auto-nearest cycling)
    const targetChannel = supabase.
    channel("driver-target-updates").
    on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "trips",
      filter: "status=eq.requested"
    }, async (payload) => {
      const trip = payload.new as any;
      if (trip.status !== "requested") return;
      if (trip.target_driver_id === userProfile.id && trip.id !== lastSeenTripRef.current && !declinedTripIdsRef.current.has(trip.id)) {
        lastSeenTripRef.current = trip.id;
        handleNewTrip(trip);
      }
    }).
    subscribe();

    // Fallback: Poll every 5s for new requested trips
    const pollInterval = setInterval(async () => {
      if (!isActive || screen !== "online") return;
      const { data } = await supabase.
      from("trips").
      select("*").
      eq("status", "requested").
      order("requested_at", { ascending: false }).
      limit(1);

      if (data && data.length > 0) {
        const trip = data[0] as any;
        // Skip if targeted at another driver
        if (trip.target_driver_id && trip.target_driver_id !== userProfile.id) return;
        if (trip.id !== lastSeenTripRef.current && !declinedTripIdsRef.current.has(trip.id)) {
          lastSeenTripRef.current = trip.id;
          handleNewTrip(trip);
        }
      }
    }, 5000);

    return () => {
      isActive = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      supabase.removeChannel(targetChannel);
    };
  }, [screen, userProfile?.id, tripRequestSoundUrl]);

  // Monitor active trip for cancellation or acceptance by another driver
  useEffect(() => {
    if (!currentTrip?.id || screen !== "navigating" && screen !== "ride-request") return;

    const channel = supabase.
    channel(`driver-trip-monitor-${currentTrip.id}`).
    on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "trips",
      filter: `id=eq.${currentTrip.id}`
    }, async (payload) => {
      const updated = payload.new as any;

      // Trip accepted by ANOTHER driver while we're on ride-request screen
      if (updated.status === "accepted" && screen === "ride-request" && updated.driver_id !== userProfile?.id) {
        toast({ title: "Trip Taken", description: "This trip was accepted by another driver.", variant: "destructive" });
        setScreen("online");
        setCurrentTrip(null);
        setPassengerProfile(null);
        return;
      }

      // Trip cancelled by passenger
      if (updated.status === "cancelled") {
        const soundUrl = await fetchSoundUrl("driver_sound_cancelled");
        playSound(soundUrl);
        toast({ title: "Trip Cancelled", description: "The passenger cancelled this trip.", variant: "destructive" });
        await supabase.from("driver_locations").update({ is_on_trip: false, session_id: deviceSessionId.current } as any).eq("driver_id", userProfile.id);
        setScreen("online");
        setCurrentTrip(null);
        setPassengerProfile(null);
        setDriverTripPhase("heading_to_pickup");
      }
    }).
    subscribe();

    return () => {supabase.removeChannel(channel);};
  }, [currentTrip?.id, screen, userProfile?.id]);

  // Sync showDriverChat ref
  useEffect(() => { showDriverChatRef.current = showDriverChat; if (showDriverChat) setUnreadDriverMessages(0); }, [showDriverChat]);

  // Background message listener — play sound + count unread when chat is closed
  useEffect(() => {
    if (!currentTrip?.id) return;
    let messageSoundUrl: string | null = null;
    fetchSoundUrl("driver_sound_message").then(url => { messageSoundUrl = url; });

    const channel = supabase
      .channel(`driver-bg-chat-${currentTrip.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "trip_messages",
        filter: `trip_id=eq.${currentTrip.id}`,
      }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_type === "driver") return; // own message
        // Increment unread if chat is closed
        if (!showDriverChatRef.current) {
          setUnreadDriverMessages(prev => prev + 1);
          // Play sound
          if (messageSoundUrl) {
            playSound(messageSoundUrl);
          } else {
            playFallbackBeep();
          }
          // Vibrate
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentTrip?.id]);

  // Track passenger live location before trip starts
  useEffect(() => {
    if (!currentTrip?.id) { setPassengerLiveLocation(null); return; }
    if (driverTripPhase === "in_progress") { setPassengerLiveLocation(null); return; }

    // Initial fetch
    supabase.from("trips").select("passenger_lat, passenger_lng").eq("id", currentTrip.id).single().then(({ data }) => {
      if (data?.passenger_lat && data?.passenger_lng) {
        setPassengerLiveLocation({ lat: Number(data.passenger_lat), lng: Number(data.passenger_lng) });
      }
    });

    // Subscribe to updates
    const channel = supabase
      .channel(`passenger-loc-${currentTrip.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "trips",
        filter: `id=eq.${currentTrip.id}`,
      }, (payload) => {
        const t = payload.new as any;
        if (t.passenger_lat && t.passenger_lng) {
          setPassengerLiveLocation({ lat: Number(t.passenger_lat), lng: Number(t.passenger_lng) });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentTrip?.id, driverTripPhase]);

  // Fetch available banks from admin-configured banks table
  useEffect(() => {
    supabase.from("banks").select("id, name, logo_url").eq("is_active", true).order("name").then(({ data }) => {
      if (data) setAvailableBanks(data);
    });
    supabase.from("vehicle_types").select("id, name, icon, image_url, map_icon_url").eq("is_active", true).order("sort_order").then(({ data }) => {
      if (data) setVehicleTypes(data);
    });
    supabase.from("system_settings").select("value").eq("key", "passenger_map_icon_url").single().then(({ data }) => {
      if (data?.value && typeof data.value === "string") setPassengerMapIconUrl(data.value);
    });
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: settingData } = await supabase.from("system_settings").select("value").eq("key", "default_trip_radius_km").single();
      const defaultRadius = settingData?.value ? Number(settingData.value) : 10;

      if (userProfile?.id) {
        const { data } = await supabase.from("profiles").select("trip_radius_km, avatar_url, id_card_front_url, id_card_back_url, license_front_url, license_back_url, taxi_permit_front_url, taxi_permit_back_url, status").eq("id", userProfile.id).single();
        setTripRadius(data?.trip_radius_km ?? defaultRadius);
        setAvatarUrl(data?.avatar_url || null);
        setIdCardFrontUrl(data?.id_card_front_url || null);
        setIdCardBackUrl(data?.id_card_back_url || null);
        setLicenseFrontUrl(data?.license_front_url || null);
        setLicenseBackUrl(data?.license_back_url || null);
        setTaxiPermitFrontUrl((data as any)?.taxi_permit_front_url || null);
        setTaxiPermitBackUrl((data as any)?.taxi_permit_back_url || null);
        setProfileStatus(data?.status || "Pending");

        // Check verification issues
        const issues: string[] = [];
        if (data?.status !== "Active") issues.push("Profile not verified by admin");
        if (!data?.avatar_url) issues.push("Profile photo required");
        if (!data?.id_card_front_url || !data?.id_card_back_url) issues.push("ID card (front & back) required");
        if (!data?.license_front_url || !data?.license_back_url) issues.push("Driving license (front & back) required");
        setVerificationIssues(issues);

        // Fetch bank accounts
        const { data: banks } = await supabase.from("driver_bank_accounts").select("*").eq("driver_id", userProfile.id).eq("is_active", true).order("is_primary", { ascending: false });
        setBankAccounts(banks || []);

        // Check if no bank accounts
        if (!banks || banks.length === 0) issues.push("At least one bank account required");
        setVerificationIssues(issues);

        // Fetch all driver vehicles
        const { data: allVehicles } = await supabase.from("vehicles").select("*").eq("driver_id", userProfile.id).eq("is_active", true).order("created_at");
        setDriverVehicles(allVehicles || []);
        const activeVehicle = allVehicles?.[0];
        if (activeVehicle) {
          const savedId = selectedVehicleId || (() => {try {return localStorage.getItem("hda_last_vehicle_id");} catch {return null;}})();
          const sel = savedId && allVehicles?.find((v) => v.id === savedId) || activeVehicle;
          setSelectedVehicleId(sel.id);
          try {localStorage.setItem("hda_last_vehicle_id", sel.id);} catch {}
          setVehicleInfo({ make: sel.make || "", model: sel.model || "", plate_number: sel.plate_number, color: sel.color || "", vehicle_type_id: sel.vehicle_type_id || "" });
        } else
        issues.push("No vehicle assigned");
        setVerificationIssues([...issues]);

        // Fetch company info if driver has one
        const { data: profileExtra } = await supabase.from("profiles").select("company_id, monthly_fee, company_name").eq("id", userProfile.id).single();
        if (profileExtra?.company_id) {
          const { data: company } = await supabase.from("companies").select("*").eq("id", profileExtra.company_id).single();
          setCompanyInfo(company);
        }

        // Fetch admin bank account info from system_settings
        const { data: adminBank } = await supabase.from("system_settings").select("value").eq("key", "admin_bank_info").single();
        if (adminBank?.value) {
          setAdminBankInfo(typeof adminBank.value === "string" ? JSON.parse(adminBank.value) : adminBank.value);
        }

        // Fetch today's stats
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const [tripsRes, declinesRes] = await Promise.all([
        supabase.
        from("trips").
        select("actual_fare, estimated_fare, duration_minutes, completed_at, accepted_at, status").
        eq("driver_id", userProfile.id).
        gte("created_at", todayStart.toISOString()),
        supabase.
        from("trip_declines").
        select("id").
        eq("driver_id", userProfile.id).
        gte("declined_at", todayStart.toISOString())]
        );
        const trips = tripsRes.data;
        const declinedToday = declinesRes.data?.length || 0;

        // Fetch all-time ratings
        const { data: ratedTrips } = await supabase.
        from("trips").
        select("rating").
        eq("driver_id", userProfile.id).
        eq("status", "completed").
        not("rating", "is", null);

        const totalRatings = ratedTrips?.length || 0;
        const avgRating = totalRatings > 0 ?
        ratedTrips!.reduce((sum, t) => sum + Number(t.rating), 0) / totalRatings :
        0;

        if (trips) {
          const completedTrips = trips.filter((t) => t.status === "completed");
          const totalEarnings = completedTrips.reduce((sum, t) => sum + (Number(t.actual_fare) || Number(t.estimated_fare) || 0), 0);
          const totalMinutes = completedTrips.reduce((sum, t) => sum + (Number(t.duration_minutes) || 0), 0);
          const h = Math.floor(totalMinutes / 60);
          const m = Math.round(totalMinutes % 60);
          setDriverStats({
            rides: completedTrips.length,
            earnings: totalEarnings,
            hours: h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, "0") : ""}` : `${m}m`,
            avgRating: Math.round(avgRating * 10) / 10,
            totalRatings,
            declinedToday
          });
        }
      } else {
        setTripRadius(defaultRadius);
      }
    };
    load();
  }, [userProfile?.id]);

  const updateRadius = async (val: number) => {
    setTripRadius(val);
    if (userProfile?.id) {
      await supabase.from("profiles").update({ trip_radius_km: val }).eq("id", userProfile.id);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userProfile?.id) return;

    setUploading(uploadTarget);
    const ext = file.name.split(".").pop();
    const path = `${userProfile.id}/${uploadTarget}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from("driver-documents").upload(path, file, { upsert: true });
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(null);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("driver-documents").getPublicUrl(path);

    const updateField: Record<string, string> = {};
    if (uploadTarget === "avatar") updateField.avatar_url = publicUrl;else
    if (uploadTarget === "id_front") updateField.id_card_front_url = publicUrl;else
    if (uploadTarget === "id_back") updateField.id_card_back_url = publicUrl;else
    if (uploadTarget === "license_front") updateField.license_front_url = publicUrl;else
    if (uploadTarget === "license_back") updateField.license_back_url = publicUrl;else
    if (uploadTarget === "taxi_permit_front") (updateField as any).taxi_permit_front_url = publicUrl;else
    if (uploadTarget === "taxi_permit_back") (updateField as any).taxi_permit_back_url = publicUrl;

    // Document uploads (not avatar) flag profile for review
    if (uploadTarget !== "avatar") {
      (updateField as any).status = "Pending Review";
    }

    await supabase.from("profiles").update(updateField).eq("id", userProfile.id);

    if (uploadTarget === "avatar") setAvatarUrl(publicUrl);else
    if (uploadTarget === "id_front") setIdCardFrontUrl(publicUrl);else
    if (uploadTarget === "id_back") setIdCardBackUrl(publicUrl);else
    if (uploadTarget === "license_front") setLicenseFrontUrl(publicUrl);else
    if (uploadTarget === "license_back") setLicenseBackUrl(publicUrl);else
    if (uploadTarget === "taxi_permit_front") setTaxiPermitFrontUrl(publicUrl);else
    if (uploadTarget === "taxi_permit_back") setTaxiPermitBackUrl(publicUrl);

    // Update status if doc was uploaded
    if (uploadTarget !== "avatar") {
      setProfileStatus("Pending Review");
      toast({ title: "Uploaded!", description: "Document submitted for admin review" });
    } else {
      toast({ title: "Uploaded!", description: "Image saved successfully" });
    }

    setUploading(null);
    e.target.value = "";
  };

  const triggerUpload = (target: string) => {
    setUploadTarget(target);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const addBankAccount = async () => {
    if (!userProfile?.id || !newBank.bank_name || !newBank.account_number) return;
    const isPrimary = bankAccounts.length === 0;
    const { data, error } = await supabase.from("driver_bank_accounts").insert({
      driver_id: userProfile.id,
      bank_name: newBank.bank_name,
      account_number: newBank.account_number,
      account_name: newBank.account_name,
      is_primary: isPrimary
    }).select().single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setBankAccounts([...bankAccounts, data]);
    setNewBank({ bank_name: "", account_number: "", account_name: "" });
    setShowAddBank(false);
    toast({ title: "Bank account added" });
  };

  const deleteBankAccount = async (id: string) => {
    await supabase.from("driver_bank_accounts").update({ is_active: false }).eq("id", id);
    setBankAccounts(bankAccounts.filter((b) => b.id !== id));
    toast({ title: "Bank account removed" });
  };

  const setPrimaryBank = async (id: string) => {
    if (!userProfile?.id) return;
    await supabase.from("driver_bank_accounts").update({ is_primary: false }).eq("driver_id", userProfile.id);
    await supabase.from("driver_bank_accounts").update({ is_primary: true }).eq("id", id);
    setBankAccounts(bankAccounts.map((b) => ({ ...b, is_primary: b.id === id })));
  };

  const addVehicle = async () => {
    if (!userProfile?.id || !newVehicle.plate_number || !newVehicle.vehicle_type_id) return;
    const { data, error } = await supabase.from("vehicles").insert({
      driver_id: userProfile.id,
      plate_number: newVehicle.plate_number,
      make: newVehicle.make,
      model: newVehicle.model,
      color: newVehicle.color,
      vehicle_type_id: newVehicle.vehicle_type_id
    }).select().single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setDriverVehicles([...driverVehicles, data]);
    setNewVehicle({ plate_number: "", make: "", model: "", color: "", vehicle_type_id: "" });
    setShowAddVehicle(false);
    if (!vehicleInfo) {
      setVehicleInfo({ make: data.make, model: data.model, plate_number: data.plate_number, color: data.color, vehicle_type_id: data.vehicle_type_id || "" });
      try {localStorage.setItem("hda_last_vehicle_id", data.id);} catch {}
    }
    // Flag for admin review
    await supabase.from("profiles").update({ status: "Pending Review" }).eq("id", userProfile.id);
    setProfileStatus("Pending Review");
    toast({ title: "Vehicle added", description: "Pending admin approval" });
  };

  const deleteVehicle = async (id: string) => {
    await supabase.from("vehicles").update({ is_active: false }).eq("id", id);
    const remaining = driverVehicles.filter((v) => v.id !== id);
    setDriverVehicles(remaining);
    if (selectedVehicleId === id) {
      const next = remaining.length > 0 ? remaining[0] : null;
      setSelectedVehicleId(next?.id || null);
      if (next) {try {localStorage.setItem("hda_last_vehicle_id", next.id);} catch {}}
      setVehicleInfo(next ? { make: next.make, model: next.model, plate_number: next.plate_number, color: next.color, vehicle_type_id: next.vehicle_type_id || "" } : null);
    } else if (remaining.length > 0) {
      const active = remaining.find((v) => v.id === selectedVehicleId) || remaining[0];
      setVehicleInfo({ make: active.make, model: active.model, plate_number: active.plate_number, color: active.color, vehicle_type_id: active.vehicle_type_id || "" });
    } else {
      setVehicleInfo(null);
    }
    // Flag for admin review
    if (userProfile?.id) {
      await supabase.from("profiles").update({ status: "Pending Review" }).eq("id", userProfile.id);
      setProfileStatus("Pending Review");
    }
    toast({ title: "Vehicle removed", description: "Pending admin approval" });
  };

  const selectVehicle = (v: any) => {
    setSelectedVehicleId(v.id);
    try {localStorage.setItem("hda_last_vehicle_id", v.id);} catch {}
    setVehicleInfo({ make: v.make || "", model: v.model || "", plate_number: v.plate_number, color: v.color || "", vehicle_type_id: v.vehicle_type_id || "" });
    toast({ title: "Vehicle selected", description: `${v.make} ${v.model} — ${v.plate_number}. Trip requests will match this vehicle type.` });
  };

  const initials = `${userProfile?.first_name?.[0] || ""}${userProfile?.last_name?.[0] || ""}`;

  return (
    <div className="relative w-full h-[100dvh] md:max-w-none max-w-screen-sm mx-auto overflow-hidden bg-surface driver-text-root" style={{ fontSize: `${textSize * 16}px` }}>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* Session conflict full-screen alert */}
      <AnimatePresence>
        {sessionKicked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 22, stiffness: 260 }}
              className="bg-card rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center space-y-5 border border-border"
            >
              <div className="w-16 h-16 rounded-full bg-destructive/15 flex items-center justify-center mx-auto">
                <Power className="w-8 h-8 text-destructive" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground">Signed In Elsewhere</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Your account has been signed in on another device. To keep the system reliable, only one device can be online at a time.
                </p>
                <p className="text-muted-foreground text-sm">
                  This device has been set to <span className="font-semibold text-destructive">offline</span>.
                </p>
              </div>
              <button
                onClick={() => setSessionKicked(false)}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-base active:scale-95 transition-transform"
              >
                I Understand
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Force takeover confirmation */}
      <AnimatePresence>
        {showTakeoverConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 22, stiffness: 260 }}
              className="bg-card rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center space-y-5 border border-border"
            >
              <div className="w-16 h-16 rounded-full bg-warning/15 flex items-center justify-center mx-auto">
                <Power className="w-8 h-8 text-[hsl(var(--warning))]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground">Already Online</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Your account is currently active on another device. Would you like to take over and go online here instead?
                </p>
                <p className="text-muted-foreground text-xs">
                  The other device will be automatically set to <span className="font-semibold text-destructive">offline</span>.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTakeoverConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm active:scale-95 transition-transform"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowTakeoverConfirm(false);
                    setScreen("online");
                  }}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-transform"
                >
                  Take Over
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-[700] pt-[env(safe-area-inset-top,0px)]">
        <div className={`flex items-center justify-between relative transition-all duration-300 ${showProfile ? "px-2 py-1" : "px-3 py-2.5"}`}>
          {/* Left: Profile */}
          <div className="flex items-center gap-2.5">
            <button onClick={() => setShowProfile(true)} className={`rounded-full bg-card/90 backdrop-blur-sm shadow-md flex items-center justify-center overflow-hidden active:scale-95 transition-all duration-300 border border-border/30 ${showProfile ? "w-8 h-8 landscape:hidden" : "w-11 h-11"}`}>
              {avatarUrl ?
              <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" /> :

              <User className="w-5 h-5 text-foreground" />
              }
            </button>
          </div>

          {/* Center: Vehicle */}
          <div className="relative">
            <button
              onClick={() => !currentTrip && driverVehicles.length > 1 ? setShowVehicleSwitcher(!showVehicleSwitcher) : null}
              className={`flex items-center gap-1.5 bg-card/90 backdrop-blur-sm rounded-2xl px-3 py-1.5 shadow-md border border-border/30 ${!currentTrip && driverVehicles.length > 1 ? "active:scale-95 transition-transform cursor-pointer" : "opacity-70"}`}>

              {(() => {
                const vTypeImg = vehicleInfo?.vehicle_type_id ? vehicleTypes.find((t) => t.id === vehicleInfo.vehicle_type_id)?.image_url : null;
                return vTypeImg ?
                <img src={vTypeImg} alt="Vehicle" className="h-7 w-auto object-contain" /> :

                <img src={hdaLogo} alt="HDA" className="h-6 w-auto object-contain" />;

              })()}
              {driverVehicles.length > 1 &&
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              }
            </button>

            {/* Vehicle quick-switcher dropdown */}
            <AnimatePresence>
              {showVehicleSwitcher && driverVehicles.length > 1 &&
              <div className="fixed inset-0 z-[800] flex items-center justify-center" onClick={() => setShowVehicleSwitcher(false)}>
                  <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-[85vw] max-w-72 bg-card rounded-2xl shadow-2xl border border-border overflow-hidden z-[801]"
                  style={{ fontSize: '14px' }}>

                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Switch Vehicle</p>
                    </div>
                    <div className="max-h-[50vh] overflow-y-auto py-1">
                      {[...driverVehicles].
                    sort((a, b) => a.id === selectedVehicleId ? -1 : b.id === selectedVehicleId ? 1 : 0).
                    map((v) => {
                      const vType = vehicleTypes.find((vt) => vt.id === v.vehicle_type_id);
                      const isSelected = selectedVehicleId === v.id;
                      return (
                        <button
                          key={v.id}
                          onClick={() => {
                            if (!isSelected) selectVehicle(v);
                            setShowVehicleSwitcher(false);
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                          isSelected ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-surface active:bg-surface border-l-2 border-transparent"}`
                          }>

                            <div className={`w-11 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-primary/10" : "bg-surface"}`
                          }>
                              {vType?.image_url ?
                            <img src={vType.image_url} alt={vType.name} className="w-9 h-7 object-contain" /> :

                            <Car className="w-4 h-4 text-muted-foreground" />
                            }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${isSelected ? "text-primary" : "text-foreground"}`}>
                                {v.make} {v.model}
                              </p>
                              <p className="text-xs text-muted-foreground">{v.plate_number}{v.color ? ` · ${v.color}` : ""}</p>
                            </div>
                            {isSelected &&
                          <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                          }
                          </button>);

                    })}
                    </div>
                  </motion.div>
                  </div>
              }
            </AnimatePresence>
          </div>

          {/* Right: Bell + On/Off toggle */}
          <div className="flex items-center gap-2">
            {!currentTrip && (
            <button
              onClick={() => setShowNotifications(true)}
              className="relative w-9 h-9 rounded-full bg-card/90 backdrop-blur-sm shadow-md flex items-center justify-center active:scale-95 transition-transform border border-border/30"
            >
              <BellIcon className={`w-4.5 h-4.5 text-foreground ${unreadNotifCount > 0 ? "animate-[wiggle_0.5s_ease-in-out]" : ""}`} />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse shadow-[0_0_8px_hsl(var(--destructive)/0.6)]">
                  {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                </span>
              )}
            </button>
            )}
            {screen !== "offline" && !currentTrip &&
            <button
              onClick={() => {
                setScreen("offline");
              }}
              className="relative w-14 h-8 rounded-full transition-colors duration-300 active:scale-95 flex items-center px-1 shrink-0 bg-[hsl(var(--success))] shadow-[0_0_12px_hsl(var(--success)/0.4)]"
              title="Go Offline">
              <motion.div
                className="absolute inset-0 rounded-full bg-[hsl(var(--success))]"
                animate={{ opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                style={{ boxShadow: "0 0 16px hsl(var(--success) / 0.5)" }} />
              <motion.div
                className="relative z-10 w-6 h-6 rounded-full bg-primary-foreground shadow-md"
                animate={{ x: 24 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }} />
            </button>
            }
          </div>
        </div>
      </div>

      <DriverMap
        isNavigating={screen === "navigating"}
        tripPhase={driverTripPhase}
        radiusKm={screen === "online" ? tripRadius : undefined}
        gpsEnabled={gpsEnabled}
        pickupCoords={currentTrip ? [currentTrip.pickup_lat ?? 4.1755, currentTrip.pickup_lng ?? 73.5093] : undefined}
        dropoffCoords={currentTrip ? [currentTrip.dropoff_lat ?? 4.1755, currentTrip.dropoff_lng ?? 73.5093] : undefined}
        pickupLabel={currentTrip?.pickup_address || "Pickup"}
        dropoffLabel={currentTrip?.dropoff_address || "Dropoff"}
        mapIconUrl={(() => {
          const sel = driverVehicles.find((v) => v.id === selectedVehicleId) || driverVehicles[0];
          const vt = sel ? vehicleTypes.find((t) => t.id === sel.vehicle_type_id) : null;
          return vt?.map_icon_url || null;
        })()}
        passengerMapIconUrl={passengerMapIconUrl}
        passengerLiveLocation={passengerLiveLocation}
        onRecenterAvailableChange={setRecenterAvailable}
        recenterRef={recenterRef}
        onNavUpdate={(etaText, distText, etaMins, distKm) => {
          if (currentTrip?.id) {
            supabase.from("trips").update({
              duration_minutes: etaMins,
              distance_km: distKm,
            } as any).eq("id", currentTrip.id).then(() => {});
          }
        }}
        onFollowDriverChange={setIsFollowingDriver}
        followToggleRef={followToggleRef}
        onSpeedChange={setDriverSpeed}
        tripPanelOpen={screen === "navigating" && !navPanelMinimized}
        onNavStepChange={setNavStepData} />


export default DriverApp;