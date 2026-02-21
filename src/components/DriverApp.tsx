import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserProfile } from "@/components/AuthScreen";
import DriverMap from "@/components/DriverMap";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
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
} from "lucide-react";

type DriverScreen = "offline" | "online" | "ride-request" | "navigating" | "complete";
type ProfileTab = "info" | "documents" | "banks";

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
}

const DriverApp = ({ onSwitchToPassenger, userProfile }: DriverAppProps) => {
  const [screen, setScreen] = useState<DriverScreen>("offline");
  const [showEarnings, setShowEarnings] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTab>("info");
  const [tripRadius, setTripRadius] = useState(10);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [idCardFrontUrl, setIdCardFrontUrl] = useState<string | null>(null);
  const [idCardBackUrl, setIdCardBackUrl] = useState<string | null>(null);
  const [licenseFrontUrl, setLicenseFrontUrl] = useState<string | null>(null);
  const [licenseBackUrl, setLicenseBackUrl] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [showAddBank, setShowAddBank] = useState(false);
  const [newBank, setNewBank] = useState({ bank_name: "", account_number: "", account_name: "" });
  const [uploading, setUploading] = useState<string | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<{ make: string; model: string; plate_number: string; color: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string>("");
  const [profileStatus, setProfileStatus] = useState<string>("Active");
  const [verificationIssues, setVerificationIssues] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: settingData } = await supabase.from("system_settings").select("value").eq("key", "default_trip_radius_km").single();
      const defaultRadius = settingData?.value ? Number(settingData.value) : 10;

      if (userProfile?.id) {
        const { data } = await supabase.from("profiles").select("trip_radius_km, avatar_url, id_card_front_url, id_card_back_url, license_front_url, license_back_url, status").eq("id", userProfile.id).single();
        setTripRadius(data?.trip_radius_km ?? defaultRadius);
        setAvatarUrl(data?.avatar_url || null);
        setIdCardFrontUrl(data?.id_card_front_url || null);
        setIdCardBackUrl(data?.id_card_back_url || null);
        setLicenseFrontUrl(data?.license_front_url || null);
        setLicenseBackUrl(data?.license_back_url || null);
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

        // Fetch vehicle
        const { data: vehicle } = await supabase.from("vehicles").select("make, model, plate_number, color").eq("driver_id", userProfile.id).eq("is_active", true).limit(1).single();
        if (vehicle) setVehicleInfo(vehicle);
        else issues.push("No vehicle assigned");
        setVerificationIssues([...issues]);
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
    if (uploadTarget === "avatar") updateField.avatar_url = publicUrl;
    else if (uploadTarget === "id_front") updateField.id_card_front_url = publicUrl;
    else if (uploadTarget === "id_back") updateField.id_card_back_url = publicUrl;
    else if (uploadTarget === "license_front") updateField.license_front_url = publicUrl;
    else if (uploadTarget === "license_back") updateField.license_back_url = publicUrl;

    await supabase.from("profiles").update(updateField).eq("id", userProfile.id);

    if (uploadTarget === "avatar") setAvatarUrl(publicUrl);
    else if (uploadTarget === "id_front") setIdCardFrontUrl(publicUrl);
    else if (uploadTarget === "id_back") setIdCardBackUrl(publicUrl);
    else if (uploadTarget === "license_front") setLicenseFrontUrl(publicUrl);
    else if (uploadTarget === "license_back") setLicenseBackUrl(publicUrl);

    setUploading(null);
    toast({ title: "Uploaded!", description: "Image saved successfully" });
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
      is_primary: isPrimary,
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

  const initials = `${userProfile?.first_name?.[0] || ""}${userProfile?.last_name?.[0] || ""}`;

  return (
    <div className="relative w-full h-screen max-w-md mx-auto overflow-hidden bg-surface">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-[500] p-4 safe-area-top">
        <div className="flex items-center justify-between">
          <button onClick={onSwitchToPassenger} className="px-3 py-2 rounded-full bg-card shadow-md text-xs font-semibold text-muted-foreground active:scale-95 transition-transform">
            Passenger Mode
          </button>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold tracking-tight text-foreground">HDA</span>
            <span className="text-lg font-extrabold tracking-tight text-primary">DRIVER</span>
          </div>
          <button onClick={() => setShowProfile(true)} className="w-10 h-10 rounded-full bg-card shadow-md flex items-center justify-center overflow-hidden active:scale-95 transition-transform">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-foreground" />
            )}
          </button>
        </div>
      </div>

      <DriverMap isNavigating={screen === "navigating"} radiusKm={screen === "online" ? tripRadius : undefined} />

      {/* Offline */}
      {screen === "offline" && (
        <div className="absolute inset-0 flex items-center justify-center z-[450]">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-5 px-6 w-full max-w-sm">
            <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${verificationIssues.length > 0 ? "bg-destructive/10" : "bg-muted"}`}>
              <Power className={`w-10 h-10 ${verificationIssues.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">You're offline</h2>
              <p className="text-muted-foreground text-sm mt-1">
                {verificationIssues.length > 0 ? "Complete your profile to go online" : "Go online to start receiving rides"}
              </p>
            </div>

            {/* Verification checklist */}
            {verificationIssues.length > 0 && (
              <div className="bg-card rounded-xl p-4 text-left space-y-2.5">
                <p className="text-xs font-semibold text-destructive uppercase tracking-wider">Action required</p>
                {verificationIssues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                      <X className="w-3 h-3 text-destructive" />
                    </div>
                    <p className="text-sm text-foreground">{issue}</p>
                  </div>
                ))}
                <button
                  onClick={() => { setShowProfile(true); setProfileTab(verificationIssues.some(i => i.includes("bank")) ? "banks" : verificationIssues.some(i => i.includes("ID") || i.includes("license") || i.includes("photo")) ? "documents" : "info"); }}
                  className="w-full mt-2 bg-primary/10 text-primary font-semibold py-3 rounded-xl text-sm active:scale-[0.98] transition-transform"
                >
                  Complete profile
                </button>
              </div>
            )}

            {profileStatus === "Active" && verificationIssues.length === 0 ? (
              <button onClick={() => setScreen("online")} className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base transition-all active:scale-[0.98]">
                Start driving
              </button>
            ) : profileStatus !== "Active" ? (
              <div className="bg-card rounded-xl p-4">
                <div className="flex items-center gap-2 justify-center">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">Waiting for admin verification</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Status: <span className="font-semibold text-foreground">{profileStatus}</span></p>
              </div>
            ) : null}
          </motion.div>
        </div>
      )}

      {/* Online */}
      {screen === "online" && (
        <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] z-[450]">
          <div className="p-4 pb-6 space-y-4">
            <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary animate-pulse-dot" />
                  <span className="font-semibold text-foreground">Online</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Waiting for ride requests...</p>
              </div>
              <button onClick={() => setScreen("offline")} className="px-4 py-2 bg-surface rounded-lg text-sm font-medium text-foreground active:scale-95 transition-transform">Go offline</button>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stats</p>
              <button onClick={() => setShowEarnings(!showEarnings)} className="flex items-center gap-1 text-xs text-muted-foreground">
                {showEarnings ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showEarnings ? "Hide" : "Show"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Rides", value: "12", icon: Navigation, mask: false },
                { label: "Earnings", value: "960 MVR", icon: DollarSign, mask: true },
                { label: "Hours", value: "6h30", icon: Clock, mask: false },
              ].map((stat) => (
                <div key={stat.label} className="bg-surface rounded-xl p-3 text-center">
                  <stat.icon className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{stat.mask && !showEarnings ? "•••" : stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Vehicle info */}
            {vehicleInfo && (
              <div className="bg-surface rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{vehicleInfo.make} {vehicleInfo.model}</p>
                  <p className="text-xs text-muted-foreground">{vehicleInfo.plate_number} {vehicleInfo.color ? `• ${vehicleInfo.color}` : ""}</p>
                </div>
              </div>
            )}

            {/* Trip Radius */}
            <div className="bg-surface rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Radar className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Trip Radius</span>
                </div>
                <div className="bg-primary/10 px-2.5 py-1 rounded-lg">
                  <span className="text-sm font-bold text-primary tabular-nums">{tripRadius} km</span>
                </div>
              </div>
              <div className="px-1">
                <input type="range" min={1} max={50} value={tripRadius} onChange={(e) => updateRadius(Number(e.target.value))} className="w-full h-1.5 bg-border rounded-full appearance-none cursor-pointer accent-primary" />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>1 km</span><span>25 km</span><span>50 km</span></div>
              </div>
            </div>

            <button onClick={() => setScreen("ride-request")} className="w-full bg-primary/10 text-primary font-semibold py-3 rounded-xl text-sm active:scale-[0.98] transition-transform">
              Simulate ride request
            </button>
          </div>
        </motion.div>
      )}

      {/* Ride Request */}
      {screen === "ride-request" && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", damping: 20 }} className="absolute inset-0 z-[500] flex items-end sm:items-center justify-center bg-foreground/50 backdrop-blur-sm">
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="bg-card rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:mx-6 sm:max-w-sm overflow-hidden">
            <div className="bg-primary px-4 py-4 text-center">
              <p className="text-primary-foreground/80 text-xs">New ride</p>
              <p className="text-2xl font-bold text-primary-foreground">70 MVR</p>
              <p className="text-primary-foreground/70 text-xs mt-0.5">~4.2 km • ~12 min</p>
            </div>

            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-sm font-bold text-foreground shrink-0">AN</div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">Ahmed Naseem</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="w-3 h-3 text-primary fill-primary shrink-0" />4.8 • 45 rides
                  </div>
                </div>
              </div>

              <div className="bg-surface rounded-xl p-3 space-y-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  <p className="text-xs text-foreground truncate">Majeedhee Magu, Malé</p>
                </div>
                <div className="ml-1 w-0.5 h-2.5 bg-border" />
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-2 h-2 text-foreground shrink-0" />
                  <p className="text-xs text-foreground truncate">Velana International Airport</p>
                </div>
              </div>

              {/* Passenger & Luggage */}
              <div className="flex gap-2">
                <div className="flex-1 bg-surface rounded-xl px-3 py-2 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground font-semibold">Passengers</p>
                    <p className="text-sm font-bold text-foreground">2</p>
                  </div>
                </div>
                <div className="flex-1 bg-surface rounded-xl px-3 py-2 flex items-center gap-2">
                  <Luggage className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground font-semibold">Luggage</p>
                    <p className="text-sm font-bold text-foreground">3</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setScreen("online")} className="flex-1 flex items-center justify-center gap-1.5 bg-surface text-foreground rounded-xl py-3 text-sm font-semibold active:scale-95 transition-transform">
                  <X className="w-4 h-4" />Decline
                </button>
                <button onClick={() => setScreen("navigating")} className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold active:scale-95 transition-transform">
                  <CheckCircle className="w-4 h-4" />Accept
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Navigating */}
      {screen === "navigating" && (
        <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] z-[450]">
          <div className="p-5 space-y-4">
            <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>
            <div className="bg-primary rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-primary-foreground/80 text-xs">Heading to passenger</p>
                <p className="text-2xl font-bold text-primary-foreground">3 min</p>
              </div>
              <Navigation className="w-8 h-8 text-primary-foreground" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-lg font-bold text-foreground">AN</div>
                <div>
                  <p className="font-semibold text-foreground">Ahmed Naseem</p>
                  <p className="text-xs text-muted-foreground">Majeedhee Magu, Malé</p>
                </div>
              </div>
              <button className="w-10 h-10 rounded-full bg-primary flex items-center justify-center active:scale-95 transition-transform">
                <Phone className="w-5 h-5 text-primary-foreground" />
              </button>
            </div>
            <div className="bg-surface rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-primary" /><p className="text-sm text-foreground">Majeedhee Magu, Malé</p></div>
              <div className="ml-1 w-0.5 h-3 bg-border" />
              <div className="flex items-center gap-2"><MapPin className="w-2.5 h-2.5 text-foreground" /><p className="text-sm text-foreground">Velana International Airport</p></div>
            </div>
            <button onClick={() => setScreen("complete")} className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base active:scale-[0.98] transition-transform">Complete ride</button>
          </div>
        </motion.div>
      )}

      {/* Complete */}
      {screen === "complete" && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute inset-0 z-[500] flex items-center justify-center bg-foreground/50 backdrop-blur-sm">
          <motion.div initial={{ y: 30 }} animate={{ y: 0 }} className="bg-card rounded-2xl shadow-2xl mx-6 w-full max-w-sm p-6 text-center space-y-5">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }} className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-primary" />
            </motion.div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Ride complete!</h3>
              <p className="text-muted-foreground text-sm mt-1">Well done, {userProfile?.first_name || "Driver"}</p>
            </div>
            <div className="bg-surface rounded-xl p-4">
              <p className="text-3xl font-bold text-primary">70 MVR</p>
              <p className="text-xs text-muted-foreground mt-1">Earnings from this ride</p>
            </div>
            <div className="flex gap-3">
              {[{ label: "Distance", value: "4.2 km" }, { label: "Duration", value: "12 min" }, { label: "Rating", value: "⭐ 5.0" }].map((s) => (
                <div key={s.label} className="flex-1 bg-surface rounded-lg p-2">
                  <p className="text-sm font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setScreen("online")} className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl active:scale-[0.98] transition-transform">Continue</button>
          </motion.div>
        </motion.div>
      )}

      {/* Profile Panel */}
      <AnimatePresence>
        {showProfile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[600] flex items-end justify-center bg-foreground/50 backdrop-blur-sm" onClick={() => setShowProfile(false)}>
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>

                {/* Avatar + Name */}
                <div className="flex items-center gap-4">
                  <button onClick={() => triggerUpload("avatar")} className="relative w-18 h-18 shrink-0">
                    <div className="w-[72px] h-[72px] rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl font-bold text-primary">{initials}</span>
                      )}
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
                <div className="flex gap-1 bg-surface rounded-xl p-1">
                  {([
                    { key: "info", label: "Info", icon: User },
                    { key: "documents", label: "Documents", icon: IdCard },
                    { key: "banks", label: "Banks", icon: Landmark },
                  ] as const).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setProfileTab(key)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                        profileTab === key ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                {profileTab === "info" && (
                  <div className="space-y-3">
                    <div className="bg-surface rounded-xl divide-y divide-border">
                      {[
                        { label: "Phone", value: `+960 ${userProfile?.phone_number || "—"}` },
                        { label: "Email", value: userProfile?.email || "Not set" },
                        { label: "Gender", value: userProfile?.gender === "1" ? "Male" : userProfile?.gender === "2" ? "Female" : userProfile?.gender || "—" },
                        { label: "Status", value: userProfile?.status || "—" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between px-4 py-3">
                          <span className="text-sm text-muted-foreground">{item.label}</span>
                          <span className="text-sm font-medium text-foreground">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {profileTab === "documents" && (
                  <div className="space-y-3">
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
                  </div>
                )}

                {profileTab === "banks" && (
                  <div className="space-y-3">
                    {bankAccounts.length === 0 && !showAddBank && (
                      <div className="text-center py-6">
                        <Landmark className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No bank accounts added yet</p>
                      </div>
                    )}
                    {bankAccounts.map((bank) => (
                      <div key={bank.id} className="bg-surface rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-primary" />
                            <span className="text-sm font-semibold text-foreground">{bank.bank_name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {bank.is_primary && (
                              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Primary</span>
                            )}
                            <button onClick={() => deleteBankAccount(bank.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>Account: <span className="font-medium text-foreground">{bank.account_number}</span></p>
                          {bank.account_name && <p>Name: <span className="font-medium text-foreground">{bank.account_name}</span></p>}
                        </div>
                        {!bank.is_primary && (
                          <button onClick={() => setPrimaryBank(bank.id)} className="text-xs text-primary font-semibold">Set as primary</button>
                        )}
                      </div>
                    ))}

                    {showAddBank ? (
                      <div className="bg-surface rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-foreground">Add bank account</p>
                        <input
                          placeholder="Bank name"
                          value={newBank.bank_name}
                          onChange={(e) => setNewBank({ ...newBank, bank_name: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <input
                          placeholder="Account number"
                          value={newBank.account_number}
                          onChange={(e) => setNewBank({ ...newBank, account_number: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <input
                          placeholder="Account name (optional)"
                          value={newBank.account_name}
                          onChange={(e) => setNewBank({ ...newBank, account_name: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => setShowAddBank(false)} className="flex-1 py-2.5 rounded-xl bg-card text-sm font-semibold text-foreground active:scale-95 transition-transform">Cancel</button>
                          <button onClick={addBankAccount} disabled={!newBank.bank_name || !newBank.account_number} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-95 transition-transform">Add</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowAddBank(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground active:scale-95 transition-transform">
                        <Plus className="w-4 h-4" />Add bank account
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="p-4 pt-2 border-t border-border">
                <button onClick={() => setShowProfile(false)} className="w-full bg-surface text-foreground font-semibold py-3 rounded-xl text-sm active:scale-95 transition-transform">Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Document upload card component
const DocumentUpload = ({ label, url, uploading, onUpload }: { label: string; url: string | null; uploading: boolean; onUpload: () => void }) => (
  <button onClick={onUpload} className="relative aspect-[3/2] rounded-xl bg-surface border-2 border-dashed border-border overflow-hidden flex items-center justify-center active:scale-95 transition-transform">
    {url ? (
      <img src={url} alt={label} className="w-full h-full object-cover" />
    ) : (
      <div className="text-center">
        <Camera className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    )}
    {uploading && (
      <div className="absolute inset-0 bg-foreground/30 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    )}
  </button>
);

export default DriverApp;
