import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { toast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/use-theme";
import {
  Phone, MapPin, X, Loader2, Navigation, ArrowRight, Moon, Sun,
  MessageSquare, PackageX, AlertTriangle, LayoutDashboard, Users,
  MapPinIcon, Layers, DollarSign, Receipt, Siren, BellRing, Wallet, Building2, Building
} from "lucide-react";
import SystemLogo from "@/components/SystemLogo";
import SOSAlertPanel from "@/components/SOSAlertPanel";
import AdminSOSHistory from "@/components/admin/AdminSOSHistory";
import DispatchTripForm from "@/components/dispatch/DispatchTripForm";

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
  const [lostTrips, setLostTrips] = useState<any[]>([]);
  const [markingLoss, setMarkingLoss] = useState<string | null>(null);

  // Chat history
  const [selectedTripMessages, setSelectedTripMessages] = useState<any[] | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [lostItems, setLostItems] = useState<any[]>([]);

  // Preloaded center-code index for instant lookups (refreshed in background)
  const [centerCodeIndex, setCenterCodeIndex] = useState<Record<string, any>>({});

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
      const [vtRes, driversRes, tripsRes, lostRes] = await Promise.all([
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
          .select(
            "id, status, pickup_address, dropoff_address, customer_name, customer_phone, created_at, dispatch_type, driver_id, estimated_fare, actual_fare, booking_notes, driver:profiles!trips_driver_id_fkey(first_name, last_name, phone_number), vehicle:vehicles!trips_vehicle_id_fkey(plate_number, center_code, color)"
          )
          .eq("dispatch_type", "operator")
          .in("status", ["requested", "accepted", "started", "completed"])
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("trips")
          .select(
            "id, status, pickup_address, dropoff_address, customer_name, customer_phone, created_at, cancel_reason, driver_id, booking_notes, driver:profiles!trips_driver_id_fkey(first_name, last_name), vehicle:vehicles!trips_vehicle_id_fkey(plate_number, center_code, color)"
          )
          .eq("dispatch_type", "operator")
          .eq("is_loss", true)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      setVehicleTypes(vtRes.data || []);
      setRecentTrips(tripsRes.data || []);
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

  // Realtime: auto-refresh trips table on any change
  useEffect(() => {
    if (!isAuthed) return;
    const channel = supabase
      .channel("dispatch-trips-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "trips",
      }, () => {
        refreshTrips();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthed]);

  const refreshTrips = async () => {
    const [{ data }, { data: lost }] = await Promise.all([
      supabase.from("trips").select("id, status, pickup_address, dropoff_address, customer_name, customer_phone, created_at, dispatch_type, driver_id, estimated_fare, actual_fare, driver:profiles!trips_driver_id_fkey(first_name, last_name, phone_number), vehicle:vehicles!trips_vehicle_id_fkey(plate_number, center_code, color)")
        .eq("dispatch_type", "operator").in("status", ["requested", "accepted", "started", "completed"]).order("created_at", { ascending: false }).limit(30),
      supabase.from("trips").select("id, status, pickup_address, dropoff_address, customer_name, customer_phone, created_at, cancel_reason, driver_id, driver:profiles!trips_driver_id_fkey(first_name, last_name), vehicle:vehicles!trips_vehicle_id_fkey(plate_number, center_code, color)")
        .eq("dispatch_type", "operator").eq("is_loss", true).order("created_at", { ascending: false }).limit(30),
    ]);
    setRecentTrips(data || []);
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
            <div className="flex flex-col lg:flex-row gap-1.5 mt-2">
              {/* Left Column — IN LOSS + Todays Booking (takes ~38% on desktop) */}
              <div className="lg:w-[38%] lg:min-w-[340px] space-y-1.5 min-w-0 shrink-0">
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
                      <div key={t.id} className="bg-surface border border-destructive/20 rounded-md px-2.5 py-1.5 flex items-center gap-2 text-[10px]">
                        <span className="text-muted-foreground whitespace-nowrap font-medium">
                          {new Date(t.created_at).toLocaleDateString([], { month: "short", day: "2-digit" }).toUpperCase()}{" "}
                          {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-destructive/15 text-destructive uppercase">LOSS STATUS</span>
                        {t.vehicle ? (
                          <>
                            {(t.vehicle as any).center_code && (
                              <span className="inline-block px-1 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-bold whitespace-nowrap">{(t.vehicle as any).center_code}</span>
                            )}
                            <span className="text-muted-foreground whitespace-nowrap">{(t.vehicle as any).color || ""} • {(t.vehicle as any).plate_number}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground whitespace-nowrap italic">
                            {t.booking_notes?.match(/Center:\s*(.+)/)?.[1] || "—"}
                          </span>
                        )}
                        <span className="text-foreground truncate flex-1">
                          {t.customer_name || "N/A"} • {(t.pickup_address || "").split(",")[0]} <span className="text-destructive">→</span> {(t.dropoff_address || "").split(",")[0]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Todays Booking */}
                <div className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <h3 className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-primary" />
                      Todays Booking ({recentTrips.length})
                    </h3>
                    <p className="text-[9px] text-muted-foreground mt-0.5">💡 Search by center code or from location.</p>
                  </div>
                  <div className="flex-1 overflow-y-auto max-h-[calc(100vh-420px)] p-1.5 space-y-1">
                    {recentTrips.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No recent rides</p>
                    ) : recentTrips.map((t: any) => (
                      <div key={t.id} className="bg-surface border border-border rounded-md px-2.5 py-1.5 flex items-center gap-2 text-[10px]">
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
                          <span className="text-muted-foreground whitespace-nowrap italic">
                            {t.booking_notes?.match(/Center:\s*(.+)/)?.[1] || "—"}
                          </span>
                        )}
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          t.status === "completed" ? "bg-green-500/15 text-green-500" :
                          t.status === "started" ? "bg-blue-500/15 text-blue-500" :
                          t.status === "accepted" ? "bg-amber-500/15 text-amber-500" :
                          "bg-surface text-muted-foreground"
                        }`}>{t.status}</span>
                        <span className="text-foreground truncate flex-1">
                          {t.vehicle ? `${(t.vehicle as any).plate_number}` : ""}{t.driver ? `• ${(t.driver as any).first_name}` : ""} • {(t.pickup_address || "").split(",")[0]} <span className="text-primary">→</span> {(t.dropoff_address || "").split(",")[0]}
                        </span>
                        <button onClick={() => handleMarkLoss(t.id)} disabled={markingLoss === t.id} className="text-[9px] font-bold text-destructive hover:text-destructive/80 shrink-0 px-1.5 py-0.5 rounded bg-destructive/10 hover:bg-destructive/20 transition-colors disabled:opacity-40">
                          {markingLoss === t.id ? "..." : "LOSS"}
                        </button>
                        <button onClick={() => viewMessages(t.id)} className="text-muted-foreground hover:text-primary shrink-0">
                          <MessageSquare className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-1.5 border-t border-border flex items-center justify-between">
                    <span className="text-[9px] text-muted-foreground">Showing {recentTrips.length} bookings</span>
                    <button onClick={refreshTrips} className="text-[9px] text-primary font-medium hover:underline">Refresh</button>
                  </div>
                </div>
              </div>

              {/* Right — 3 Bid Forms side by side */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5 min-w-0">
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
    </div>
  );
};

export default Dispatch;
