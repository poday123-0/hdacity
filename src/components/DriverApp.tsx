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
  ChevronUp,
  ChevronDown,
  Locate,
  LocateOff,
  Car,
  Pencil,
  Save,
  Volume2,
  Play,
  Pause,
} from "lucide-react";

type DriverScreen = "offline" | "online" | "ride-request" | "navigating" | "complete";
type ProfileTab = "info" | "documents" | "banks" | "vehicles" | "sounds" | "billing";

interface TripRequest {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number | null;
  passenger_count: number;
  luggage_count: number;
  passenger_id: string | null;
  distance_km: number | null;
  vehicle_type_id: string | null;
  customer_name?: string;
  customer_phone?: string;
  dispatch_type?: string;
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
  const [screen, setScreen] = useState<DriverScreen>("offline");
  const [currentTrip, setCurrentTrip] = useState<TripRequest | null>(null);
  const [passengerProfile, setPassengerProfile] = useState<{ first_name: string; last_name: string } | null>(null);
  const [tripStops, setTripStops] = useState<Array<{ id: string; stop_order: number; address: string; completed_at: string | null }>>([]);
  const [showEarnings, setShowEarnings] = useState(true);
  const [panelMinimized, setPanelMinimized] = useState(false);
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
  const [availableBanks, setAvailableBanks] = useState<Array<{ id: string; name: string; logo_url: string | null }>>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<{ make: string; model: string; plate_number: string; color: string } | null>(null);
  const [driverVehicles, setDriverVehicles] = useState<any[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ plate_number: "", make: "", model: "", color: "", vehicle_type_id: "" });
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string>("");
  const [profileStatus, setProfileStatus] = useState<string>("Active");
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [adminBankInfo, setAdminBankInfo] = useState<any>(null);
  const [verificationIssues, setVerificationIssues] = useState<string[]>([]);
  const [driverStats, setDriverStats] = useState({ rides: 0, earnings: 0, hours: "0h" });
  const [editingProfile, setEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone_number: "", gender: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const locationWatchRef = useRef<number | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);

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
        }, { onConflict: "driver_id" });
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
      locationIntervalRef.current = setInterval(() => {
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
  const [availableSounds, setAvailableSounds] = useState<Array<{ id: string; name: string; file_url: string; is_default: boolean }>>([]);
  const [selectedSoundId, setSelectedSoundId] = useState<string | null>(null);
  const [previewSoundId, setPreviewSoundId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const loadSounds = async () => {
      // Fetch available trip request sounds
      const { data: soundsData } = await supabase.from("notification_sounds").select("id, name, file_url, is_default").eq("category", "trip_request").eq("is_active", true);
      const allSounds = (soundsData as any[]) || [];
      setAvailableSounds(allSounds);

      // Check if driver has a selected sound preference
      if (userProfile?.id) {
        const { data: profile } = await supabase.from("profiles").select("trip_sound_id").eq("id", userProfile.id).single();
        const driverSoundId = (profile as any)?.trip_sound_id;
        if (driverSoundId) {
          const selected = allSounds.find(s => s.id === driverSoundId);
          if (selected) {
            setSelectedSoundId(driverSoundId);
            setTripRequestSoundUrl(selected.file_url);
            return;
          }
        }
      }

      // Fallback to default sound
      const defaultSound = allSounds.find(s => s.is_default);
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

    // Fetch passenger profile and trip stops in parallel
    const [pProfileRes, stopsRes] = await Promise.all([
      trip.passenger_id
        ? supabase.from("profiles").select("first_name, last_name").eq("id", trip.passenger_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("trip_stops").select("id, stop_order, address, completed_at").eq("trip_id", trip.id).order("stop_order"),
    ]);

    toast({
      title: "🚗 New Ride Request!",
      description: `${trip.pickup_address} → ${trip.dropoff_address}`,
    });

    setCurrentTrip(trip);
    setPassengerProfile(pProfileRes.data);
    setTripStops((stopsRes.data as any[]) || []);
    setScreen("ride-request");
  };

  // Track last seen trip id to avoid duplicate handling
  const lastSeenTripRef = useRef<string | null>(null);

  useEffect(() => {
    if (screen !== "online" || !userProfile?.id) return;
    let isActive = true;

    // Primary: Realtime subscription
    const channel = supabase
      .channel("driver-trip-requests")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "trips",
        filter: "status=eq.requested",
      }, (payload) => {
        const trip = payload.new as TripRequest;
        if (trip.id !== lastSeenTripRef.current) {
          lastSeenTripRef.current = trip.id;
          handleNewTrip(trip);
        }
      })
      .subscribe();

    // Fallback: Poll every 5s for new requested trips
    const pollInterval = setInterval(async () => {
      if (!isActive || screen !== "online") return;
      const { data } = await supabase
        .from("trips")
        .select("*")
        .eq("status", "requested")
        .order("requested_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        const trip = data[0] as TripRequest;
        if (trip.id !== lastSeenTripRef.current) {
          lastSeenTripRef.current = trip.id;
          handleNewTrip(trip);
        }
      }
    }, 5000);

    return () => {
      isActive = false;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [screen, userProfile?.id, tripRequestSoundUrl]);

  // Fetch available banks from admin-configured banks table
  useEffect(() => {
    supabase.from("banks").select("id, name, logo_url").eq("is_active", true).order("name").then(({ data }) => {
      if (data) setAvailableBanks(data);
    });
    supabase.from("vehicle_types").select("id, name, icon, image_url").eq("is_active", true).order("sort_order").then(({ data }) => {
      if (data) setVehicleTypes(data);
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
          if (!selectedVehicleId) setSelectedVehicleId(activeVehicle.id);
          const sel = allVehicles?.find(v => v.id === selectedVehicleId) || activeVehicle;
          setVehicleInfo({ make: sel.make || "", model: sel.model || "", plate_number: sel.plate_number, color: sel.color || "" });
        }
        else issues.push("No vehicle assigned");
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
        const { data: trips } = await supabase
          .from("trips")
          .select("actual_fare, estimated_fare, duration_minutes, completed_at, accepted_at, status")
          .eq("driver_id", userProfile.id)
          .gte("created_at", todayStart.toISOString());

        if (trips) {
          const completedTrips = trips.filter(t => t.status === "completed");
          const totalEarnings = completedTrips.reduce((sum, t) => sum + (Number(t.actual_fare) || Number(t.estimated_fare) || 0), 0);
          const totalMinutes = completedTrips.reduce((sum, t) => sum + (Number(t.duration_minutes) || 0), 0);
          const h = Math.floor(totalMinutes / 60);
          const m = Math.round(totalMinutes % 60);
          setDriverStats({
            rides: completedTrips.length,
            earnings: totalEarnings,
            hours: h > 0 ? `${h}h${m > 0 ? m.toString().padStart(2, "0") : ""}` : `${m}m`,
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
    if (uploadTarget === "avatar") updateField.avatar_url = publicUrl;
    else if (uploadTarget === "id_front") updateField.id_card_front_url = publicUrl;
    else if (uploadTarget === "id_back") updateField.id_card_back_url = publicUrl;
    else if (uploadTarget === "license_front") updateField.license_front_url = publicUrl;
    else if (uploadTarget === "license_back") updateField.license_back_url = publicUrl;
    else if (uploadTarget === "taxi_permit_front") (updateField as any).taxi_permit_front_url = publicUrl;
    else if (uploadTarget === "taxi_permit_back") (updateField as any).taxi_permit_back_url = publicUrl;

    // Document uploads (not avatar) flag profile for review
    if (uploadTarget !== "avatar") {
      (updateField as any).status = "Pending Review";
    }

    await supabase.from("profiles").update(updateField).eq("id", userProfile.id);

    if (uploadTarget === "avatar") setAvatarUrl(publicUrl);
    else if (uploadTarget === "id_front") setIdCardFrontUrl(publicUrl);
    else if (uploadTarget === "id_back") setIdCardBackUrl(publicUrl);
    else if (uploadTarget === "license_front") setLicenseFrontUrl(publicUrl);
    else if (uploadTarget === "license_back") setLicenseBackUrl(publicUrl);
    else if (uploadTarget === "taxi_permit_front") setTaxiPermitFrontUrl(publicUrl);
    else if (uploadTarget === "taxi_permit_back") setTaxiPermitBackUrl(publicUrl);

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

  const addVehicle = async () => {
    if (!userProfile?.id || !newVehicle.plate_number || !newVehicle.vehicle_type_id) return;
    const { data, error } = await supabase.from("vehicles").insert({
      driver_id: userProfile.id,
      plate_number: newVehicle.plate_number,
      make: newVehicle.make,
      model: newVehicle.model,
      color: newVehicle.color,
      vehicle_type_id: newVehicle.vehicle_type_id,
    }).select().single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setDriverVehicles([...driverVehicles, data]);
    setNewVehicle({ plate_number: "", make: "", model: "", color: "", vehicle_type_id: "" });
    setShowAddVehicle(false);
    if (!vehicleInfo) setVehicleInfo({ make: data.make, model: data.model, plate_number: data.plate_number, color: data.color });
    // Flag for admin review
    await supabase.from("profiles").update({ status: "Pending Review" }).eq("id", userProfile.id);
    setProfileStatus("Pending Review");
    toast({ title: "Vehicle added", description: "Pending admin approval" });
  };

  const deleteVehicle = async (id: string) => {
    await supabase.from("vehicles").update({ is_active: false }).eq("id", id);
    const remaining = driverVehicles.filter(v => v.id !== id);
    setDriverVehicles(remaining);
    if (selectedVehicleId === id) {
      const next = remaining.length > 0 ? remaining[0] : null;
      setSelectedVehicleId(next?.id || null);
      setVehicleInfo(next ? { make: next.make, model: next.model, plate_number: next.plate_number, color: next.color } : null);
    } else if (remaining.length > 0) {
      const active = remaining.find(v => v.id === selectedVehicleId) || remaining[0];
      setVehicleInfo({ make: active.make, model: active.model, plate_number: active.plate_number, color: active.color });
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
    setVehicleInfo({ make: v.make || "", model: v.model || "", plate_number: v.plate_number, color: v.color || "" });
    toast({ title: "Vehicle selected", description: `${v.make} ${v.model} — ${v.plate_number}. Trip requests will match this vehicle type.` });
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

      <DriverMap
        isNavigating={screen === "navigating"}
        radiusKm={screen === "online" ? tripRadius : undefined}
        gpsEnabled={gpsEnabled}
        pickupCoords={[4.1745, 73.5088]}
        dropoffCoords={[4.1912, 73.5291]}
        pickupLabel="Majeedhee Magu, Malé"
        dropoffLabel="Velana International Airport"
      />

      {/* GPS Toggle */}
      <button
        onClick={() => setGpsEnabled(!gpsEnabled)}
        className={`absolute bottom-4 right-4 z-[460] w-12 h-12 rounded-full shadow-lg flex items-center justify-center active:scale-90 transition-all duration-300 ${
          gpsEnabled ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
        }`}
      >
        {gpsEnabled ? <Locate className="w-5 h-5" /> : <LocateOff className="w-5 h-5" />}
      </button>

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
            ) : profileStatus !== "Active" && verificationIssues.length === 0 ? (
              <div className="bg-card rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 justify-center">
                  <Clock className="w-4 h-4 text-primary animate-pulse" />
                  <p className="text-sm font-semibold text-foreground">Pending Admin Approval</p>
                </div>
                <p className="text-xs text-muted-foreground text-center">Your documents have been submitted. An admin will review and approve your profile shortly.</p>
              </div>
            ) : profileStatus !== "Active" ? (
              <div className="bg-card rounded-xl p-4">
                <div className="flex items-center gap-2 justify-center">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">Complete requirements above to request approval</p>
                </div>
              </div>
            ) : null}
          </motion.div>
        </div>
      )}

      {/* Online */}
      {screen === "online" && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] z-[450]"
        >
          <div className="p-4 pb-6 space-y-3">
            {/* Drag handle — tap to toggle */}
            <button onClick={() => setPanelMinimized(!panelMinimized)} className="w-full flex justify-center py-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </button>

            {/* Always visible: status bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary animate-pulse-dot" />
                <span className="font-semibold text-foreground">Online</span>
                {panelMinimized && (
                  <span className="text-xs text-muted-foreground ml-1">• {driverStats.rides} rides today</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setPanelMinimized(!panelMinimized)} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center active:scale-90 transition-transform">
                  {panelMinimized ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                <button onClick={() => setScreen("offline")} className="px-3 py-1.5 bg-surface rounded-lg text-xs font-medium text-foreground active:scale-95 transition-transform">Go offline</button>
              </div>
            </div>

            {/* Collapsible content */}
            <AnimatePresence>
              {!panelMinimized && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3 overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Stats</p>
                    <button onClick={() => setShowEarnings(!showEarnings)} className="flex items-center gap-1 text-xs text-muted-foreground">
                      {showEarnings ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showEarnings ? "Hide" : "Show"}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: "Rides", value: String(driverStats.rides), icon: Navigation, mask: false },
                      { label: "Earnings", value: `${driverStats.earnings.toFixed(0)} MVR`, icon: DollarSign, mask: true },
                      { label: "Hours", value: driverStats.hours, icon: Clock, mask: false },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-surface rounded-xl p-2.5 text-center">
                        <stat.icon className="w-4 h-4 text-primary mx-auto mb-1" />
                        <p className="text-base font-bold text-foreground">{stat.mask && !showEarnings ? "•••" : stat.value}</p>
                        <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                    {/* Trip Radius card */}
                    <div className="bg-surface rounded-xl p-2.5 text-center space-y-1">
                      <Radar className="w-4 h-4 text-primary mx-auto" />
                      <p className="text-base font-bold text-foreground tabular-nums">{tripRadius < 1 ? `${(tripRadius * 1000).toFixed(0)}m` : `${tripRadius}km`}</p>
                      <p className="text-[10px] text-muted-foreground">Radius</p>
                      <div className="flex items-center justify-center gap-1 pt-0.5">
                        <button
                          onClick={() => updateRadius(Math.max(0.1, +(tripRadius - (tripRadius <= 1 ? 0.1 : 1)).toFixed(1)))}
                          className="w-6 h-6 rounded-lg bg-card flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-transform"
                        >
                          <span className="text-sm font-bold leading-none">−</span>
                        </button>
                        <button
                          onClick={() => updateRadius(Math.min(50, +(tripRadius + (tripRadius < 1 ? 0.1 : 1)).toFixed(1)))}
                          className="w-6 h-6 rounded-lg bg-card flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-transform"
                        >
                          <span className="text-sm font-bold leading-none">+</span>
                        </button>
                      </div>
                    </div>
                  </div>


                  {/* Vehicle info with switcher */}
                  {vehicleInfo && (
                    <div className="bg-surface rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Car className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{vehicleInfo.make} {vehicleInfo.model}</p>
                          <p className="text-xs text-muted-foreground">{vehicleInfo.plate_number} {vehicleInfo.color ? `• ${vehicleInfo.color}` : ""}</p>
                        </div>
                        {driverVehicles.length > 1 && (
                          <button onClick={() => { setShowProfile(true); setProfileTab("vehicles"); }} className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-1 rounded-lg">
                            Switch
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* Ride Request */}
      {screen === "ride-request" && currentTrip && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", damping: 20 }} className="absolute inset-0 z-[500] flex items-end sm:items-center justify-center bg-foreground/50 backdrop-blur-sm">
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className="bg-card rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:mx-6 sm:max-w-sm overflow-hidden">
            <div className="bg-primary px-4 py-4 text-center">
              <p className="text-primary-foreground/80 text-xs">New ride</p>
              <p className="text-2xl font-bold text-primary-foreground">{currentTrip.estimated_fare ?? "—"} MVR</p>
              {currentTrip.distance_km && <p className="text-primary-foreground/70 text-xs mt-0.5">~{currentTrip.distance_km} km</p>}
            </div>

            <div className="px-4 py-4 space-y-3">
              {/* Customer/Passenger info */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-sm font-bold text-foreground shrink-0">
                  {currentTrip.customer_name
                    ? `${currentTrip.customer_name[0] || ""}` 
                    : passengerProfile ? `${passengerProfile.first_name?.[0] || ""}${passengerProfile.last_name?.[0] || ""}` : "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-foreground truncate">
                    {currentTrip.customer_name || (passengerProfile ? `${passengerProfile.first_name} ${passengerProfile.last_name}` : "Passenger")}
                  </p>
                  {currentTrip.customer_phone && (
                    <a href={`tel:+960${currentTrip.customer_phone}`} className="text-xs text-primary font-medium">
                      +960 {currentTrip.customer_phone}
                    </a>
                  )}
                  {currentTrip.dispatch_type === "operator" && (
                    <span className="ml-2 text-[10px] font-bold text-accent-foreground bg-accent px-1.5 py-0.5 rounded-full">Dispatch</span>
                  )}
                </div>
              </div>

              {/* Route with stops */}
              <div className="bg-surface rounded-xl p-3 space-y-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  <p className="text-xs text-foreground truncate">{currentTrip.pickup_address}</p>
                </div>
                {tripStops.map((stop, i) => (
                  <div key={stop.id}>
                    <div className="ml-1 w-0.5 h-2.5 bg-border" />
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-sm bg-accent shrink-0" />
                      <p className="text-xs text-foreground truncate">Stop {stop.stop_order}: {stop.address}</p>
                    </div>
                  </div>
                ))}
                <div className="ml-1 w-0.5 h-2.5 bg-border" />
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-2 h-2 text-foreground shrink-0" />
                  <p className="text-xs text-foreground truncate">{currentTrip.dropoff_address}</p>
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

              <div className="flex gap-2">
                <button onClick={async () => {
                  setScreen("online");
                  setCurrentTrip(null);
                  setPassengerProfile(null);
                }} className="flex-1 flex items-center justify-center gap-1.5 bg-surface text-foreground rounded-xl py-3 text-sm font-semibold active:scale-95 transition-transform">
                  <X className="w-4 h-4" />Decline
                </button>
                <button onClick={async () => {
                  if (!currentTrip || !userProfile?.id) return;
                  // Accept trip in database
                  const { error } = await supabase.from("trips").update({
                    status: "accepted",
                    driver_id: userProfile.id,
                    accepted_at: new Date().toISOString(),
                  }).eq("id", currentTrip.id).eq("status", "requested");

                  if (error) {
                    toast({ title: "Error", description: error.message, variant: "destructive" });
                    return;
                  }

                  // Mark driver as on trip
                  await supabase.from("driver_locations").update({ is_on_trip: true }).eq("driver_id", userProfile.id);

                  setScreen("navigating");
                }} className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold active:scale-95 transition-transform">
                  <CheckCircle className="w-4 h-4" />Accept
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Navigating */}
      {screen === "navigating" && currentTrip && (
        <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] z-[450]">
          <div className="p-5 space-y-4">
            <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>
            <div className="bg-primary rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-primary-foreground/80 text-xs">Heading to passenger</p>
                <p className="text-2xl font-bold text-primary-foreground">{currentTrip.estimated_fare ?? "—"} MVR</p>
              </div>
              <Navigation className="w-8 h-8 text-primary-foreground" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-lg font-bold text-foreground">
                  {currentTrip.customer_name ? currentTrip.customer_name[0] : passengerProfile ? `${passengerProfile.first_name?.[0] || ""}${passengerProfile.last_name?.[0] || ""}` : "?"}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{currentTrip.customer_name || (passengerProfile ? `${passengerProfile.first_name} ${passengerProfile.last_name}` : "Passenger")}</p>
                  <p className="text-xs text-muted-foreground">{currentTrip.customer_phone ? `+960 ${currentTrip.customer_phone}` : currentTrip.pickup_address}</p>
                </div>
              </div>
              <a href={`tel:+960${currentTrip.customer_phone || ""}`} className="w-10 h-10 rounded-full bg-primary flex items-center justify-center active:scale-95 transition-transform">
                <Phone className="w-5 h-5 text-primary-foreground" />
              </a>
            </div>
            <div className="bg-surface rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-primary" /><p className="text-sm text-foreground">{currentTrip.pickup_address}</p></div>
              {tripStops.map((stop) => (
                <div key={stop.id}>
                  <div className="ml-1 w-0.5 h-3 bg-border" />
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
                    <p className="text-sm text-foreground">Stop {stop.stop_order}: {stop.address}</p>
                    {stop.completed_at && <span className="text-[10px] text-primary font-bold">✓</span>}
                  </div>
                </div>
              ))}
              <div className="ml-1 w-0.5 h-3 bg-border" />
              <div className="flex items-center gap-2"><MapPin className="w-2.5 h-2.5 text-foreground" /><p className="text-sm text-foreground">{currentTrip.dropoff_address}</p></div>
            </div>
            <button onClick={async () => {
              if (!currentTrip || !userProfile?.id) return;
              await supabase.from("trips").update({
                status: "completed",
                completed_at: new Date().toISOString(),
                actual_fare: currentTrip.estimated_fare,
              }).eq("id", currentTrip.id);
              await supabase.from("driver_locations").update({ is_on_trip: false }).eq("driver_id", userProfile.id);
              setScreen("complete");
            }} className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base active:scale-[0.98] transition-transform">Complete ride</button>
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
              <p className="text-3xl font-bold text-primary">{currentTrip?.estimated_fare ?? "—"} MVR</p>
              <p className="text-xs text-muted-foreground mt-1">Earnings from this ride</p>
            </div>
            <button onClick={() => {
              setScreen("online");
              setCurrentTrip(null);
              setPassengerProfile(null);
            }} className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl active:scale-[0.98] transition-transform">Continue</button>
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
                    { key: "documents", label: "Docs", icon: IdCard },
                    { key: "vehicles", label: "Vehicles", icon: Car },
                    { key: "banks", label: "Banks", icon: Landmark },
                    { key: "sounds", label: "Sounds", icon: Volume2 },
                    { key: "billing", label: "Billing", icon: DollarSign },
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
                    {profileStatus === "Pending Review" && (
                      <div className="bg-yellow-100 text-yellow-800 rounded-xl px-4 py-2.5 text-xs font-medium flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        Your profile changes are pending admin approval
                      </div>
                    )}
                    {!editingProfile ? (
                      <>
                        <div className="bg-surface rounded-xl divide-y divide-border">
                          {[
                            { label: "First Name", value: userProfile?.first_name || "—" },
                            { label: "Last Name", value: userProfile?.last_name || "—" },
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
                        <button
                          onClick={() => {
                            setEditForm({
                              first_name: userProfile?.first_name || "",
                              last_name: userProfile?.last_name || "",
                              email: userProfile?.email || "",
                              phone_number: userProfile?.phone_number || "",
                              gender: userProfile?.gender || "1",
                            });
                            setEditingProfile(true);
                          }}
                          className="w-full flex items-center justify-center gap-2 bg-primary/10 text-primary font-semibold py-2.5 rounded-xl text-sm active:scale-[0.98] transition-transform"
                        >
                          <Pencil className="w-4 h-4" />
                          Edit Profile
                        </button>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <div className="bg-surface rounded-xl p-3 space-y-3">
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">First Name</label>
                            <input value={editForm.first_name} onChange={(e) => setEditForm(f => ({ ...f, first_name: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Last Name</label>
                            <input value={editForm.last_name} onChange={(e) => setEditForm(f => ({ ...f, last_name: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm text-muted-foreground bg-card border border-border rounded-lg px-3 py-2">+960</span>
                              <input value={editForm.phone_number} onChange={(e) => setEditForm(f => ({ ...f, phone_number: e.target.value.replace(/\D/g, "").slice(0, 7) }))} className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Email</label>
                            <input type="email" value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="driver@example.com" className="w-full mt-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Gender</label>
                            <select value={editForm.gender} onChange={(e) => setEditForm(f => ({ ...f, gender: e.target.value }))} className="w-full mt-1 px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
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
                              }).eq("id", userProfile.id);
                              setSavingProfile(false);
                              if (error) {
                                toast({ title: "Error", description: error.message, variant: "destructive" });
                              } else {
                                toast({ title: "Profile updated", description: "Awaiting admin approval" });
                                setProfileStatus("Pending Review");
                                setEditingProfile(false);
                              }
                            }}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50"
                          >
                            <Save className="w-4 h-4" />
                            {savingProfile ? "Saving..." : "Save & Submit"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {profileTab === "documents" && (
                  <div className="space-y-3">
                    {profileStatus === "Pending Review" && (
                      <div className="bg-yellow-100 text-yellow-800 rounded-xl px-4 py-2.5 text-xs font-medium flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        Documents pending admin approval
                      </div>
                    )}
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
                            {(() => {
                              const bankInfo = availableBanks.find(b => b.name === bank.bank_name);
                              return bankInfo?.logo_url ? (
                                <img src={bankInfo.logo_url} alt={bank.bank_name} className="w-6 h-6 rounded object-contain" />
                              ) : (
                                <CreditCard className="w-4 h-4 text-primary" />
                              );
                            })()}
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
                        <div className="relative">
                          <select
                            value={newBank.bank_name}
                            onChange={(e) => setNewBank({ ...newBank, bank_name: e.target.value })}
                            className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                          >
                            <option value="">Select bank</option>
                            {availableBanks.map((bank) => (
                              <option key={bank.id} value={bank.name}>{bank.name}</option>
                            ))}
                          </select>
                          {newBank.bank_name && (() => {
                            const selected = availableBanks.find(b => b.name === newBank.bank_name);
                            return selected?.logo_url ? (
                              <img src={selected.logo_url} alt="" className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded object-contain" />
                            ) : null;
                          })()}
                        </div>
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

                {profileTab === "vehicles" && (
                  <div className="space-y-3">
                    {driverVehicles.length === 0 && !showAddVehicle && (
                      <div className="text-center py-6">
                        <Car className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No vehicles added yet</p>
                      </div>
                    )}
                    {driverVehicles.map((v) => {
                      const vType = vehicleTypes.find(vt => vt.id === v.vehicle_type_id);
                      return (
                        <div key={v.id} className={`bg-surface rounded-xl p-3 space-y-2 ${selectedVehicleId === v.id ? "ring-2 ring-primary" : ""}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {vType?.image_url ? (
                                <img src={vType.image_url} alt={vType.name} className="w-14 h-10 object-contain" />
                              ) : (
                                <Car className="w-4 h-4 text-primary" />
                              )}
                              <div>
                                <span className="text-sm font-semibold text-foreground">{v.make} {v.model}</span>
                                <p className="text-xs text-muted-foreground">{vType?.name || "Unknown type"}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {selectedVehicleId === v.id && (
                                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Selected</span>
                              )}
                              <button onClick={() => deleteVehicle(v.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            <span className="bg-card px-2 py-1 rounded-lg font-medium text-foreground">{v.plate_number}</span>
                            {v.color && <span className="bg-card px-2 py-1 rounded-lg">{v.color}</span>}
                          </div>
                          {selectedVehicleId !== v.id && (
                            <button onClick={() => selectVehicle(v)} className="w-full py-2 rounded-lg bg-primary/10 text-primary text-xs font-semibold active:scale-95 transition-transform">
                              Use this vehicle
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {showAddVehicle ? (
                      <div className="bg-surface rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-foreground">Add vehicle</p>
                        <select
                          value={newVehicle.vehicle_type_id}
                          onChange={(e) => setNewVehicle({ ...newVehicle, vehicle_type_id: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                        >
                          <option value="">Select type (Car, Cycle, etc.)</option>
                          {vehicleTypes.map((vt) => (
                            <option key={vt.id} value={vt.id}>{vt.name}</option>
                          ))}
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
                      </div>
                    ) : (
                      <button onClick={() => setShowAddVehicle(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground active:scale-95 transition-transform">
                        <Plus className="w-4 h-4" />Add vehicle
                      </button>
                    )}
                  </div>
                )}

                {profileTab === "sounds" && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trip Request Sound</p>
                    <p className="text-xs text-muted-foreground">Choose the sound you hear when a new trip request arrives</p>
                    {availableSounds.length === 0 ? (
                      <div className="text-center py-6">
                        <Volume2 className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No sounds available yet</p>
                        <p className="text-xs text-muted-foreground">Admin needs to upload sounds first</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {availableSounds.map((sound) => (
                          <div
                            key={sound.id}
                            className={`bg-surface rounded-xl p-3 flex items-center gap-3 transition-all ${
                              selectedSoundId === sound.id ? "ring-2 ring-primary" : ""
                            }`}
                          >
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
                                previewSoundId === sound.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
                              }`}
                            >
                              {previewSoundId === sound.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{sound.name}</p>
                              {sound.is_default && <span className="text-[10px] text-primary font-bold">★ Default</span>}
                            </div>
                            {selectedSoundId === sound.id ? (
                              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">Selected</span>
                            ) : (
                              <button
                                onClick={async () => {
                                  setSelectedSoundId(sound.id);
                                  setTripRequestSoundUrl(sound.file_url);
                                  if (userProfile?.id) {
                                    await supabase.from("profiles").update({ trip_sound_id: sound.id } as any).eq("id", userProfile.id);
                                  }
                                  toast({ title: "Sound selected", description: sound.name });
                                }}
                                className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold active:scale-95 transition-transform"
                              >
                                Use this
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {profileTab === "billing" && (
                  <div className="space-y-3">
                    {/* Company info & discounts */}
                    {companyInfo ? (
                      <div className="bg-surface rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</p>
                        <div className="flex items-center gap-3">
                          {companyInfo.logo_url && <img src={companyInfo.logo_url} alt={companyInfo.name} className="w-10 h-10 rounded-lg object-contain" />}
                          <div>
                            <p className="text-sm font-semibold text-foreground">{companyInfo.name}</p>
                            {companyInfo.fee_free && <span className="text-xs text-primary font-semibold">Fee Free</span>}
                          </div>
                        </div>
                        {companyInfo.discount_pct > 0 && (
                          <p className="text-xs text-muted-foreground">Discount: <span className="font-semibold text-primary">{companyInfo.discount_pct}%</span></p>
                        )}
                        {companyInfo.monthly_fee > 0 && (
                          <p className="text-xs text-muted-foreground">Monthly fee: <span className="font-semibold text-foreground">{companyInfo.monthly_fee} MVR</span></p>
                        )}
                      </div>
                    ) : (
                      <div className="bg-surface rounded-xl p-3">
                        <p className="text-sm text-muted-foreground text-center">No company assigned</p>
                      </div>
                    )}

                    {/* Admin bank info for payment */}
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Account</p>
                    {adminBankInfo ? (
                      <div className="bg-surface rounded-xl p-3 space-y-2">
                        <p className="text-xs text-muted-foreground">Transfer your fees to the account below:</p>
                        <div className="bg-card rounded-xl divide-y divide-border">
                          {adminBankInfo.bank_name && (
                            <div className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs text-muted-foreground">Bank</span>
                              <span className="text-sm font-semibold text-foreground">{adminBankInfo.bank_name}</span>
                            </div>
                          )}
                          {adminBankInfo.account_number && (
                            <div className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs text-muted-foreground">Account</span>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(adminBankInfo.account_number);
                                  toast({ title: "Copied!", description: "Account number copied to clipboard" });
                                }}
                                className="text-sm font-semibold text-primary flex items-center gap-1"
                              >
                                {adminBankInfo.account_number}
                                <CreditCard className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          {adminBankInfo.account_name && (
                            <div className="flex items-center justify-between px-3 py-2">
                              <span className="text-xs text-muted-foreground">Name</span>
                              <span className="text-sm font-medium text-foreground">{adminBankInfo.account_name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-surface rounded-xl p-3">
                        <p className="text-sm text-muted-foreground text-center">No payment account configured</p>
                      </div>
                    )}

                    {/* Monthly fee info */}
                    <div className="bg-surface rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Your monthly fee</span>
                        <span className="text-lg font-bold text-foreground">
                          {companyInfo?.fee_free ? (
                            <span className="text-primary">FREE</span>
                          ) : userProfile?.monthly_fee === 0 ? (
                            <span className="text-primary">FREE</span>
                          ) : (
                            `${userProfile?.monthly_fee || 0} MVR`
                          )}
                        </span>
                      </div>
                      {(userProfile as any)?.fee_free_until && new Date((userProfile as any).fee_free_until) > new Date() && (
                        <p className="text-xs text-primary mt-1">Free until {new Date((userProfile as any).fee_free_until).toLocaleDateString()}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 pt-2 border-t border-border space-y-2">
                {onLogout && (
                  <button
                    onClick={() => { setShowProfile(false); onLogout(); }}
                    className="w-full flex items-center justify-center gap-2 bg-destructive/10 text-destructive font-semibold py-3 rounded-xl text-sm active:scale-95 transition-transform"
                  >
                    Logout
                  </button>
                )}
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
