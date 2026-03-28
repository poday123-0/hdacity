import { useState, useEffect, useRef, useCallback } from "react";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import PullToRefreshIndicator from "@/components/PullToRefreshIndicator";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { UserProfile } from "@/components/AuthScreen";
import DriverMap from "@/components/DriverMap";
import { type NavSettings, DEFAULT_NAV_SETTINGS, loadNavSettings, saveNavSettings } from "@/components/DriverMap";
import SystemLogo from "@/components/SystemLogo";
import DriverEarnings from "@/components/DriverEarnings";
import DriverWallet from "@/components/DriverWallet";
import DriverCompleteScreen from "@/components/DriverCompleteScreen";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { compressImage } from "@/lib/image-compress";
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
  Banknote,
  IdCard,
  Wallet,
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
  Upload,
  AlertTriangle,
  Bell as BellIcon,
  Trophy,
  XCircle,
  Ban,
  FileText,
  Shield,
  Search } from
"lucide-react";
import TripChat from "./TripChat";
import SOSButton from "./SOSButton";
import SlideToConfirm from "./SlideToConfirm";
import RideRequestMap from "./RideRequestMap";
import WatermelonMapOverlay from "./WatermelonMapOverlay";
import AdBanner from "./AdBanner";
import DriverLeaderboard from "./DriverLeaderboard";

import { notifyTripCancelled, notifyTripAccepted, notifyDriverArrived, notifyTripStarted, notifyTripCompleted, notifyTripTaken } from "@/lib/push-notifications";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import { startBackgroundLocation, stopBackgroundLocation } from "@/lib/background-location";
import NotificationPermissionPrompt from "@/components/NotificationPermissionPrompt";
import DriverNotifications from "@/components/DriverNotifications";
import { fetchSoundUrl, playSound, playFallbackBeep } from "@/lib/sound-utils";
import { stopAllSounds, playTrackedSound, unlockAudioPool, stopHeartbeat } from "@/lib/sound-manager";
import RideTypesTab from "@/components/RideTypesTab";
import SuggestPlace from "@/components/SuggestPlace";
import AnimatedTimer from "./AnimatedTimer";

type DriverScreen = "offline" | "online" | "ride-request" | "navigating" | "complete";
type DriverTripPhase = "heading_to_pickup" | "arrived" | "in_progress";
type ProfileTab = "info" | "documents" | "banks" | "wallets" | "vehicles" | "sounds" | "billing" | "messages" | "settings";
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
  arrived_at?: string;
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
  const driverScreenKey = userProfile?.id ? `hda_driver_screen_${userProfile.id}` : "hda_driver_screen";
  const [screen, setScreen] = useState<DriverScreen>(() => {
    try {
      const saved = localStorage.getItem(driverScreenKey);
      if (saved === "online" || saved === "ride-request" || saved === "navigating") return "online";
    } catch {}
    return "offline";
  });
  const screenRef = useRef(screen);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  const [showVehicleSwitcher, setShowVehicleSwitcher] = useState(false);
  const [driverTripPhase, setDriverTripPhase] = useState<DriverTripPhase>("heading_to_pickup");
  const [showDriverChat, setShowDriverChat] = useState(false);
  const [unreadDriverMessages, setUnreadDriverMessages] = useState(0);
  const showDriverChatRef = useRef(false);
  const [currentTrip, setCurrentTrip] = useState<TripRequest | null>(null);
  const [passengerProfile, setPassengerProfile] = useState<{first_name: string;last_name: string;phone_number?: string;avatar_url?: string | null;country_code?: string;} | null>(null);
  const [tripStops, setTripStops] = useState<Array<{id: string;stop_order: number;address: string;completed_at: string | null;}>>([]);
  const [passengerLiveLocation, setPassengerLiveLocation] = useState<{lat: number;lng: number;} | null>(null);
  const getStoredTripTimer = (tripId: string | undefined, field: "accepted_at" | "arrived_at" | "started_at") => {
    if (!tripId) return null;
    try {
      return localStorage.getItem(`hda_trip_timer:${tripId}:${field}`);
    } catch {
      return null;
    }
  };
  const setStoredTripTimer = (tripId: string | undefined, field: "accepted_at" | "arrived_at" | "started_at", value?: string | null) => {
    if (!tripId || !value) return;
    try {
      localStorage.setItem(`hda_trip_timer:${tripId}:${field}`, value);
    } catch {}
  };
  const [showEarnings, setShowEarnings] = useState(() => {
    try { return localStorage.getItem("hda_driver_show_earnings") !== "false"; } catch { return true; }
  });
  const [completionFare, setCompletionFare] = useState(0);
  const [confirmedPaymentMethod, setConfirmedPaymentMethod] = useState<"cash" | "transfer" | "wallet">("cash");
  const [driverWalletBalance, setDriverWalletBalance] = useState(0);
  const [driverWalletId, setDriverWalletId] = useState<string | null>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showPayFeeModal, setShowPayFeeModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawNotes, setWithdrawNotes] = useState("");
  const [minWithdrawalAmount, setMinWithdrawalAmount] = useState(100);
  const [showEarningsHistory, setShowEarningsHistory] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [upcomingScheduledTrip, setUpcomingScheduledTrip] = useState<{ id: string; scheduled_at: string; pickup_address: string; dropoff_address: string } | null>(null);
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
  const [favaraAccounts, setFavaraAccounts] = useState<Array<{id: string;favara_id: string;favara_name: string;is_primary: boolean;}>>([]);
  const [showAddFavara, setShowAddFavara] = useState(false);
  const [newFavara, setNewFavara] = useState({ favara_id: "", favara_name: "" });
  const [favaraLogoUrl, setFavaraLogoUrl] = useState<string | null>(null);
  const [swipeAccounts, setSwipeAccounts] = useState<Array<{id: string;swipe_username: string;swipe_name: string;is_primary: boolean;}>>([]);
  const [showAddSwipe, setShowAddSwipe] = useState(false);
  const [newSwipe, setNewSwipe] = useState({ swipe_username: "", swipe_name: "" });
  const [swipeLogoUrl, setSwipeLogoUrl] = useState<string | null>(null);
  const [availableBanks, setAvailableBanks] = useState<Array<{id: string;name: string;logo_url: string | null;}>>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [submittingProfileDocs, setSubmittingProfileDocs] = useState(false);
  const [submittingVehicleDocsById, setSubmittingVehicleDocsById] = useState<Record<string, boolean>>({});
  const [vehicleInfo, setVehicleInfo] = useState<{make: string;model: string;plate_number: string;color: string;vehicle_type_id?: string;} | null>(null);
  const [driverVehicles, setDriverVehicles] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ plate_number: "", make: "", model: "", color: "", vehicle_type_id: "" });
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editVehicle, setEditVehicle] = useState({ plate_number: "", make: "", model: "", color: "", vehicle_type_id: "" });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(() => {
    try {return localStorage.getItem("hda_last_vehicle_id");} catch {return null;}
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string>("");
  const [profileStatus, setProfileStatus] = useState<string>("Active");
  const [profileRejectionReason, setProfileRejectionReason] = useState<string>("");
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [adminBankInfo, setAdminBankInfo] = useState<any>(null);
  const [verificationIssues, setVerificationIssues] = useState<string[]>([]);
  const [driverStats, setDriverStats] = useState({ rides: 0, earnings: 0, hours: "0h", avgRating: 0, totalRatings: 0, declinedToday: 0 });
  const [onlineTimeDisplay, setOnlineTimeDisplay] = useState("0m");
  const [acceptTimeoutSeconds, setAcceptTimeoutSeconds] = useState(30);
  const [rideRequestCountdown, setRideRequestCountdown] = useState(0);
  const rideRequestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone_number: "", gender: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [notifPermissionDenied, setNotifPermissionDenied] = useState(false);
  const [billingHold, setBillingHold] = useState(false);
  const [showBillingPayPopup, setShowBillingPayPopup] = useState(false);
  const [billingSlipUploading, setBillingSlipUploading] = useState(false);
  const [billingSlipUrl, setBillingSlipUrl] = useState<string | null>(null);
  const [billingPaymentSubmitting, setBillingPaymentSubmitting] = useState(false);
  const billingFileRef = useRef<HTMLInputElement>(null);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [passengerMapIconUrl, setPassengerMapIconUrl] = useState<string | null>(null);
  const [recenterAvailable, setRecenterAvailable] = useState(false);
  const [sessionKicked, setSessionKicked] = useState(false);
  const sessionKickedRef = useRef(false);
  const [showTakeoverConfirm, setShowTakeoverConfirm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSuggestPlace, setShowSuggestPlace] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [showDriverCancelConfirm, setShowDriverCancelConfirm] = useState(false);
  const [showCancelledByPassengerPopup, setShowCancelledByPassengerPopup] = useState(false);
  const [cancelledTripReason, setCancelledTripReason] = useState("");
  const recenterRef = useRef<(() => void) | null>(null);
  const followToggleRef = useRef<(() => void) | null>(null);
  const [isFollowingDriver, setIsFollowingDriver] = useState(true);
  const missingProfileChecksRef = useRef(0);
  const [driverSpeed, setDriverSpeed] = useState(0);
  const [navStepData, setNavStepData] = useState<{instruction: string;distance: string;maneuver?: string;eta: string;totalDistance: string;nextInstruction?: string;nextManeuver?: string;nextDistance?: string;} | null>(null);
  const [driverNavSettings, setDriverNavSettings] = useState<NavSettings>(loadNavSettings);
  const [mapHeading, setMapHeading] = useState(0);
  const resetNorthRef = useRef<(() => void) | null>(null);
  const startFreeNavRef = useRef<((target: { lat: number; lng: number }) => void) | null>(null);
  const locationWatchRef = useRef<number | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef = useRef<{lat: number;lng: number;} | null>(null);
  const foregroundGpsCleanupRef = useRef<(() => void) | null>(null);
  const tripRadiusRef = useRef(10);
  const deviceSessionId = useRef<string>(crypto.randomUUID());
  const takeoverWindowUntilRef = useRef(0);
  const [driverMapInstance, setDriverMapInstance] = useState<any>(null);
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState("");
  const [locationSearchResults, setLocationSearchResults] = useState<{ name: string; address: string; lat: number; lng: number; type: string }[]>([]);
  const [isFreeNavigating, setIsFreeNavigating] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // --- Online time tracking ---
  const onlineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onlineStorageKey = userProfile?.id ? `hda_online_since_${userProfile.id}` : null;

  const formatOnlineTime = (ms: number) => {
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}` : `${m}m`;
  };

  // Start / resume online timer when screen goes online
  useEffect(() => {
    if (onlineTimerRef.current) { clearInterval(onlineTimerRef.current); onlineTimerRef.current = null; }

    const isOnline = screen === "online" || screen === "navigating" || screen === "ride-request";
    if (!isOnline || !onlineStorageKey) { return; }

    const accKey = `${onlineStorageKey}_acc`;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    // Reset accumulated time if it's from a previous day
    const accDayKey = `${onlineStorageKey}_acc_day`;
    const storedDay = localStorage.getItem(accDayKey);
    const todayStr = todayStart.toISOString().slice(0, 10);
    if (storedDay !== todayStr) {
      localStorage.setItem(accKey, "0");
      localStorage.setItem(accDayKey, todayStr);
    }

    // Persist "went online" timestamp (only set if not already set today)
    let onlineSince: number;
    const stored = localStorage.getItem(onlineStorageKey);
    if (stored) {
      const ts = parseInt(stored, 10);
      if (ts >= todayStart.getTime()) {
        onlineSince = ts;
      } else {
        // Reset for new day
        onlineSince = Date.now();
        localStorage.setItem(onlineStorageKey, String(onlineSince));
        localStorage.setItem(accKey, "0");
        localStorage.setItem(accDayKey, todayStr);
      }
    } else {
      onlineSince = Date.now();
      localStorage.setItem(onlineStorageKey, String(onlineSince));
    }

    const accumulated = parseInt(localStorage.getItem(accKey) || "0", 10);

    const tick = () => {
      // Check if midnight has passed since onlineSince — if so, reset
      const now = Date.now();
      const currentDayStart = new Date(); currentDayStart.setHours(0, 0, 0, 0);
      if (onlineSince < currentDayStart.getTime()) {
        // Midnight crossed — reset everything for new day
        onlineSince = currentDayStart.getTime();
        localStorage.setItem(onlineStorageKey, String(onlineSince));
        localStorage.setItem(accKey, "0");
        localStorage.setItem(accDayKey, currentDayStart.toISOString().slice(0, 10));
        const elapsed = now - onlineSince;
        setOnlineTimeDisplay(formatOnlineTime(elapsed));
      } else {
        const elapsed = accumulated + (now - onlineSince);
        setOnlineTimeDisplay(formatOnlineTime(elapsed));
      }
    };
    tick();
    onlineTimerRef.current = setInterval(tick, 30000);

    // Schedule a tick at exactly midnight to reset the display
    const now = new Date();
    const nextMidnight = new Date(now); nextMidnight.setDate(nextMidnight.getDate() + 1); nextMidnight.setHours(0, 0, 0, 0);
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();
    const midnightTimer = setTimeout(() => { tick(); }, msUntilMidnight + 500);

    return () => {
      if (onlineTimerRef.current) clearInterval(onlineTimerRef.current);
      clearTimeout(midnightTimer);
    };
  }, [screen, onlineStorageKey]);

  // When going offline, accumulate the elapsed online time
  useEffect(() => {
    if (screen !== "offline" || !onlineStorageKey) return;
    const accKey = `${onlineStorageKey}_acc`;
    const stored = localStorage.getItem(onlineStorageKey);
    if (stored) {
      const onlineSince = parseInt(stored, 10);
      const prev = parseInt(localStorage.getItem(accKey) || "0", 10);
      const sessionMs = Date.now() - onlineSince;
      localStorage.setItem(accKey, String(prev + sessionMs));
      localStorage.removeItem(onlineStorageKey);
    }
  }, [screen, onlineStorageKey]);
  const [vehicleBlockedUntil, setVehicleBlockedUntil] = useState<Date | null>(null);
  const [blockCountdown, setBlockCountdown] = useState<string>("");
  const eligibleVehicleTypeIdsRef = useRef<Set<string>>(new Set());
  const activeVehicleTypeIdRef = useRef<string | null>(null);
  const [driverPhaseElapsed, setDriverPhaseElapsed] = useState(0);
  const [driverArrivedElapsed, setDriverArrivedElapsed] = useState(0);
  const [driverTripElapsed, setDriverTripElapsed] = useState(0);
  const forceSessionTakeoverLogout = useCallback(() => {
    // Guard: only fire once
    if (sessionKickedRef.current) return;
    sessionKickedRef.current = true;

    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
    if (locationWatchRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
    stopBackgroundLocation();
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
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {}

    setSessionKicked(true);
    setScreen("offline");
    setCurrentTrip(null);
    setShowTakeoverConfirm(false);
    toast({
      title: "Switched Offline",
      description: "Another device became active. This device is now offline.",
      variant: "destructive",
    });
  }, []);

  const handleSessionMismatch = useCallback(async () => {
    if (!userProfile?.id) return;

    // Grace window: newest device reclaims session once to avoid race during takeover
    if (Date.now() < takeoverWindowUntilRef.current) {
      await supabase
        .from("driver_locations")
        .update({
          session_id: deviceSessionId.current,
          is_online: true,
          updated_at: new Date().toISOString(),
        })
        .eq("driver_id", userProfile.id);
      takeoverWindowUntilRef.current = 0;
      return;
    }

    forceSessionTakeoverLogout();
  }, [userProfile?.id, forceSessionTakeoverLogout]);

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

  // Load admin default font size if user hasn't set a personal preference
  useEffect(() => {
    const hasLocal = (() => {
      try {
        if (userProfile?.id && localStorage.getItem(`hda_driver_text_size_${userProfile.id}`)) return true;
        if (localStorage.getItem("hda_driver_text_size")) return true;
        return false;
      } catch { return false; }
    })();
    if (hasLocal) return;
    supabase.from("system_settings").select("value").eq("key", "default_driver_font_size").single().then(({ data }) => {
      if (data?.value) {
        const pct = typeof data.value === "number" ? data.value : parseFloat(String(data.value));
        if (pct && pct > 0) setTextSize(pct / 100);
      }
    });
  }, [userProfile?.id]);

  // Fetch unread notification count
  const fetchUnreadCount = useCallback(async () => {
    if (!userProfile?.id) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, read_by")
      .in("target_type", ["all", "drivers"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      const unread = data.filter(n => {
        const readBy = Array.isArray(n.read_by) ? n.read_by : [];
        return !(readBy as string[]).includes(userProfile.id);
      });
      setUnreadNotifCount(unread.length);
    }
  }, [userProfile?.id]);

  // Profile existence check removed — users should only logout manually

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount, showNotifications]);

  useEffect(() => {
    if (showNotifications) {
      // When closing notifications, recount
      return () => { fetchUnreadCount(); };
    }
  }, [showNotifications, fetchUnreadCount]);

  // Check notification permission when driver goes online
  useEffect(() => {
    if (screen === "online") {
      const check = () => {
        if ("Notification" in window && Notification.permission !== "granted") {
          setNotifPermissionDenied(true);
        } else {
          setNotifPermissionDenied(false);
        }
      };
      check();
      // Re-check periodically in case user grants permission externally
      const interval = setInterval(check, 120000);
      return () => clearInterval(interval);
    } else {
      setNotifPermissionDenied(false);
    }
  }, [screen]);

  // Load eligible vehicle type IDs for the selected vehicle
  useEffect(() => {
    if (!userProfile?.id) return;
    const load = async () => {
      const ids = new Set<string>();
      // If a vehicle is selected, get its specific ride types
      if (selectedVehicleId) {
        const { data: dvtData } = await supabase.from("driver_vehicle_types")
          .select("vehicle_type_id")
          .eq("driver_id", userProfile.id)
          .eq("vehicle_id", selectedVehicleId)
          .eq("status", "approved");
        (dvtData || []).forEach((r: any) => { if (r.vehicle_type_id) ids.add(r.vehicle_type_id); });
        // Also include the vehicle's own type
        const { data: veh } = await supabase.from("vehicles").select("vehicle_type_id").eq("id", selectedVehicleId).single();
        if (veh?.vehicle_type_id) ids.add(veh.vehicle_type_id);
      } else {
        // Fallback: all driver's approved types
        const [dvtRes, vehRes] = await Promise.all([
          supabase.from("driver_vehicle_types").select("vehicle_type_id").eq("driver_id", userProfile.id).eq("status", "approved"),
          supabase.from("vehicles").select("vehicle_type_id").eq("driver_id", userProfile.id).eq("is_active", true),
        ]);
        (dvtRes.data || []).forEach((r: any) => { if (r.vehicle_type_id) ids.add(r.vehicle_type_id); });
        (vehRes.data || []).forEach((r: any) => { if (r.vehicle_type_id) ids.add(r.vehicle_type_id); });
      }
      eligibleVehicleTypeIdsRef.current = ids;
    };
    load();
  }, [userProfile?.id, selectedVehicleId]);

  useEffect(() => {
    try {localStorage.setItem(driverScreenKey, screen);} catch {}
  }, [screen, driverScreenKey]);

  // Restore ongoing trip on app reload
  useEffect(() => {
    if (!userProfile?.id) return;
    const restoreTrip = async () => {
      const { data } = await supabase.
      from("trips").
      select("*").
      eq("driver_id", userProfile.id).
      in("status", ["accepted", "arrived", "started", "in_progress"]).
      order("accepted_at", { ascending: false }).
      limit(1);

      if (data && data.length > 0) {
        const trip = data[0] as any;

        // IMPORTANT: accepted scheduled rides must only open via manual "Start Scheduled Ride"
        if (trip.booking_type === "scheduled" && trip.status === "accepted") {
          return;
        }

        const normalizedStatus = trip.status === "started" ? "in_progress" : trip.status;
        // Use updated_at as fallback for missing timestamps based on status
        const fallbackAccepted = trip.accepted_at || trip.updated_at;
        const fallbackArrived = trip.arrived_at || (["arrived", "in_progress"].includes(normalizedStatus) ? (trip.started_at || trip.updated_at) : null);
        const fallbackStarted = trip.started_at || (normalizedStatus === "in_progress" ? trip.updated_at : null);
        setStoredTripTimer(trip.id, "accepted_at", fallbackAccepted);
        if (fallbackArrived) setStoredTripTimer(trip.id, "arrived_at", fallbackArrived);
        if (fallbackStarted) setStoredTripTimer(trip.id, "started_at", fallbackStarted);
        setCurrentTrip({ ...trip, status: normalizedStatus, accepted_at: fallbackAccepted, arrived_at: fallbackArrived, started_at: fallbackStarted } as any);

        // Determine trip phase from status
        if (normalizedStatus === "in_progress") {
          setDriverTripPhase("in_progress");
        } else if (normalizedStatus === "arrived") {
          setDriverTripPhase("arrived");
        } else {
          setDriverTripPhase("heading_to_pickup");
        }

        // Fetch passenger profile
        if (trip.passenger_id) {
          const { data: profile } = await supabase.from("profiles").
          select("first_name, last_name, phone_number, avatar_url, country_code").
          eq("id", trip.passenger_id).single();
          if (profile) setPassengerProfile(profile);
        }

        // Fetch trip stops
        const { data: stops } = await supabase.from("trip_stops").
        select("id, stop_order, address, lat, lng, completed_at").
        eq("trip_id", trip.id).order("stop_order");
        if (stops) setTripStops(stops as any[]);

        setScreen("navigating");
      }
    };
    restoreTrip();
  }, [userProfile?.id]);

  // No fallback location — only use actual GPS

  // Immediately stop all driver location tracking & mark offline
  const goOfflineNow = useCallback(async () => {
    // Clear GPS watcher
    if (locationWatchRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
    // Stop native background location tracking
    stopBackgroundLocation();
    // Clear heartbeat interval
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
    // Stop silent audio heartbeat to save battery
    stopHeartbeat();
    // Mark driver as offline in DB (only if we own the session)
    if (userProfile?.id) {
      const { data } = await supabase
        .from("driver_locations")
        .select("session_id")
        .eq("driver_id", userProfile.id)
        .single();
      const activeSessionId = (data as any)?.session_id;
      if (!activeSessionId || activeSessionId === deviceSessionId.current) {
        await supabase.from("driver_locations").update({ is_online: false }).eq("driver_id", userProfile.id);
      }
    }
  }, [userProfile?.id]);

  // Push driver location to driver_locations when online
  useEffect(() => {
    if (!userProfile?.id || !sessionReady) return;

    if (screen === "offline") {
      goOfflineNow();
      return;
    }

    // Don't start tracking if screen is ride-request/complete (only online & navigating need GPS)
    if (screen !== "online" && screen !== "navigating" && screen !== "ride-request") {
      return;
    }

    // Pre-unlock audio pool so notification sounds play even when PWA is minimized
    unlockAudioPool();

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
      activeVehicleTypeIdRef.current = vehicleTypeId;

      // Distance threshold — skip DB writes if driver hasn't moved enough
      const MIN_MOVE_METERS = 10;
      const lastWrittenPosRef = { lat: 0, lng: 0, time: 0 };
      const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      const upsertLocation = async (lat: number, lng: number, force = false) => {
        lastPosRef.current = { lat, lng };

        // Skip DB write if driver hasn't moved enough (saves battery & network)
        // Always write on first fix, force flag, or if >60s since last write
        const now = Date.now();
        const timeSinceLastWrite = now - lastWrittenPosRef.time;
        if (!force && lastWrittenPosRef.time > 0 && timeSinceLastWrite < 60000) {
          const dist = haversineMeters(lat, lng, lastWrittenPosRef.lat, lastWrittenPosRef.lng);
          if (dist < MIN_MOVE_METERS) return;
        }

        lastWrittenPosRef.lat = lat;
        lastWrittenPosRef.lng = lng;
        lastWrittenPosRef.time = now;

        // Don't override is_on_trip — just update position + online status
        const upsertPayload: any = {
          driver_id: userProfile.id,
          vehicle_id: vehicleId,
          vehicle_type_id: vehicleTypeId,
          lat,
          lng,
          is_online: true,
          updated_at: new Date().toISOString(),
          session_id: deviceSessionId.current
        };
        // Only set is_on_trip to false when on 'online' screen (not navigating/ride-request)
        if (screen === "online") {
          upsertPayload.is_on_trip = false;
        }
        const { error } = await supabase.from("driver_locations").upsert(
          upsertPayload, { onConflict: "driver_id" }
        );
        if (error) {
          console.error("Failed to upsert driver location:", error);
        }
      };

      // Wait for actual GPS before making driver visible — no fallback location
      setGpsEnabled(false);

      // Fetch GPS accuracy settings from admin
      let gpsHighAccuracy = false; // Default to balanced mode to reduce battery drain
      let gpsMaxAge = 15000; // 15s idle — reduces GPS radio usage significantly
      try {
        const [accRes, ageRes] = await Promise.all([
          supabase.from("system_settings").select("value").eq("key", "driver_gps_accuracy").single(),
          supabase.from("system_settings").select("value").eq("key", "driver_gps_max_age_ms").single(),
        ]);
        if (accRes.data?.value) {
          const acc = typeof accRes.data.value === "string" ? accRes.data.value : String(accRes.data.value);
          gpsHighAccuracy = acc === "high";
        }
        if (ageRes.data?.value) {
          const val = typeof ageRes.data.value === "number" ? ageRes.data.value : parseInt(String(ageRes.data.value), 10);
          if (!isNaN(val) && val >= 1000) gpsMaxAge = val;
        }
      } catch {}

      // On native, use ONLY background geolocation plugin (battery efficient, distance-filtered).
      // On web, fall back to watchPosition.
      const isNativePlatform = typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor.isNativePlatform?.();

      if (isNativePlatform) {
        // Native: rely solely on background geolocation plugin — much more battery efficient
        // It uses the OS-level distance filter and doesn't keep GPS radio on constantly
        startBackgroundLocation(
          (lat, lng) => {
            setGpsEnabled(true);
            setDriverLat(lat);
            setDriverLng(lng);
            upsertLocation(lat, lng);
          },
          { distanceFilter: MIN_MOVE_METERS }
        );
        // Get one initial fix to show position immediately
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setGpsEnabled(true);
              setDriverLat(pos.coords.latitude);
              setDriverLng(pos.coords.longitude);
              upsertLocation(pos.coords.latitude, pos.coords.longitude);
            },
            () => {},
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 15000 }
          );
        }
      } else {
        // Web: use watchPosition
        if (navigator.geolocation) {
          locationWatchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              setGpsEnabled(true);
              setDriverLat(pos.coords.latitude);
              setDriverLng(pos.coords.longitude);
              upsertLocation(pos.coords.latitude, pos.coords.longitude);
            },
            (err) => {
              console.warn("GPS unavailable:", err.message);
              setGpsEnabled(false);
              toast({ title: "GPS Required", description: "Please enable location services to go online.", variant: "destructive" });
            },
            { enableHighAccuracy: gpsHighAccuracy, timeout: 15000, maximumAge: gpsMaxAge }
          );
        } else {
          toast({ title: "GPS Not Supported", description: "Your device does not support GPS.", variant: "destructive" });
        }
      }

      // Heartbeat — use admin-configured interval or default 30s (reduced from 10s to save battery)
      let driverIntervalMs = 30000;
      try {
        const { data: intervalSetting } = await supabase.from("system_settings").select("value").eq("key", "driver_location_interval_ms").single();
        if (intervalSetting?.value) {
          const val = typeof intervalSetting.value === "number" ? intervalSetting.value : parseInt(String(intervalSetting.value), 10);
          if (!isNaN(val) && val >= 1000) driverIntervalMs = val;
        }
      } catch {}
      locationIntervalRef.current = setInterval(async () => {
        // Check if another device took over this driver's session FIRST
        const { data: locRow } = await supabase.
        from("driver_locations").
        select("session_id").
        eq("driver_id", userProfile.id).
        single();
        if (locRow && (locRow as any).session_id && (locRow as any).session_id !== deviceSessionId.current) {
          // Another device is now active — resolve mismatch
          await handleSessionMismatch();
          return; // Don't upsert — this device is no longer active
        }
        // Only upsert location if session is still ours
        if (lastPosRef.current) {
          upsertLocation(lastPosRef.current.lat, lastPosRef.current.lng);
        }
      }, driverIntervalMs);

      // Force fresh GPS on foreground return (web only — native plugin handles this automatically)
      const onForeground = () => {
        if (document.visibilityState !== "visible") return;
        if (isNativePlatform) {
          // On native, get a fresh GPS fix on resume — background plugin may lag after wake
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setGpsEnabled(true);
              setDriverLat(pos.coords.latitude);
              setDriverLng(pos.coords.longitude);
              lastPosRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              upsertLocation(pos.coords.latitude, pos.coords.longitude, true);
            },
            () => {
              // Fallback: upsert last known position if fresh fix fails
              if (lastPosRef.current) upsertLocation(lastPosRef.current.lat, lastPosRef.current.lng, true);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
          );
          return;
        }

        // Web: get fresh fix and restart watchPosition
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setGpsEnabled(true);
            setDriverLat(pos.coords.latitude);
            setDriverLng(pos.coords.longitude);
            upsertLocation(pos.coords.latitude, pos.coords.longitude);
          },
          () => {},
          { enableHighAccuracy: gpsHighAccuracy, timeout: 10000, maximumAge: 0 }
        );

        if (locationWatchRef.current !== null) {
          navigator.geolocation.clearWatch(locationWatchRef.current);
        }
        locationWatchRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            setGpsEnabled(true);
            setDriverLat(pos.coords.latitude);
            setDriverLng(pos.coords.longitude);
            upsertLocation(pos.coords.latitude, pos.coords.longitude);
          },
          (err) => {
            console.warn("GPS unavailable after foreground:", err.message);
            setGpsEnabled(false);
          },
          { enableHighAccuracy: gpsHighAccuracy, timeout: 15000, maximumAge: gpsMaxAge }
        );
      };
      document.addEventListener("visibilitychange", onForeground);
      foregroundGpsCleanupRef.current = () => document.removeEventListener("visibilitychange", onForeground);
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
      if (foregroundGpsCleanupRef.current) {
        foregroundGpsCleanupRef.current();
        foregroundGpsCleanupRef.current = null;
      }
      stopBackgroundLocation();
    };
  }, [screen, sessionReady, userProfile?.id, selectedVehicleId, handleSessionMismatch, goOfflineNow]);

  // Claim active driver session before takeover checks start
  useEffect(() => {
    if (!userProfile?.id) {
      setSessionReady(false);
      return;
    }

    let cancelled = false;

    const claimSession = async () => {
      setSessionReady(false);

      try {
        const { data: existingLoc } = await supabase
          .from("driver_locations")
          .select("id")
          .eq("driver_id", userProfile.id)
          .maybeSingle();

        if (existingLoc?.id) {
          await supabase
            .from("driver_locations")
            .update({
              session_id: deviceSessionId.current,
              updated_at: new Date().toISOString(),
            })
            .eq("driver_id", userProfile.id);
        }
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    };

    claimSession();

    return () => {
      cancelled = true;
    };
  }, [userProfile?.id]);

  // Realtime session takeover — enforce only while this device is actively driving
  useEffect(() => {
    if (!userProfile?.id || !sessionReady || screen === "offline") return;

    const channel = supabase
      .channel(`driver-session-${userProfile.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "driver_locations",
          filter: `driver_id=eq.${userProfile.id}`,
        },
        (payload: any) => {
          const newSessionId = payload.new?.session_id;
          if (newSessionId && newSessionId !== deviceSessionId.current) {
            // Another device took over — resolve mismatch
            void handleSessionMismatch();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile?.id, sessionReady, screen, handleSessionMismatch]);

  // Fallback takeover check — enforce only while this device is actively driving
  useEffect(() => {
    if (!userProfile?.id || !sessionReady || screen === "offline") return;

    const checkTakeover = async () => {
      const { data: locRow } = await supabase
        .from("driver_locations")
        .select("session_id")
        .eq("driver_id", userProfile.id)
        .single();

      const activeSessionId = (locRow as any)?.session_id;
      if (activeSessionId && activeSessionId !== deviceSessionId.current) {
        await handleSessionMismatch();
      }
    };

    const interval = setInterval(checkTakeover, 60000); // 60s — realtime handles most cases
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        checkTakeover();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    checkTakeover();

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userProfile?.id, sessionReady, screen, handleSessionMismatch]);

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

  // Haversine distance in km
  const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const handleNewTrip = async (trip: TripRequest) => {
    // Block new trips if driver already has an active (non-scheduled) trip
    if (currentTrip) return;

    // Note: Scheduled trips no longer block normal trip acceptance.
    // The driver can accept normal trips and start scheduled rides from the banner.

    // Skip trips that don't match the driver's currently selected vehicle type
    if (trip.vehicle_type_id && activeVehicleTypeIdRef.current && trip.vehicle_type_id !== activeVehicleTypeIdRef.current) {
      console.log(`[VEHICLE TYPE CHECK] Trip ${trip.id} vehicle_type ${trip.vehicle_type_id} does not match active vehicle type ${activeVehicleTypeIdRef.current} — skipping`);
      return;
    }
    // Fallback: if no active vehicle type set, check against all eligible types
    if (trip.vehicle_type_id && !activeVehicleTypeIdRef.current && eligibleVehicleTypeIdsRef.current.size > 0 && !eligibleVehicleTypeIdsRef.current.has(trip.vehicle_type_id)) {
      console.log(`[VEHICLE TYPE CHECK] Trip ${trip.id} vehicle_type ${trip.vehicle_type_id} not in driver's eligible types — skipping`);
      return;
    }

    // Skip trips outside driver's radius (fail-open if no GPS)
    if (lastPosRef.current && trip.pickup_lat && trip.pickup_lng) {
      const dist = haversineKm(lastPosRef.current.lat, lastPosRef.current.lng, Number(trip.pickup_lat), Number(trip.pickup_lng));
      console.log(`[RADIUS CHECK] Driver pos: ${lastPosRef.current.lat.toFixed(4)}, ${lastPosRef.current.lng.toFixed(4)} | Pickup: ${trip.pickup_lat}, ${trip.pickup_lng} | Distance: ${dist.toFixed(2)}km | Radius: ${tripRadiusRef.current}km | ${dist > tripRadiusRef.current ? "❌ BLOCKED" : "✅ ALLOWED"}`);
      if (dist > tripRadiusRef.current) return;
    } else {
      console.log(`[RADIUS CHECK] No GPS or no pickup coords — fail-open, allowing trip through`);
    }

    // Check if driver's vehicle is temporarily blocked
    if (userProfile?.id) {
      const { data: blockedVehicle } = await supabase
        .from("vehicles")
        .select("blocked_until")
        .eq("driver_id", userProfile.id)
        .eq("is_active", true)
        .not("blocked_until", "is", null)
        .limit(1)
        .maybeSingle();
      if (blockedVehicle?.blocked_until && new Date(blockedVehicle.blocked_until as string) > new Date()) {
        console.log(`[BLOCK CHECK] Driver vehicle is blocked until ${blockedVehicle.blocked_until} — skipping trip`);
        return;
      }
    }

    // Verify the trip is still valid before showing it (prevents stale/old trip requests)
    const { data: freshTrip } = await supabase.
    from("trips").
    select("id, status, driver_id, requested_at").
    eq("id", trip.id).
    single();

    if (!freshTrip) return;
    // Skip if trip is no longer requestable or already taken
    if (!(freshTrip.status === "requested" || freshTrip.status === "scheduled")) return;
    if (freshTrip.driver_id) return;
    // Skip if trip is older than 5 minutes
    const tripAge = Date.now() - new Date(freshTrip.requested_at).getTime();
    if (tripAge > 5 * 60 * 1000) return;

    // Vibrate to alert driver
    try { navigator.vibrate?.([300, 100, 300, 100, 300, 100, 300, 100, 300]); } catch {}

    // Play sound
    if (tripRequestSoundUrl) {
      try {
        stopAllSounds();
        tripSoundRef.current = playTrackedSound(tripRequestSoundUrl, true);
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
        stopAllSounds();
        tripSoundRef.current = null;
      }
    }, 1000);
  };

  // Track last seen trip id and declined trips to avoid duplicate handling
  const lastSeenTripRef = useRef<string | null>(null);
  const declinedTripIdsRef = useRef<Set<string>>(new Set());
  const doForegroundTripCheckRef = useRef<(() => void) | null>(null);

  // Load declined trips from DB on mount
  useEffect(() => {
    if (!userProfile?.id) return;
    supabase.from("trip_declines").select("trip_id").eq("driver_id", userProfile.id).
    then(({ data }) => {
      if (data) data.forEach((r: any) => declinedTripIdsRef.current.add(r.trip_id));
    });
  }, [userProfile?.id]);

  // Handle direct-assigned dispatch trips (already accepted)
  const handleDirectAssignedTrip = async (trip: TripRequest) => {
    if (currentTrip) return;
    // Scheduled rides must only be started manually from the scheduled banner
    if (trip.booking_type === "scheduled") return;

    // Skip trips outside driver's radius (fail-open if no GPS)
    if (lastPosRef.current && trip.pickup_lat && trip.pickup_lng) {
      const dist = haversineKm(lastPosRef.current.lat, lastPosRef.current.lng, Number(trip.pickup_lat), Number(trip.pickup_lng));
      console.log(`[RADIUS CHECK - DISPATCH] Distance: ${dist.toFixed(2)}km | Radius: ${tripRadiusRef.current}km | ${dist > tripRadiusRef.current ? "❌ BLOCKED" : "✅ ALLOWED"}`);
      if (dist > tripRadiusRef.current) return;
    }

    // Vibrate to alert driver
    try { navigator.vibrate?.([300, 100, 300, 100, 300, 100, 300, 100, 300]); } catch {}

    // Play sound to alert driver
    if (tripRequestSoundUrl) {
      try {
        stopAllSounds();
        tripSoundRef.current = playTrackedSound(tripRequestSoundUrl, true);
      } catch {}
    }

    // Fetch passenger profile and trip stops
    const [pProfileRes, stopsRes] = await Promise.all([
      trip.passenger_id
        ? supabase.from("profiles").select("first_name, last_name, phone_number, avatar_url, country_code").eq("id", trip.passenger_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("trip_stops").select("id, stop_order, address, lat, lng, completed_at").eq("trip_id", trip.id).order("stop_order"),
    ]);

    toast({
      title: "🚗 New Dispatch Assignment!",
      description: `${trip.pickup_address} → ${trip.dropoff_address}`,
    });

    setCurrentTrip(trip);
    setPassengerProfile(pProfileRes.data);
    setTripStops(stopsRes.data as any[] || []);
    setScreen("ride-request");

    // Auto-stop sound after 5 seconds for assigned trips
    setTimeout(() => {
      stopAllSounds();
      tripSoundRef.current = null;
    }, 5000);
  };

  useEffect(() => {
    if (screen !== "online" || !userProfile?.id) return;
    let isActive = true;

    // Primary: Realtime subscription for new trips (requested AND scheduled)
    const channel = supabase.
    channel("driver-trip-requests").
    on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "trips"
    }, async (payload) => {
      const trip = payload.new as any;
      // Handle broadcast trips (requested + scheduled)
      if (trip.status === "requested" || trip.status === "scheduled") {
        if (trip.id !== lastSeenTripRef.current && !declinedTripIdsRef.current.has(trip.id)) {
          if (trip.target_driver_id && trip.target_driver_id !== userProfile.id) return;
          lastSeenTripRef.current = trip.id;
          handleNewTrip(trip);
        }
      }
      // Handle direct-assigned dispatch trips (inserted as "accepted" with driver_id)
      if (trip.status === "accepted" && trip.driver_id === userProfile.id && trip.booking_type !== "scheduled") {
        if (trip.id !== lastSeenTripRef.current) {
          lastSeenTripRef.current = trip.id;
          handleDirectAssignedTrip(trip);
        }
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

    // Fallback: Poll every 30s for new requested/scheduled trips AND direct-assigned trips
    // Realtime handles most cases — this is just a safety net
    const pollInterval = setInterval(async () => {
      if (!isActive || screen !== "online") return;
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      // Poll for broadcast trips
      const { data } = await supabase.
      from("trips").
      select("*").
      in("status", ["requested", "scheduled"]).
      is("driver_id", null).
      gte("requested_at", fiveMinAgo).
      order("requested_at", { ascending: false }).
      limit(1);

      if (data && data.length > 0) {
        const trip = data[0] as any;
        if (trip.target_driver_id && trip.target_driver_id !== userProfile.id) return;
        if (trip.id !== lastSeenTripRef.current && !declinedTripIdsRef.current.has(trip.id)) {
          lastSeenTripRef.current = trip.id;
          handleNewTrip(trip);
        }
      }

      // Poll for direct-assigned dispatch trips (exclude scheduled trips)
      const { data: assignedTrips } = await supabase.
      from("trips").
      select("*").
      eq("status", "accepted").
      eq("driver_id", userProfile.id).
      neq("booking_type", "scheduled").
      gte("created_at", fiveMinAgo).
      order("created_at", { ascending: false }).
      limit(1);

      if (assignedTrips && assignedTrips.length > 0) {
        const trip = assignedTrips[0] as any;
        if (trip.id !== lastSeenTripRef.current && !declinedTripIdsRef.current.has(trip.id)) {
          lastSeenTripRef.current = trip.id;
          handleDirectAssignedTrip(trip);
        }
      }
    }, 30000);

    // Immediately check for pending trips when app becomes visible (e.g. after push notification tap)
    const doForegroundTripCheck = async () => {
      if (!isActive) return;
      // Skip check if already showing a trip (use ref for latest value inside closure)
      if (screenRef.current !== "online" && screenRef.current !== "offline") return;
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      // Check broadcast trips (no driver assigned yet)
      const { data } = await supabase
        .from("trips")
        .select("*")
        .in("status", ["requested", "scheduled"])
        .is("driver_id", null)
        .gte("requested_at", fiveMinAgo)
        .order("requested_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const trip = data[0] as any;
        if (!(trip.target_driver_id && trip.target_driver_id !== userProfile.id)) {
          if (!declinedTripIdsRef.current.has(trip.id)) {
            lastSeenTripRef.current = trip.id;
            handleNewTrip(trip);
            return;
          }
        }
      }

      // Check targeted trips (target_driver_id matches this driver, still requested)
      const { data: targetedTrips } = await supabase
        .from("trips")
        .select("*")
        .in("status", ["requested", "scheduled"])
        .eq("target_driver_id", userProfile.id)
        .gte("requested_at", fiveMinAgo)
        .order("requested_at", { ascending: false })
        .limit(1);

      if (targetedTrips && targetedTrips.length > 0) {
        const trip = targetedTrips[0] as any;
        if (!declinedTripIdsRef.current.has(trip.id)) {
          lastSeenTripRef.current = trip.id;
          handleNewTrip(trip);
          return;
        }
      }

      // Check direct-assigned trips
      const { data: assignedTrips } = await supabase
        .from("trips")
        .select("*")
        .eq("status", "accepted")
        .eq("driver_id", userProfile.id)
        .neq("booking_type", "scheduled")
        .gte("created_at", fiveMinAgo)
        .order("created_at", { ascending: false })
        .limit(1);

      if (assignedTrips && assignedTrips.length > 0) {
        const trip = assignedTrips[0] as any;
        if (!declinedTripIdsRef.current.has(trip.id)) {
          lastSeenTripRef.current = trip.id;
          handleDirectAssignedTrip(trip);
        }
      }
    };
    // Expose for native notification tap / SW focus message
    doForegroundTripCheckRef.current = doForegroundTripCheck;

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      // Fire immediately + multiple retries to handle WebView resume lag on native
      doForegroundTripCheck();
      setTimeout(doForegroundTripCheck, 500);
      setTimeout(doForegroundTripCheck, 1500);
      setTimeout(doForegroundTripCheck, 3000);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isActive = false;
      doForegroundTripCheckRef.current = null;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      supabase.removeChannel(targetChannel);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [screen, userProfile?.id, tripRequestSoundUrl]);

  // Native: trigger immediate trip check when driver taps push notification
  // PWA: listen for SW TRIP_REQUEST_FOCUS message to trigger immediate trip check
  useEffect(() => {
    if (!userProfile?.id) return;

    const triggerCheck = () => {
      doForegroundTripCheckRef.current?.();
      // Retry after delays to handle WebView resume lag
      setTimeout(() => doForegroundTripCheckRef.current?.(), 300);
      setTimeout(() => doForegroundTripCheckRef.current?.(), 1000);
      setTimeout(() => doForegroundTripCheckRef.current?.(), 2500);
    };

    // Native Capacitor: listen for notification tap
    let nativeCleanup: (() => void) | null = null;
    const setupNativeListener = async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const listener = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
          console.log("Native notification tapped:", action);
          triggerCheck();
        });
        nativeCleanup = () => listener.remove();
      } catch {}
    };
    setupNativeListener();

    // PWA: listen for SW TRIP_REQUEST_FOCUS message
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "TRIP_REQUEST_FOCUS") {
        console.log("SW TRIP_REQUEST_FOCUS received");
        triggerCheck();
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSwMessage);
    }

    return () => {
      nativeCleanup?.();
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage);
      }
    };
  }, [userProfile?.id]);

  // Poll for vehicle block status
  useEffect(() => {
    if (screen !== "online" || !userProfile?.id) {
      setVehicleBlockedUntil(null);
      setBlockCountdown("");
      return;
    }

    const checkBlockStatus = async () => {
      const vehicleId = selectedVehicleId || (driverVehicles[0]?.id);
      if (!vehicleId) return;
      const { data } = await supabase
        .from("vehicles")
        .select("blocked_until")
        .eq("id", vehicleId)
        .single();
      if (data?.blocked_until && new Date(data.blocked_until) > new Date()) {
        setVehicleBlockedUntil(new Date(data.blocked_until));
      } else {
        setVehicleBlockedUntil(null);
      }
    };

    checkBlockStatus();
    const poll = setInterval(checkBlockStatus, 60000); // Check every 60s
    return () => clearInterval(poll);
  }, [screen, userProfile?.id, selectedVehicleId, driverVehicles]);

  // Countdown timer for blocked vehicle
  useEffect(() => {
    if (!vehicleBlockedUntil) {
      setBlockCountdown("");
      return;
    }
    const tick = () => {
      const remaining = vehicleBlockedUntil.getTime() - Date.now();
      if (remaining <= 0) {
        setVehicleBlockedUntil(null);
        setBlockCountdown("");
        return;
      }
      const hrs = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setBlockCountdown(`${hrs}h ${mins}m ${secs}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [vehicleBlockedUntil]);

  // Poll for upcoming scheduled trips to show reminder banner
  useEffect(() => {
    if (screen !== "online" || !userProfile?.id) {
      setUpcomingScheduledTrip(null);
      return;
    }
    const checkScheduled = async () => {
      const { data } = await supabase
        .from("trips")
        .select("id, scheduled_at, pickup_address, dropoff_address")
        .eq("driver_id", userProfile.id)
        .eq("status", "accepted")
        .eq("booking_type", "scheduled")
        .order("scheduled_at", { ascending: true })
        .limit(1);
      if (data && data.length > 0) {
        setUpcomingScheduledTrip(data[0] as any);
      } else {
        setUpcomingScheduledTrip(null);
      }
    };
    checkScheduled();
    const interval = setInterval(checkScheduled, 60000); // 60s — scheduled trips don't change often
    return () => clearInterval(interval);
  }, [screen, userProfile?.id]);


  const handleTripCancelledOrTaken = useCallback(async (updated: any) => {
    // Trip accepted by ANOTHER driver while we're on ride-request screen
    if (updated.status === "accepted" && updated.driver_id !== userProfile?.id) {
      stopAllSounds(); tripSoundRef.current = null;
      if (rideRequestTimerRef.current) { clearInterval(rideRequestTimerRef.current); rideRequestTimerRef.current = null; }
      toast({ title: "Trip Taken", description: "This trip was accepted by another driver.", variant: "destructive" });
      setScreen("online");
      setCurrentTrip(null);
      setPassengerProfile(null);
      return true;
    }

    // Trip cancelled by passenger (or auto-expired)
    if (updated.status === "cancelled") {
      stopAllSounds(); tripSoundRef.current = null;
      if (rideRequestTimerRef.current) { clearInterval(rideRequestTimerRef.current); rideRequestTimerRef.current = null; }
      // Fetch cancel sound from notification_sounds table
      const { data: cancelSound } = await supabase.from("notification_sounds").select("file_url").eq("category", "driver_trip_cancelled").eq("is_default", true).eq("is_active", true).single();
      if (cancelSound?.file_url) playSound(cancelSound.file_url);
      const cancelledByDriver = updated.cancel_reason?.includes("driver");
      if (!cancelledByDriver) {
        setCancelledTripReason(updated.cancel_reason || "The passenger cancelled this trip.");
        setShowCancelledByPassengerPopup(true);
      }
      await supabase.from("driver_locations").update({ is_on_trip: false, session_id: deviceSessionId.current } as any).eq("driver_id", userProfile?.id);
      setScreen("online");
      setCurrentTrip(null);
      setPassengerProfile(null);
      setDriverTripPhase("heading_to_pickup");
      return true;
    }
    return false;
  }, [userProfile?.id]);

  // Monitor active trip for cancellation or acceptance by another driver
  useEffect(() => {
    if (!currentTrip?.id || (screen !== "navigating" && screen !== "ride-request")) return;

    // Realtime subscription
    const channel = supabase.
    channel(`driver-trip-monitor-${currentTrip.id}`).
    on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "trips",
      filter: `id=eq.${currentTrip.id}`
    }, async (payload) => {
      await handleTripCancelledOrTaken(payload.new as any);
    }).
    subscribe();

    // Polling fallback every 30s in case realtime misses the event
    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from("trips").select("status, driver_id, cancel_reason").eq("id", currentTrip.id).single();
      if (data) {
        await handleTripCancelledOrTaken(data);
      }
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [currentTrip?.id, screen, userProfile?.id, handleTripCancelledOrTaken]);

  // Sync showDriverChat ref
  useEffect(() => {showDriverChatRef.current = showDriverChat;if (showDriverChat) setUnreadDriverMessages(0);}, [showDriverChat]);

  // Background message listener — play sound + count unread when chat is closed
  useEffect(() => {
    if (!currentTrip?.id) return;
    let messageSoundUrl: string | null = null;
    // Fetch from notification_sounds table
    supabase.from("notification_sounds").select("file_url").eq("category", "driver_message_received").eq("is_default", true).eq("is_active", true).single().then(({ data }) => {
      if (data?.file_url) messageSoundUrl = data.file_url;
    });

    const channel = supabase.
    channel(`driver-bg-chat-${currentTrip.id}`).
    on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "trip_messages",
      filter: `trip_id=eq.${currentTrip.id}`
    }, (payload) => {
      const msg = payload.new as any;
      if (msg.sender_type === "driver") return; // own message
      // Increment unread if chat is closed
      if (!showDriverChatRef.current) {
        setUnreadDriverMessages((prev) => prev + 1);
        // Play sound
        if (messageSoundUrl) {
          playSound(messageSoundUrl);
        } else {
          playFallbackBeep();
        }
        // Vibrate
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    }).
    subscribe();

    return () => {supabase.removeChannel(channel);};
  }, [currentTrip?.id]);

  // Track passenger live location before trip starts
  useEffect(() => {
    if (!currentTrip?.id) {setPassengerLiveLocation(null);return;}
    if (driverTripPhase === "in_progress") {setPassengerLiveLocation(null);return;}

    // Initial fetch
    supabase.from("trips").select("passenger_lat, passenger_lng").eq("id", currentTrip.id).single().then(({ data }) => {
      if (data?.passenger_lat && data?.passenger_lng) {
        setPassengerLiveLocation({ lat: Number(data.passenger_lat), lng: Number(data.passenger_lng) });
      }
    });

    // Subscribe to updates
    const channel = supabase.
    channel(`passenger-loc-${currentTrip.id}`).
    on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "trips",
      filter: `id=eq.${currentTrip.id}`
    }, (payload) => {
      const t = payload.new as any;
      if (t.passenger_lat && t.passenger_lng) {
        setPassengerLiveLocation({ lat: Number(t.passenger_lat), lng: Number(t.passenger_lng) });
      }
    }).
    subscribe();

    return () => {supabase.removeChannel(channel);};
  }, [currentTrip?.id, driverTripPhase]);

  // Fetch available banks from admin-configured banks table
  useEffect(() => {
    supabase.from("banks").select("id, name, logo_url").eq("is_active", true).order("name").then(({ data }) => {
      if (data) setAvailableBanks(data);
    });
    supabase.from("vehicle_types").select("id, name, icon, image_url, map_icon_url, monthly_fee").eq("is_active", true).order("sort_order").then(({ data }) => {
      if (data) setVehicleTypes(data);
    });
    supabase.from("system_settings").select("value").eq("key", "passenger_map_icon_url").single().then(({ data }) => {
      if (data?.value && typeof data.value === "string") setPassengerMapIconUrl(data.value);
    });
  }, []);

  // Driver accepted elapsed timer (resumes from current trip data or persisted storage on refresh)
  useEffect(() => {
    if (!currentTrip?.id || driverTripPhase !== "heading_to_pickup") { setDriverPhaseElapsed(0); return; }
    let timer: ReturnType<typeof setInterval>;
    const startTimer = (timestamp: string) => {
      const t = new Date(timestamp).getTime();
      const calc = () => Math.max(0, Math.floor((Date.now() - t) / 1000));
      setDriverPhaseElapsed(calc());
      if (timer) clearInterval(timer);
      timer = setInterval(() => setDriverPhaseElapsed(calc()), 1000);
    };
    const fallbackAcceptedAt = currentTrip.accepted_at || getStoredTripTimer(currentTrip.id, "accepted_at");
    if (fallbackAcceptedAt) startTimer(fallbackAcceptedAt);
    const init = async () => {
      const { data } = await supabase.from("trips").select("accepted_at").eq("id", currentTrip.id).single();
      if (data?.accepted_at) {
        setStoredTripTimer(currentTrip.id, "accepted_at", data.accepted_at);
        startTimer(data.accepted_at);
      } else if (!fallbackAcceptedAt) {
        timer = setInterval(() => setDriverPhaseElapsed(p => p + 1), 1000);
      }
    };
    init();
    return () => { if (timer) clearInterval(timer); };
  }, [currentTrip?.id, currentTrip?.accepted_at, driverTripPhase]);

  // Driver arrived waiting timer (resumes from current trip data or persisted storage on refresh)
  useEffect(() => {
    if (!currentTrip?.id || driverTripPhase !== "arrived") { setDriverArrivedElapsed(0); return; }
    let timer: ReturnType<typeof setInterval>;
    const startTimer = (timestamp: string) => {
      const t = new Date(timestamp).getTime();
      const calc = () => Math.max(0, Math.floor((Date.now() - t) / 1000));
      setDriverArrivedElapsed(calc());
      if (timer) clearInterval(timer);
      timer = setInterval(() => setDriverArrivedElapsed(calc()), 1000);
    };
    const fallbackArrivedAt = currentTrip.arrived_at || getStoredTripTimer(currentTrip.id, "arrived_at");
    if (fallbackArrivedAt) startTimer(fallbackArrivedAt);
    const init = async () => {
      const { data } = await supabase.from("trips").select("arrived_at").eq("id", currentTrip.id).single();
      if ((data as any)?.arrived_at) {
        setStoredTripTimer(currentTrip.id, "arrived_at", (data as any).arrived_at);
        startTimer((data as any).arrived_at);
      } else if (!fallbackArrivedAt) {
        timer = setInterval(() => setDriverArrivedElapsed(p => p + 1), 1000);
      }
    };
    init();
    return () => { if (timer) clearInterval(timer); };
  }, [currentTrip?.id, currentTrip?.arrived_at, driverTripPhase]);

  // Driver trip elapsed timer (resumes from current trip data or persisted storage on refresh)
  useEffect(() => {
    if (!currentTrip?.id || driverTripPhase !== "in_progress") { setDriverTripElapsed(0); return; }
    let timer: ReturnType<typeof setInterval>;
    const startTimer = (timestamp: string) => {
      const t = new Date(timestamp).getTime();
      const calc = () => Math.max(0, Math.floor((Date.now() - t) / 1000));
      setDriverTripElapsed(calc());
      if (timer) clearInterval(timer);
      timer = setInterval(() => setDriverTripElapsed(calc()), 1000);
    };
    const fallbackStartedAt = currentTrip.started_at || getStoredTripTimer(currentTrip.id, "started_at");
    if (fallbackStartedAt) startTimer(fallbackStartedAt);
    const init = async () => {
      const { data } = await supabase.from("trips").select("started_at").eq("id", currentTrip.id).single();
      if (data?.started_at) {
        setStoredTripTimer(currentTrip.id, "started_at", data.started_at);
        startTimer(data.started_at);
      } else if (!fallbackStartedAt) {
        timer = setInterval(() => setDriverTripElapsed(p => p + 1), 1000);
      }
    };
    init();
    return () => { if (timer) clearInterval(timer); };
  }, [currentTrip?.id, currentTrip?.started_at, driverTripPhase]);

  // Lightweight stats-only refresh (called periodically + after trip completion)
  const refreshDriverStats = useCallback(async () => {
    if (!userProfile?.id) return;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [tripsRes, declinesRes, ratedRes] = await Promise.all([
      supabase.from("trips").select("actual_fare, estimated_fare, duration_minutes, accepted_at, completed_at, status").eq("driver_id", userProfile.id).gte("created_at", todayStart.toISOString()),
      supabase.from("trip_declines").select("id").eq("driver_id", userProfile.id).gte("declined_at", todayStart.toISOString()),
      supabase.from("trips").select("rating").eq("driver_id", userProfile.id).eq("status", "completed").not("rating", "is", null),
    ]);
    const trips = tripsRes.data;
    const declinedToday = declinesRes.data?.length || 0;
    const totalRatings = ratedRes.data?.length || 0;
    const avgRating = totalRatings > 0 ? ratedRes.data!.reduce((sum, t) => sum + Number(t.rating), 0) / totalRatings : 0;
    if (trips) {
      const completedTrips = trips.filter((t: any) => t.status === "completed");
      const totalEarnings = completedTrips.reduce((sum: number, t: any) => sum + (Number(t.actual_fare) || Number(t.estimated_fare) || 0), 0);
      const totalMinutes = completedTrips.reduce((sum: number, t: any) => {
        if (Number(t.duration_minutes) > 0) return sum + Number(t.duration_minutes);
        // Fallback: calculate from accepted_at to completed_at
        if (t.accepted_at && t.completed_at) {
          return sum + (new Date(t.completed_at).getTime() - new Date(t.accepted_at).getTime()) / 60000;
        }
        return sum;
      }, 0);
      const h = Math.floor(totalMinutes / 60);
      const m = Math.round(totalMinutes % 60);
      setDriverStats({
        rides: completedTrips.length,
        earnings: totalEarnings,
        hours: h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, "0") : ""}` : `${m}m`,
        avgRating: Math.round(avgRating * 10) / 10,
        totalRatings,
        declinedToday,
      });
    }
  }, [userProfile?.id]);

  useEffect(() => {
    const load = async () => {
      const { data: settingData } = await supabase.from("system_settings").select("value").eq("key", "default_trip_radius_km").single();
      const defaultRadius = settingData?.value ? Number(settingData.value) : 10;

      if (userProfile?.id) {
        const { data } = await supabase.from("profiles").select("trip_radius_km, avatar_url, id_card_front_url, id_card_back_url, license_front_url, license_back_url, taxi_permit_front_url, taxi_permit_back_url, status, rejection_reason").eq("id", userProfile.id).single();
        // Use admin default if driver hasn't customized (still at DB default of 10)
        const dbDefault = 10;
        const driverRadius = data?.trip_radius_km;
        const radius = (driverRadius === dbDefault || driverRadius == null) ? defaultRadius : driverRadius;
        setTripRadius(radius);
        tripRadiusRef.current = radius;
        setAvatarUrl(data?.avatar_url || null);
        setIdCardFrontUrl(data?.id_card_front_url || null);
        setIdCardBackUrl(data?.id_card_back_url || null);
        setLicenseFrontUrl(data?.license_front_url || null);
        setLicenseBackUrl(data?.license_back_url || null);
        setTaxiPermitFrontUrl((data as any)?.taxi_permit_front_url || null);
        setTaxiPermitBackUrl((data as any)?.taxi_permit_back_url || null);
        setProfileStatus(data?.status || "Pending");
        setProfileRejectionReason((data as any)?.rejection_reason || "");
        // Check if driver is on billing hold
        if (data?.status === "Billing_hold") {
          setBillingHold(true);
          setScreen("offline");
          // Auto-show payment popup so driver sees it immediately
          setShowBillingPayPopup(true);
          setBillingSlipUrl(null);
        } else {
          setBillingHold(false);
        }

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

        // Fetch Favara accounts
        const { data: favaras } = await supabase.from("driver_favara_accounts").select("*").eq("driver_id", userProfile.id).eq("is_active", true).order("is_primary", { ascending: false });
        setFavaraAccounts((favaras || []) as any);

        // Fetch Favara logo
        const { data: favaraLogoSetting } = await supabase.from("system_settings").select("value").eq("key", "favara_logo_url").maybeSingle();
        if (favaraLogoSetting?.value && typeof favaraLogoSetting.value === "string") setFavaraLogoUrl(favaraLogoSetting.value);

        // Fetch Swipe accounts
        const { data: swipes } = await supabase.from("driver_swipe_accounts").select("*").eq("driver_id", userProfile.id).eq("is_active", true).order("is_primary", { ascending: false });
        setSwipeAccounts((swipes || []) as any);

        // Fetch Swipe logo
        const { data: swipeLogoSetting } = await supabase.from("system_settings").select("value").eq("key", "swipe_logo_url").maybeSingle();
        if (swipeLogoSetting?.value && typeof swipeLogoSetting.value === "string") setSwipeLogoUrl(swipeLogoSetting.value);

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

        // Fetch driver wallet
        const { data: walletData } = await supabase.from("wallets").select("id, balance").eq("user_id", userProfile.id).maybeSingle();
        if (walletData) {
          setDriverWalletBalance(Number(walletData.balance));
          setDriverWalletId(walletData.id);
          // Fetch pending withdrawals
          const { data: withdrawals } = await supabase.from("wallet_withdrawals").select("*").eq("user_id", userProfile.id).order("created_at", { ascending: false }).limit(10);
          setPendingWithdrawals(withdrawals || []);
        } else {
          // Create wallet if none exists
          const { data: newWallet } = await supabase.from("wallets").insert({ user_id: userProfile.id, balance: 0 } as any).select().single();
          if (newWallet) {setDriverWalletId(newWallet.id);}
        }

        // Fetch min withdrawal amount
        const { data: minWdSetting } = await supabase.from("system_settings").select("value").eq("key", "min_withdrawal_amount").maybeSingle();
        if (minWdSetting?.value) setMinWithdrawalAmount(Number(minWdSetting.value) || 100);

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
          const completedTrips = trips.filter((t: any) => t.status === "completed");
          const totalEarnings = completedTrips.reduce((sum: number, t: any) => sum + (Number(t.actual_fare) || Number(t.estimated_fare) || 0), 0);
          const totalMinutes = completedTrips.reduce((sum: number, t: any) => {
            if (Number(t.duration_minutes) > 0) return sum + Number(t.duration_minutes);
            if (t.accepted_at && t.completed_at) {
              return sum + (new Date(t.completed_at).getTime() - new Date(t.accepted_at).getTime()) / 60000;
            }
            return sum;
          }, 0);
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
        tripRadiusRef.current = defaultRadius;
      }
    };
    load();
    // Refresh stats every 60s while driver is active
    const statsInterval = setInterval(() => { refreshDriverStats(); }, 60000);
    return () => clearInterval(statsInterval);
  }, [userProfile?.id]);

  const updateRadius = async (val: number) => {
    setTripRadius(val);
    tripRadiusRef.current = val;
    if (userProfile?.id) {
      await supabase.from("profiles").update({ trip_radius_km: val }).eq("id", userProfile.id);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    if (!rawFile || !userProfile?.id) return;

    setUploading(uploadTarget);
    const file = await compressImage(rawFile);
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

    // Vehicle document uploads (target format: vehicle_registration_VEHICLEID)
    const vehicleDocPrefixes = ["vehicle_registration_", "vehicle_insurance_", "vehicle_image_"];
    const matchedPrefix = vehicleDocPrefixes.find((p) => uploadTarget.startsWith(p));
    if (matchedPrefix) {
      const vehicleId = uploadTarget.slice(matchedPrefix.length);
      const vehicleField = matchedPrefix === "vehicle_registration_" ? "registration_url" : matchedPrefix === "vehicle_insurance_" ? "insurance_url" : "image_url";
      await supabase.from("vehicles").update({ [vehicleField]: publicUrl } as any).eq("id", vehicleId);
      setDriverVehicles((prev) => prev.map((v) => v.id === vehicleId ? { ...v, [vehicleField]: publicUrl } : v));
      setUploading(null);
      e.target.value = "";
      toast({ title: "Uploaded!", description: "Vehicle document uploaded. Tap submit after all 3 files." });
      return;
    }

    await supabase.from("profiles").update(updateField).eq("id", userProfile.id);

    if (uploadTarget === "avatar") setAvatarUrl(publicUrl);else
    if (uploadTarget === "id_front") setIdCardFrontUrl(publicUrl);else
    if (uploadTarget === "id_back") setIdCardBackUrl(publicUrl);else
    if (uploadTarget === "license_front") setLicenseFrontUrl(publicUrl);else
    if (uploadTarget === "license_back") setLicenseBackUrl(publicUrl);else
    if (uploadTarget === "taxi_permit_front") setTaxiPermitFrontUrl(publicUrl);else
    if (uploadTarget === "taxi_permit_back") setTaxiPermitBackUrl(publicUrl);

    if (uploadTarget !== "avatar") {
      toast({ title: "Uploaded!", description: "Document uploaded. Tap submit after all profile docs." });
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

  const submitProfileDocuments = async () => {
    if (!userProfile?.id) return;
    if (!idCardFrontUrl || !idCardBackUrl || !licenseFrontUrl || !licenseBackUrl) {
      toast({
        title: "Missing documents",
        description: "Please upload ID and license front/back before submitting.",
        variant: "destructive",
      });
      return;
    }

    setSubmittingProfileDocs(true);
    try {
      const wasRejected = profileStatus === "Rejected";

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ status: "Pending Review", rejection_reason: null } as any)
        .eq("id", userProfile.id);

      if (updateError) throw updateError;

      setProfileStatus("Pending Review");
      setProfileRejectionReason("");

      await supabase.functions.invoke("notify-vehicle-update", {
        body: {
          driver_name: `${userProfile.first_name} ${userProfile.last_name}`.trim(),
          phone_number: userProfile.phone_number,
          plate_number: "",
          update_type: wasRejected ? "🔄 RESUBMISSION — Profile documents submitted" : "Profile documents submitted",
        },
      });

      toast({ title: "Submitted", description: "Profile documents sent for admin review." });
    } catch (err: any) {
      toast({
        title: "Submit failed",
        description: err?.message || "Could not submit profile documents.",
        variant: "destructive",
      });
    } finally {
      setSubmittingProfileDocs(false);
    }
  };

  const submitVehicleDocuments = async (vehicle: any) => {
    if (!userProfile?.id || !vehicle?.id) return;
    if (!vehicle.registration_url || !vehicle.insurance_url || !vehicle.image_url) {
      toast({
        title: "Missing documents",
        description: "Please upload registration, insurance, and vehicle photo before submitting.",
        variant: "destructive",
      });
      return;
    }

    setSubmittingVehicleDocsById((prev) => ({ ...prev, [vehicle.id]: true }));
    try {
      const wasRejected = vehicle.vehicle_status === "rejected";

      const { error: updateError } = await supabase
        .from("vehicles")
        .update({ vehicle_status: "pending", rejection_reason: null } as any)
        .eq("id", vehicle.id);

      if (updateError) throw updateError;

      setDriverVehicles((prev) =>
        prev.map((v) => (v.id === vehicle.id ? { ...v, vehicle_status: "pending", rejection_reason: null } : v))
      );

      await supabase.functions.invoke("notify-vehicle-update", {
        body: {
          driver_name: `${userProfile.first_name} ${userProfile.last_name}`.trim(),
          phone_number: userProfile.phone_number,
          plate_number: vehicle.plate_number || "",
          update_type: wasRejected ? "🔄 RESUBMISSION — Vehicle documents submitted" : "Vehicle documents submitted",
        },
      });

      toast({ title: "Submitted", description: "Vehicle documents sent for admin review." });
    } catch (err: any) {
      toast({
        title: "Submit failed",
        description: err?.message || "Could not submit vehicle documents.",
        variant: "destructive",
      });
    } finally {
      setSubmittingVehicleDocsById((prev) => {
        const next = { ...prev };
        delete next[vehicle.id];
        return next;
      });
    }
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

  // Favara account CRUD
  const addFavaraAccount = async () => {
    if (!userProfile?.id || !newFavara.favara_id) return;
    const isPrimary = favaraAccounts.length === 0;
    const { data, error } = await supabase.from("driver_favara_accounts").insert({
      driver_id: userProfile.id,
      favara_id: newFavara.favara_id,
      favara_name: newFavara.favara_name,
      is_primary: isPrimary
    } as any).select().single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setFavaraAccounts([...favaraAccounts, data as any]);
    setNewFavara({ favara_id: "", favara_name: "" });
    setShowAddFavara(false);
    toast({ title: "Favara account added" });
  };

  const deleteFavaraAccount = async (id: string) => {
    await supabase.from("driver_favara_accounts").update({ is_active: false } as any).eq("id", id);
    setFavaraAccounts(favaraAccounts.filter((f) => f.id !== id));
    toast({ title: "Favara account removed" });
  };

  const setPrimaryFavara = async (id: string) => {
    if (!userProfile?.id) return;
    await supabase.from("driver_favara_accounts").update({ is_primary: false } as any).eq("driver_id", userProfile.id);
    await supabase.from("driver_favara_accounts").update({ is_primary: true } as any).eq("id", id);
    setFavaraAccounts(favaraAccounts.map((f) => ({ ...f, is_primary: f.id === id })));
  };

  // Swipe account CRUD
  const addSwipeAccount = async () => {
    if (!userProfile?.id || !newSwipe.swipe_username) return;
    const isPrimary = swipeAccounts.length === 0;
    const { data, error } = await supabase.from("driver_swipe_accounts").insert({
      driver_id: userProfile.id,
      swipe_username: newSwipe.swipe_username,
      swipe_name: newSwipe.swipe_name,
      is_primary: isPrimary
    } as any).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setSwipeAccounts([...swipeAccounts, data as any]);
    setNewSwipe({ swipe_username: "", swipe_name: "" });
    setShowAddSwipe(false);
    toast({ title: "Swipe account added" });
  };

  const deleteSwipeAccount = async (id: string) => {
    await supabase.from("driver_swipe_accounts").update({ is_active: false } as any).eq("id", id);
    setSwipeAccounts(swipeAccounts.filter((s) => s.id !== id));
    toast({ title: "Swipe account removed" });
  };

  const setPrimarySwipe = async (id: string) => {
    if (!userProfile?.id) return;
    await supabase.from("driver_swipe_accounts").update({ is_primary: false } as any).eq("driver_id", userProfile.id);
    await supabase.from("driver_swipe_accounts").update({ is_primary: true } as any).eq("id", id);
    setSwipeAccounts(swipeAccounts.map((s) => ({ ...s, is_primary: s.id === id })));
  };

  const addVehicle = async () => {
    if (!userProfile?.id || !newVehicle.plate_number || !newVehicle.vehicle_type_id) return;
    // Check for duplicate plate number
    const normalizedPlate = newVehicle.plate_number.trim().toUpperCase();
    const { data: existing } = await supabase.from("vehicles").select("id").eq("plate_number", normalizedPlate).maybeSingle();
    if (existing) {
      toast({ title: "Duplicate plate number", description: `Vehicle ${normalizedPlate} is already registered.`, variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.from("vehicles").insert({
      driver_id: userProfile.id,
      plate_number: normalizedPlate,
      make: newVehicle.make,
      model: newVehicle.model,
      color: newVehicle.color,
      vehicle_type_id: newVehicle.vehicle_type_id,
      vehicle_status: "pending"
    } as any).select().single();
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
    // Auto-add the vehicle's primary type as a ride type for this vehicle
    if (data.id && newVehicle.vehicle_type_id) {
      await supabase.from("driver_vehicle_types").insert({
        driver_id: userProfile.id,
        vehicle_type_id: newVehicle.vehicle_type_id,
        vehicle_id: data.id,
        status: "pending",
      } as any);
    }
    // Flag for admin review
    await supabase.from("profiles").update({ status: "Pending Review" }).eq("id", userProfile.id);
    setProfileStatus("Pending Review");
    // Notify admin
    try {
      await supabase.functions.invoke("notify-vehicle-update", {
        body: {
          driver_name: `${userProfile.first_name} ${userProfile.last_name}`.trim(),
          phone_number: userProfile.phone_number,
          plate_number: newVehicle.plate_number,
          update_type: "New vehicle added",
        },
      });
    } catch {} // Non-blocking
    toast({ title: "Vehicle added", description: "Pending admin approval" });
  };

  const startEditVehicle = (v: any) => {
    setEditingVehicleId(v.id);
    setEditVehicle({ plate_number: v.plate_number || "", make: v.make || "", model: v.model || "", color: v.color || "", vehicle_type_id: v.vehicle_type_id || "" });
  };

  const saveEditVehicle = async () => {
    if (!editingVehicleId || !editVehicle.plate_number || !editVehicle.vehicle_type_id) return;
    const normalizedPlate = editVehicle.plate_number.trim().toUpperCase();
    const { data: existingPlate } = await supabase.from("vehicles").select("id").eq("plate_number", normalizedPlate).maybeSingle();
    if (existingPlate && existingPlate.id !== editingVehicleId) {
      toast({ title: "Duplicate plate number", description: `Vehicle ${normalizedPlate} is already registered.`, variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("vehicles").update({
      plate_number: normalizedPlate,
      make: editVehicle.make,
      model: editVehicle.model,
      color: editVehicle.color,
      vehicle_type_id: editVehicle.vehicle_type_id,
      vehicle_status: "pending"
    } as any).eq("id", editingVehicleId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setDriverVehicles((prev) => prev.map((v) => v.id === editingVehicleId ? { ...v, ...editVehicle, vehicle_status: "pending" } : v));
    if (selectedVehicleId === editingVehicleId) {
      setVehicleInfo({ make: editVehicle.make, model: editVehicle.model, plate_number: editVehicle.plate_number, color: editVehicle.color, vehicle_type_id: editVehicle.vehicle_type_id });
    }
    setEditingVehicleId(null);
    // Notify admin
    try {
      await supabase.functions.invoke("notify-vehicle-update", {
        body: {
          driver_name: `${userProfile?.first_name} ${userProfile?.last_name}`.trim(),
          phone_number: userProfile?.phone_number,
          plate_number: editVehicle.plate_number,
          update_type: "Vehicle info updated",
        },
      });
    } catch {} // Non-blocking
    toast({ title: "Vehicle updated", description: "Pending admin approval before use" });
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

  const selectVehicle = async (v: any) => {
    setSelectedVehicleId(v.id);
    try {localStorage.setItem("hda_last_vehicle_id", v.id);} catch {}
    setVehicleInfo({ make: v.make || "", model: v.model || "", plate_number: v.plate_number, color: v.color || "", vehicle_type_id: v.vehicle_type_id || "" });
    activeVehicleTypeIdRef.current = v.vehicle_type_id || null;
    // Update driver_locations so the backend also reflects the current vehicle
    if (screen === "online" && userProfile?.id) {
      await supabase.from("driver_locations").update({
        vehicle_id: v.id,
        vehicle_type_id: v.vehicle_type_id || null,
        updated_at: new Date().toISOString(),
      }).eq("driver_id", userProfile.id);
    }
    toast({ title: "Vehicle selected", description: `${v.make} ${v.model} — ${v.plate_number}. You will only receive ${vehicleTypes.find(vt => vt.id === v.vehicle_type_id)?.name || "matching"} ride requests.` });
  };

  const initials = `${userProfile?.first_name?.[0] || ""}${userProfile?.last_name?.[0] || ""}`;

  const driverPTR = usePullToRefresh({
    onRefresh: async () => {
      // Force SW to check for updates, then hard-reload to bypass cache
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update().catch(() => {});
      }
      window.location.reload();
    },
    disabled: false
  });

  // Helper: update competition leaderboard entries after trip completion
  const updateCompetitionEntries = async (driverId: string) => {
    try {
      const now = new Date().toISOString();
      const { data: activeComps } = await supabase
        .from("competitions")
        .select("id, start_date, end_date")
        .eq("is_active", true)
        .eq("status", "active")
        .lte("start_date", now)
        .gte("end_date", now);

      if (!activeComps || activeComps.length === 0) return;

      for (const comp of activeComps) {
        // Count driver's completed trips in this competition period
        const { count } = await supabase
          .from("trips")
          .select("id", { count: "exact", head: true })
          .eq("driver_id", driverId)
          .eq("status", "completed")
          .gte("completed_at", comp.start_date)
          .lte("completed_at", comp.end_date);

        const tripCount = count || 0;

        // Check if entry exists
        const { data: existing } = await supabase
          .from("competition_entries")
          .select("id, trip_count")
          .eq("competition_id", comp.id)
          .eq("driver_id", driverId)
          .maybeSingle();

        if (existing) {
          await supabase.from("competition_entries").update({
            trip_count: tripCount,
            updated_at: now,
          } as any).eq("id", existing.id);
        } else {
          await supabase.from("competition_entries").insert({
            competition_id: comp.id,
            driver_id: driverId,
            trip_count: tripCount,
          } as any);
        }
      }
    } catch (err) {
      console.error("Competition entry update failed:", err);
    }
  };

  // Helper: apply trip cashback rewards to both passenger and driver wallets
  const applyTripCashback = async (tripId: string, fare: number, passengerId?: string | null) => {
    try {
      // Fetch reward settings
      const keys = ["passenger_trip_reward", "passenger_trip_reward_type", "driver_trip_reward", "driver_trip_reward_type"];
      const { data: settingsData } = await supabase.from("system_settings").select("key, value").in("key", keys);
      const sMap: Record<string, any> = {};
      settingsData?.forEach((s) => {sMap[s.key] = s.value;});

      const now = new Date().toISOString();

      // Passenger cashback
      if (passengerId && sMap.passenger_trip_reward) {
        const rewardVal = Number(sMap.passenger_trip_reward) || 0;
        if (rewardVal > 0) {
          const isPercent = sMap.passenger_trip_reward_type === "percentage";
          const cashback = isPercent ? Math.round(fare * rewardVal / 100) : rewardVal;
          if (cashback > 0) {
            let pWallet = (await supabase.from("wallets").select("id, balance").eq("user_id", passengerId).maybeSingle()).data;
            if (!pWallet) {
              const { data: nw } = await supabase.from("wallets").insert({ user_id: passengerId, balance: 0 } as any).select().single();
              pWallet = nw;
            }
            if (pWallet) {
              await supabase.from("wallets").update({ balance: Number(pWallet.balance) + cashback, updated_at: now } as any).eq("id", pWallet.id);
              await supabase.from("wallet_transactions").insert({ wallet_id: pWallet.id, user_id: passengerId, amount: cashback, type: "credit", reason: "Trip reward", trip_id: tripId } as any);
            }
          }
        }
      }

      // Driver cashback
      if (userProfile?.id && sMap.driver_trip_reward) {
        const rewardVal = Number(sMap.driver_trip_reward) || 0;
        if (rewardVal > 0) {
          const isPercent = sMap.driver_trip_reward_type === "percentage";
          const cashback = isPercent ? Math.round(fare * rewardVal / 100) : rewardVal;
          if (cashback > 0) {
            let dWallet = (await supabase.from("wallets").select("id, balance").eq("user_id", userProfile.id).maybeSingle()).data;
            if (!dWallet) {
              const { data: nw } = await supabase.from("wallets").insert({ user_id: userProfile.id, balance: 0 } as any).select().single();
              dWallet = nw;
            }
            if (dWallet) {
              const newBal = Number(dWallet.balance) + cashback;
              await supabase.from("wallets").update({ balance: newBal, updated_at: now } as any).eq("id", dWallet.id);
              await supabase.from("wallet_transactions").insert({ wallet_id: dWallet.id, user_id: userProfile.id, amount: cashback, type: "credit", reason: "Trip reward", trip_id: tripId } as any);
              setDriverWalletBalance(newBal);
            }
          }
        }
      }
    } catch (e) {
      console.error("Cashback error:", e);
    }
  };

  return (
    <div ref={driverPTR.containerRef} className="relative w-full h-[100dvh] md:max-w-none max-w-screen-sm mx-auto overflow-hidden bg-surface driver-text-root" style={{ fontSize: `${textSize * 16}px` }}>
      <PullToRefreshIndicator pullDistance={driverPTR.pullDistance} refreshing={driverPTR.refreshing} progress={driverPTR.progress} />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* Session conflict full-screen alert */}
      <AnimatePresence>
        {sessionKicked &&
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-md flex items-center justify-center p-6">

            <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            className="bg-card rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center space-y-5 border border-border">

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
              onClick={() => {
                deviceSessionId.current = crypto.randomUUID();
                setSessionKicked(false);
                sessionKickedRef.current = false;
              }}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-base active:scale-95 transition-transform">

                I Understand
              </button>
            </motion.div>
          </motion.div>
        }
      </AnimatePresence>

      {/* Force takeover confirmation */}
      <AnimatePresence>
        {showTakeoverConfirm &&
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-md flex items-center justify-center p-6">

            <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            className="bg-card rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center space-y-5 border border-border">

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
                className="flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm active:scale-95 transition-transform">

                  Cancel
                </button>
                <button
                onClick={() => {
                  setShowTakeoverConfirm(false);
                  deviceSessionId.current = crypto.randomUUID();
                  takeoverWindowUntilRef.current = Date.now() + 10000;
                  // Force effect re-trigger by going offline then online
                  setScreen("offline");
                  setTimeout(() => setScreen("online"), 100);
                }}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-transform">

                  Take Over
                </button>
              </div>
            </motion.div>
          </motion.div>
        }
      </AnimatePresence>

      {/* Top bar */}
      <div className="absolute -top-3 left-0 right-0 z-[700] capacitor-safe-top">
        <div className={`flex items-center justify-between relative transition-all duration-300 ${showProfile ? "px-2 py-0" : "px-2 py-0 sm:px-3"}`}>
          {/* Left: Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <button onClick={() => setShowProfile(true)} className={`rounded-full bg-card/90 backdrop-blur-sm shadow-md flex items-center justify-center overflow-hidden active:scale-95 transition-all duration-300 border border-border/30 shrink-0 ${showProfile ? "w-8 h-8 landscape:hidden" : "w-10 h-10 sm:w-11 sm:h-11"}`}>
              {avatarUrl ?
              <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" /> :
              <User className="w-5 h-5 text-foreground" />
              }
            </button>
            {!currentTrip &&
            <button
              onClick={() => {setShowProfile(false);setScreen("offline");goOfflineNow();onSwitchToPassenger();}}
              className="flex items-center gap-1.5 sm:gap-2 bg-card border border-border rounded-full pl-1.5 pr-2.5 sm:pl-2 sm:pr-3.5 py-1 sm:py-1.5 active:scale-95 transition-transform shadow-md min-w-0">
                <SystemLogo className="w-5 h-5 sm:w-6 sm:h-6 object-contain rounded-full shrink-0" alt="Passenger" />
                <span className="text-xs sm:text-sm font-bold text-primary whitespace-nowrap">Passenger</span>
              </button>
            }
          </div>

          {/* Center: Vehicle */}
          <div className="relative">
            
















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
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {!currentTrip &&
            <button
              onClick={() => setShowNotifications(true)}
              className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-card/90 backdrop-blur-sm shadow-md flex items-center justify-center active:scale-95 transition-transform border border-border/30">

              <BellIcon className={`w-4 h-4 text-foreground ${unreadNotifCount > 0 ? "animate-[wiggle_0.5s_ease-in-out]" : ""}`} />
              {unreadNotifCount > 0 &&
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse shadow-[0_0_8px_hsl(var(--destructive)/0.6)]">
                  {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                </span>
              }
            </button>
            }
            {screen !== "offline" && !currentTrip &&
            <button
              onClick={() => {
                setScreen("offline");
                goOfflineNow();
              }}
              className="relative w-12 h-7 sm:w-14 sm:h-8 rounded-full transition-colors duration-300 active:scale-95 flex items-center px-1 shrink-0 bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.4)]"
              title="Go Offline">
              <motion.div
                className="absolute inset-0 rounded-full bg-primary"
                animate={{ opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                style={{ boxShadow: "0 0 16px hsl(var(--primary) / 0.5)" }} />
              <motion.div
                className="relative z-10 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary-foreground shadow-md"
                animate={{ x: 20 }}
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
        pickupCoords={currentTrip?.pickup_lat && currentTrip?.pickup_lng ? [currentTrip.pickup_lat, currentTrip.pickup_lng] : undefined}
        dropoffCoords={currentTrip?.dropoff_lat && currentTrip?.dropoff_lng ? [currentTrip.dropoff_lat, currentTrip.dropoff_lng] : undefined}
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
              distance_km: distKm
            } as any).eq("id", currentTrip.id).then(() => {});
          }
        }}
        onFollowDriverChange={setIsFollowingDriver}
        followToggleRef={followToggleRef}
        onSpeedChange={setDriverSpeed}
        tripPanelOpen={screen === "navigating" && !navPanelMinimized}
        onNavStepChange={setNavStepData}
        navSettings={driverNavSettings}
        onMapHeadingChange={setMapHeading}
        onMapReady={setDriverMapInstance}
        resetNorthRef={resetNorthRef}
        externalPosition={driverLat != null && driverLng != null ? { lat: driverLat, lng: driverLng } : null}
        startFreeNavRef={startFreeNavRef}
        onFreeNavChange={setIsFreeNavigating} />

      {/* Promo Items Overlay — only when online and NOT on a trip */}
      {userProfile?.id && screen === "online" && driverMapInstance && (
        <WatermelonMapOverlay
          userType="driver"
          userId={userProfile.id}
          userLat={driverLat}
          userLng={driverLng}
          mapInstance={driverMapInstance}
        />
      )}
      {/* Ad Banner for drivers */}
      {screen === "online" && !isFreeNavigating && (
        <div className="fixed top-20 left-3 right-3 z-[600] pointer-events-auto max-w-lg mx-auto capacitor-safe-top">
          <AdBanner audience="drivers" />
        </div>
      )}

      {/* Map action buttons — right side, positioned for thumb reach */}
      {screen !== "offline" &&
      <div className={`absolute right-3 z-[455] flex flex-col gap-1.5 bg-card/90 backdrop-blur-sm rounded-2xl p-1.5 shadow-lg border border-border/30 mx-0 mb-[60px] landscape-map-controls transition-all duration-300 ${screen === "navigating" && !navPanelMinimized ? "bottom-[calc(env(safe-area-inset-bottom,0px)+440px)]" : "bottom-[calc(env(safe-area-inset-bottom,0px)+340px)]"}`}>
        {recenterAvailable &&
        <>
            <button
            onClick={() => recenterRef.current?.()}
            className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all duration-300 text-primary hover:bg-surface"
            title="Re-center">

              <Crosshair className="w-[18px] h-[18px]" />
            </button>
            <div className="w-5 h-px bg-border mx-auto" />
          </>
        }
        {screen === "navigating" &&
        <>
            <button
            onClick={() => followToggleRef.current?.()}
            className={`w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all duration-300 ${
            isFollowingDriver ? "text-muted-foreground hover:bg-surface" : "bg-primary text-primary-foreground"}`
            }
            title={isFollowingDriver ? "Show full route" : "Follow my location"}>

              {isFollowingDriver ? <Route className="w-[18px] h-[18px]" /> : <Crosshair className="w-[18px] h-[18px]" />}
            </button>
            <div className="w-5 h-px bg-border mx-auto" />
          </>
        }
        {/* Search locations */}
        <button
          onClick={() => { setShowLocationSearch(true); setLocationSearchQuery(""); setLocationSearchResults([]); }}
          className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all duration-300 text-primary hover:bg-surface"
          title="Search location"
        >
          <Search className="w-[18px] h-[18px]" />
        </button>
        <div className="w-5 h-px bg-border mx-auto" />
        <ThemeToggle className="!w-10 !h-10 !rounded-xl !shadow-none !bg-transparent hover:!bg-surface" />
        <div className="w-5 h-px bg-border mx-auto" />
        {/* Compass */}
        <button
          onClick={() => resetNorthRef.current?.()}
          className="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-all duration-300 hover:bg-surface"
          title="Reset to North"
        >
          <div
            style={{ transform: `rotate(${-mapHeading}deg)`, transition: "transform 0.3s ease-out" }}
            className="relative w-6 h-6"
          >
            <svg viewBox="0 0 28 28" className="w-full h-full">
              <polygon points="14,4 18,16 14,14 10,16" fill="hsl(var(--muted-foreground))" opacity="0.4" />
              <polygon points="14,24 10,12 14,14 18,12" fill="hsl(var(--muted-foreground))" opacity="0.4" />
              <polygon points="14,4 18,16 14,14 10,16" fill="#EF4444" />
              <text x="14" y="3" textAnchor="middle" fontSize="5" fontWeight="bold" fill="#EF4444">N</text>
            </svg>
          </div>
        </button>
        {userProfile?.id &&
        <>
            <div className="w-5 h-px bg-border mx-auto" />
            <SOSButton
            userId={userProfile.id}
            userType="driver"
            userName={`${userProfile.first_name} ${userProfile.last_name}`}
            userPhone={userProfile.phone_number || ""}
            tripId={currentTrip?.id} />

          </>
        }
      </div>
      }

      {/* Location Search Modal */}
      <AnimatePresence>
        {showLocationSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9995] bg-black/40 backdrop-blur-sm"
            onClick={() => setShowLocationSearch(false)}
          >
            <motion.div
              initial={{ y: "-100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="absolute top-0 left-0 right-0 max-h-[100vh] bg-card shadow-2xl border-b border-border overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 space-y-3 safe-top">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground">Search Location</h3>
                  <button onClick={() => setShowLocationSearch(false)} className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search service areas, named locations..."
                    className="w-full h-11 pl-10 pr-4 rounded-xl bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    value={locationSearchQuery}
                    onChange={async (e) => {
                      const q = e.target.value;
                      setLocationSearchQuery(q);
                      if (q.trim().length < 1) { setLocationSearchResults([]); return; }
                      const [{ data: svcData }, { data: namedData }] = await Promise.all([
                        supabase
                          .from("service_locations")
                          .select("name, address, lat, lng")
                          .eq("is_active", true)
                          .or(`name.ilike.%${q}%,address.ilike.%${q}%`)
                          .limit(10),
                        supabase
                          .from("named_locations")
                          .select("name, address, lat, lng")
                          .eq("is_active", true)
                          .eq("status", "approved")
                          .or(`name.ilike.%${q}%,address.ilike.%${q}%`)
                          .limit(20),
                      ]);
                      const results: { name: string; address: string; lat: number; lng: number; type: string }[] = [];
                      // Show service areas first, then named locations
                      (svcData || []).forEach((d: any) => results.push({ name: d.name, address: d.address || "", lat: Number(d.lat), lng: Number(d.lng), type: "service" }));
                      (namedData || []).forEach((d: any) => results.push({ name: d.name, address: d.address || "", lat: Number(d.lat), lng: Number(d.lng), type: "named" }));

                      // If few DB results, also search Google Places as fallback
                      if (results.length < 5) {
                        const g = (window as any).google;
                        if (g?.maps?.places?.AutocompleteService) {
                          try {
                            const autoSvc = new g.maps.places.AutocompleteService();
                            const predictions = await new Promise<any[]>((resolve) => {
                              autoSvc.getPlacePredictions(
                                { input: q, componentRestrictions: { country: "mv" } },
                                (res: any[] | null, status: string) => resolve(status === "OK" && res ? res : [])
                              );
                            });
                            const mapDiv = document.createElement("div");
                            const placesSvc = new g.maps.places.PlacesService(mapDiv);
                            const existingNames = new Set(results.map(r => r.name.toLowerCase()));
                            for (const pred of predictions.slice(0, 5)) {
                              const detail = await new Promise<any>((resolve) => {
                                placesSvc.getDetails(
                                  { placeId: pred.place_id, fields: ["geometry", "name", "formatted_address"] },
                                  (place: any, st: string) => resolve(st === "OK" ? place : null)
                                );
                              });
                              if (detail?.geometry?.location && !existingNames.has((detail.name || "").toLowerCase())) {
                                results.push({
                                  name: detail.name || pred.structured_formatting?.main_text || "",
                                  address: detail.formatted_address || pred.description || "",
                                  lat: detail.geometry.location.lat(),
                                  lng: detail.geometry.location.lng(),
                                  type: "google",
                                });
                                existingNames.add((detail.name || "").toLowerCase());
                              }
                            }
                          } catch {}
                        }
                      }
                      setLocationSearchResults(results);
                    }}
                  />
                </div>
                <div className="max-h-[60vh] overflow-y-auto space-y-1 pb-safe">
                  {locationSearchResults.length === 0 && locationSearchQuery.trim().length > 0 && (
                    <p className="text-center text-muted-foreground text-sm py-8">No locations found</p>
                  )}
                  {locationSearchResults.map((loc, i) => (
                    <button
                      key={`${loc.type}-${i}`}
                      onClick={() => {
                        setShowLocationSearch(false);
                        startFreeNavRef.current?.({ lat: loc.lat, lng: loc.lng });
                        toast({ title: "🧭 Navigating", description: `Heading to ${loc.name}` });
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted/50 active:bg-muted transition-colors text-left"
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${loc.type === "named" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"}`}>
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{loc.name}</p>
                        {loc.address && <p className="text-xs text-muted-foreground truncate">{loc.address}</p>}
                      </div>
                      <Navigation className="w-4 h-4 text-primary shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline */}
      {screen === "offline" &&
      <div className="absolute inset-0 flex items-center justify-center z-[450] landscape-offline bg-background/60 backdrop-blur-sm">
          <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="text-center space-y-6 px-6 w-full max-w-sm landscape-offline-card">

            {/* Icon with animated ring */}
            <div className="relative w-24 h-24 mx-auto">
              {verificationIssues.length === 0 &&
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-primary/30"
              animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} />

            }
              <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
            verificationIssues.length > 0 ? "bg-destructive/10" : "bg-primary/10"}`
            }>
                <Power className={`w-10 h-10 ${verificationIssues.length > 0 ? "text-destructive" : "text-primary"}`} />
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold text-foreground">You're offline</h2>
              <p className="text-muted-foreground text-sm">
                {verificationIssues.length > 0 ? "Complete your profile to go online" : "Go online to start receiving rides"}
              </p>
            </div>

            {/* Rejected profile banner */}
            {profileStatus === "Rejected" &&
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="relative bg-card rounded-2xl overflow-hidden shadow-lg w-full border border-destructive/20">
                {/* Animated top gradient bar */}
                <div className="h-1.5 bg-gradient-to-r from-destructive via-destructive/70 to-destructive animate-pulse" />
                <div className="p-5 space-y-4">
                  <div className="flex items-start gap-4">
                    <motion.div 
                      animate={{ scale: [1, 1.1, 1] }} 
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center shrink-0">
                      <XCircle className="w-7 h-7 text-destructive" />
                    </motion.div>
                    <div className="space-y-1 flex-1">
                      <h3 className="text-base font-extrabold text-destructive">Profile Rejected</h3>
                      {profileRejectionReason && (
                        <div className="bg-destructive/5 rounded-lg px-3 py-2 mt-1.5">
                          <p className="text-xs text-destructive/90 font-medium leading-relaxed">"{profileRejectionReason}"</p>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">Update your info or documents and resubmit for review.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowProfile(true); setProfileTab("info"); }}
                      className="flex-1 flex items-center justify-center gap-2 bg-muted text-foreground font-bold py-3 rounded-xl text-sm active:scale-[0.97] transition-transform">
                      <Pencil className="w-4 h-4" />
                      Edit Info
                    </button>
                    <button
                      onClick={() => { setShowProfile(true); setProfileTab("documents"); }}
                      className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold py-3 rounded-xl text-sm active:scale-[0.97] transition-transform">
                      <Upload className="w-4 h-4" />
                      Update Docs
                    </button>
                  </div>
                </div>
              </motion.div>
          }

            {/* Verification checklist */}
            {profileStatus !== "Rejected" && verificationIssues.length > 0 &&
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-card rounded-2xl p-4 text-left space-y-3 border border-border/50 shadow-sm">

                <p className="text-[11px] font-bold text-destructive uppercase tracking-wider">Action required</p>
                {verificationIssues.map((issue, i) =>
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.08 }}
              className="flex items-start gap-2.5">

                    <div className="w-5 h-5 rounded-full bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                      <X className="w-3 h-3 text-destructive" />
                    </div>
                    <p className="text-sm text-foreground">{issue}</p>
                  </motion.div>
            )}
                <button
              onClick={() => {setShowProfile(true);setProfileTab(verificationIssues.some((i) => i.includes("bank")) ? "banks" : verificationIssues.some((i) => i.includes("ID") || i.includes("license") || i.includes("photo")) ? "documents" : "info");}}
              className="w-full mt-1 bg-primary text-primary-foreground font-semibold py-3 rounded-xl text-sm active:scale-[0.98] transition-transform">

                  Complete profile
                </button>
              </motion.div>
          }

            {/* Billing Hold - Payment Required */}
            {billingHold && verificationIssues.length === 0 ?
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-card rounded-2xl p-5 text-center space-y-4 border border-destructive/30 shadow-sm w-full">
                <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                  <DollarSign className="w-7 h-7 text-destructive" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-bold text-destructive">Payment Required</h3>
                  <p className="text-sm text-muted-foreground">Your monthly fee is overdue. Please submit payment to continue driving.</p>
                  <p className="text-xs text-muted-foreground">Fee: <span className="font-bold text-foreground">{driverVehicles.reduce((s: number, v: any) => { const vt = vehicleTypes.find((t: any) => t.id === v.vehicle_type_id); return s + (vt?.monthly_fee || 0); }, 0)} MVR</span></p>
                </div>
                <button
              onClick={() => { setShowBillingPayPopup(true); setBillingSlipUrl(null); }}
              className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-sm active:scale-[0.97] transition-transform">
                    Pay Now
                  </button>
              </motion.div> :

          profileStatus === "Active" && verificationIssues.length === 0 ?
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            onClick={async () => {
              // Block going online if notification permission not granted
              // Skip check in iframe/preview contexts where Notification API is restricted
              const isInIframe = window !== window.top;
              if (!isInIframe && "Notification" in window && Notification.permission !== "granted") {
                if (Notification.permission === "default") {
                  const result = await Notification.requestPermission();
                  if (result !== "granted") {
                    toast({ title: "Notifications Required", description: "You must enable notifications to go online and receive trip requests.", variant: "destructive" });
                    return;
                  }
                  // Unlock audio pool after permission grant (user gesture context)
                  unlockAudioPool();
                } else {
                  toast({ title: "Notifications Blocked", description: "Please enable notifications in your browser settings to go online.", variant: "destructive" });
                  return;
                }
              }
              // Always let this device take over and become active
              const newSessionId = crypto.randomUUID();
              deviceSessionId.current = newSessionId;
              takeoverWindowUntilRef.current = Date.now() + 10000;
              await supabase
                .from("driver_locations")
                .update({
                  session_id: newSessionId,
                  is_online: true,
                  updated_at: new Date().toISOString(),
                })
                .eq("driver_id", userProfile!.id);
              setShowTakeoverConfirm(false);
              setSessionKicked(false);
              sessionKickedRef.current = false;
              setScreen("online");
            }}
            className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-2xl text-base transition-all active:scale-[0.97] shadow-lg shadow-primary/20"
            whileTap={{ scale: 0.97 }}>

                Start driving
              </motion.button> :
          profileStatus !== "Active" && !billingHold && verificationIssues.length === 0 ?
          <div className="bg-card rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 justify-center">
                  <Clock className="w-4 h-4 text-primary animate-pulse" />
                  <p className="text-sm font-semibold text-foreground">Pending Admin Approval</p>
                </div>
                <p className="text-xs text-muted-foreground text-center">Your documents have been submitted. An admin will review and approve your profile shortly.</p>
              </div> :
          profileStatus !== "Active" ?
          <div className="bg-card rounded-xl p-4">
                <div className="flex items-center gap-2 justify-center">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">Complete requirements above to request approval</p>
                </div>
              </div> :
          null}
          </motion.div>
        </div>
      }

      {/* Online */}
      {screen === "online" &&
      <>
        {/* Expand tab when panel is hidden */}
        <AnimatePresence>
          {panelMinimized && !isFreeNavigating &&
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            onClick={() => setPanelMinimized(false)}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[460] rounded-2xl px-5 py-3 flex items-center gap-3 active:scale-95 transition-transform bg-card border border-border shadow-xl landscape-expand-btn">
              <div className="relative flex items-center justify-center w-4 h-4">
                <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--success))]" />
                <div className="absolute w-4 h-4 rounded-full border-2 border-[hsl(var(--success)/0.4)] animate-ping" />
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-bold text-foreground">Online</span>
                {driverStats.rides > 0 && (
                  <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{driverStats.rides} rides</span>
                )}
                {driverStats.avgRating > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
                    <Star className="w-2.5 h-2.5 text-primary fill-primary" />
                    {driverStats.avgRating}
                  </span>
                )}
              </div>
              <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            </motion.button>
          }
        </AnimatePresence>

        <AnimatePresence>{!showProfile && !panelMinimized && !isFreeNavigating && <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className={`absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] z-[800] flex flex-col landscape-panel`}
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)", maxHeight: "min(60vh, calc(100dvh - 140px))" }}>

          <div className="px-4 pt-3 pb-5 space-y-3 overflow-y-auto flex-1 min-h-0">
            {/* Drag handle */}
            <button onClick={() => setPanelMinimized(!panelMinimized)} className="w-full flex justify-center py-1.5 -mt-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </button>

            {/* Status bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative flex items-center justify-center w-3.5 h-3.5">
                  <div className="w-2 h-2 rounded-full bg-[hsl(var(--success))]" />
                  <div className="absolute w-3.5 h-3.5 rounded-full border border-[hsl(var(--success)/0.3)] animate-ping" />
                </div>
                <span className="font-bold text-sm text-foreground">Online</span>
                {driverStats.avgRating > 0 &&
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Star className="w-3 h-3 text-primary fill-primary" />
                    {driverStats.avgRating}
                  </span>
                }
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => { const next = !showEarnings; setShowEarnings(next); try { localStorage.setItem("hda_driver_show_earnings", String(next)); } catch {} }} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform">
                  {showEarnings ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                </button>
                <button onClick={() => setPanelMinimized(true)} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform">
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Collapsible content */}
            <AnimatePresence>
              {!panelMinimized &&
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-3 overflow-hidden">

                  {/* Stats row */}
                   <div className="bg-surface rounded-2xl px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
                     <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 overflow-x-auto scrollbar-none">
                       <div className="text-center min-w-0 shrink-0">
                         <p className="text-sm sm:text-lg font-bold text-foreground tabular-nums leading-none">{driverStats.rides}</p>
                         <p className="text-[8px] sm:text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1">Rides</p>
                       </div>
                       <div className="w-px h-7 bg-border/40 shrink-0" />
                       <div className="text-center min-w-0 shrink-0">
                         <p className="text-sm sm:text-lg font-bold text-foreground tabular-nums leading-none">{showEarnings ? driverStats.earnings.toFixed(0) : "•••"}</p>
                         <p className="text-[8px] sm:text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1">MVR</p>
                       </div>
                       <div className="w-px h-7 bg-border/40 shrink-0" />
                       <div className="text-center min-w-0 shrink-0">
                          <p className="text-sm sm:text-lg font-bold text-foreground tabular-nums leading-none">{onlineTimeDisplay}</p>
                          <p className="text-[8px] sm:text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1">Online</p>
                       </div>
                       {driverStats.declinedToday > 0 &&
                     <>
                         <div className="w-px h-7 bg-border/40 shrink-0" />
                         <div className="text-center min-w-0 shrink-0">
                           <p className="text-sm sm:text-lg font-bold text-destructive tabular-nums leading-none">{driverStats.declinedToday}</p>
                           <p className="text-[8px] sm:text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1">Declined</p>
                         </div>
                       </>
                     }
                     </div>
                     <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-1 sm:ml-3">
                       <button
                         onClick={() => setShowLeaderboard(true)}
                         className="relative flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-2xl bg-gradient-to-br from-yellow-400/20 to-amber-500/10 border border-yellow-500/20 active:scale-90 transition-all shadow-sm hover:shadow-yellow-500/10">
                         <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-500 drop-shadow-sm" />
                         <span className="text-[9px] sm:text-xs font-bold text-yellow-600 dark:text-yellow-400">Rank</span>
                         <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse border-2 border-background" />
                       </button>
                       <button
                         onClick={() => setShowEarningsHistory(true)}
                         className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-xl bg-primary/10 active:scale-95 transition-transform">
                         <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
                         <span className="text-[9px] sm:text-xs font-semibold text-primary">History</span>
                       </button>
                     </div>
                   </div>

                  {/* Upcoming Scheduled Trip Banner */}
                  {upcomingScheduledTrip && (
                    <div className="bg-primary/10 border border-primary/20 rounded-2xl px-3 py-2.5 space-y-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                          <Clock className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Scheduled Ride</p>
                          <p className="text-xs font-semibold text-foreground truncate">{upcomingScheduledTrip.pickup_address}</p>
                          <p className="text-[10px] text-muted-foreground truncate">→ {upcomingScheduledTrip.dropoff_address}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(upcomingScheduledTrip.scheduled_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            {(() => {
                              const mins = Math.round((new Date(upcomingScheduledTrip.scheduled_at).getTime() - Date.now()) / 60000);
                              if (mins <= 0) return " · Now";
                              if (mins < 60) return ` · in ${mins}min`;
                              return ` · in ${Math.floor(mins/60)}h ${mins%60}m`;
                            })()}
                          </p>
                        </div>
                        {(() => {
                          const mins = Math.round((new Date(upcomingScheduledTrip.scheduled_at).getTime() - Date.now()) / 60000);
                          return mins <= 15 ? (
                            <span className="text-[9px] font-bold text-primary bg-primary/20 px-2 py-1 rounded-full animate-pulse shrink-0">Get Ready</span>
                          ) : null;
                        })()}
                      </div>
                      {/* Start Ride button — requires manual confirmation */}
                      <button
                        onClick={async () => {
                          // Confirmation dialog
                          const confirmed = window.confirm(
                            `Start scheduled ride?\n\n📍 ${upcomingScheduledTrip.pickup_address}\n→ ${upcomingScheduledTrip.dropoff_address}\n🕐 ${new Date(upcomingScheduledTrip.scheduled_at).toLocaleString()}\n\nThis will begin navigation to pickup.`
                          );
                          if (!confirmed) return;

                          // Load the full trip and go to navigating
                          const { data: fullTrip } = await supabase
                            .from("trips")
                            .select("*")
                            .eq("id", upcomingScheduledTrip.id)
                            .single();
                          if (!fullTrip) {
                            toast({ title: "Trip not found", variant: "destructive" });
                            return;
                          }
                          if (fullTrip.status === "cancelled") {
                            toast({ title: "This trip was cancelled", variant: "destructive" });
                            setUpcomingScheduledTrip(null);
                            return;
                          }
                          // If currently on another trip, block
                          if (currentTrip) {
                            toast({ title: "Finish your current trip first", variant: "destructive" });
                            return;
                          }
                          // Mark driver as on trip
                          await supabase.from("driver_locations").update({ is_on_trip: true, session_id: deviceSessionId.current } as any).eq("driver_id", userProfile.id);
                          setCurrentTrip(fullTrip as any);
                          setDriverTripPhase("heading_to_pickup");
                          // Fetch passenger profile
                          if (fullTrip.passenger_id) {
                            const { data: pp } = await supabase.from("profiles").select("*").eq("id", fullTrip.passenger_id).single();
                            if (pp) setPassengerProfile(pp);
                            // Notify passenger that driver is on the way
                            notifyTripAccepted(fullTrip.passenger_id, `${userProfile.first_name} ${userProfile.last_name}`, fullTrip.id);
                          }
                          setUpcomingScheduledTrip(null);
                          setScreen("navigating");
                          fetchSoundUrl("driver_sound_accepted").then(u => playSound(u));
                        }}
                        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold active:scale-[0.97] transition-transform flex items-center justify-center gap-1.5"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        Start Scheduled Ride
                      </button>
                    </div>
                  )}

                  {/* Radius + Vehicle row */}
                  <div className="flex gap-2">
                    {/* Radius */}
                    <div className="bg-surface rounded-2xl px-2 sm:px-3 py-2.5 flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <Radar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary shrink-0" />
                      <div className="flex items-center gap-0.5">
                        <button
                        onClick={() => updateRadius(Math.max(0.1, +(tripRadius - (tripRadius <= 1 ? 0.1 : 1)).toFixed(1)))}
                        className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-card flex items-center justify-center text-muted-foreground active:scale-90 transition-transform">
                          <span className="text-xs font-bold leading-none">−</span>
                        </button>
                        <span className="text-[11px] sm:text-xs font-bold text-foreground tabular-nums w-8 sm:w-10 text-center">
                          {tripRadius < 1 ? `${(tripRadius * 1000).toFixed(0)}m` : `${tripRadius}km`}
                        </span>
                        <button
                        onClick={() => updateRadius(Math.min(50, +(tripRadius + (tripRadius < 1 ? 0.1 : 1)).toFixed(1)))}
                        className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-card flex items-center justify-center text-muted-foreground active:scale-90 transition-transform">
                          <span className="text-xs font-bold leading-none">+</span>
                        </button>
                      </div>
                    </div>

                    {/* Vehicle */}
                    {vehicleInfo && (() => {
                    const vTypeImg = vehicleInfo.vehicle_type_id ? vehicleTypes.find((t) => t.id === vehicleInfo.vehicle_type_id)?.image_url : null;
                    return (
                      <div className="bg-surface rounded-2xl px-2 sm:px-3 py-2.5 flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center shrink-0 overflow-hidden">
                            {vTypeImg ?
                          <img src={vTypeImg} alt="Vehicle" className="w-full h-full object-contain" /> :
                          <Car className="w-4 h-4 text-primary" />
                          }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] sm:text-sm font-semibold text-foreground truncate">{vehicleInfo.make} {vehicleInfo.model}</p>
                            <p className="text-[9px] sm:text-xs text-muted-foreground truncate">{vehicleInfo.plate_number}{vehicleInfo.color ? ` • ${vehicleInfo.color}` : ""}</p>
                          </div>
                          {driverVehicles.length > 1 &&
                        <button onClick={() => {setShowProfile(true);setProfileTab("vehicles");}} className="text-[9px] sm:text-xs font-semibold text-primary bg-primary/10 px-1.5 sm:px-2 py-1 rounded-lg shrink-0 active:scale-95 transition-transform">
                              Switch
                            </button>
                        }
                        </div>);
                  })()}
                  </div>

                </motion.div>
              }
            </AnimatePresence>
          </div>
        </motion.div>}</AnimatePresence>

        {/* Earnings History Modal */}
        {userProfile?.id &&
        <DriverEarnings
          driverId={userProfile.id}
          isOpen={showEarningsHistory}
          onClose={() => setShowEarningsHistory(false)}
          vehicleId={selectedVehicleId}
          vehiclePlate={driverVehicles.find(v => v.id === selectedVehicleId)?.plate_number || ""}
        />

        }
        </>
      }

      {/* Ride Request */}
      {screen === "ride-request" && currentTrip &&
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", damping: 20 }} className="absolute inset-0 z-[500] flex items-end sm:items-center justify-center bg-foreground/50 backdrop-blur-sm ride-request-overlay">
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="bg-card rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:mx-6 sm:max-w-sm overflow-hidden max-h-[90dvh] flex flex-col">
            {/* Header with countdown */}
            <div className="bg-gradient-to-b from-primary to-primary/90 px-5 py-5 text-center relative overflow-hidden">
              {/* Decorative circles */}
              <div className="absolute -top-6 -left-6 w-24 h-24 rounded-full bg-primary-foreground/5" />
              <div className="absolute -bottom-4 -right-8 w-32 h-32 rounded-full bg-primary-foreground/5" />
              
              {/* Countdown timer - top right */}
              <div className="absolute top-4 right-4 w-12 h-12 rounded-full bg-primary-foreground/15 backdrop-blur-sm flex items-center justify-center border border-primary-foreground/20">
                <span className={`text-base font-bold ${rideRequestCountdown <= 5 ? "text-red-300 animate-pulse" : "text-primary-foreground"}`}>
                  {rideRequestCountdown}
                </span>
              </div>

              <p className="text-primary-foreground/70 text-[11px] font-medium uppercase tracking-wider">
                {currentTrip.booking_type === "scheduled" ? "📅 Scheduled ride" : currentTrip.booking_type === "hourly" ? "⏱ Hourly booking" : "New ride request"}{tripStops.length > 0 ? ` • ${tripStops.length} stop${tripStops.length > 1 ? "s" : ""}` : ""}
              </p>
              
              <p className="text-3xl font-extrabold text-primary-foreground mt-1.5 tracking-tight">
                {(currentTrip.estimated_fare ?? 0) + ((currentTrip as any).passenger_bonus || 0)} <span className="text-lg font-semibold text-primary-foreground/80">MVR{currentTrip.booking_type === "hourly" ? "/hr" : ""}</span>
              </p>

              {(currentTrip as any).passenger_bonus > 0 && (
                <div className="mt-2 inline-flex items-center gap-2 bg-primary-foreground/15 backdrop-blur-sm rounded-full px-3 py-1.5 border border-primary-foreground/10">
                  <span className="text-primary-foreground/80 text-[11px] font-medium">Base {currentTrip.estimated_fare}</span>
                  <div className="w-px h-3 bg-primary-foreground/30" />
                  <span className="text-amber-300 text-[11px] font-bold">🔥 +{(currentTrip as any).passenger_bonus} boost</span>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 mt-2">
                {currentTrip.distance_km && (
                  <span className="text-primary-foreground/60 text-xs font-medium">📍 ~{currentTrip.distance_km} km</span>
                )}
                {currentTrip.booking_type === "scheduled" && currentTrip.scheduled_at && (
                  <span className="text-primary-foreground/60 text-xs font-medium">🕐 {new Date(currentTrip.scheduled_at).toLocaleString()}</span>
                )}
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-1 bg-primary-foreground/15 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary-foreground/50 rounded-full"
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: acceptTimeoutSeconds, ease: "linear" }}
                />
              </div>
            </div>

            {/* Mini map preview */}
            <div className="h-40 sm:h-56 w-full shrink-0">
              <RideRequestMap
              pickupLat={currentTrip.pickup_lat}
              pickupLng={currentTrip.pickup_lng}
              dropoffLat={currentTrip.dropoff_lat}
              dropoffLng={currentTrip.dropoff_lng}
              stops={tripStops.map((s) => ({ lat: (s as any).lat, lng: (s as any).lng, stop_order: s.stop_order }))} />

            </div>

            <div className="px-4 py-3 space-y-2.5 overflow-y-auto flex-1 min-h-0">
              {/* Customer/Passenger info */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-sm font-bold text-foreground shrink-0 overflow-hidden">
                  {passengerProfile?.avatar_url ?
                <img src={passengerProfile.avatar_url} alt="" className="w-full h-full object-cover" /> :
                currentTrip.customer_name ?
                `${currentTrip.customer_name[0] || ""}` :
                passengerProfile ? `${passengerProfile.first_name?.[0] || ""}${passengerProfile.last_name?.[0] || ""}` : "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-foreground truncate">
                    {currentTrip.customer_name || (passengerProfile ? `${passengerProfile.first_name} ${passengerProfile.last_name}` : "Passenger")}
                  </p>
                  {(currentTrip.customer_phone || passengerProfile?.phone_number) &&
                <a href={`tel:${currentTrip.customer_phone ? `+960${currentTrip.customer_phone}` : `+${passengerProfile?.country_code || "960"}${passengerProfile?.phone_number}`}`} className="text-xs text-primary font-medium">
                      {currentTrip.customer_phone ? `+960 ${currentTrip.customer_phone}` : `+${passengerProfile?.country_code || "960"} ${passengerProfile?.phone_number}`}
                    </a>
                }
                  {currentTrip.dispatch_type === "operator" &&
                <span className="ml-2 text-[10px] font-bold text-accent-foreground bg-accent px-1.5 py-0.5 rounded-full">Dispatch</span>
                }
                </div>
              </div>

              {/* Route with stops */}
              <div className="bg-surface rounded-xl p-3 space-y-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                  <p className="text-xs text-foreground truncate font-medium">{currentTrip.pickup_address}</p>
                </div>
                {tripStops.map((stop) =>
              <div key={stop.id}>
                    <div className="ml-1 w-0.5 h-2.5 bg-border" />
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-sm bg-amber-500 shrink-0" />
                      <p className="text-xs text-foreground truncate">Stop {stop.stop_order}: {stop.address}</p>
                    </div>
                  </div>
              )}
                <div className="ml-1 w-0.5 h-2.5 bg-border" />
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                  <p className="text-xs text-foreground truncate font-medium">{currentTrip.dropoff_address}</p>
                </div>
              </div>

              {/* Passenger & Luggage */}
              <div className="flex gap-2">
                <div className="flex-1 bg-surface rounded-xl px-3 py-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground font-semibold">Passengers</p>
                    <p className="text-sm font-bold text-foreground">{currentTrip.passenger_count}</p>
                  </div>
                </div>
                <div className="flex-1 bg-surface rounded-xl px-3 py-2 flex items-center gap-2">
                  <Luggage className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground font-semibold">Luggage</p>
                    <p className="text-sm font-bold text-foreground">{currentTrip.luggage_count}</p>
                  </div>
                </div>
              </div>

              {/* Booking notes */}
              {currentTrip.booking_notes &&
            <div className="bg-surface rounded-xl px-3 py-2">
                  <p className="text-[10px] text-muted-foreground font-semibold">Notes</p>
                  <p className="text-xs text-foreground mt-0.5">{currentTrip.booking_notes}</p>
                </div>
            }


            </div>

              {/* Accept / Decline buttons - sticky at bottom */}
              <div className="flex gap-2 px-4 py-3 pb-[max(0.75rem,calc(env(safe-area-inset-bottom,8px)+0.5rem))] border-t border-border/30 shrink-0 bg-card">
                <button onClick={async () => {
                if (rideRequestTimerRef.current) {clearInterval(rideRequestTimerRef.current);rideRequestTimerRef.current = null;}
                stopAllSounds(); tripSoundRef.current = null;
                if (currentTrip?.id) {
                  declinedTripIdsRef.current.add(currentTrip.id);
                  if (userProfile?.id) {
                    supabase.from("trip_declines").upsert({ driver_id: userProfile.id, trip_id: currentTrip.id }, { onConflict: "driver_id,trip_id" });
                  }
                }
                setScreen("online");
                setCurrentTrip(null);
                setPassengerProfile(null);
              }} className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 rounded-xl py-3 text-sm font-semibold active:scale-95 transition-transform">
                  <X className="w-4 h-4" />Decline
                </button>
                <button onClick={async () => {
                // Stop sound immediately on accept
                stopAllSounds(); tripSoundRef.current = null;
                if (rideRequestTimerRef.current) {clearInterval(rideRequestTimerRef.current);rideRequestTimerRef.current = null;}
                if (!currentTrip || !userProfile?.id) return;

                // First check if trip is still available
                const { data: freshTrip } = await supabase.
                from("trips").
                select("status, driver_id, booking_type").
                eq("id", currentTrip.id).
                single();

                // Direct-assigned trips already have status "accepted" with driver_id set
                const isDirectAssigned = freshTrip?.status === "accepted" && freshTrip?.driver_id === userProfile.id;

                if (!freshTrip || (!isDirectAssigned && freshTrip.status !== "requested" && freshTrip.status !== "scheduled")) {
                  const isCancelled = freshTrip?.status === "cancelled";
                  toast({ title: isCancelled ? "Trip Cancelled" : "Trip Unavailable", description: isCancelled ? "The passenger cancelled this trip." : "This trip has already been accepted by another driver.", variant: "destructive" });
                  setScreen("online");
                  setCurrentTrip(null);
                  setPassengerProfile(null);
                  return;
                }

                // If direct-assigned, skip the DB update (already accepted) and go straight to navigating
                if (isDirectAssigned) {
                  await supabase.from("driver_locations").update({ is_on_trip: true, session_id: deviceSessionId.current } as any).eq("driver_id", userProfile.id);
                  fetchSoundUrl("driver_sound_accepted").then(u => playSound(u));
                  if (currentTrip.passenger_id) {
                    notifyTripAccepted(currentTrip.passenger_id, `${userProfile.first_name} ${userProfile.last_name}`, currentTrip.id);
                  }
                  setScreen("navigating");
                  return;
                }

                const isScheduled = freshTrip.booking_type === "scheduled" || currentTrip.booking_type === "scheduled";

                // Stop trip request sound immediately on accept
                stopAllSounds(); tripSoundRef.current = null;
                if (rideRequestTimerRef.current) { clearInterval(rideRequestTimerRef.current); rideRequestTimerRef.current = null; }

                // Accept trip in database
                const acceptedNow = new Date().toISOString();
                const { error, count } = await supabase.from("trips").update({
                  status: "accepted",
                  driver_id: userProfile.id,
                  accepted_at: acceptedNow,
                  vehicle_id: selectedVehicleId || null
                }).eq("id", currentTrip.id).in("status", ["requested", "scheduled"]);

                if (error) {
                  toast({ title: "Error", description: error.message, variant: "destructive" });
                  return;
                }

                // Verify the update actually happened (race condition check)
                const { data: verifyTrip } = await supabase.
                from("trips").
                select("driver_id").
                eq("id", currentTrip.id).
                single();

                if (verifyTrip?.driver_id !== userProfile.id) {
                  toast({ title: "Trip Taken", description: "Another driver accepted this trip first.", variant: "destructive" });
                  setScreen("online");
                  setCurrentTrip(null);
                  setPassengerProfile(null);
                  return;
                }

                setStoredTripTimer(currentTrip.id, "accepted_at", acceptedNow);
                setCurrentTrip({ ...currentTrip, status: "accepted", accepted_at: acceptedNow, driver_id: userProfile.id, vehicle_id: selectedVehicleId || null } as any);

                // Send tracking SMS for broadcast trips (non-blocking)
                if (currentTrip.dispatch_type === "dispatch_broadcast" || currentTrip.dispatch_type === "passenger") {
                  supabase.functions.invoke("send-tracking-sms", { body: { trip_id: currentTrip.id } }).catch(console.warn);
                }

                // Notify other online drivers that this trip was taken
                try {
                  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
                  const { data: otherDrivers } = await supabase
                    .from("driver_locations")
                    .select("driver_id")
                    .eq("is_online", true)
                    .eq("is_on_trip", false)
                    .neq("driver_id", userProfile.id)
                    .gte("updated_at", twoMinAgo);
                  if (otherDrivers && otherDrivers.length > 0) {
                    const otherIds = otherDrivers.map((d: any) => d.driver_id);
                    notifyTripTaken(otherIds, currentTrip.id);
                  }
                } catch (e) { console.warn("Failed to notify other drivers:", e); }

                // For scheduled rides, driver stays available (is_on_trip = false)
                // For immediate rides, mark driver as on trip
                if (!isScheduled) {
                  await supabase.from("driver_locations").update({ is_on_trip: true, session_id: deviceSessionId.current } as any).eq("driver_id", userProfile.id);
                  fetchSoundUrl("driver_sound_accepted").then(u => playSound(u));
                  // Notify passenger that driver accepted
                  if (currentTrip.passenger_id) {
                    notifyTripAccepted(currentTrip.passenger_id, `${userProfile.first_name} ${userProfile.last_name}`, currentTrip.id);
                  }
                  setScreen("navigating");
                } else {
                  // Scheduled trip accepted — driver goes back to online, stays available
                  toast({ title: "📅 Scheduled Ride Accepted!", description: `You'll be notified 10 minutes before pickup at ${currentTrip.scheduled_at ? new Date(currentTrip.scheduled_at).toLocaleString() : "the scheduled time"}.` });
                  // Notify passenger via push
                  if (currentTrip.passenger_id) {
                    notifyTripAccepted(currentTrip.passenger_id, `${userProfile.first_name} ${userProfile.last_name}`, currentTrip.id);
                  }
                  // Send SMS to passenger
                  if (currentTrip.passenger_id) {
                    try {
                      const { data: pProfile } = await supabase.from("profiles").select("phone_number, country_code, first_name").eq("id", currentTrip.passenger_id).single();
                      if (pProfile?.phone_number) {
                        const phone = `${pProfile.country_code || "960"}${pProfile.phone_number}`;
                        supabase.functions.invoke("send-scheduled-sms", {
                          body: {
                            phone,
                            driver_name: `${userProfile.first_name} ${userProfile.last_name}`,
                            pickup: currentTrip.pickup_address,
                            dropoff: currentTrip.dropoff_address,
                            scheduled_at: currentTrip.scheduled_at,
                          },
                        }).catch(e => console.warn("Scheduled SMS failed:", e));
                      }
                    } catch (e) { console.warn("Failed to send scheduled SMS:", e); }
                  }
                  setScreen("online");
                  setCurrentTrip(null);
                  setPassengerProfile(null);
                }
              }} className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 text-white rounded-xl py-3 text-sm font-bold active:scale-95 transition-transform">
                  <CheckCircle className="w-4 h-4" />Accept
                </button>
              </div>
          </motion.div>
        </motion.div>
      }

      {/* Navigating - floating restore pill when hidden */}
      {screen === "navigating" && currentTrip && navPanelMinimized &&
      <button
        onClick={() => setNavPanelMinimized(false)}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[449] bg-primary text-primary-foreground px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 active:scale-95 transition-transform">

        <ChevronUp className="w-4 h-4" />
        <span className="text-xs font-bold">{driverTripPhase === "heading_to_pickup" ? "Heading to pickup" : driverTripPhase === "arrived" ? "At pickup" : "Trip in progress"}</span>
        <AnimatedTimer seconds={driverTripPhase === "in_progress" ? driverTripElapsed : driverTripPhase === "arrived" ? driverArrivedElapsed : driverPhaseElapsed} variant="badge" showIcon={false} className="bg-primary-foreground/20" />
      </button>
      }

      {/* Navigating */}
      {screen === "navigating" && currentTrip && !navPanelMinimized &&
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className={`absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] z-[450] flex flex-col landscape-panel max-h-[70vh] landscape-panel-trip-offset`}>
          <div className="px-4 pb-2 space-y-2">
            {/* Drag handle - tap to hide */}
            <button onClick={() => setNavPanelMinimized(true)} className="w-full flex justify-center pt-0.5 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </button>

            {/* Compact header: Status + Fare + Passenger inline */}
            <div className="bg-primary rounded-xl p-3 flex items-center gap-3">
              {/* Passenger avatar */}
              <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center text-sm font-bold text-primary-foreground overflow-hidden shrink-0">
                {passengerProfile?.avatar_url ?
              <img src={passengerProfile.avatar_url} alt="" className="w-full h-full object-cover" /> :
              currentTrip.customer_name ? currentTrip.customer_name[0] : passengerProfile ? `${passengerProfile.first_name?.[0] || ""}${passengerProfile.last_name?.[0] || ""}` : "?"
              }
              </div>
              {/* Name + status */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-primary-foreground truncate">
                  {currentTrip.customer_name || (passengerProfile ? `${passengerProfile.first_name} ${passengerProfile.last_name}` : "Passenger")}
                </p>
                <p className="text-[10px] text-primary-foreground/70">
                  {driverTripPhase === "heading_to_pickup" ? "Heading to pickup" : driverTripPhase === "arrived" ? "At pickup location" : "Trip in progress"}
                </p>
              </div>
              {/* Fare */}
              <div className="text-right shrink-0">
                <p className="text-lg font-bold text-primary-foreground leading-tight">{(currentTrip.estimated_fare ?? 0) + ((currentTrip as any).passenger_bonus || 0)}</p>
                <p className="text-[10px] text-primary-foreground/70">MVR{(currentTrip as any).passenger_bonus > 0 ? ` (+${(currentTrip as any).passenger_bonus})` : ""}</p>
              </div>
              {/* Minimize */}
              <button onClick={() => setNavPanelMinimized(true)} className="w-7 h-7 rounded-lg bg-primary-foreground/20 flex items-center justify-center active:scale-90 transition-transform shrink-0">
                <ChevronDown className="w-3.5 h-3.5 text-primary-foreground" />
              </button>
            </div>
            {/* Animated Timer Bar */}
            <div className="px-3 pb-3 flex justify-center">
              <AnimatedTimer
                seconds={driverTripPhase === "in_progress" ? driverTripElapsed : driverTripPhase === "arrived" ? driverArrivedElapsed : driverPhaseElapsed}
                label={driverTripPhase === "in_progress" ? "Trip" : driverTripPhase === "arrived" ? "Waiting" : "En route"}
                variant="badge"
              />
            </div>
          </div>

          <AnimatePresence>
            {!navPanelMinimized &&
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden flex-1 min-h-0">

                <div className="px-4 pb-3 space-y-2 overflow-y-auto max-h-[calc(70vh-10rem)]">
                  {/* Quick actions row */}
                  <div className="flex items-center gap-2">
                    {/* Call */}
                    <a href={`tel:${currentTrip.customer_phone ? `+960${currentTrip.customer_phone}` : passengerProfile?.phone_number ? `+${passengerProfile.country_code || "960"}${passengerProfile.phone_number}` : ""}`} className="flex-1 bg-primary/10 rounded-xl py-2.5 flex items-center justify-center gap-2 active:scale-95 transition-transform">
                      <Phone className="w-4 h-4 text-primary" />
                      <span className="text-xs font-semibold text-primary">Call</span>
                    </a>
                    {/* Chat */}
                    <button onClick={() => {setShowDriverChat(true);setUnreadDriverMessages(0);}} className="flex-1 bg-surface rounded-xl py-2.5 flex items-center justify-center gap-2 active:scale-95 transition-transform relative">
                      <MessageSquare className="w-4 h-4 text-foreground" />
                      <span className="text-xs font-semibold text-foreground">Chat</span>
                      {unreadDriverMessages > 0 &&
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-0.5">
                          {unreadDriverMessages}
                        </span>
                      }
                    </button>
                    {/* Stats pills */}
                    <div className="flex items-center gap-1.5 bg-surface rounded-xl px-3 py-2.5">
                      <Users className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-bold text-foreground">{currentTrip.passenger_count}</span>
                      <span className="text-muted-foreground/40">|</span>
                      <Luggage className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-bold text-foreground">{currentTrip.luggage_count}</span>
                    </div>
                    {/* Speedometer */}
                    <div className="bg-surface rounded-xl px-3 py-2.5 flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-bold text-foreground">{driverSpeed}</span>
                      <span className="text-[9px] text-muted-foreground">km/h</span>
                    </div>
                  </div>

                  {/* Navigation info — embedded in trip panel */}
                  {navStepData &&
              <div className="rounded-xl overflow-hidden border border-border/30">
                      <div className="bg-primary px-3 py-2 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center shrink-0">
                          <span className="text-sm font-black text-primary-foreground">
                            {(() => {
                        const m = navStepData.maneuver;
                        if (!m) return "↑";
                        if (m.includes("turn-left") || m === "left") return "↰";
                        if (m.includes("turn-right") || m === "right") return "↱";
                        if (m.includes("uturn")) return "↩";
                        if (m.includes("roundabout")) return "↻";
                        if (m.includes("merge") || m.includes("ramp")) return "↗";
                        return "↑";
                      })()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-primary-foreground leading-tight line-clamp-1">{navStepData.instruction}</p>
                          <p className="text-[10px] text-primary-foreground/70 font-medium">{navStepData.distance}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-bold text-primary-foreground">{navStepData.eta}</span>
                          <span className="text-[10px] text-primary-foreground/60">{navStepData.totalDistance}</span>
                        </div>
                      </div>
                      {navStepData.nextInstruction &&
                <div className="bg-surface px-3 py-1.5 flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground font-medium">Then</span>
                          <span className="text-xs font-bold text-foreground">
                            {(() => {
                      const m = navStepData.nextManeuver;
                      if (!m) return "↑";
                      if (m.includes("left")) return "↰";
                      if (m.includes("right")) return "↱";
                      return "↑";
                    })()}
                          </span>
                          <p className="text-[10px] text-foreground font-medium line-clamp-1 flex-1">{navStepData.nextInstruction}</p>
                          <span className="text-[10px] text-muted-foreground">{navStepData.nextDistance}</span>
                        </div>
                }
                    </div>
              }

                  {/* Route card */}
                  <div className="bg-surface rounded-xl p-3 space-y-0">
                    <div className="flex items-start gap-2.5">
                      <div className="flex flex-col items-center mt-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                        <div className="w-0.5 flex-1 min-h-[16px] bg-border" />
                        {tripStops.map((stop) =>
                    <div key={stop.id} className="flex flex-col items-center">
                            <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
                            {stop.completed_at && <span className="text-[8px] text-primary font-bold">✓</span>}
                            <div className="w-0.5 min-h-[16px] bg-border" />
                          </div>
                    )}
                        <MapPin className="w-3 h-3 text-destructive shrink-0" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground font-medium">Pickup</p>
                          <p className="text-xs font-semibold text-foreground truncate">{currentTrip.pickup_address}</p>
                        </div>
                        {tripStops.map((stop) =>
                    <div key={stop.id}>
                            <p className="text-[10px] text-muted-foreground font-medium">Stop {stop.stop_order}</p>
                            <p className="text-xs text-foreground truncate">{stop.address}</p>
                          </div>
                    )}
                        <div>
                          <p className="text-[10px] text-muted-foreground font-medium">Drop-off</p>
                          <p className="text-xs font-semibold text-foreground truncate">{currentTrip.dropoff_address}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
          }
          </AnimatePresence>

          {/* Sticky action button - always visible */}
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-2 border-t border-border/40 shrink-0 space-y-2">
            {/* Driver cancel trip button - hidden for dispatch trips */}
            {currentTrip?.dispatch_type !== "operator" && (
            <button
              onClick={() => setShowDriverCancelConfirm(true)}
              className="w-full flex items-center justify-center gap-1.5 text-destructive text-xs font-medium py-1.5 active:scale-95 transition-transform"
            >
              <X className="w-3.5 h-3.5" />
              Cancel Trip
            </button>
            )}
            {driverTripPhase === "heading_to_pickup" &&
          <button onClick={async () => {
            if (!currentTrip) return;
            const arrivedNow = new Date().toISOString();
            const { error: arrErr } = await supabase.from("trips").update({ status: "arrived", arrived_at: arrivedNow } as any).eq("id", currentTrip.id);
            if (arrErr) { console.error("Arrived update failed:", arrErr); await supabase.from("trips").update({ status: "arrived", arrived_at: arrivedNow } as any).eq("id", currentTrip.id); }
            setStoredTripTimer(currentTrip.id, "arrived_at", arrivedNow);
            setCurrentTrip({ ...currentTrip, status: "arrived", arrived_at: arrivedNow } as any);
            setDriverTripPhase("arrived");
            fetchSoundUrl("driver_sound_arrived").then(u => playSound(u));
            // Notify passenger that driver arrived
            if (currentTrip.passenger_id) {
              notifyDriverArrived(currentTrip.passenger_id, `${userProfile?.first_name} ${userProfile?.last_name}`, currentTrip.id);
            }
            toast({ title: "📍 Arrived", description: "Passenger has been notified" });
          }} className="w-full bg-accent text-accent-foreground font-semibold py-3.5 rounded-xl text-sm active:scale-[0.98] transition-transform">
                I've Arrived at Pickup
              </button>
          }

            {driverTripPhase === "arrived" &&
          <button onClick={async () => {
            if (!currentTrip) return;
            const now = new Date().toISOString();
            const { error: startErr } = await supabase.from("trips").update({ status: "in_progress", started_at: now, ...(currentTrip.booking_type === "hourly" ? { hourly_started_at: now } : {}) } as any).eq("id", currentTrip.id);
            if (startErr) { console.error("Start update failed:", startErr); await supabase.from("trips").update({ status: "in_progress", started_at: now } as any).eq("id", currentTrip.id); }
            setStoredTripTimer(currentTrip.id, "started_at", now);
            setCurrentTrip({ ...currentTrip, status: "in_progress", started_at: now } as any);
            setDriverTripPhase("in_progress");
            fetchSoundUrl("driver_sound_started").then(u => playSound(u));
            // Notify passenger that trip started
            if (currentTrip.passenger_id) {
              notifyTripStarted(currentTrip.passenger_id, currentTrip.id);
            }
            toast({ title: "🚗 Trip Started", description: "Navigate to destination" });
          }} className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl text-sm active:scale-[0.98] transition-transform">
                Start Trip
              </button>
          }

            {driverTripPhase === "in_progress" && currentTrip?.booking_type === "hourly" &&
          <div className="bg-primary/10 border border-primary/20 rounded-xl px-3 py-2 flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold text-foreground">Hourly trip — {currentTrip.estimated_fare ?? "—"} MVR/hr</p>
              </div>
          }

            {driverTripPhase === "in_progress" &&
          <SlideToConfirm
            label={currentTrip?.booking_type === "hourly" ? "Slide to End Trip" : "Slide to Complete"}
            onConfirm={async () => {
              if (!currentTrip || !userProfile?.id) return;
              const now = new Date().toISOString();
              let actualFare = (currentTrip.estimated_fare || 0) + ((currentTrip as any).passenger_bonus || 0);
              if (currentTrip.booking_type === "hourly") {
                const startedAt = (currentTrip as any).started_at || (currentTrip as any).accepted_at;
                if (startedAt) {
                  const hours = Math.max(1, (Date.now() - new Date(startedAt).getTime()) / 3600000);
                  actualFare = Math.round(hours * (currentTrip.estimated_fare || 0)) + ((currentTrip as any).passenger_bonus || 0);
                }
              }
              setCompletionFare(actualFare || 0);
              const tripPaymentMethod = (currentTrip as any).payment_method || "cash";
              if (tripPaymentMethod === "wallet") {
                // Wallet payment: auto-process
                const acceptedAt = (currentTrip as any).accepted_at;
                const calcDuration = acceptedAt ? Math.round((Date.now() - new Date(acceptedAt).getTime()) / 60000) : null;
                await supabase.from("trips").update({
                  status: "completed",
                  completed_at: now,
                  actual_fare: actualFare,
                  duration_minutes: calcDuration,
                  payment_confirmed_method: "wallet",
                  hourly_ended_at: currentTrip.booking_type === "hourly" ? now : null
                } as any).eq("id", currentTrip.id);
                await supabase.from("driver_locations").update({ is_on_trip: false, session_id: deviceSessionId.current } as any).eq("driver_id", userProfile.id);
                // Skip wallet operations for dispatch trips
                const isDispatchTrip = currentTrip.dispatch_type === "operator";
                if (!isDispatchTrip) {
                  // Deduct from passenger wallet, credit driver wallet
                  const passengerId = currentTrip.passenger_id;
                  if (passengerId && actualFare) {
                    // Deduct passenger
                    const { data: pWallet } = await supabase.from("wallets").select("id, balance").eq("user_id", passengerId).maybeSingle();
                    if (pWallet) {
                      await supabase.from("wallets").update({ balance: Math.max(0, Number(pWallet.balance) - actualFare), updated_at: now } as any).eq("id", pWallet.id);
                      await supabase.from("wallet_transactions").insert({ wallet_id: pWallet.id, user_id: passengerId, amount: actualFare, type: "debit", reason: "Trip fare", trip_id: currentTrip.id } as any);
                    }
                    // Credit driver
                    let dWallet = (await supabase.from("wallets").select("id, balance").eq("user_id", userProfile.id).maybeSingle()).data;
                    if (!dWallet) {
                      const { data: newW } = await supabase.from("wallets").insert({ user_id: userProfile.id, balance: 0 } as any).select().single();
                      dWallet = newW;
                    }
                    if (dWallet) {
                      await supabase.from("wallets").update({ balance: Number(dWallet.balance) + actualFare, updated_at: now } as any).eq("id", dWallet.id);
                      await supabase.from("wallet_transactions").insert({ wallet_id: dWallet.id, user_id: userProfile.id, amount: actualFare, type: "credit", reason: "Trip earning", trip_id: currentTrip.id } as any);
                    }
                  }
                  await applyTripCashback(currentTrip.id, actualFare || 0, currentTrip.passenger_id);
                }
                // Notify passenger trip completed
                if (currentTrip.passenger_id) {
                  notifyTripCompleted(currentTrip.passenger_id, String(actualFare || 0), currentTrip.id);
                }
                setConfirmedPaymentMethod("wallet");
                setDriverTripPhase("heading_to_pickup");
                supabase.from("notification_sounds").select("file_url").eq("category", "driver_trip_completed").eq("is_default", true).eq("is_active", true).single().then(({ data: s }) => { if (s?.file_url) playSound(s.file_url); });
                updateCompetitionEntries(userProfile.id);
                setScreen("complete");
              } else {
                // Auto-complete with passenger's selected payment method (no driver confirmation needed)
                const tripPM = (currentTrip as any).payment_method || "cash";
                const acceptedAt2 = (currentTrip as any).accepted_at;
                const calcDuration2 = acceptedAt2 ? Math.round((Date.now() - new Date(acceptedAt2).getTime()) / 60000) : null;
                await supabase.from("trips").update({
                  status: "completed", completed_at: now, actual_fare: actualFare,
                  duration_minutes: calcDuration2,
                  payment_confirmed_method: tripPM,
                  hourly_ended_at: currentTrip.booking_type === "hourly" ? now : null
                } as any).eq("id", currentTrip.id);
                await supabase.from("driver_locations").update({ is_on_trip: false, session_id: deviceSessionId.current } as any).eq("driver_id", userProfile.id);
                if (currentTrip.dispatch_type !== "operator") {
                  await applyTripCashback(currentTrip.id, actualFare, currentTrip.passenger_id);
                }
                if (currentTrip.passenger_id) notifyTripCompleted(currentTrip.passenger_id, String(actualFare), currentTrip.id);
                setConfirmedPaymentMethod(tripPM);
                setDriverTripPhase("heading_to_pickup");
                supabase.from("notification_sounds").select("file_url").eq("category", "driver_trip_completed").eq("is_default", true).eq("is_active", true).single().then(({ data: s }) => { if (s?.file_url) playSound(s.file_url); });
                updateCompetitionEntries(userProfile.id);
                setScreen("complete");
              }
            }} />

          }
          </div>
        </motion.div>
      }

      {/* Driver Cancel Confirmation Popup */}
      <AnimatePresence>
        {showDriverCancelConfirm && (
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
                  <AlertTriangle className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Cancel this trip?</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  The passenger will be notified immediately. This action cannot be undone.
                </p>
              </div>
              <div className="px-6 pb-6 space-y-3">
                <button
                  onClick={async () => {
                    if (!currentTrip || !userProfile?.id) return;
                    setShowDriverCancelConfirm(false);
                    await supabase.from("trips").update({
                      status: "cancelled",
                      cancel_reason: "Cancelled by driver",
                      cancelled_at: new Date().toISOString(),
                    }).eq("id", currentTrip.id);
                    await supabase.from("driver_locations").update({ is_on_trip: false, session_id: deviceSessionId.current } as any).eq("driver_id", userProfile.id);
                    // Notify the passenger about cancellation
                    if (currentTrip.passenger_id) {
                      notifyTripCancelled([currentTrip.passenger_id], "driver", currentTrip.id);
                    }
                    toast({ title: "Trip Cancelled", description: "The trip has been cancelled." });
                    setScreen("online");
                    setCurrentTrip(null);
                    setPassengerProfile(null);
                    setDriverTripPhase("heading_to_pickup");
                  }}
                  className="w-full py-4 bg-destructive text-destructive-foreground rounded-2xl text-base font-bold active:scale-95 transition-transform"
                >
                  Yes, Cancel Trip
                </button>
                <button
                  onClick={() => setShowDriverCancelConfirm(false)}
                  className="w-full py-3 text-sm font-medium text-muted-foreground hover:text-foreground rounded-2xl transition-colors"
                >
                  Go back
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancelled by Passenger Popup */}
      <AnimatePresence>
        {showCancelledByPassengerPopup && (
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
                  <X className="w-8 h-8 text-destructive" />
                </motion.div>
                <h3 className="text-lg font-bold text-foreground">Trip Cancelled</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {cancelledTripReason}
                </p>
              </div>
              <div className="px-6 pb-6">
                <button
                  onClick={() => setShowCancelledByPassengerPopup(false)}
                  className="w-full py-4 bg-primary text-primary-foreground rounded-2xl text-base font-bold active:scale-95 transition-transform"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Driver Chat */}
      {currentTrip &&
      <TripChat
        tripId={currentTrip.id}
        senderId={userProfile?.id}
        senderName={`${userProfile?.first_name || ""} ${userProfile?.last_name || ""}`.trim()}
        recipientId={currentTrip.passenger_id || undefined}
        senderType="driver"
        isOpen={showDriverChat}
        onClose={() => setShowDriverChat(false)} />

      }

      {/* Complete */}
      {screen === "complete" &&
      <DriverCompleteScreen
        completionFare={completionFare}
        currentTrip={currentTrip}
        confirmedPaymentMethod={confirmedPaymentMethod}
        passengerProfile={passengerProfile}
        userProfile={userProfile}
        onContinue={() => {
          setScreen("online");
          setCurrentTrip(null);
          setPassengerProfile(null);
          refreshDriverStats();
        }} />

      }

      {/* Profile Panel */}
      <AnimatePresence>
        {showProfile &&
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[600] flex items-end justify-center landscape-profile-overlay bg-foreground/50 backdrop-blur-sm" onClick={() => setShowProfile(false)}>
            <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col landscape-panel"
            onClick={(e) => e.stopPropagation()}>

              {/* Sticky header with handle + close */}
              <div className="sticky top-0 z-10 bg-card px-4 pt-3 pb-2 flex items-center justify-between border-b border-border/30 shrink-0">
                <div className="w-8" />
                <div className="w-10 h-1 rounded-full bg-border" />
                <button onClick={() => setShowProfile(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform">
                  <X className="w-4 h-4 text-foreground" />
                </button>
              </div>

              <div id="profile-scroll-area" className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>

                {/* Avatar + Name */}
                <div className="flex items-center gap-4">
                  <button onClick={() => triggerUpload("avatar")} className="relative w-18 h-18 shrink-0">
                    <div className="w-[72px] h-[72px] rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden">
                      {avatarUrl ?
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> :

                    <span className="text-2xl font-bold text-primary">{initials}</span>
                    }
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md">
                      <Camera className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                    {uploading === "avatar" && <div className="absolute inset-0 bg-foreground/30 rounded-2xl flex items-center justify-center"><div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /></div>}
                  </button>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{userProfile?.first_name} {userProfile?.last_name}</h3>
                    <p className="text-sm text-muted-foreground">Driver</p>
                    {vehicleInfo && <p className="text-xs text-muted-foreground mt-0.5">{vehicleInfo.make} {vehicleInfo.model} • {vehicleInfo.plate_number}</p>}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar bg-surface/60 rounded-2xl p-1.5 -mx-1">
                  {([
                { key: "info", label: "Info", icon: User },
                { key: "documents", label: "Docs", icon: IdCard },
                { key: "vehicles", label: "Vehicles", icon: Car },
                { key: "banks", label: "Banks", icon: Landmark },
                { key: "wallets", label: "Wallets", icon: Wallet },
                { key: "sounds", label: "Sounds", icon: Volume2 },
                { key: "billing", label: "Billing", icon: DollarSign },
                { key: "settings", label: "Settings", icon: Settings }] as
                const).map(({ key, label, icon: Icon }) =>
                <button
                  key={key}
                  onClick={() => { setProfileTab(key); const sc = document.getElementById('profile-scroll-area'); if (sc) sc.scrollTop = 0; }}
                  className={`flex flex-col items-center gap-1 min-w-[52px] py-2 px-2.5 rounded-xl text-[10px] font-semibold transition-all shrink-0 ${
                  profileTab === key ?
                  "bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-[1.02]" :
                  "text-muted-foreground hover:text-foreground hover:bg-card/50"}`
                  }>

                      <Icon className={`w-4 h-4 ${profileTab === key ? "" : "opacity-70"}`} />
                      {label}
                    </button>
                )}
                </div>

                {/* Tab Content */}
                {profileTab === "info" &&
              <div className="space-y-3">
                    {profileStatus === "Rejected" &&
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  className="relative overflow-hidden rounded-xl border border-destructive/20">
                        <div className="h-1 bg-gradient-to-r from-destructive via-destructive/60 to-destructive/30" />
                        <div className="bg-destructive/5 px-4 py-3 flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                            <XCircle className="w-4 h-4 text-destructive" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-bold text-destructive">Profile Rejected</p>
                            {profileRejectionReason && (
                              <p className="text-[11px] text-destructive/80 mt-0.5 italic">"{profileRejectionReason}"</p>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-1">Update your info below and save to resubmit.</p>
                          </div>
                        </div>
                      </motion.div>
                }
                    {profileStatus === "Pending Review" &&
                <div className="bg-yellow-100 text-yellow-800 rounded-xl px-4 py-2.5 text-xs font-medium flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        Your profile changes are pending admin approval
                      </div>
                }
                    {!editingProfile ?
                <>
                        <div className="bg-surface rounded-xl divide-y divide-border">
                          {[
                    { label: "First Name", value: userProfile?.first_name || "—" },
                    { label: "Last Name", value: userProfile?.last_name || "—" },
                    { label: "Phone", value: `+960 ${userProfile?.phone_number || "—"}` },
                    { label: "Email", value: userProfile?.email || "Not set" },
                    { label: "Gender", value: userProfile?.gender === "1" ? "Male" : userProfile?.gender === "2" ? "Female" : userProfile?.gender || "—" },
                    { label: "Company", value: companyInfo?.name || "No company" },
                    { label: "Status", value: userProfile?.status || "—" }].
                    map((item) =>
                    <div key={item.label} className="flex items-center justify-between px-4 py-3">
                              <span className="text-sm text-muted-foreground">{item.label}</span>
                              <span className="text-sm font-medium text-foreground">{item.value}</span>
                            </div>
                    )}
                        </div>
                        <button
                    onClick={() => {
                      setEditForm({
                        first_name: userProfile?.first_name || "",
                        last_name: userProfile?.last_name || "",
                        email: userProfile?.email || "",
                        phone_number: userProfile?.phone_number || "",
                        gender: userProfile?.gender || "1"
                      });
                      setEditingProfile(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-primary/10 text-primary font-semibold py-2.5 rounded-xl text-sm active:scale-[0.98] transition-transform">

                          <Pencil className="w-4 h-4" />
                          Edit Profile
                        </button>
                      </> :

                <div className="space-y-3">
                        <div className="bg-surface rounded-xl p-3 space-y-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">First Name</label>
                            <input value={editForm.first_name} onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Last Name</label>
                            <input value={editForm.last_name} onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm text-muted-foreground bg-card border border-border rounded-lg px-3 py-2">+960</span>
                              <input value={editForm.phone_number} onChange={(e) => setEditForm((f) => ({ ...f, phone_number: e.target.value.replace(/\D/g, "").slice(0, 7) }))} className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Email</label>
                            <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} placeholder="driver@example.com" className="w-full mt-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Gender</label>
                            <select value={editForm.gender} onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                              <option value="1">Male</option>
                              <option value="2">Female</option>
                            </select>
                          </div>
                        </div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2.5 text-xs text-yellow-700">
                          ⚠️ Saving changes will set your profile to <strong>Pending Review</strong>. You won't be able to go online until an admin approves.
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingProfile(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-surface text-foreground">Cancel</button>
                          <button
                      disabled={savingProfile}
                      onClick={async () => {
                        if (!userProfile?.id || !editForm.first_name.trim() || !editForm.last_name.trim() || !editForm.phone_number.trim()) {
                          toast({ title: "Please fill all required fields", variant: "destructive" });
                          return;
                        }
                        setSavingProfile(true);
                        const { error } = await supabase.from("profiles").update({
                          first_name: editForm.first_name.trim(),
                          last_name: editForm.last_name.trim(),
                          phone_number: editForm.phone_number.trim(),
                          email: editForm.email.trim() || null,
                          gender: editForm.gender,
                          status: "Pending Review",
                          rejection_reason: null
                        } as any).eq("id", userProfile.id);
                        setSavingProfile(false);
                        if (error) {
                          toast({ title: "Error", description: error.message, variant: "destructive" });
                        } else {
                          toast({ title: "Profile updated", description: "Awaiting admin approval" });
                          setProfileStatus("Pending Review");
                          setProfileRejectionReason("");
                          setEditingProfile(false);
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50">

                            <Save className="w-4 h-4" />
                            {savingProfile ? "Saving..." : "Save & Submit"}
                          </button>
                        </div>
                      </div>
                }
                  </div>
              }

                {profileTab === "documents" &&
              <div className="space-y-3">
                    {profileStatus === "Rejected" &&
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  className="relative overflow-hidden rounded-xl border border-destructive/20">
                        <div className="h-1 bg-gradient-to-r from-destructive via-destructive/60 to-destructive/30" />
                        <div className="bg-destructive/5 px-4 py-3 flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                            <Upload className="w-4 h-4 text-destructive" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-bold text-destructive">Documents Need Re-upload</p>
                            {profileRejectionReason && (
                              <p className="text-[11px] text-destructive/80 mt-0.5 italic">"{profileRejectionReason}"</p>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-1">Tap on any document below to re-upload it.</p>
                          </div>
                        </div>
                      </motion.div>
                }
                    {profileStatus === "Pending Review" &&
                <div className="bg-yellow-100 text-yellow-800 rounded-xl px-4 py-2.5 text-xs font-medium flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        Documents pending admin approval
                      </div>
                }
                    {/* ID Card */}
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ID Card</p>
                    <div className="grid grid-cols-2 gap-2">
                      <DocumentUpload label="Front" url={idCardFrontUrl} uploading={uploading === "id_front"} onUpload={() => triggerUpload("id_front")} />
                      <DocumentUpload label="Back" url={idCardBackUrl} uploading={uploading === "id_back"} onUpload={() => triggerUpload("id_back")} />
                    </div>
                    {/* License */}
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Driving License</p>
                    <div className="grid grid-cols-2 gap-2">
                      <DocumentUpload label="Front" url={licenseFrontUrl} uploading={uploading === "license_front"} onUpload={() => triggerUpload("license_front")} />
                      <DocumentUpload label="Back" url={licenseBackUrl} uploading={uploading === "license_back"} onUpload={() => triggerUpload("license_back")} />
                    </div>
                    {/* Taxi Permit (optional) */}
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Taxi Permit <span className="text-[10px] font-normal normal-case">(optional)</span></p>
                    <div className="grid grid-cols-2 gap-2">
                      <DocumentUpload label="Front" url={taxiPermitFrontUrl} uploading={uploading === "taxi_permit_front"} onUpload={() => triggerUpload("taxi_permit_front")} />
                      <DocumentUpload label="Back" url={taxiPermitBackUrl} uploading={uploading === "taxi_permit_back"} onUpload={() => triggerUpload("taxi_permit_back")} />
                    </div>

                    {(!idCardFrontUrl || !idCardBackUrl || !licenseFrontUrl || !licenseBackUrl) && (
                      <p className="text-[11px] text-muted-foreground">
                        Upload ID and license front/back, then tap submit once.
                      </p>
                    )}

                    <button
                      onClick={submitProfileDocuments}
                      disabled={
                        profileStatus === "Pending Review" ||
                        submittingProfileDocs ||
                        !!uploading ||
                        !idCardFrontUrl ||
                        !idCardBackUrl ||
                        !licenseFrontUrl ||
                        !licenseBackUrl
                      }
                      className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-transform"
                    >
                      {submittingProfileDocs ? "Submitting..." : profileStatus === "Pending Review" ? "Already Submitted" : "Submit Profile Documents"}
                    </button>
                  </div>
              }

                {profileTab === "banks" &&
              <div className="space-y-3">
                    {bankAccounts.length === 0 && !showAddBank &&
                <div className="text-center py-6">
                        <Landmark className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No bank accounts added yet</p>
                      </div>
                }
                    {bankAccounts.map((bank) =>
                <div key={bank.id} className="bg-surface rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {(() => {
                        const bankInfo = availableBanks.find((b) => b.name === bank.bank_name);
                        return bankInfo?.logo_url ?
                        <img src={bankInfo.logo_url} alt={bank.bank_name} className="w-6 h-6 rounded object-contain" /> :

                        <CreditCard className="w-4 h-4 text-primary" />;

                      })()}
                            <span className="text-sm font-semibold text-foreground">{bank.bank_name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {bank.is_primary &&
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Primary</span>
                      }
                            <button onClick={() => deleteBankAccount(bank.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>Account: <span className="font-medium text-foreground">{bank.account_number}</span></p>
                          {bank.account_name && <p>Name: <span className="font-medium text-foreground">{bank.account_name}</span></p>}
                        </div>
                        {!bank.is_primary &&
                  <button onClick={() => setPrimaryBank(bank.id)} className="text-xs text-primary font-semibold">Set as primary</button>
                  }
                      </div>
                )}

                    {showAddBank ?
                <div className="bg-surface rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-foreground">Add bank account</p>
                        <div className="relative">
                          <select
                      value={newBank.bank_name}
                      onChange={(e) => setNewBank({ ...newBank, bank_name: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary appearance-none">

                            <option value="">Select bank</option>
                            {availableBanks.map((bank) =>
                      <option key={bank.id} value={bank.name}>{bank.name}</option>
                      )}
                          </select>
                          {newBank.bank_name && (() => {
                      const selected = availableBanks.find((b) => b.name === newBank.bank_name);
                      return selected?.logo_url ?
                      <img src={selected.logo_url} alt="" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded object-contain" /> :
                      null;
                    })()}
                        </div>
                        <input
                    placeholder="Account number"
                    value={newBank.account_number}
                    onChange={(e) => setNewBank({ ...newBank, account_number: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />

                        <input
                    placeholder="Account name (optional)"
                    value={newBank.account_name}
                    onChange={(e) => setNewBank({ ...newBank, account_name: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />

                        <div className="flex gap-2">
                          <button onClick={() => setShowAddBank(false)} className="flex-1 py-2.5 rounded-xl bg-card text-sm font-semibold text-foreground active:scale-95 transition-transform">Cancel</button>
                          <button onClick={addBankAccount} disabled={!newBank.bank_name || !newBank.account_number} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-95 transition-transform">Add</button>
                        </div>
                      </div> :

                <button onClick={() => setShowAddBank(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground active:scale-95 transition-transform">
                        <Plus className="w-4 h-4" />Add bank account
                      </button>
                }
                  </div>
              }

                {profileTab === "wallets" &&
              <div className="space-y-4">
                    {/* HDA Wallet */}
                    <DriverWallet
                  driverId={userProfile.id}
                  walletId={driverWalletId}
                  balance={driverWalletBalance}
                  onRequestWithdraw={() => setShowWithdrawModal(true)}
                  minWithdrawalAmount={minWithdrawalAmount} />

                    {/* Favara Section */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        {favaraLogoUrl ? <img src={favaraLogoUrl} alt="Favara" className="w-4 h-4 rounded object-contain" /> : <Wallet className="w-3.5 h-3.5" />}
                        Favara
                      </p>
                    {favaraAccounts.length === 0 && !showAddFavara &&
                <div className="text-center py-4 bg-surface rounded-xl">
                        <p className="text-xs text-muted-foreground">No Favara accounts added</p>
                      </div>
                }
                    {favaraAccounts.map((favara) =>
                <div key={favara.id} className="bg-surface rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {favaraLogoUrl ?
                      <img src={favaraLogoUrl} alt="Favara" className="w-6 h-6 rounded object-contain" /> :
                      <Wallet className="w-4 h-4 text-primary" />}
                            <span className="text-sm font-semibold text-foreground">Favara</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {favara.is_primary &&
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Primary</span>}
                            <button onClick={() => deleteFavaraAccount(favara.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>ID: <span className="font-medium text-foreground font-mono">{favara.favara_id}</span></p>
                          {favara.favara_name && <p>Name: <span className="font-medium text-foreground">{favara.favara_name}</span></p>}
                        </div>
                        {!favara.is_primary &&
                  <button onClick={() => setPrimaryFavara(favara.id)} className="text-xs text-primary font-semibold">Set as primary</button>}
                      </div>
                )}
                    {showAddFavara ?
                <div className="bg-surface rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-foreground">Add Favara account</p>
                        <input
                    placeholder="Favara ID (phone / ID card / account)"
                    value={newFavara.favara_id}
                    onChange={(e) => setNewFavara({ ...newFavara, favara_id: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                        <input
                    placeholder="Account name (optional)"
                    value={newFavara.favara_name}
                    onChange={(e) => setNewFavara({ ...newFavara, favara_name: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                        <div className="flex gap-2">
                          <button onClick={() => setShowAddFavara(false)} className="flex-1 py-2.5 rounded-xl bg-card text-sm font-semibold text-foreground active:scale-95 transition-transform">Cancel</button>
                          <button onClick={addFavaraAccount} disabled={!newFavara.favara_id} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-95 transition-transform">Add</button>
                        </div>
                      </div> :
                <button onClick={() => setShowAddFavara(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-border text-xs font-semibold text-muted-foreground active:scale-95 transition-transform">
                        <Plus className="w-3.5 h-3.5" />Add Favara
                      </button>}
                    </div>

                    <div className="border-t border-border" />

                    {/* Swipe Section */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        {swipeLogoUrl ? <img src={swipeLogoUrl} alt="Swipe" className="w-4 h-4 rounded object-contain" /> : <Wallet className="w-3.5 h-3.5" />}
                        Swipe
                      </p>
                    {swipeAccounts.length === 0 && !showAddSwipe &&
                <div className="text-center py-4 bg-surface rounded-xl">
                        <p className="text-xs text-muted-foreground">No Swipe accounts added</p>
                      </div>
                }
                    {swipeAccounts.map((swipe) =>
                <div key={swipe.id} className="bg-surface rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {swipeLogoUrl ?
                      <img src={swipeLogoUrl} alt="Swipe" className="w-6 h-6 rounded object-contain" /> :
                      <Wallet className="w-4 h-4 text-primary" />}
                            <span className="text-sm font-semibold text-foreground">Swipe</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {swipe.is_primary &&
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Primary</span>}
                            <button onClick={() => deleteSwipeAccount(swipe.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>Username: <span className="font-medium text-foreground font-mono">{swipe.swipe_username}</span></p>
                          {swipe.swipe_name && <p>Name: <span className="font-medium text-foreground">{swipe.swipe_name}</span></p>}
                        </div>
                        {!swipe.is_primary &&
                  <button onClick={() => setPrimarySwipe(swipe.id)} className="text-xs text-primary font-semibold">Set as primary</button>}
                      </div>
                )}
                    {showAddSwipe ?
                <div className="bg-surface rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-foreground">Add Swipe account</p>
                        <input
                    placeholder="Swipe username"
                    value={newSwipe.swipe_username}
                    onChange={(e) => setNewSwipe({ ...newSwipe, swipe_username: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                        <input
                    placeholder="Account name (optional)"
                    value={newSwipe.swipe_name}
                    onChange={(e) => setNewSwipe({ ...newSwipe, swipe_name: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                        <div className="flex gap-2">
                          <button onClick={() => setShowAddSwipe(false)} className="flex-1 py-2.5 rounded-xl bg-card text-sm font-semibold text-foreground active:scale-95 transition-transform">Cancel</button>
                          <button onClick={addSwipeAccount} disabled={!newSwipe.swipe_username} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-95 transition-transform">Add</button>
                        </div>
                      </div> :
                <button onClick={() => setShowAddSwipe(true)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-border text-xs font-semibold text-muted-foreground active:scale-95 transition-transform">
                        <Plus className="w-3.5 h-3.5" />Add Swipe
                      </button>}
                    </div>
                  </div>
              }

                {profileTab === "vehicles" &&
              <div className="space-y-3">
                    {driverVehicles.length === 0 && !showAddVehicle &&
                <div className="text-center py-6">
                        <Car className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No vehicles added yet</p>
                      </div>
                }
                    {driverVehicles.map((v) => {
                  const vType = vehicleTypes.find((vt) => vt.id === v.vehicle_type_id);
                  const isSelected = selectedVehicleId === v.id;
                  const isEditing = editingVehicleId === v.id;
                  const vStatus = v.vehicle_status || "approved";
                  const isPending = vStatus === "pending";
                  const isRejected = vStatus === "rejected";
                  const hasAllVehicleDocs = !!(v.registration_url && v.insurance_url && v.image_url);
                  const isUploadingVehicleDocs = !!uploading && uploading.endsWith(v.id) && uploading.startsWith("vehicle_");
                  const isSubmittingVehicleDocs = !!submittingVehicleDocsById[v.id];
                  return (
                    <div
                      key={v.id}
                      className={`relative rounded-2xl overflow-hidden transition-all ${
                      isSelected ?
                      "bg-primary/5 ring-2 ring-primary shadow-md" :
                      "bg-surface hover:bg-card"}`
                      }>
                          {/* Status strip */}
                          {isSelected && !isPending && !isRejected &&
                      <div className="absolute top-0 left-0 right-0 h-1 bg-primary rounded-t-2xl" />}
                          {isPending &&
                      <div className="absolute top-0 left-0 right-0 h-1 bg-yellow-500 rounded-t-2xl" />}
                          {isRejected &&
                      <div className="absolute top-0 left-0 right-0 h-1 bg-destructive rounded-t-2xl" />}

                          <div className="p-4">
                            {/* Top row: image + info + actions */}
                            <div className="flex items-start gap-3">
                              <div className={`w-16 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-primary/10" : "bg-card"}`}>
                                {v.image_url ?
                            <img src={v.image_url} alt="Vehicle" className="w-14 h-10 object-cover rounded-lg" /> :
                            vType?.image_url ?
                            <img src={vType.image_url} alt={vType.name} className="w-14 h-10 object-contain" /> :
                            <Car className="w-6 h-6 text-muted-foreground" />}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-bold text-foreground truncate">
                                    {v.make} {v.model}
                                  </h4>
                                  {isPending &&
                              <span className="shrink-0 text-[10px] font-bold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                                      Pending
                                    </span>}
                                  {isRejected &&
                              <span className="shrink-0 text-[10px] font-bold text-white bg-destructive px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                                      <XCircle className="w-3 h-3" />
                                      Rejected
                                    </span>}
                                  {isSelected && !isPending && !isRejected &&
                              <span className="shrink-0 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                      Active
                                    </span>}
                                </div>
                                {isRejected && v.rejection_reason &&
                            <div className="mt-2 bg-destructive/5 border border-destructive/15 rounded-lg px-3 py-2">
                                    <p className="text-[11px] text-destructive font-medium flex items-start gap-1.5">
                                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                      <span className="italic">"{v.rejection_reason}"</span>
                                    </p>
                                    <p className="text-[10px] text-muted-foreground mt-1 ml-5">Re-upload documents below to resubmit.</p>
                                  </div>
                            }
                                <p className="text-xs text-muted-foreground mt-0.5">{vType?.name || "Unknown type"}</p>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => isEditing ? setEditingVehicleId(null) : startEditVehicle(v)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteVehicle(v.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Tags row */}
                            <div className="flex items-center gap-2 mt-3">
                              <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-lg text-xs font-semibold text-foreground">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                {v.plate_number}
                              </span>
                              {v.color &&
                          <span className="bg-card px-2.5 py-1 rounded-lg text-xs text-muted-foreground">
                                  {v.color}
                                </span>}
                            </div>

                            {/* Document upload buttons */}
                            <div className="grid grid-cols-3 gap-2 mt-3">
                              {[
                          { key: "vehicle_registration_" + v.id, field: "registration_url", label: "Registration" },
                          { key: "vehicle_insurance_" + v.id, field: "insurance_url", label: "Insurance" },
                          { key: "vehicle_image_" + v.id, field: "image_url", label: "Photo" }].
                          map(({ key, field, label }) =>
                          <button key={key} onClick={() => triggerUpload(key)}
                          disabled={uploading === key}
                          className="flex flex-col items-center gap-1 p-2 rounded-xl bg-card border border-border/50 active:scale-95 transition-all">
                                  {v[field] ?
                            <img src={v[field]} alt={label} className="w-10 h-7 object-cover rounded" /> :

                            <div className="w-10 h-7 rounded bg-muted flex items-center justify-center">
                                      <Upload className="w-3 h-3 text-muted-foreground" />
                                    </div>
                            }
                                  <span className="text-[9px] text-muted-foreground font-medium">
                                    {uploading === key ? "..." : label}
                                  </span>
                                </button>
                          )}
                            </div>

                            {!hasAllVehicleDocs && (
                              <p className="text-[11px] text-muted-foreground mt-2">Upload all 3 vehicle documents, then submit once.</p>
                            )}

                            <button
                              onClick={() => submitVehicleDocuments(v)}
                              disabled={isPending || !hasAllVehicleDocs || isUploadingVehicleDocs || isSubmittingVehicleDocs}
                              className="w-full mt-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
                            >
                              {isSubmittingVehicleDocs ? "Submitting..." : isPending ? "Already Submitted" : "Submit Vehicle Documents"}
                            </button>

                            {/* Edit form */}
                            {isEditing &&
                        <div className="mt-3 space-y-2 bg-card rounded-xl p-3 border border-border">
                                <select value={editVehicle.vehicle_type_id} onChange={(e) => setEditVehicle({ ...editVehicle, vehicle_type_id: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary appearance-none">
                                  <option value="">Select type</option>
                                  {vehicleTypes.map((vt) => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
                                </select>
                                <input placeholder="Plate number *" value={editVehicle.plate_number} onChange={(e) => setEditVehicle({ ...editVehicle, plate_number: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-surface text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                                <div className="grid grid-cols-2 gap-2">
                                  <input placeholder="Make" value={editVehicle.make} onChange={(e) => setEditVehicle({ ...editVehicle, make: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl bg-surface text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                                  <input placeholder="Model" value={editVehicle.model} onChange={(e) => setEditVehicle({ ...editVehicle, model: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl bg-surface text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                                </div>
                                <input placeholder="Color" value={editVehicle.color} onChange={(e) => setEditVehicle({ ...editVehicle, color: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl bg-surface text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                                <div className="flex gap-2">
                                  <button onClick={() => setEditingVehicleId(null)} className="flex-1 py-2 rounded-xl bg-surface text-sm font-semibold text-foreground active:scale-95">Cancel</button>
                                  <button onClick={saveEditVehicle} disabled={!editVehicle.plate_number || !editVehicle.vehicle_type_id}
                            className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-95">Save</button>
                                </div>
                              </div>
                        }

                            {/* Select button (only for non-selected approved vehicles) */}
                            {!isSelected && !isPending && !isRejected &&
                        <button onClick={() => selectVehicle(v)}
                        className="w-full mt-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold active:scale-[0.98] transition-transform">
                                Use this vehicle
                              </button>}
                            {isPending && !isEditing &&
                        <p className="text-[11px] text-yellow-600 mt-3 text-center font-medium">⏳ Awaiting admin approval</p>}
                            {isRejected && !isEditing &&
                        <p className="text-[11px] text-destructive mt-3 text-center font-medium">Edit vehicle details and resubmit</p>}
                          </div>
                        </div>);

                })}


                    {showAddVehicle ?
                <div className="bg-surface rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-foreground">Add vehicle</p>
                        <select
                    value={newVehicle.vehicle_type_id}
                    onChange={(e) => setNewVehicle({ ...newVehicle, vehicle_type_id: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary appearance-none">

                          <option value="">Select type (Car, Cycle, etc.)</option>
                          {vehicleTypes.map((vt) =>
                    <option key={vt.id} value={vt.id}>{vt.name}</option>
                    )}
                        </select>
                        <input placeholder="Plate number *" value={newVehicle.plate_number} onChange={(e) => setNewVehicle({ ...newVehicle, plate_number: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                        <div className="grid grid-cols-2 gap-2">
                          <input placeholder="Make" value={newVehicle.make} onChange={(e) => setNewVehicle({ ...newVehicle, make: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                          <input placeholder="Model" value={newVehicle.model} onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <input placeholder="Color" value={newVehicle.color} onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                        <div className="flex gap-2">
                          <button onClick={() => setShowAddVehicle(false)} className="flex-1 py-2.5 rounded-xl bg-card text-sm font-semibold text-foreground active:scale-95 transition-transform">Cancel</button>
                          <button onClick={addVehicle} disabled={!newVehicle.plate_number || !newVehicle.vehicle_type_id} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-95 transition-transform">Add</button>
                        </div>
                      </div> :

                <button onClick={() => setShowAddVehicle(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground active:scale-95 transition-transform">
                        <Plus className="w-4 h-4" />Add vehicle
                      </button>
                }

                    {/* Ride Types per Vehicle */}
                    <RideTypesTab
                      userId={userProfile?.id}
                      vehicleTypes={vehicleTypes}
                      vehicles={driverVehicles}
                    />
                  </div>
              }

                

                {profileTab === "sounds" &&
              <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trip Request Sound</p>
                    <p className="text-xs text-muted-foreground">Choose the sound you hear when a new trip request arrives</p>
                    {availableSounds.length === 0 ?
                <div className="text-center py-6">
                        <Volume2 className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No sounds available yet</p>
                        <p className="text-xs text-muted-foreground">Admin needs to upload sounds first</p>
                      </div> :

                <div className="space-y-2">
                        {availableSounds.map((sound) =>
                  <div
                    key={sound.id}
                    className={`bg-surface rounded-xl p-3 flex items-center gap-3 transition-all ${
                    selectedSoundId === sound.id ? "ring-2 ring-primary" : ""}`
                    }>

                            <button
                      onClick={() => {
                        if (previewSoundId === sound.id) {
                          previewAudioRef.current?.pause();
                          setPreviewSoundId(null);
                        } else {
                          if (previewAudioRef.current) previewAudioRef.current.pause();
                          previewAudioRef.current = new Audio(sound.file_url);
                          previewAudioRef.current.onended = () => setPreviewSoundId(null);
                          previewAudioRef.current.play().catch(() => {});
                          setPreviewSoundId(sound.id);
                        }
                      }}
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${
                      previewSoundId === sound.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`
                      }>

                              {previewSoundId === sound.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{sound.name}</p>
                              {sound.is_default && <span className="text-[10px] text-primary font-bold">★ Default</span>}
                            </div>
                            {selectedSoundId === sound.id ?
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">Selected</span> :

                    <button
                      onClick={async () => {
                        setSelectedSoundId(sound.id);
                        setTripRequestSoundUrl(sound.file_url);
                        if (userProfile?.id) {
                          await supabase.from("profiles").update({ trip_sound_id: sound.id } as any).eq("id", userProfile.id);
                        }
                        toast({ title: "Sound selected", description: sound.name });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold active:scale-95 transition-transform">

                                Use this
                              </button>
                    }
                          </div>
                  )}
                      </div>
                }
                  </div>
              }

                {profileTab === "billing" &&
              <div className="space-y-3">



                    {/* Company info & discounts */}
                    {companyInfo ?
                <div className="bg-surface rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</p>
                        <div className="flex items-center gap-3">
                          {companyInfo.logo_url && <img src={companyInfo.logo_url} alt={companyInfo.name} className="w-10 h-10 rounded-lg object-contain" />}
                          <div>
                            <p className="text-sm font-semibold text-foreground">{companyInfo.name}</p>
                            {companyInfo.fee_free && <span className="text-xs text-primary font-semibold">Free</span>}
                          </div>
                        </div>
                        {companyInfo.discount_pct > 0 &&
                  <p className="text-xs text-muted-foreground">Discount: <span className="font-semibold text-primary">{companyInfo.discount_pct}%</span></p>
                  }
                        {companyInfo.monthly_fee > 0 &&
                  <p className="text-xs text-muted-foreground">Monthly fee: <span className="font-semibold text-foreground">{companyInfo.monthly_fee} MVR</span></p>
                  }
                      </div> :

                <div className="bg-surface rounded-xl p-3">
                        <p className="text-sm text-muted-foreground text-center">No company assigned</p>
                      </div>
                }

                    {/* Admin bank info for payment */}
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Account</p>
                    {adminBankInfo ?
                <div className="bg-surface rounded-xl p-3 space-y-2">
                        <p className="text-xs text-muted-foreground">Transfer your fees to the account below:</p>
                        <div className="bg-card rounded-xl divide-y divide-border">
                          {adminBankInfo.bank_name &&
                    <div className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs text-muted-foreground">Bank</span>
                              <span className="text-sm font-semibold text-foreground">{adminBankInfo.bank_name}</span>
                            </div>
                    }
                          {adminBankInfo.account_number &&
                    <div className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs text-muted-foreground">Account</span>
                              <button
                        onClick={() => {
                          navigator.clipboard.writeText(adminBankInfo.account_number);
                          toast({ title: "Copied!", description: "Account number copied to clipboard" });
                        }}
                        className="text-sm font-semibold text-primary flex items-center gap-1">

                                {adminBankInfo.account_number}
                                <CreditCard className="w-3.5 h-3.5" />
                              </button>
                            </div>
                    }
                          {adminBankInfo.account_name &&
                    <div className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs text-muted-foreground">Name</span>
                              <span className="text-sm font-medium text-foreground">{adminBankInfo.account_name}</span>
                            </div>
                    }
                        </div>
                      </div> :

                <div className="bg-surface rounded-xl p-3">
                        <p className="text-sm text-muted-foreground text-center">No payment account configured</p>
                      </div>
                }

                    {/* Monthly fee info — based on vehicle type */}
                    <div className="bg-surface rounded-xl p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Monthly Fee</p>
                      {(() => {
                        const isFreeCompany = companyInfo?.fee_free;
                        const isFreePeriod = (userProfile as any)?.fee_free_until && new Date((userProfile as any).fee_free_until) > new Date();
                        
                        // Calculate total fee from all active vehicles' vehicle types
                        const vehicleFees = driverVehicles.map((v: any) => {
                          const vt = vehicleTypes.find((t: any) => t.id === v.vehicle_type_id);
                          return { plate: v.plate_number, typeName: vt?.name || "Unknown", fee: vt?.monthly_fee || 0 };
                        });
                        const totalFee = vehicleFees.reduce((sum: number, v: any) => sum + v.fee, 0);

                        if (isFreeCompany) {
                          return (
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">Status</span>
                              <span className="text-lg font-bold text-primary">FREE (Company)</span>
                            </div>
                          );
                        }
                        if (isFreePeriod) {
                          return (
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Status</span>
                                <span className="text-lg font-bold text-primary">FREE</span>
                              </div>
                              <p className="text-xs text-primary mt-1">Free until {new Date((userProfile as any).fee_free_until).toLocaleDateString()}</p>
                              <p className="text-xs text-muted-foreground mt-1">Normal fee would be {totalFee} MVR</p>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-2">
                            {vehicleFees.map((v: any, i: number) => (
                              <div key={i} className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">{v.plate} ({v.typeName})</span>
                                <span className="text-sm font-semibold text-foreground">{v.fee} MVR</span>
                              </div>
                            ))}
                            {vehicleFees.length > 1 && (
                              <div className="flex items-center justify-between border-t border-border pt-2">
                                <span className="text-sm font-semibold text-muted-foreground">Total</span>
                                <span className="text-lg font-bold text-foreground">{totalFee} MVR</span>
                              </div>
                            )}
                            {vehicleFees.length === 1 && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Amount due</span>
                                <span className="text-lg font-bold text-foreground">{totalFee} MVR</span>
                              </div>
                            )}
                            {vehicleFees.length === 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">No vehicles</span>
                                <span className="text-lg font-bold text-foreground">0 MVR</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
              }

              {profileTab === "settings" &&
            <div className="space-y-3">

                  {/* Text Size — compact */}
                  <div className="bg-surface rounded-2xl p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Type className="w-4 h-4 text-primary" />
                      </div>
                      <p style={{ fontSize: '13px' }} className="font-semibold text-foreground flex-1">Text Size</p>
                      <span className="text-xs font-bold text-primary tabular-nums">{Math.round(textSize * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-muted-foreground shrink-0" style={{ fontSize: '11px' }}>A</span>
                      <input type="range" min="0.75" max="2.0" step="0.05" value={textSize}
                        onChange={(e) => { const val = parseFloat(e.target.value); setTextSize(val); try {localStorage.setItem(textSizeKey, String(val));} catch {} }}
                        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-[hsl(var(--primary))] bg-border" />
                      <span className="text-muted-foreground font-bold shrink-0" style={{ fontSize: '18px' }}>A</span>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {[
                        { label: "S", value: 0.85 },
                        { label: "M", value: 1.0 },
                        { label: "L", value: 1.25 },
                        { label: "XL", value: 1.5 },
                        { label: "2XL", value: 1.75 },
                        { label: "3XL", value: 2.0 },
                      ].map((preset) => (
                        <button key={preset.label}
                          onClick={() => { setTextSize(preset.value); try {localStorage.setItem(textSizeKey, String(preset.value));} catch {} }}
                          style={{ fontSize: '11px' }}
                          className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                            Math.abs(textSize - preset.value) < 0.03
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-muted/50 text-muted-foreground"
                          }`}>
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Theme */}
                  <div className="bg-surface rounded-2xl p-3.5 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Settings className="w-4 h-4 text-primary" />
                    </div>
                    <p style={{ fontSize: '13px' }} className="font-semibold text-foreground flex-1">Theme</p>
                    <ThemeToggle />
                  </div>

                  {/* Navigation — all in one compact card */}
                  <div className="bg-surface rounded-2xl p-3.5 space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Navigation className="w-4 h-4 text-primary" />
                      </div>
                      <p style={{ fontSize: '13px' }} className="font-semibold text-foreground flex-1">Navigation</p>
                    </div>

                    {/* Compact nav settings rows */}
                    {[
                      { label: "Camera Speed", key: "followSensitivity" as const, options: [{ v: "low" as const, l: "Smooth" }, { v: "medium" as const, l: "Normal" }, { v: "high" as const, l: "Snappy" }] },
                      { label: "Look-Ahead", key: "lookAheadDistance" as const, options: [{ v: "short" as const, l: "Close" }, { v: "medium" as const, l: "Normal" }, { v: "far" as const, l: "Far" }] },
                      { label: "Rerouting", key: "rerouteAggressiveness" as const, options: [{ v: "relaxed" as const, l: "Relaxed" }, { v: "normal" as const, l: "Normal" }, { v: "aggressive" as const, l: "Fast" }] },
                    ].map(({ label, key, options }) => (
                      <div key={key} className="flex items-center gap-2">
                        <p style={{ fontSize: '11px' }} className="font-medium text-muted-foreground w-20 shrink-0">{label}</p>
                        <div className="flex-1 flex gap-1">
                          {options.map(({ v, l }) => (
                            <button key={v}
                              onClick={() => { const s = { ...driverNavSettings, [key]: v }; setDriverNavSettings(s); saveNavSettings(s); }}
                              style={{ fontSize: '11px' }}
                              className={`flex-1 py-1.5 rounded-lg font-medium transition-all text-center ${
                                (driverNavSettings as any)[key] === v ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/40 text-muted-foreground"
                              }`}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Auto-refocus toggle */}
                    <div className="flex items-center gap-2 pt-1 border-t border-border/30">
                      <p style={{ fontSize: '11px' }} className="font-medium text-muted-foreground flex-1">Auto-refocus on turns</p>
                      <button
                        onClick={() => { const s = { ...driverNavSettings, autoRefocusOnTurn: !driverNavSettings.autoRefocusOnTurn }; setDriverNavSettings(s); saveNavSettings(s); }}
                        className={`w-10 h-6 rounded-full transition-colors relative shrink-0 ${driverNavSettings.autoRefocusOnTurn ? "bg-primary" : "bg-muted"}`}>
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${driverNavSettings.autoRefocusOnTurn ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                  </div>

                  {/* Suggest a Place */}
                  <button
                    onClick={() => { setShowProfile(false); setShowSuggestPlace(true); }}
                    className="w-full flex items-center gap-2.5 bg-surface rounded-2xl p-3.5 active:scale-[0.97] transition-transform">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p style={{ fontSize: '13px' }} className="font-semibold text-foreground leading-tight">Suggest a Place</p>
                      <p style={{ fontSize: '10px' }} className="text-muted-foreground">Help us name locations on the map</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>

                  {/* Switch to Passenger */}
                  <button
                    onClick={() => {setShowProfile(false);setScreen("offline");goOfflineNow();onSwitchToPassenger();}}
                    className="w-full flex items-center gap-2.5 bg-primary/10 border border-primary/20 rounded-2xl p-3.5 active:scale-[0.97] transition-transform">
                    <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p style={{ fontSize: '13px' }} className="font-bold text-primary leading-tight">Switch to Passenger</p>
                      <p style={{ fontSize: '10px' }} className="text-muted-foreground">Use the app as a rider</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-primary shrink-0" />
                  </button>
                </div>
            }

              </div>

              <div className="p-4 pt-2 border-t border-border space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowProfile(false); window.location.href = "/terms"; }}
                    className="flex-1 flex items-center justify-center gap-2 bg-muted text-muted-foreground font-semibold py-2.5 rounded-xl text-xs active:scale-95 transition-transform"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Terms
                  </button>
                  <button
                    onClick={() => { setShowProfile(false); window.location.href = "/privacy"; }}
                    className="flex-1 flex items-center justify-center gap-2 bg-muted text-muted-foreground font-semibold py-2.5 rounded-xl text-xs active:scale-95 transition-transform"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Privacy
                  </button>
                </div>
                {onLogout &&
              <button
                onClick={() => {setShowProfile(false);onLogout();}}
                className="w-full flex items-center justify-center gap-2 bg-destructive/10 text-destructive font-semibold py-3 rounded-xl text-sm active:scale-95 transition-transform">

                    Logout
                  </button>
              }
                
              </div>
            </motion.div>
          </motion.div>
        }
      </AnimatePresence>

      <PWAInstallPrompt />
      <NotificationPermissionPrompt />
      <SuggestPlace userId={userProfile?.id} userType="driver" visible={showSuggestPlace} onClose={() => setShowSuggestPlace(false)} />

      {/* Persistent banner when driver is online but notifications not granted */}
      {screen === "online" && notifPermissionDenied && (
        <div className="fixed top-14 left-2 right-2 z-[9990] mx-auto max-w-md">
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-3 flex items-center gap-3 shadow-lg">
            <BellIcon className="w-5 h-5 text-destructive shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-destructive">Notifications are OFF</p>
              <p className="text-[10px] text-destructive/80">You won't hear trip requests when the app is minimized</p>
            </div>
            <button
              onClick={async () => {
                if ("Notification" in window && Notification.permission === "default") {
                  const result = await Notification.requestPermission();
                  if (result === "granted") setNotifPermissionDenied(false);
                } else {
                  // Permission was denied — user must enable in browser settings
                  toast({
                    title: "Enable in Browser Settings",
                    description: "Go to your browser settings → Site Settings → Notifications → Allow for this site",
                    variant: "destructive",
                  });
                }
              }}
              className="text-[10px] font-bold text-primary-foreground bg-destructive px-3 py-1.5 rounded-lg shrink-0"
            >
              Enable
            </button>
          </div>
        </div>
      )}

      {/* Vehicle blocked banner */}
      {screen === "online" && vehicleBlockedUntil && blockCountdown && (
        <div className="fixed top-14 left-2 right-2 z-[9990] mx-auto max-w-md">
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-3 flex items-center gap-3 shadow-lg backdrop-blur-sm">
            <Ban className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-destructive">Vehicle Temporarily Blocked</p>
              <p className="text-[10px] text-destructive/80">You won't receive any trip requests</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-destructive tabular-nums">{blockCountdown}</p>
              <p className="text-[9px] text-destructive/60">remaining</p>
            </div>
          </div>
        </div>
      )}

      <DriverNotifications userId={userProfile?.id} userType="driver" visible={showNotifications} onClose={() => setShowNotifications(false)} />

      {/* Withdraw Modal */}
      {showWithdrawModal &&
      <div className="fixed inset-0 z-[900] flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={() => setShowWithdrawModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground">Request Withdrawal</h3>
            <p className="text-sm text-muted-foreground">Available: {driverWalletBalance.toFixed(2)} MVR • Minimum: {minWithdrawalAmount} MVR</p>
            <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder={`Amount (min ${minWithdrawalAmount} MVR)`} className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary" />
            <input value={withdrawNotes} onChange={(e) => setWithdrawNotes(e.target.value)} placeholder="Notes (optional)" className="w-full px-4 py-2.5 rounded-xl bg-surface border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            {withdrawAmount && Number(withdrawAmount) < minWithdrawalAmount &&
          <p className="text-[11px] text-destructive">Minimum withdrawal amount is {minWithdrawalAmount} MVR</p>
          }
            <div className="flex gap-2">
              <button onClick={() => setShowWithdrawModal(false)} className="flex-1 py-3 rounded-xl bg-surface text-foreground font-semibold text-sm">Cancel</button>
              <button
              disabled={!withdrawAmount || Number(withdrawAmount) < minWithdrawalAmount || Number(withdrawAmount) > driverWalletBalance}
              onClick={async () => {
                if (!driverWalletId || !userProfile?.id) return;
                await supabase.from("wallet_withdrawals").insert({
                  wallet_id: driverWalletId,
                  user_id: userProfile.id,
                  amount: Number(withdrawAmount),
                  notes: withdrawNotes,
                  status: "pending"
                } as any);
                toast({ title: "Withdrawal requested", description: `${withdrawAmount} MVR withdrawal submitted for approval` });
                setShowWithdrawModal(false);
                setWithdrawAmount("");
                setWithdrawNotes("");
                // Refresh withdrawals
                const { data: w } = await supabase.from("wallet_withdrawals").select("*").eq("user_id", userProfile.id).order("created_at", { ascending: false }).limit(10);
                setPendingWithdrawals(w || []);
              }}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40">

                Submit
              </button>
            </div>
          </div>
        </div>
      }

      {/* Pay Fee from Wallet Modal */}
      {showPayFeeModal && (() => {
        const vtFeeTotal = driverVehicles.reduce((s: number, v: any) => { const vt = vehicleTypes.find((t: any) => t.id === v.vehicle_type_id); return s + (vt?.monthly_fee || 0); }, 0);
        return (
      <div className="fixed inset-0 z-[900] flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={() => setShowPayFeeModal(false)}>
          <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground">Pay Monthly Fee</h3>
            <p className="text-sm text-muted-foreground">Wallet: {driverWalletBalance.toFixed(2)} MVR</p>
            <div className="bg-surface rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{vtFeeTotal} MVR</p>
              <p className="text-xs text-muted-foreground mt-1">Monthly center fee</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowPayFeeModal(false)} className="flex-1 py-3 rounded-xl bg-surface text-foreground font-semibold text-sm">Cancel</button>
              <button
              disabled={driverWalletBalance < vtFeeTotal}
              onClick={async () => {
                if (!driverWalletId || !userProfile?.id) return;
                const fee = vtFeeTotal;
                const now = new Date().toISOString();
                const currentMonth = new Date().toISOString().slice(0, 7);

                const newBalance = driverWalletBalance - fee;
                await supabase.from("wallets").update({ balance: newBalance, updated_at: now } as any).eq("id", driverWalletId);
                await supabase.from("wallet_transactions").insert({
                  wallet_id: driverWalletId,
                  user_id: userProfile.id,
                  amount: fee,
                  type: "debit",
                  reason: `Monthly fee - ${currentMonth}`
                } as any);

                await supabase.from("driver_payments").insert({
                  driver_id: userProfile.id,
                  amount: fee,
                  payment_month: currentMonth,
                  status: "approved",
                  notes: "Paid from wallet",
                  submitted_at: now,
                  approved_at: now
                } as any);

                setDriverWalletBalance(newBalance);
                toast({ title: "Fee paid!", description: `${fee} MVR deducted from your wallet` });
                setShowPayFeeModal(false);
              }}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40">
                Pay {vtFeeTotal} MVR
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Billing Payment Popup */}
      {showBillingPayPopup && userProfile &&
      <div className="fixed inset-0 z-[950] flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={() => setShowBillingPayPopup(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-destructive/10 p-4 text-center">
              <div className="w-14 h-14 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-2">
                <DollarSign className="w-7 h-7 text-destructive" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Monthly Fee Payment</h3>
              {(() => {
                const vFees = driverVehicles.map((v: any) => {
                  const vt = vehicleTypes.find((t: any) => t.id === v.vehicle_type_id);
                  return { plate: v.plate_number, typeName: vt?.name || "Unknown", fee: vt?.monthly_fee || 0 };
                });
                const total = vFees.reduce((s: number, v: any) => s + v.fee, 0);
                return (
                  <div className="mt-2 space-y-1">
                    {vFees.map((v: any, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground">{v.plate} ({v.typeName}): <span className="font-semibold text-foreground">{v.fee} MVR</span></p>
                    ))}
                    <p className="text-3xl font-black text-foreground mt-1">{total} MVR</p>
                  </div>
                );
              })()}
            </div>

            <div className="p-5 space-y-4">
              {/* Admin bank info */}
              {adminBankInfo ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transfer to this account</p>
                  <div className="bg-surface rounded-xl divide-y divide-border">
                    {adminBankInfo.bank_name && (
                      <div className="flex items-center justify-between px-3 py-2.5">
                        <span className="text-xs text-muted-foreground">Bank</span>
                        <span className="text-sm font-semibold text-foreground">{adminBankInfo.bank_name}</span>
                      </div>
                    )}
                    {adminBankInfo.account_number && (
                      <div className="flex items-center justify-between px-3 py-2.5">
                        <span className="text-xs text-muted-foreground">Account</span>
                        <button onClick={() => { navigator.clipboard.writeText(adminBankInfo.account_number); toast({ title: "Copied!" }); }} className="text-sm font-semibold text-primary flex items-center gap-1">
                          {adminBankInfo.account_number} <CreditCard className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {adminBankInfo.account_name && (
                      <div className="flex items-center justify-between px-3 py-2.5">
                        <span className="text-xs text-muted-foreground">Name</span>
                        <span className="text-sm font-medium text-foreground">{adminBankInfo.account_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center">Contact admin for payment details</p>
              )}

              {/* Upload payment slip */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upload Payment Slip</p>
                <input
                  ref={billingFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBillingSlipUploading(true);
                    try {
                      const ext = file.name.split(".").pop() || "jpg";
                      const path = `${userProfile.id}/billing-slip-${Date.now()}.${ext}`;
                      const { error: uploadErr } = await supabase.storage.from("payment-slips").upload(path, file, { upsert: true });
                      if (uploadErr) throw uploadErr;
                      const { data: urlData } = supabase.storage.from("payment-slips").getPublicUrl(path);
                      setBillingSlipUrl(urlData.publicUrl);
                    } catch (err) {
                      toast({ title: "Upload failed", variant: "destructive" });
                    }
                    setBillingSlipUploading(false);
                  }}
                />
                {billingSlipUrl ? (
                  <div className="relative">
                    <img src={billingSlipUrl} alt="Payment slip" className="w-full rounded-xl border border-border max-h-48 object-contain" />
                    <button onClick={() => setBillingSlipUrl(null)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-foreground/70 text-background flex items-center justify-center"><X className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => billingFileRef.current?.click()}
                    disabled={billingSlipUploading}
                    className="w-full py-4 rounded-xl border-2 border-dashed border-border bg-surface flex items-center justify-center gap-2 text-sm text-muted-foreground active:scale-[0.98] transition-transform">
                    {billingSlipUploading ? (
                      <><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> Uploading...</>
                    ) : (
                      <><Upload className="w-4 h-4" /> Take photo or upload slip</>
                    )}
                  </button>
                )}
              </div>

              {/* Submit button */}
              <button
                disabled={!billingSlipUrl || billingPaymentSubmitting}
                onClick={async () => {
                  if (!billingSlipUrl) return;
                  setBillingPaymentSubmitting(true);
                  const currentMonth = new Date().toISOString().slice(0, 7);
                  const now = new Date().toISOString();

                  const totalVtFee = driverVehicles.reduce((s: number, v: any) => {
                    const vt = vehicleTypes.find((t: any) => t.id === v.vehicle_type_id);
                    return s + (vt?.monthly_fee || 0);
                  }, 0);

                  await supabase.from("driver_payments").insert({
                    driver_id: userProfile.id,
                    amount: totalVtFee,
                    payment_month: currentMonth,
                    status: "submitted",
                    slip_url: billingSlipUrl,
                    submitted_at: now,
                  } as any);

                  setBillingPaymentSubmitting(false);
                  setShowBillingPayPopup(false);
                  toast({ title: "Payment submitted!", description: "Admin will review your payment. You'll be able to go online once approved." });
                }}
                className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                {billingPaymentSubmitting ? (
                  <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> Submitting...</>
                ) : (
                  "Submit Payment for Approval"
                )}
              </button>

              {/* Pay from wallet option */}
              {(() => { const vtTotal = driverVehicles.reduce((s: number, v: any) => { const vt = vehicleTypes.find((t: any) => t.id === v.vehicle_type_id); return s + (vt?.monthly_fee || 0); }, 0); return driverWalletBalance >= vtTotal && vtTotal > 0; })() && (
                <button
                  onClick={() => {
                    setShowBillingPayPopup(false);
                    setShowPayFeeModal(true);
                  }}
                  className="w-full py-3 rounded-xl bg-surface text-foreground font-semibold text-sm border border-border">
                  Or pay from wallet ({driverWalletBalance.toFixed(2)} MVR)
                </button>
              )}
            </div>
          </div>
        </div>
      }

      {/* Driver Leaderboard */}
      <AnimatePresence>
        {showLeaderboard && userProfile?.id && (
          <DriverLeaderboard driverId={userProfile.id} onClose={() => setShowLeaderboard(false)} />
        )}
      </AnimatePresence>
    </div>);

};

// Document upload card component
const DocumentUpload = ({ label, url, uploading, onUpload }: {label: string;url: string | null;uploading: boolean;onUpload: () => void;}) =>
<button onClick={onUpload} className="relative aspect-[3/2] rounded-xl bg-surface border-2 border-dashed border-border overflow-hidden flex items-center justify-center active:scale-95 transition-transform">
    {url ?
  <img src={url} alt={label} className="w-full h-full object-cover" /> :

  <div className="text-center">
        <Camera className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
  }
    {uploading &&
  <div className="absolute inset-0 bg-foreground/30 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
      </div>
  }
  </button>;

export default DriverApp;