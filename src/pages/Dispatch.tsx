import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { toast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/use-theme";
import {
  Phone, MapPin, X, Loader2, Navigation, ArrowRight, Moon, Sun,
  MessageSquare, PackageX, AlertTriangle, LayoutDashboard, Users,
  MapPinIcon, Layers, DollarSign, Receipt, Siren, BellRing, Wallet, Building2, Building,
  Search, CalendarIcon, Send
} from "lucide-react";
import SystemLogo from "@/components/SystemLogo";
import SOSAlertPanel from "@/components/SOSAlertPanel";
import AdminSOSHistory from "@/components/admin/AdminSOSHistory";
import DispatchTripForm from "@/components/dispatch/DispatchTripForm";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import LiveTripTracker from "@/components/dispatch/LiveTripTracker";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// Admin area imports
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminDrivers from "@/components/admin/AdminDrivers";
import AdminPassengers from "@/components/admin/AdminPassengers";
import AdminTrips from "@/components/admin/AdminTrips";
import AdminVehicleTypes from "@/components/admin/AdminVehicleTypes";
import AdminFares from "@/components/admin/AdminFares";
import AdminBilling from "@/components/admin/AdminBilling";
import AdminWallets from "@/components/admin/AdminWallets";
import AdminLostItems from "@/components/admin/AdminLostItems";
import AdminNotifications from "@/components/admin/AdminNotifications";
import AdminLocations from "@/components/admin/AdminLocations";
import AdminBanks from "@/components/admin/AdminBanks";
import AdminCompanies from "@/components/admin/AdminCompanies";

interface OnlineDriver {
  driver_id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  vehicle_name: string;
  plate_number: string;
  lat: number;
  lng: number;
}

type DispatchTab = "dispatch" | "dashboard" | "trips" | "drivers" | "passengers" | "vehicle_types" | "fares" | "billing" | "wallets" | "locations" | "lost_items" | "sos_history" | "notifications" | "banks" | "companies";

// Map each tab to the permission key required to access it
const tabPermissionMap: Record<DispatchTab, string | null> = {
  dispatch: "dispatch_trips",
  dashboard: "view_dashboard",
  trips: "manage_trips",
  drivers: "manage_drivers",
  passengers: "manage_passengers",
  vehicle_types: "manage_vehicles",
  fares: "manage_fares",
  billing: "manage_billing",
  wallets: "manage_wallets",
  locations: "manage_locations",
  lost_items: "manage_lost_items",
  sos_history: "manage_sos",
  notifications: "manage_notifications",
  banks: "manage_banks",
  companies: "manage_companies",
};

const dispatchTabs: { id: DispatchTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dispatch", label: "Dispatch", icon: Navigation },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "trips", label: "Trips", icon: MapPinIcon },
  { id: "drivers", label: "Drivers", icon: Users },
  { id: "passengers", label: "Passengers", icon: Users },
  { id: "vehicle_types", label: "Vehicle Types", icon: Layers },
  { id: "fares", label: "Fares", icon: DollarSign },
  { id: "billing", label: "Billing", icon: Receipt },
  { id: "wallets", label: "Wallets", icon: Wallet },
  { id: "locations", label: "Service Areas", icon: MapPinIcon },
  { id: "lost_items", label: "Lost Items", icon: PackageX },
  { id: "sos_history", label: "SOS Alerts", icon: Siren },
  { id: "notifications", label: "Notifications", icon: BellRing },
  { id: "banks", label: "Banks", icon: Building2 },
  { id: "companies", label: "Companies", icon: Building },
];

const Dispatch = () => {
  const [isAuthed, setIsAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { theme, toggleTheme } = useTheme();
  const [dispatcherProfile, setDispatcherProfile] = useState<any>(null);
  const [dispatcherPermissions, setDispatcherPermissions] = useState<string[]>([]);
  const [dispatcherRole, setDispatcherRole] = useState<string>("dispatcher");
  const [activeTab, setActiveTab] = useState<DispatchTab>("dispatch");
  usePushNotifications(dispatcherProfile?.id, "dispatcher");
  const [trackingTripId, setTrackingTripId] = useState<string | null>(null);

  // Login state
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loginStep, setLoginStep] = useState<"phone" | "otp">("phone");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Shared state for forms
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [onlineDrivers, setOnlineDrivers] = useState<OnlineDriver[]>([]);
  const [recentTrips, setRecentTrips] = useState<any[]>([]);
  const [appRequestTrips, setAppRequestTrips] = useState<any[]>([]);
  const [lostTrips, setLostTrips] = useState<any[]>([]);
  const [markingLoss, setMarkingLoss] = useState<string | null>(null);
  const [bookingSearch, setBookingSearch] = useState("");
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [showAllBookings, setShowAllBookings] = useState(false);
  const [allBookingsSearch, setAllBookingsSearch] = useState("");
  const [allBookingsDateFilter, setAllBookingsDateFilter] = useState<string>("today");
  const [allBookingsCustomDate, setAllBookingsCustomDate] = useState<Date | undefined>(undefined);

  // Chat history
  const [selectedTripMessages, setSelectedTripMessages] = useState<any[] | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [lostItems, setLostItems] = useState<any[]>([]);

  // Preloaded center-code index for instant lookups (refreshed in background)
  const [centerCodeIndex, setCenterCodeIndex] = useState<Record<string, any>>({});

  const getAssignedCenterCode = (bookingNotes?: string | null) => {
    const raw = bookingNotes?.match(/Center:\s*(.+)/)?.[1] || "";
    return raw.split(",")[0]?.trim() || "";
  };

  const getAssignedVehicleDetails = (trip: any) => {
    if (trip?.vehicle) {
      return {
        centerCode: (trip.vehicle as any).center_code || "",
        plateNumber: (trip.vehicle as any).plate_number || "",
        color: (trip.vehicle as any).color || "",
      };
    }

    const centerCode = getAssignedCenterCode(trip?.booking_notes);
    if (!centerCode) return { centerCode: "", plateNumber: "", color: "" };

    const info = centerCodeIndex[centerCode.toUpperCase()];
    return {
      centerCode,
      plateNumber: info?.plate_number || "",
      color: info?.color || "",
    };
  };

  useEffect(() => {
    const stored = localStorage.getItem("hda_dispatcher");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const profile = parsed.profile || parsed;
        setDispatcherProfile(profile);
        setDispatcherPermissions(parsed.permissions || []);
        setDispatcherRole(parsed.role || "dispatcher");
        setIsAuthed(true);

        // Refresh permissions from DB to avoid stale cache
        if (profile?.id) {
          supabase.from("user_roles").select("role, permissions").eq("user_id", profile.id).single().then(({ data }) => {
            if (data) {
              const freshPerms = Array.isArray(data.permissions) ? data.permissions as string[] : [];
              const freshRole = data.role as string;
              setDispatcherPermissions(freshPerms);
              setDispatcherRole(freshRole);
              localStorage.setItem("hda_dispatcher", JSON.stringify({ profile, permissions: freshPerms, role: freshRole }));
            }
          });
        }
      } catch {}
    }
    setLoading(false);
  }, []);

  // Build a local index of center_code -> vehicle/driver info so Enter lookup is instant
  useEffect(() => {
    if (!isAuthed) return;

    const CACHE_KEY = "hda_center_code_index_v1";
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    const loadFromCache = () => {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL_MS) return null;
        return parsed.index || null;
      } catch {
        return null;
      }
    };

    const saveToCache = (index: Record<string, any>) => {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), index }));
      } catch {}
    };

    const refresh = async () => {
      const cached = loadFromCache();
      if (cached) setCenterCodeIndex(cached);

      try {
        const { data: vehicles } = await supabase
          .from("vehicles")
          .select(
            "center_code, plate_number, color, vehicle_type_id, driver_id, vehicle_types:vehicle_type_id(name)"
          )
          .eq("is_active", true)
          .not("center_code", "is", null);

        const driverIds = Array.from(
          new Set((vehicles || []).map((v: any) => v.driver_id).filter(Boolean))
        ) as string[];

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [profilesRes, todayTripsRes, completedTripsRes] = await Promise.all([
          driverIds.length
            ? supabase
                .from("profiles")
                .select("id, first_name, last_name, phone_number")
                .in("id", driverIds)
            : Promise.resolve({ data: [] as any[] }),
          driverIds.length
            ? supabase
                .from("trips")
                .select("driver_id")
                .in("driver_id", driverIds)
                .gte("created_at", todayStart.toISOString())
                .in("status", ["requested", "accepted", "started", "completed"])
            : Promise.resolve({ data: [] as any[] }),
          driverIds.length
            ? supabase
                .from("trips")
                .select("driver_id, completed_at")
                .in("driver_id", driverIds)
                .eq("status", "completed")
                .order("completed_at", { ascending: false })
                .limit(2000)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const profileMap = new Map<string, any>();
        (profilesRes.data || []).forEach((p: any) => profileMap.set(p.id, p));

        const lastTripMap = new Map<string, string>();
        (completedTripsRes.data || []).forEach((t: any) => {
          if (t?.driver_id && t?.completed_at && !lastTripMap.has(t.driver_id)) {
            lastTripMap.set(t.driver_id, t.completed_at);
          }
        });

        const todayCounts = new Map<string, number>();
        (todayTripsRes.data || []).forEach((t: any) => {
          if (!t?.driver_id) return;
          todayCounts.set(t.driver_id, (todayCounts.get(t.driver_id) || 0) + 1);
        });

        // Fetch loss driver IDs
        const { data: lossTrips } = await supabase
          .from("trips")
          .select("driver_id")
          .eq("is_loss", true)
          .eq("dispatch_type", "operator")
          .not("driver_id", "is", null);
        const lossDriverIds = new Set((lossTrips || []).map((t: any) => t.driver_id));

        const index: Record<string, any> = {};
        (vehicles || []).forEach((v: any) => {
          const code = (v.center_code || "").toUpperCase();
          if (!code) return;

          const p = v.driver_id ? profileMap.get(v.driver_id) : null;
          index[code] = {
            code,
            color: v.color || null,
            plate_number: v.plate_number,
            vehicle_type: (v.vehicle_types as any)?.name || null,
            vehicle_type_id: v.vehicle_type_id || null,
            driver_id: v.driver_id || null,
            driver_name: p ? `${p.first_name} ${p.last_name}`.trim() : null,
            driver_phone: p?.phone_number || null,
            last_trip_date: v.driver_id ? lastTripMap.get(v.driver_id) || null : null,
            today_trips: v.driver_id ? todayCounts.get(v.driver_id) || 0 : 0,
            has_loss: v.driver_id ? lossDriverIds.has(v.driver_id) : false,
          };
        });

        setCenterCodeIndex(index);
        saveToCache(index);
      } catch {
        // keep any cached data
      }
    };

    refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(interval);
  }, [isAuthed]);

  // Load vehicle types, drivers, recent trips
  useEffect(() => {
    if (!isAuthed) return;
    const load = async () => {
      const tripSelect = "id, status, pickup_address, dropoff_address, customer_name, customer_phone, created_at, updated_at, dispatch_type, driver_id, estimated_fare, actual_fare, booking_notes, created_by, accepted_at, driver:profiles!trips_driver_id_fkey(first_name, last_name, phone_number, avatar_url, company_name), vehicle:vehicles!trips_vehicle_id_fkey(plate_number, center_code, color)";
      const [vtRes, driversRes, tripsRes, appReqRes, lostRes] = await Promise.all([
        supabase.from("vehicle_types").select("*").eq("is_active", true).order("sort_order"),
        supabase
          .from("driver_locations")
          .select(`
            driver_id, lat, lng,
            profiles:driver_id (first_name, last_name, phone_number),
            vehicles:vehicle_id (plate_number, vehicle_types:vehicle_type_id (name))
          `)
          .eq("is_online", true)
          .eq("is_on_trip", false),
        supabase
          .from("trips")
          .select(tripSelect)
          .eq("dispatch_type", "operator")
          .in("status", ["requested", "accepted", "started", "completed"])
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("trips")
          .select(tripSelect)
          .eq("dispatch_type", "dispatch_broadcast")
          .in("status", ["requested", "accepted", "started", "completed", "cancelled"])
          .order("updated_at", { ascending: false })
          .limit(300),
        supabase
          .from("trips")
          .select(
            "id, status, pickup_address, dropoff_address, customer_name, customer_phone, created_at, cancel_reason, driver_id, booking_notes, driver:profiles!trips_driver_id_fkey(first_name, last_name), vehicle:vehicles!trips_vehicle_id_fkey(plate_number, center_code, color)"
          )
          .eq("dispatch_type", "operator")
          .eq("is_loss", true)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      setVehicleTypes(vtRes.data || []);
      setRecentTrips(tripsRes.data || []);
      setAppRequestTrips(appReqRes.data || []);
      setLostTrips(lostRes.data || []);
      const drivers: OnlineDriver[] = (driversRes.data || []).map((d: any) => ({
        driver_id: d.driver_id,
        first_name: (d.profiles as any)?.first_name || "",
        last_name: (d.profiles as any)?.last_name || "",
        phone_number: (d.profiles as any)?.phone_number || "",
        vehicle_name: (d.vehicles as any)?.vehicle_types?.name || "Unknown",
        plate_number: (d.vehicles as any)?.plate_number || "",
        lat: d.lat,
        lng: d.lng,
      }));
      setOnlineDrivers(drivers);
    };
    load();
  }, [isAuthed]);

  // Realtime: auto-refresh trips table on any change — instant status update + full refetch
  useEffect(() => {
    if (!isAuthed) return;
    const channel = supabase
      .channel("dispatch-trips-realtime")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "trips",
      }, (payload) => {
        const updated = payload.new as any;
        // Instantly patch trip scalar fields — preserve joined objects (driver, vehicle)
        const patchTrip = (trips: any[]) =>
          trips.map(t => t.id === updated.id ? {
            ...t,
            status: updated.status,
            accepted_at: updated.accepted_at,
            driver_id: updated.driver_id,
            actual_fare: updated.actual_fare,
            completed_at: updated.completed_at,
            cancelled_at: updated.cancelled_at,
            vehicle_id: updated.vehicle_id,
          } : t);
        setRecentTrips(prev => patchTrip(prev));
        setAppRequestTrips(prev => patchTrip(prev));
        setLostTrips(prev => patchTrip(prev));
        // Full refetch for joined data (driver/vehicle details)
        refreshTrips();
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "trips",
      }, () => {
        refreshTrips();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthed]);

  // Polling fallback: refresh every 10s in case realtime misses events
  useEffect(() => {
    if (!isAuthed) return;
    const interval = setInterval(() => { refreshTrips(); }, 10_000);
    return () => clearInterval(interval);
  }, [isAuthed]);

  const refreshTrips = async () => {
    const tripSelect = "id, status, pickup_address, dropoff_address, customer_name, customer_phone, created_at, dispatch_type, driver_id, estimated_fare, actual_fare, booking_notes, created_by, accepted_at, driver:profiles!trips_driver_id_fkey(first_name, last_name, phone_number, avatar_url, company_name), vehicle:vehicles!trips_vehicle_id_fkey(plate_number, center_code, color)";
    const [{ data }, { data: appReq }, { data: lost }] = await Promise.all([
      supabase.from("trips").select(tripSelect)
        .eq("dispatch_type", "operator").in("status", ["requested", "accepted", "started", "completed"]).order("created_at", { ascending: false }).limit(200),
      supabase.from("trips").select(tripSelect)
        .eq("dispatch_type", "dispatch_broadcast").in("status", ["requested", "accepted", "started", "completed", "cancelled"]).order("created_at", { ascending: false }).limit(100),
      supabase.from("trips").select("id, status, pickup_address, dropoff_address, customer_name, customer_phone, created_at, cancel_reason, driver_id, booking_notes, driver:profiles!trips_driver_id_fkey(first_name, last_name), vehicle:vehicles!trips_vehicle_id_fkey(plate_number, center_code, color)")
        .eq("dispatch_type", "operator").eq("is_loss", true).order("created_at", { ascending: false }).limit(200),
    ]);
    setRecentTrips(data || []);
    setAppRequestTrips(appReq || []);
    setLostTrips(lost || []);
  };

  // Login handlers
  const handlePhoneSubmit = async () => {
    if (phone.length < 7) return;
    setLoginLoading(true);
    setLoginError("");
    try {
      const { data, error } = await supabase.functions.invoke("send-otp", { body: { phone_number: phone } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setLoginStep("otp");
      toast({ title: "OTP sent!", description: `Code sent to +960 ${phone}` });
    } catch (err: any) {
      setLoginError(err.message || "Failed to send OTP");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleVerify = async (code: string) => {
    setLoginLoading(true);
    setLoginError("");
    try {
      const { data, error } = await supabase.functions.invoke("verify-otp", { body: { phone_number: phone, code } });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Invalid code");

      const { data: profiles } = await supabase.from("profiles").select("*").eq("phone_number", phone);
      if (!profiles || profiles.length === 0) throw new Error("Profile not found");

      const profileIds = profiles.map(p => p.id);
      const { data: allRoles } = await supabase.from("user_roles").select("user_id, role, permissions").in("user_id", profileIds);

      const matchedRole = allRoles?.find((r: any) =>
        (r.role === "dispatcher" || r.role === "admin") && profiles.some(p => p.id === r.user_id)
      );

      if (!matchedRole) throw new Error("You don't have dispatcher access");

      const matchedProfile = profiles.find(p => p.id === matchedRole.user_id)!;
      const permissions = Array.isArray(matchedRole.permissions) ? matchedRole.permissions as string[] : [];
      const role = matchedRole.role as string;

      setDispatcherProfile(matchedProfile);
      setDispatcherPermissions(permissions);
      setDispatcherRole(role);
      setIsAuthed(true);
      localStorage.setItem("hda_dispatcher", JSON.stringify({ profile: matchedProfile, permissions, role }));
    } catch (err: any) {
      setLoginError(err.message || "Verification failed");
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoginLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (newOtp.every(d => d !== "")) handleVerify(newOtp.join(""));
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const viewMessages = async (tripId: string) => {
    setSelectedTripId(tripId);
    const [{ data: msgs }, { data: items }] = await Promise.all([
      supabase.from("trip_messages").select("*").eq("trip_id", tripId).order("created_at", { ascending: true }),
      supabase.from("lost_item_reports").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
    ]);
    setSelectedTripMessages((msgs as any[]) || []);
    setLostItems((items as any[]) || []);
  };

  const handleMarkLoss = async (tripId: string) => {
    setMarkingLoss(tripId);
    await supabase.from("trips").update({ is_loss: true }).eq("id", tripId);
    toast({ title: "Marked as Loss" });
    refreshTrips();
    setMarkingLoss(null);
  };

  const handleDispatchCancel = async (tripId: string) => {
    await supabase
      .from("trips")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Cancelled by dispatch",
        is_loss: true,
      })
      .eq("id", tripId);
    toast({ title: "Trip Cancelled" });
    refreshTrips();
  };

  const handleLogout = () => {
    setIsAuthed(false);
    setDispatcherProfile(null);
    localStorage.removeItem("hda_dispatcher");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Login screen
  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Navigation className="w-8 h-8 text-primary" />
            </div>
            <div className="flex items-center justify-center gap-2">
              <SystemLogo className="w-8 h-8 object-contain" alt="HDA" />
              <h1 className="text-2xl font-extrabold text-foreground">HDA <span className="text-primary">DISPATCH</span></h1>
            </div>
            <p className="text-sm text-muted-foreground">Login with your dispatcher phone number</p>
          </div>

          {loginError && <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">{loginError}</div>}

          {loginStep === "phone" ? (
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  <span className="text-sm font-semibold">+960</span>
                  <div className="w-px h-5 bg-border" />
                </div>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="7XX XXXX" className="w-full pl-24 pr-4 py-4 bg-surface rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-base font-medium" autoFocus disabled={loginLoading} />
              </div>
              <button onClick={handlePhoneSubmit} disabled={phone.length < 7 || loginLoading} className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40">
                {loginLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">Code sent to <span className="font-semibold text-foreground">+960 {phone}</span></p>
              <div className="flex gap-3 justify-center py-2">
                {otp.map((digit, i) => (
                  <input key={i} ref={el => { otpRefs.current[i] = el; }} type="tel" value={digit} onChange={e => handleOtpChange(i, e.target.value)} onKeyDown={e => handleOtpKeyDown(i, e)} maxLength={1} className="w-12 h-14 text-center text-2xl font-bold bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary" autoFocus={i === 0} disabled={loginLoading} />
                ))}
              </div>
              {loginLoading && <div className="flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}
              <button onClick={() => { setLoginStep("phone"); setLoginError(""); setOtp(["", "", "", "", "", ""]); }} className="w-full text-center text-sm text-muted-foreground font-medium py-1">Change number</button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // Main dispatch UI
  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-card border-b border-border px-3 sm:px-4 lg:px-8 py-3 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <SystemLogo className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0" alt="HDA" />
          <h1 className="text-base sm:text-lg font-extrabold text-foreground truncate">HDA <span className="text-primary">DISPATCH</span></h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button onClick={toggleTheme} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <span className="text-xs sm:text-sm text-muted-foreground hidden sm:inline">{dispatcherProfile?.first_name} {dispatcherProfile?.last_name}</span>
          <button onClick={handleLogout} className="text-xs text-muted-foreground hover:text-destructive font-medium">Logout</button>
        </div>
      </header>

      {/* Tab navigation - scrollable */}
      <div className="bg-card border-b border-border shrink-0 overflow-x-auto">
        <div className="flex px-2 py-1.5 gap-1 min-w-max">
          {dispatchTabs.filter(tab => {
            // Admins see everything
            if (dispatcherRole === "admin") return true;
            // Tabs with no permission requirement are always visible
            const requiredPerm = tabPermissionMap[tab.id];
            if (!requiredPerm) return true;
            // Check if dispatcher has the required permission
            return dispatcherPermissions.includes(requiredPerm);
          }).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-surface hover:text-foreground"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area - scrollable */}
      <div className="flex-1 overflow-auto">
        {activeTab === "dispatch" && (
          <div className="p-2 sm:p-3 lg:p-4">
            {/* SOS Alerts */}
            <SOSAlertPanel />

            {/* Layout: Left tables column | 3 Bid forms right */}
            <div className="flex flex-col lg:flex-row gap-2 mt-2">
              {/* Left Column — IN LOSS + Todays Booking (narrower on desktop) */}
              <div className="lg:w-[320px] lg:min-w-[280px] space-y-1.5 min-w-0 shrink-0">
                {/* IN LOSS */}
                <div className="bg-card border border-destructive/30 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <h3 className="text-xs font-bold text-destructive flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                      IN LOSS
                      <span className="text-[10px] font-normal text-muted-foreground ml-1">{lostTrips.length} LOSS bookings • Auto-clears at 00:00hrs</span>
                    </h3>
                  </div>
                  <div className="max-h-[220px] overflow-y-auto p-1.5 space-y-1">
                    {lostTrips.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No lost rides</p>
                    ) : lostTrips.map((t: any) => (
                      <div
                        key={t.id}
                        className={`rounded-md overflow-hidden ${
                          t.status === "cancelled"
                            ? "bg-warning/10 border border-warning/30"
                            : "bg-surface border border-destructive/20"
                        }`}
                      >
                        <div
                          className={`px-2.5 py-1.5 flex items-center gap-2 text-[10px] cursor-pointer transition-colors ${
                            t.status === "cancelled" ? "hover:bg-warning/10" : "hover:bg-destructive/5"
                          }`}
                          onClick={() => setExpandedTripId(expandedTripId === `loss-${t.id}` ? null : `loss-${t.id}`)}
                        >
                          <span className="text-muted-foreground whitespace-nowrap font-medium">
                            {new Date(t.created_at).toLocaleDateString([], { month: "short", day: "2-digit" }).toUpperCase()}{" "}
                            {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              t.status === "cancelled"
                                ? "bg-warning/20 text-warning"
                                : "bg-destructive/15 text-destructive"
                            }`}
                          >
                            LOSS STATUS
                          </span>
                          {t.vehicle ? (
                            <>
                              {(t.vehicle as any).center_code && (
                                <span className="inline-block px-1 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-bold whitespace-nowrap">{(t.vehicle as any).center_code}</span>
                              )}
                              <span className="text-muted-foreground whitespace-nowrap">{(t.vehicle as any).color || ""} • {(t.vehicle as any).plate_number}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground whitespace-nowrap italic">
                              {(() => {
                                const assigned = getAssignedVehicleDetails(t);
                                if (!assigned.centerCode) return "—";
                                const vehicleText = [assigned.color, assigned.plateNumber].filter(Boolean).join(" • ");
                                return vehicleText ? `${assigned.centerCode} • ${vehicleText}` : assigned.centerCode;
                              })()}
                            </span>
                          )}
                          <span className="text-foreground truncate flex-1">
                            {t.customer_name || "N/A"} • {(t.pickup_address || "").split(",")[0]}{" "}
                            <span className={t.status === "cancelled" ? "text-warning" : "text-destructive"}>→</span>{" "}
                            {(t.dropoff_address || "").split(",")[0]}
                          </span>
                        </div>
                        {expandedTripId === `loss-${t.id}` && (
                          <div
                            className={`px-2.5 pb-2 pt-1 border-t grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] ${
                              t.status === "cancelled" ? "border-warning/20" : "border-destructive/10"
                            }`}
                          >
                            <div><span className="text-muted-foreground">From:</span> <span className="text-foreground">{t.pickup_address || "—"}</span></div>
                            <div><span className="text-muted-foreground">To:</span> <span className="text-foreground">{t.dropoff_address || "—"}</span></div>
                            <div><span className="text-muted-foreground">Customer:</span> <span className="text-foreground">{t.customer_name || "—"}</span></div>
                            <div><span className="text-muted-foreground">Customer Phone:</span> <span className="text-foreground">{t.customer_phone || "—"}</span></div>
                            <div><span className="text-muted-foreground">Driver:</span> <span className="text-foreground">{t.driver ? `${(t.driver as any).first_name} ${(t.driver as any).last_name}` : "—"}</span></div>
                            <div><span className="text-muted-foreground">Vehicle:</span> <span className="text-foreground">{(() => {
                              const assigned = getAssignedVehicleDetails(t);
                              const vehicleText = [assigned.color, assigned.plateNumber].filter(Boolean).join(" • ");
                              return assigned.centerCode ? `${assigned.centerCode}${vehicleText ? ` • ${vehicleText}` : ""}` : "—";
                            })()}</span></div>
                            <div><span className="text-muted-foreground">Cancel Reason:</span> <span className="text-foreground">{t.cancel_reason || "—"}</span></div>
                            <div className="col-span-2 flex items-center justify-between">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  supabase.from("trips").update({ is_loss: false, status: "completed", cancel_reason: null, cancelled_at: null }).eq("id", t.id).then(() => {
                                    toast({ title: "Removed from Loss" });
                                    refreshTrips();
                                  });
                                }}
                                className="h-6 px-2 rounded text-[10px] font-bold bg-success/15 text-success hover:bg-success/25 transition-colors"
                              >
                                Remove from Loss
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Todays Booking */}
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-primary flex items-center gap-1.5">
                        <Navigation className="w-3.5 h-3.5 text-primary" />
                        Todays Booking ({recentTrips.length})
                      </h3>
                      <input
                        type="text"
                        value={bookingSearch}
                        onChange={(e) => setBookingSearch(e.target.value)}
                        placeholder="Search..."
                        className="h-6 w-28 px-2 text-[10px] rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto max-h-[calc(100vh-420px)] p-1.5 space-y-1">
                    {(() => {
                      const q = bookingSearch.toLowerCase().trim();
                      const filtered = q ? recentTrips.filter((t: any) => {
                        const centerCode = t.vehicle?.center_code?.toLowerCase() || t.booking_notes?.match(/Center:\s*(.+)/)?.[1]?.toLowerCase() || "";
                        const plateNumber = t.vehicle?.plate_number?.toLowerCase() || "";
                        const pickup = (t.pickup_address || "").toLowerCase();
                        const dropoff = (t.dropoff_address || "").toLowerCase();
                        return centerCode.includes(q) || plateNumber.includes(q) || pickup.includes(q) || dropoff.includes(q);
                      }) : recentTrips;
                      
                      const displayTrips = filtered.slice(0, 5);
                      
                      if (filtered.length === 0) {
                        return <p className="text-xs text-muted-foreground text-center py-4">{q ? "No matches found" : "No recent rides"}</p>;
                      }
                      return (<>
                        {displayTrips.map((t: any) => (
                        <div
                          key={t.id}
                          className={`rounded-md overflow-hidden ${
                            t.is_loss
                              ? "bg-destructive/10 border border-destructive/30"
                              : t.status === "completed"
                                ? "bg-success/10 border border-success/30"
                                : t.status === "cancelled"
                                  ? "bg-warning/10 border border-warning/30"
                                  : "bg-surface border border-border"
                          }`}
                        >
                          <div className="px-2.5 py-1.5 flex items-center gap-2 text-[10px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setExpandedTripId(expandedTripId === `booking-${t.id}` ? null : `booking-${t.id}`)}>
                            <span className="text-muted-foreground whitespace-nowrap font-medium">
                              {new Date(t.created_at).toLocaleDateString([], { month: "short", day: "2-digit" }).toUpperCase()} • {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {t.dispatch_type !== "operator" && (
                              <span className="inline-block px-1 py-0.5 rounded bg-blue-500/15 text-blue-500 text-[8px] font-bold whitespace-nowrap">APP</span>
                            )}
                            {t.vehicle ? (
                              <>
                                {(t.vehicle as any).center_code && (
                                  <span className="inline-block px-1 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-bold whitespace-nowrap">{(t.vehicle as any).center_code}</span>
                                )}
                                <span className="text-muted-foreground whitespace-nowrap">{(t.vehicle as any).color || ""} • {(t.vehicle as any).plate_number}</span>
                              </>
                            ) : (
                              <span className="whitespace-nowrap italic">
                                {(() => {
                                  const assigned = getAssignedVehicleDetails(t);
                                  if (!assigned.centerCode) return <span className="text-muted-foreground">—</span>;
                                  return (
                                    <>
                                      <span className="font-bold text-[11px] text-primary">{assigned.centerCode}</span>
                                      {assigned.color && (
                                        <>
                                          <span className="text-muted-foreground"> • </span>
                                          <span style={{ color: assigned.color.toLowerCase() }}>{assigned.color}</span>
                                        </>
                                      )}
                                      {assigned.plateNumber && <span className="text-muted-foreground"> • {assigned.plateNumber}</span>}
                                    </>
                                  );
                                })()}
                              </span>
                            )}
                            {(t.is_loss || t.status !== "completed") && (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                                t.is_loss ? "bg-destructive/20 text-destructive" :
                                t.status === "cancelled" ? "bg-warning/20 text-warning" :
                                t.status === "started" ? "bg-blue-500/15 text-blue-500" :
                                t.status === "accepted" ? "bg-success/20 text-success" :
                                "bg-surface text-muted-foreground"
                              }`}>{t.is_loss ? "LOSS" : t.status}</span>
                            )}
                            <span className="text-foreground truncate flex-1">
                              {(t.pickup_address || "").split(",")[0]} <span className="text-primary">→</span> {(t.dropoff_address || "").split(",")[0]}
                            </span>
                            {!t.is_loss && (t.status === "accepted" || t.status === "started") && t.driver && (
                              <a href={`tel:${(t.driver as any).phone_number}`} onClick={(e) => e.stopPropagation()} className="text-[9px] font-bold text-success shrink-0 px-1.5 py-0.5 rounded bg-success/15 hover:bg-success/25 transition-colors" title={`Call ${(t.driver as any).first_name}`}>
                                <Phone className="w-3 h-3" />
                              </a>
                            )}
                            {!t.is_loss && t.status !== "completed" && t.status !== "cancelled" && (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); setTrackingTripId(t.id); }} className="text-[9px] font-bold text-primary hover:text-primary/90 shrink-0 px-1.5 py-0.5 rounded bg-primary/15 hover:bg-primary/25 transition-colors" title="Track on Live Map">
                                  <Navigation className="w-3 h-3" />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleDispatchCancel(t.id); }} className="text-[9px] font-bold text-warning hover:text-warning/90 shrink-0 px-1.5 py-0.5 rounded bg-warning/15 hover:bg-warning/25 transition-colors">
                                  CANCEL
                                </button>
                              </>
                            )}
                            {!t.is_loss && t.status !== "cancelled" && (
                              <button onClick={(e) => { e.stopPropagation(); handleMarkLoss(t.id); }} disabled={markingLoss === t.id} className="text-[9px] font-bold text-destructive hover:text-destructive/80 shrink-0 px-1.5 py-0.5 rounded bg-destructive/10 hover:bg-destructive/20 transition-colors disabled:opacity-40">
                                {markingLoss === t.id ? "..." : "LOSS"}
                              </button>
                            )}
                          </div>
                          {expandedTripId === `booking-${t.id}` && (
                            <div className="px-2.5 pb-2 pt-1 border-t border-border grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                              <div><span className="text-muted-foreground">From:</span> <span className="text-foreground">{t.pickup_address || "—"}</span></div>
                              <div><span className="text-muted-foreground">To:</span> <span className="text-foreground">{t.dropoff_address || "—"}</span></div>
                              <div><span className="text-muted-foreground">Customer Phone:</span> <span className="text-foreground">{t.customer_phone || "—"}</span></div>
                              <div><span className="text-muted-foreground">Driver:</span> <span className="text-foreground">{t.driver ? `${(t.driver as any).first_name} ${(t.driver as any).last_name}` : "—"}</span></div>
                              <div><span className="text-muted-foreground">Driver Phone:</span> <span className="text-foreground">{t.driver ? (t.driver as any).phone_number || "—" : "—"}</span></div>
                              <div><span className="text-muted-foreground">Vehicle:</span> <span className="text-foreground">{(() => {
                                const assigned = getAssignedVehicleDetails(t);
                                const vehicleText = [assigned.color, assigned.plateNumber].filter(Boolean).join(" • ");
                                return assigned.centerCode ? `${assigned.centerCode}${vehicleText ? ` • ${vehicleText}` : ""}` : "—";
                              })()}</span></div>
                              <div><span className="text-muted-foreground">Fare:</span> <span className="text-foreground">{t.actual_fare ?? t.estimated_fare ?? "—"}</span></div>
                              <div><span className="text-muted-foreground">Status:</span> <span className={`font-bold ${t.is_loss ? "text-red-500" : t.status === "cancelled" ? "text-warning" : t.status === "completed" ? "text-green-500" : "text-foreground"}`}>{t.is_loss ? "LOSS" : t.status?.toUpperCase()}</span></div>
                              

                              <div className="col-span-2 flex items-center justify-between pt-1">
                                <div className="flex items-center gap-2">
                                  {t.driver && (t.status === "accepted" || t.status === "started") && (
                                    <a
                                      href={`tel:${(t.driver as any).phone_number}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="h-6 px-2 rounded text-[10px] font-bold bg-success/15 text-success hover:bg-success/25 transition-colors flex items-center gap-1"
                                    >
                                      <Phone className="w-3 h-3" /> Call Driver
                                    </a>
                                  )}
                                  {t.status !== "cancelled" && !t.is_loss && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); if (t.status !== "completed") setTrackingTripId(t.id); }}
                                      disabled={t.status === "completed"}
                                      className="h-6 px-2 rounded text-[10px] font-bold bg-primary/15 text-primary hover:bg-primary/25 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <Navigation className="w-3 h-3" /> Track Live
                                    </button>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {(t.is_loss || t.status === "cancelled") && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        supabase.from("trips").update({ is_loss: false, status: "completed", cancel_reason: null, cancelled_at: null }).eq("id", t.id).then(() => {
                                          toast({ title: "Removed from Loss/Cancel" });
                                          refreshTrips();
                                        });
                                      }}
                                      className="h-6 px-2 rounded text-[10px] font-bold bg-success/15 text-success hover:bg-success/25 transition-colors"
                                    >
                                      Restore Trip
                                    </button>
                                  )}
                                  {t.status !== "cancelled" && !t.is_loss && (
                                    <>
                                      <button onClick={(e) => { e.stopPropagation(); handleMarkLoss(t.id); }} disabled={markingLoss === t.id} className="h-6 px-2 rounded text-[10px] font-bold bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors disabled:opacity-40">
                                        {markingLoss === t.id ? "..." : "LOSS"}
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleDispatchCancel(t.id); }}
                                        className="h-6 px-2 rounded text-[10px] font-bold bg-warning/15 text-warning hover:bg-warning/25 transition-colors"
                                      >
                                        Cancel Trip
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                        {filtered.length > 5 && (
                          <button
                            onClick={() => setShowAllBookings(true)}
                            className="w-full text-center py-1.5 text-[10px] font-bold text-primary hover:underline"
                          >
                            View All {filtered.length} Bookings →
                          </button>
                        )}
                      </>);
                    })()}
                  </div>
                  <div className="px-3 py-1.5 border-t border-border flex items-center justify-between">
                    <span className="text-[9px] text-muted-foreground">
                      {`${recentTrips.length} total bookings`}
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setShowAllBookings(true)} className="text-[9px] text-primary font-medium hover:underline">View All</button>
                      <button onClick={refreshTrips} className="text-[9px] text-primary font-medium hover:underline">Refresh</button>
                    </div>
                  </div>
                </div>

                {/* App Requests Table */}
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-border bg-orange-500/5">
                    <h3 className="text-xs font-bold text-orange-500 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-orange-500" />
                      App Requests ({appRequestTrips.length})
                    </h3>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto p-1.5 space-y-1.5">
                    {appRequestTrips.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No app requests</p>
                    ) : appRequestTrips.map((t: any) => {
                      // Status logic: cancelled without accept = no drivers, cancelled after accept = cancelled
                      const wasAccepted = !!t.accepted_at;
                      const statusLabel = t.status === "cancelled"
                        ? (wasAccepted ? "Cancelled" : "No drivers available")
                        : t.status === "completed" ? "Completed"
                        : t.status === "accepted" ? "Accepted"
                        : t.status === "started" ? "On Trip"
                        : "Searching...";
                      const statusColor = t.status === "cancelled"
                        ? (wasAccepted ? "bg-warning/20 text-warning" : "bg-destructive/20 text-destructive")
                        : t.status === "completed" ? "bg-success/20 text-success"
                        : t.status === "accepted" || t.status === "started" ? "bg-orange-500/20 text-orange-500"
                        : "bg-primary/10 text-primary animate-pulse";
                      const borderColor = t.status === "cancelled"
                        ? (wasAccepted ? "border-warning/30" : "border-destructive/30")
                        : t.status === "completed" ? "border-success/30"
                        : t.status === "accepted" || t.status === "started" ? "border-orange-500/30"
                        : "border-primary/20";

                      const driver = t.driver as any;
                      const vehicle = t.vehicle as any;
                      const hasDriverInfo = driver && (t.status === "accepted" || t.status === "started" || t.status === "completed");

                      return (
                        <div
                          key={t.id}
                          className={`rounded-lg overflow-hidden bg-card border ${borderColor} transition-all`}
                        >
                          {/* Header row */}
                          <div className="px-2.5 py-2 flex items-center gap-2 text-[10px] cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setExpandedTripId(expandedTripId === `app-${t.id}` ? null : `app-${t.id}`)}>
                            <span className="text-muted-foreground whitespace-nowrap font-medium">
                              {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase whitespace-nowrap ${statusColor}`}>
                              {statusLabel}
                            </span>
                            <span className="text-foreground truncate flex-1 font-medium">
                              {(t.pickup_address || "").split(",")[0]} <span className="text-orange-500">→</span> {(t.dropoff_address || "").split(",")[0]}
                            </span>
                            {hasDriverInfo && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                {driver.avatar_url ? (
                                  <img src={driver.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover border border-border" />
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center text-[8px] font-bold text-orange-500">
                                    {driver.first_name?.[0] || "?"}
                                  </div>
                                )}
                                <span className="text-[9px] text-foreground font-medium">{driver.first_name}</span>
                              </div>
                            )}
                            {t.status === "requested" && (
                              <button onClick={(e) => { e.stopPropagation(); handleDispatchCancel(t.id); }} className="text-[9px] font-bold text-warning shrink-0 px-1.5 py-0.5 rounded bg-warning/15 hover:bg-warning/25 transition-colors">
                                CANCEL
                              </button>
                            )}
                          </div>

                          {/* Driver + Vehicle card (always shown when accepted) */}
                          {hasDriverInfo && (
                            <div className="mx-2.5 mb-2 rounded-lg bg-muted/30 border border-border p-2.5">
                              <div className="flex items-start gap-3">
                                {/* Driver avatar */}
                                <div className="shrink-0">
                                  {driver.avatar_url ? (
                                    <img src={driver.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-orange-500/30" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center text-sm font-bold text-orange-500 border-2 border-orange-500/30">
                                      {driver.first_name?.[0]}{driver.last_name?.[0]}
                                    </div>
                                  )}
                                </div>
                                {/* Driver info */}
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-foreground">{driver.first_name} {driver.last_name}</span>
                                    {driver.company_name && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{driver.company_name}</span>
                                    )}
                                  </div>
                                  <a href={`tel:${driver.phone_number}`} className="text-[10px] text-primary hover:underline">{driver.phone_number}</a>
                                </div>
                              </div>
                              {/* Vehicle info */}
                              {vehicle && (
                                <div className="mt-2 pt-2 border-t border-border flex items-center gap-3 text-[10px]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground">Plate:</span>
                                    <span className="font-bold text-foreground">{vehicle.plate_number}</span>
                                  </div>
                                  {vehicle.color && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-muted-foreground">Color:</span>
                                      <span className="font-medium text-foreground flex items-center gap-1">
                                        <span className="w-2.5 h-2.5 rounded-full border border-border inline-block" style={{ backgroundColor: vehicle.color.toLowerCase() }} />
                                        {vehicle.color}
                                      </span>
                                    </div>
                                  )}
                                  {vehicle.center_code && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-muted-foreground">Center:</span>
                                      <span className="font-bold text-primary">{vehicle.center_code}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Expanded trip details */}
                          {expandedTripId === `app-${t.id}` && (
                            <div className="px-2.5 pb-2 pt-1 border-t border-border grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                              <div><span className="text-muted-foreground">From:</span> <span className="text-foreground">{t.pickup_address || "—"}</span></div>
                              <div><span className="text-muted-foreground">To:</span> <span className="text-foreground">{t.dropoff_address || "—"}</span></div>
                              <div><span className="text-muted-foreground">Customer:</span> <span className="text-foreground">{t.customer_name || "—"} • {t.customer_phone || "—"}</span></div>
                              <div><span className="text-muted-foreground">Fare:</span> <span className="text-foreground">{t.actual_fare ?? t.estimated_fare ?? "—"}</span></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right — 3 Bid Forms side by side */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 min-w-0">
                {/* Bid 1 */}
                <DispatchTripForm
                  formIndex={0}
                  dispatcherProfile={dispatcherProfile}
                  vehicleTypes={vehicleTypes}
                  onlineDrivers={onlineDrivers}
                  centerCodeIndex={centerCodeIndex}
                  onTripCreated={refreshTrips}
                />

                {/* Bid 2 */}
                <DispatchTripForm
                  formIndex={1}
                  dispatcherProfile={dispatcherProfile}
                  vehicleTypes={vehicleTypes}
                  onlineDrivers={onlineDrivers}
                  centerCodeIndex={centerCodeIndex}
                  onTripCreated={refreshTrips}
                />

                {/* Bid 3 */}
                <DispatchTripForm
                  formIndex={2}
                  dispatcherProfile={dispatcherProfile}
                  vehicleTypes={vehicleTypes}
                  onlineDrivers={onlineDrivers}
                  centerCodeIndex={centerCodeIndex}
                  onTripCreated={refreshTrips}
                />
              </div>
            </div>
          </div>
        )}

        {/* Admin area tabs */}
        {activeTab === "dashboard" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminDashboard /></div>}
        {activeTab === "trips" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminTrips /></div>}
        {activeTab === "drivers" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminDrivers /></div>}
        {activeTab === "passengers" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminPassengers /></div>}
        {activeTab === "vehicle_types" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminVehicleTypes /></div>}
        {activeTab === "fares" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminFares /></div>}
        {activeTab === "billing" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminBilling /></div>}
        {activeTab === "wallets" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminWallets /></div>}
        {activeTab === "locations" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminLocations /></div>}
        {activeTab === "lost_items" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminLostItems /></div>}
        {activeTab === "sos_history" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminSOSHistory /></div>}
        {activeTab === "notifications" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminNotifications /></div>}
        {activeTab === "banks" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminBanks /></div>}
        {activeTab === "companies" && <div className="p-4 lg:p-6 max-w-7xl mx-auto"><AdminCompanies /></div>}
      </div>

      {/* Chat history modal */}
      {selectedTripMessages !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm" onClick={() => { setSelectedTripMessages(null); setSelectedTripId(null); }}>
          <div className="bg-card rounded-2xl shadow-2xl mx-4 w-full max-w-lg max-h-[70vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Trip Messages & Reports</h3>
              <button onClick={() => { setSelectedTripMessages(null); setSelectedTripId(null); }} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {lostItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1"><PackageX className="w-3.5 h-3.5" /> Lost Item Reports</p>
                  {lostItems.map((item: any) => (
                    <div key={item.id} className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
                      <p className="text-sm text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">Status: <span className="font-medium">{item.status}</span> • {new Date(item.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Messages ({selectedTripMessages.length})</p>
              {selectedTripMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No messages in this trip</p>
              ) : (
                selectedTripMessages.map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.sender_type === "system" ? "justify-center" : msg.sender_type === "driver" ? "justify-end" : "justify-start"}`}>
                    {msg.sender_type === "system" ? (
                      <span className="text-[10px] text-muted-foreground bg-surface px-3 py-1 rounded-full">{msg.message}</span>
                    ) : (
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${msg.sender_type === "driver" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-surface text-foreground rounded-bl-md"}`}>
                        <p className="text-[10px] font-semibold opacity-70 mb-0.5">{msg.sender_type === "driver" ? "Driver" : "Passenger"}</p>
                        <p className="text-sm">{msg.message}</p>
                        <p className="text-[9px] mt-1 opacity-60">{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Map Tracking Dialog */}
      <Dialog open={!!trackingTripId} onOpenChange={(open) => { if (!open) setTrackingTripId(null); }}>
        <DialogContent className="max-w-4xl w-[95vw] h-[80vh] p-0 overflow-hidden" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Live Trip Tracking</DialogTitle>
          {trackingTripId && <LiveTripTracker tripId={trackingTripId} />}
        </DialogContent>
      </Dialog>

      {/* All Bookings Dialog */}
      <Dialog open={showAllBookings} onOpenChange={setShowAllBookings}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[85vh] overflow-hidden flex flex-col" aria-describedby={undefined}>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Navigation className="w-4 h-4 text-primary" />
            All Bookings
          </DialogTitle>
          
          {/* Search + Filters */}
          <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-border">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={allBookingsSearch}
                onChange={(e) => setAllBookingsSearch(e.target.value)}
                placeholder="Search center code, plate, address..."
                className="w-full h-7 pl-7 pr-2 text-[11px] rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-1">
              {[
                { key: "today", label: "Today" },
                { key: "yesterday", label: "Yesterday" },
                { key: "this_week", label: "This Week" },
                { key: "last_week", label: "Last Week" },
                { key: "this_month", label: "This Month" },
                { key: "last_month", label: "Last Month" },
                { key: "all", label: "All Time" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => { setAllBookingsDateFilter(f.key); setAllBookingsCustomDate(undefined); }}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                    allBookingsDateFilter === f.key && !allBookingsCustomDate
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <button className={`px-2 py-1 text-[10px] font-medium rounded transition-colors flex items-center gap-1 ${
                    allBookingsCustomDate ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}>
                    <CalendarIcon className="w-3 h-3" />
                    {allBookingsCustomDate ? format(allBookingsCustomDate, "dd MMM") : "Pick Date"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={allBookingsCustomDate}
                    onSelect={(d) => { setAllBookingsCustomDate(d); setAllBookingsDateFilter("custom"); }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Filtered list */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {(() => {
              const now = new Date();
              let dateStart: Date | null = null;
              let dateEnd: Date | null = null;
              
              if (allBookingsCustomDate) {
                dateStart = startOfDay(allBookingsCustomDate);
                dateEnd = endOfDay(allBookingsCustomDate);
              } else {
                switch (allBookingsDateFilter) {
                  case "today": dateStart = startOfDay(now); dateEnd = endOfDay(now); break;
                  case "yesterday": dateStart = startOfDay(subDays(now, 1)); dateEnd = endOfDay(subDays(now, 1)); break;
                  case "this_week": dateStart = startOfWeek(now, { weekStartsOn: 1 }); dateEnd = endOfWeek(now, { weekStartsOn: 1 }); break;
                  case "last_week": dateStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }); dateEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }); break;
                  case "this_month": dateStart = startOfMonth(now); dateEnd = endOfMonth(now); break;
                  case "last_month": dateStart = startOfMonth(subMonths(now, 1)); dateEnd = endOfMonth(subMonths(now, 1)); break;
                  case "all": dateStart = null; dateEnd = null; break;
                }
              }

              const q = allBookingsSearch.toLowerCase().trim();
              const filtered = recentTrips.filter((t: any) => {
                // Date filter
                if (dateStart && dateEnd) {
                  const created = new Date(t.created_at);
                  if (created < dateStart || created > dateEnd) return false;
                }
                // Search filter
                if (q) {
                  const centerCode = t.vehicle?.center_code?.toLowerCase() || t.booking_notes?.match(/Center:\s*(.+)/)?.[1]?.toLowerCase() || "";
                  const plateNumber = t.vehicle?.plate_number?.toLowerCase() || "";
                  const pickup = (t.pickup_address || "").toLowerCase();
                  const dropoff = (t.dropoff_address || "").toLowerCase();
                  const customerName = (t.customer_name || "").toLowerCase();
                  const driverName = t.driver ? `${(t.driver as any).first_name} ${(t.driver as any).last_name}`.toLowerCase() : "";
                  return centerCode.includes(q) || plateNumber.includes(q) || pickup.includes(q) || dropoff.includes(q) || customerName.includes(q) || driverName.includes(q);
                }
                return true;
              });

              if (filtered.length === 0) {
                return <p className="text-xs text-muted-foreground text-center py-8">No bookings found</p>;
              }

              return (
                <>
                  <p className="text-[10px] text-muted-foreground px-1">{filtered.length} booking{filtered.length !== 1 ? "s" : ""}</p>
                  {filtered.map((t: any) => (
                    <div
                      key={t.id}
                      className={`rounded-md overflow-hidden ${
                        t.is_loss
                          ? "bg-destructive/10 border border-destructive/30"
                          : t.status === "completed"
                            ? "bg-success/10 border border-success/30"
                            : t.status === "cancelled"
                              ? "bg-warning/10 border border-warning/30"
                              : "bg-surface border border-border"
                      }`}
                    >
                      <div className="px-2.5 py-1.5 flex items-center gap-2 text-[10px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setExpandedTripId(expandedTripId === `all-${t.id}` ? null : `all-${t.id}`)}>
                        <span className="text-muted-foreground whitespace-nowrap font-medium">
                          {new Date(t.created_at).toLocaleDateString([], { month: "short", day: "2-digit" }).toUpperCase()} • {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {t.vehicle ? (
                          <>
                            {(t.vehicle as any).center_code && (
                              <span className="inline-block px-1 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-bold whitespace-nowrap">{(t.vehicle as any).center_code}</span>
                            )}
                            <span className="text-muted-foreground whitespace-nowrap">{(t.vehicle as any).color || ""} • {(t.vehicle as any).plate_number}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                          t.is_loss ? "bg-destructive/20 text-destructive" :
                          t.status === "cancelled" ? "bg-warning/20 text-warning" :
                          t.status === "completed" ? "bg-success/20 text-success" :
                          t.status === "started" ? "bg-accent/50 text-accent-foreground" :
                          t.status === "accepted" ? "bg-success/20 text-success" :
                          "bg-surface text-muted-foreground"
                        }`}>{t.is_loss ? "LOSS" : t.status}</span>
                        <span className="text-foreground truncate flex-1">
                          {(t.pickup_address || "").split(",")[0]} <span className="text-primary">→</span> {(t.dropoff_address || "").split(",")[0]}
                        </span>
                        {t.driver && (t.status === "accepted" || t.status === "started") && (
                          <a href={`tel:${(t.driver as any).phone_number}`} onClick={(e) => e.stopPropagation()} className="text-[9px] font-bold text-success shrink-0 px-1.5 py-0.5 rounded bg-success/15 hover:bg-success/25 transition-colors">
                            <Phone className="w-3 h-3" />
                          </a>
                        )}
                        {!t.is_loss && t.status !== "completed" && t.status !== "cancelled" && (
                          <button onClick={(e) => { e.stopPropagation(); setTrackingTripId(t.id); setShowAllBookings(false); }} className="text-[9px] font-bold text-primary shrink-0 px-1.5 py-0.5 rounded bg-primary/15 hover:bg-primary/25 transition-colors">
                            <Navigation className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {expandedTripId === `all-${t.id}` && (
                        <div className="px-2.5 pb-2 pt-1 border-t border-border grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                          <div><span className="text-muted-foreground">From:</span> <span className="text-foreground">{t.pickup_address || "—"}</span></div>
                          <div><span className="text-muted-foreground">To:</span> <span className="text-foreground">{t.dropoff_address || "—"}</span></div>
                          <div><span className="text-muted-foreground">Customer:</span> <span className="text-foreground">{t.customer_name || "—"} {t.customer_phone || ""}</span></div>
                          <div><span className="text-muted-foreground">Driver:</span> <span className="text-foreground">{t.driver ? `${(t.driver as any).first_name} ${(t.driver as any).last_name}` : "—"}</span></div>
                          <div><span className="text-muted-foreground">Fare:</span> <span className="text-foreground">{t.actual_fare ?? t.estimated_fare ?? "—"}</span></div>
                          <div><span className="text-muted-foreground">Status:</span> <span className={`font-bold ${t.is_loss ? "text-destructive" : t.status === "completed" ? "text-success" : "text-foreground"}`}>{t.is_loss ? "LOSS" : t.status?.toUpperCase()}</span></div>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dispatch;
