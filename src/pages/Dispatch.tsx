import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/hooks/use-theme";
import {
  Phone, MapPin, Users, Luggage, Plus, Minus, X, Search,
  Loader2, Navigation, Send, ArrowRight, Shield, Trash2, ChevronDown, Moon, Sun, MessageSquare, PackageX
} from "lucide-react";
import hdaLogo from "@/assets/hda-logo.png";

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
}

interface StopLocation {
  address: string;
  lat: number;
  lng: number;
}

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

const Dispatch = () => {
  const [isAuthed, setIsAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { theme, toggleTheme } = useTheme();
  const [dispatcherProfile, setDispatcherProfile] = useState<any>(null);

  // Login state
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loginStep, setLoginStep] = useState<"phone" | "otp">("phone");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Trip form state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pickup, setPickup] = useState<StopLocation | null>(null);
  const [dropoff, setDropoff] = useState<StopLocation | null>(null);
  const [stops, setStops] = useState<StopLocation[]>([]);
  const [passengerCount, setPassengerCount] = useState(1);
  const [luggageCount, setLuggageCount] = useState(0);
  const [selecting, setSelecting] = useState<"pickup" | "dropoff" | number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [osmResults, setOsmResults] = useState<NominatimResult[]>([]);
  const [osmSearching, setOsmSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Vehicle types and dispatch
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [selectedVehicleType, setSelectedVehicleType] = useState<string>("");
  const [dispatchMethod, setDispatchMethod] = useState<"broadcast" | "specific">("broadcast");
  const [onlineDrivers, setOnlineDrivers] = useState<OnlineDriver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Recent trips
  const [recentTrips, setRecentTrips] = useState<any[]>([]);

  // Chat history
  const [selectedTripMessages, setSelectedTripMessages] = useState<any[] | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [lostItems, setLostItems] = useState<any[]>([]);

  // Check auth on mount
  useEffect(() => {
    const stored = localStorage.getItem("hda_dispatcher");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setDispatcherProfile(parsed);
        setIsAuthed(true);
      } catch {}
    }
    setLoading(false);
  }, []);

  // Load vehicle types and online drivers
  useEffect(() => {
    if (!isAuthed) return;
    const load = async () => {
      const [vtRes, driversRes, tripsRes] = await Promise.all([
        supabase.from("vehicle_types").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("driver_locations").select(`
          driver_id, lat, lng,
          profiles:driver_id (first_name, last_name, phone_number),
          vehicles:vehicle_id (plate_number, vehicle_types:vehicle_type_id (name))
        `).eq("is_online", true).eq("is_on_trip", false),
        supabase.from("trips").select("id, status, pickup_address, dropoff_address, customer_name, customer_phone, created_at, dispatch_type")
          .eq("dispatch_type", "operator")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      setVehicleTypes(vtRes.data || []);
      setRecentTrips(tripsRes.data || []);

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

      // Check dispatcher or admin role
      const { data: profiles } = await supabase.from("profiles").select("*").eq("phone_number", phone);
      if (!profiles || profiles.length === 0) throw new Error("Profile not found");

      let matchedProfile: any = null;
      for (const p of profiles) {
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", p.id);
        if (roles?.some((r: any) => r.role === "dispatcher" || r.role === "admin")) {
          matchedProfile = p;
          break;
        }
      }

      if (!matchedProfile) throw new Error("You don't have dispatcher access");

      setDispatcherProfile(matchedProfile);
      setIsAuthed(true);
      localStorage.setItem("hda_dispatcher", JSON.stringify(matchedProfile));
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
    if (newOtp.every((d) => d !== "")) {
      setTimeout(() => handleVerify(newOtp.join("")), 300);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  // Nominatim search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) { setOsmResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setOsmSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=mv&limit=5&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        setOsmResults(await res.json());
      } catch { setOsmResults([]); }
      setOsmSearching(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const selectLocation = (result: NominatimResult) => {
    const loc: StopLocation = {
      address: result.name || result.display_name.split(",").slice(0, 2).join(", "),
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    };
    if (selecting === "pickup") setPickup(loc);
    else if (selecting === "dropoff") setDropoff(loc);
    else if (typeof selecting === "number") {
      const newStops = [...stops];
      newStops[selecting] = loc;
      setStops(newStops);
    }
    setSelecting(null);
    setSearchQuery("");
    setOsmResults([]);
  };

  const addStop = () => setStops([...stops, { address: "", lat: 0, lng: 0 }]);
  const removeStop = (i: number) => setStops(stops.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!pickup || !dropoff) {
      toast({ title: "Select pickup and dropoff", variant: "destructive" });
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      toast({ title: "Enter customer name and phone", variant: "destructive" });
      return;
    }
    if (dispatchMethod === "specific" && !selectedDriverId) {
      toast({ title: "Select a driver", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const tripPayload: any = {
        pickup_address: pickup.address,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        dropoff_address: dropoff.address,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,
        passenger_count: passengerCount,
        luggage_count: luggageCount,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        created_by: dispatcherProfile?.id || null,
        dispatch_type: "operator",
        vehicle_type_id: selectedVehicleType || null,
        status: dispatchMethod === "specific" ? "accepted" : "requested",
        driver_id: dispatchMethod === "specific" ? selectedDriverId : null,
        accepted_at: dispatchMethod === "specific" ? new Date().toISOString() : null,
        fare_type: "distance",
      };

      const { data: trip, error } = await supabase.from("trips").insert(tripPayload).select().single();
      if (error) throw error;

      // Insert intermediate stops
      if (stops.length > 0) {
        const validStops = stops.filter(s => s.lat !== 0 && s.address);
        if (validStops.length > 0) {
          await supabase.from("trip_stops").insert(
            validStops.map((s, i) => ({
              trip_id: trip.id,
              stop_order: i + 1,
              address: s.address,
              lat: s.lat,
              lng: s.lng,
            }))
          );
        }
      }

      toast({ title: "Trip created!", description: dispatchMethod === "specific" ? "Assigned to driver" : "Broadcasting to nearby drivers" });

      // Reset form
      setCustomerName("");
      setCustomerPhone("");
      setPickup(null);
      setDropoff(null);
      setStops([]);
      setPassengerCount(1);
      setLuggageCount(0);
      setSelectedDriverId("");

      // Refresh recent trips
      const { data: trips } = await supabase.from("trips").select("id, status, pickup_address, dropoff_address, customer_name, customer_phone, created_at, dispatch_type")
        .eq("dispatch_type", "operator").order("created_at", { ascending: false }).limit(20);
      setRecentTrips(trips || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
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
              <img src={hdaLogo} alt="HDA" className="w-8 h-8 object-contain" />
              <h1 className="text-2xl font-extrabold text-foreground">
                HDA <span className="text-primary">DISPATCH</span>
              </h1>
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
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="7XX XXXX" className="w-full pl-24 pr-4 py-4 bg-surface rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-base font-medium" autoFocus disabled={loginLoading} />
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
                  <input key={i} ref={(el) => { otpRefs.current[i] = el; }} type="tel" value={digit} onChange={(e) => handleOtpChange(i, e.target.value)} onKeyDown={(e) => handleOtpKeyDown(i, e)} maxLength={1} className="w-12 h-14 text-center text-2xl font-bold bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary" autoFocus={i === 0} disabled={loginLoading} />
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 lg:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={hdaLogo} alt="HDA" className="w-8 h-8 object-contain" />
          <h1 className="text-lg font-extrabold text-foreground">HDA <span className="text-primary">DISPATCH</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <span className="text-sm text-muted-foreground">{dispatcherProfile?.first_name} {dispatcherProfile?.last_name}</span>
          <button onClick={handleLogout} className="text-xs text-muted-foreground hover:text-destructive font-medium">Logout</button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 lg:p-8 space-y-6">
        <h2 className="text-2xl font-bold text-foreground">Create Trip Request</h2>

        {/* Customer info */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /> Customer Contact</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Customer Name *</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone Number *</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">+960</span>
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="7XXXXXX" className="w-full pl-12 pr-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
          </div>
        </div>

        {/* Locations */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Route</h3>

          {/* Location selector modal */}
          <AnimatePresence>
            {selecting !== null && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-start justify-center pt-20 p-4" onClick={() => { setSelecting(null); setSearchQuery(""); setOsmResults([]); }}>
                <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} className="bg-card border border-border rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
                  <h4 className="font-semibold text-foreground">
                    {selecting === "pickup" ? "Select Pickup" : selecting === "dropoff" ? "Select Dropoff" : `Select Stop ${(selecting as number) + 1}`}
                  </h4>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input type="text" placeholder="Search places in Maldives..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                    {osmSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {osmResults.map((r) => (
                      <button key={r.place_id} onClick={() => selectLocation(r)} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-surface text-left transition-colors">
                        <Navigation className="w-4 h-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{r.name || r.display_name.split(",")[0]}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.display_name.split(",").slice(0, 3).join(",")}</p>
                        </div>
                      </button>
                    ))}
                    {osmResults.length === 0 && searchQuery.length >= 3 && !osmSearching && (
                      <p className="text-sm text-muted-foreground text-center py-4">No places found</p>
                    )}
                    {searchQuery.length < 3 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Type at least 3 characters to search</p>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pickup */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Pickup Location *</label>
            <button onClick={() => { setSelecting("pickup"); setSearchQuery(""); setOsmResults([]); }} className={`w-full mt-1 px-3 py-3 rounded-lg text-left text-sm transition-all ${pickup ? "bg-surface border border-border text-foreground" : "bg-surface border-2 border-dashed border-border text-muted-foreground"}`}>
              {pickup ? pickup.address : "Click to select pickup location"}
            </button>
          </div>

          {/* Stops */}
          {stops.map((stop, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground">Stop {i + 1}</label>
                <button onClick={() => { setSelecting(i); setSearchQuery(""); setOsmResults([]); }} className={`w-full mt-1 px-3 py-3 rounded-lg text-left text-sm transition-all ${stop.address ? "bg-surface border border-border text-foreground" : "bg-surface border-2 border-dashed border-border text-muted-foreground"}`}>
                  {stop.address || "Click to select stop location"}
                </button>
              </div>
              <button onClick={() => removeStop(i)} className="mt-5 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}

          <button onClick={addStop} className="flex items-center gap-2 text-xs font-semibold text-primary hover:underline">
            <Plus className="w-3.5 h-3.5" /> Add Stop
          </button>

          {/* Dropoff */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Dropoff Location *</label>
            <button onClick={() => { setSelecting("dropoff"); setSearchQuery(""); setOsmResults([]); }} className={`w-full mt-1 px-3 py-3 rounded-lg text-left text-sm transition-all ${dropoff ? "bg-surface border border-border text-foreground" : "bg-surface border-2 border-dashed border-border text-muted-foreground"}`}>
              {dropoff ? dropoff.address : "Click to select dropoff location"}
            </button>
          </div>
        </div>

        {/* Passengers & Luggage */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Passengers</label>
              <div className="flex items-center gap-3 mt-2">
                <button onClick={() => setPassengerCount(Math.max(1, passengerCount - 1))} className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center" disabled={passengerCount <= 1}><Minus className="w-4 h-4" /></button>
                <span className="text-lg font-bold text-foreground w-6 text-center">{passengerCount}</span>
                <button onClick={() => setPassengerCount(Math.min(20, passengerCount + 1))} className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"><Plus className="w-4 h-4 text-primary" /></button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Luggage className="w-3.5 h-3.5" /> Luggage</label>
              <div className="flex items-center gap-3 mt-2">
                <button onClick={() => setLuggageCount(Math.max(0, luggageCount - 1))} className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center" disabled={luggageCount <= 0}><Minus className="w-4 h-4" /></button>
                <span className="text-lg font-bold text-foreground w-6 text-center">{luggageCount}</span>
                <button onClick={() => setLuggageCount(Math.min(30, luggageCount + 1))} className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"><Plus className="w-4 h-4 text-primary" /></button>
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle type & dispatch method */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Vehicle Type</label>
              <select value={selectedVehicleType} onChange={(e) => setSelectedVehicleType(e.target.value)} className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Any available</option>
                {vehicleTypes.map((vt) => <option key={vt.id} value={vt.id}>{vt.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Dispatch Method</label>
              <select value={dispatchMethod} onChange={(e) => setDispatchMethod(e.target.value as any)} className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="broadcast">Broadcast to nearby drivers</option>
                <option value="specific">Assign to specific driver</option>
              </select>
            </div>
          </div>

          {/* Driver picker */}
          {dispatchMethod === "specific" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Select Driver ({onlineDrivers.length} online)</label>
              {onlineDrivers.length === 0 ? (
                <p className="text-sm text-muted-foreground mt-2">No drivers online right now</p>
              ) : (
                <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                  {onlineDrivers.map((d) => (
                    <button key={d.driver_id} onClick={() => setSelectedDriverId(d.driver_id)} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all ${selectedDriverId === d.driver_id ? "bg-primary/10 ring-2 ring-primary" : "bg-surface hover:bg-muted"}`}>
                      <div>
                        <p className="text-sm font-medium text-foreground">{d.first_name} {d.last_name}</p>
                        <p className="text-xs text-muted-foreground">{d.vehicle_name} • {d.plate_number}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">+960 {d.phone_number}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={submitting || !pickup || !dropoff || !customerName || !customerPhone} className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 text-base">
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-5 h-5" /> Send Trip Request</>}
        </button>

        {/* Recent trips */}
        {recentTrips.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-bold text-foreground">Recent Dispatch Trips</h3>
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {recentTrips.map((t) => (
                <div key={t.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{t.customer_name} • +960 {t.customer_phone}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.pickup_address} → {t.dropoff_address}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => viewMessages(t.id)} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center text-primary hover:bg-primary/10 transition-colors" title="View chat & reports">
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                      t.status === "completed" ? "bg-primary/10 text-primary" :
                      t.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                      t.status === "accepted" ? "bg-accent text-accent-foreground" :
                      "bg-accent text-accent-foreground"
                    }`}>{t.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chat history modal */}
        {selectedTripMessages !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm" onClick={() => { setSelectedTripMessages(null); setSelectedTripId(null); }}>
            <div className="bg-card rounded-2xl shadow-2xl mx-4 w-full max-w-lg max-h-[70vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="font-bold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Trip Messages & Reports</h3>
                <button onClick={() => { setSelectedTripMessages(null); setSelectedTripId(null); }} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Lost items */}
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

                {/* Messages */}
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
    </div>
  );
};

export default Dispatch;
