import { Phone, MessageSquare, X, Star, Landmark, Copy, Check, ChevronDown, ChevronUp, Share2, Navigation, Gauge, Clock, MapPin, ArrowRight, Route, ChevronRight, Minimize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchSoundUrl, playSound, playFallbackBeep } from "@/lib/sound-utils";
import TripChat from "./TripChat";
import AnimatedTimer from "./AnimatedTimer";

interface BankAccountInfo {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_primary: boolean;
}

interface FavaraAccountInfo {
  id: string;
  favara_id: string;
  favara_name: string;
  is_primary: boolean;
}

interface DriverInfo {
  id?: string;
  name?: string;
  initials?: string;
  rating?: number;
  vehicle?: string;
  plate?: string;
  phone?: string;
  avatar_url?: string | null;
  vehicle_color?: string;
  vehicle_image_url?: string | null;
  bank_accounts?: BankAccountInfo[];
  favara_accounts?: FavaraAccountInfo[];
}

interface DriverMatchingProps {
  onCancel: () => void;
  driver?: DriverInfo;
  tripId?: string;
  userId?: string;
  tripStatus?: string;
  showBankDetails?: boolean;
  pickupName?: string;
  dropoffName?: string;
  onCancelTrip?: () => void;
}

const DriverMatching = ({ onCancel, driver, tripId, userId, tripStatus, showBankDetails = false, pickupName, dropoffName, onCancelTrip }: DriverMatchingProps) => {
  const driverName = driver?.name || "Driver";
  const initials = driver?.initials || driverName.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const rating = driver?.rating || 4.9;
  const vehicle = driver?.vehicle || "";
  const plate = driver?.plate || "";
  const phone = driver?.phone || "";
  const avatarUrl = driver?.avatar_url;
  const vehicleColor = driver?.vehicle_color || "";
  const vehicleImageUrl = driver?.vehicle_image_url;
  const bankAccounts = driver?.bank_accounts || [];
  const favaraAccounts = driver?.favara_accounts || [];
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllBanks, setShowAllBanks] = useState(false);
  const [favaraLogoUrl, setFavaraLogoUrl] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const showChatRef = useRef(false);
  const [minimized, setMinimized] = useState(false);
  const [bankLogos, setBankLogos] = useState<Record<string, string>>({});
  const [speed, setSpeed] = useState(0);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [tripElapsed, setTripElapsed] = useState(0);
  const [acceptedElapsed, setAcceptedElapsed] = useState(0);
  const [totalDistanceKm, setTotalDistanceKm] = useState<number | null>(null);
  const lastLocRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const [tripPickupName, setTripPickupName] = useState(pickupName || "");
  const [tripDropoffName, setTripDropoffName] = useState(dropoffName || "");

  // Sync showChat ref & clear unread
  useEffect(() => { showChatRef.current = showChat; if (showChat) setUnreadMessages(0); }, [showChat]);

  // Background message listener for passenger — sound + unread count
  useEffect(() => {
    if (!tripId) return;
    let messageSoundUrl: string | null = null;
    supabase.from("notification_sounds").select("file_url").eq("category", "passenger_message_received").eq("is_default", true).eq("is_active", true).single().then(({ data }) => {
      if (data?.file_url) messageSoundUrl = data.file_url;
    });

    const channel = supabase
      .channel(`passenger-bg-chat-${tripId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "trip_messages",
        filter: `trip_id=eq.${tripId}`,
      }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_type === "passenger") return;
        if (!showChatRef.current) {
          setUnreadMessages(prev => prev + 1);
          if (messageSoundUrl) {
            playSound(messageSoundUrl);
          } else {
            playFallbackBeep();
          }
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tripId]);

  // Fetch trip addresses as fallback when props are missing
  useEffect(() => {
    if (pickupName) setTripPickupName(pickupName);
    if (dropoffName) setTripDropoffName(dropoffName);
    if ((pickupName && dropoffName) || !tripId) return;
    supabase.from("trips").select("pickup_address, dropoff_address").eq("id", tripId).single().then(({ data }) => {
      if (data) {
        if (!pickupName && data.pickup_address) setTripPickupName(data.pickup_address);
        if (!dropoffName && data.dropoff_address) setTripDropoffName(data.dropoff_address);
      }
    });
  }, [tripId, pickupName, dropoffName]);

  // Fetch bank logos & favara logo
  useEffect(() => {
    supabase.from("banks").select("name, logo_url").eq("is_active", true).then(({ data }) => {
      if (data) {
        const logos: Record<string, string> = {};
        data.forEach((b: any) => { if (b.logo_url) logos[b.name] = b.logo_url; });
        setBankLogos(logos);
      }
    });
    supabase.from("system_settings").select("value").eq("key", "favara_logo_url").maybeSingle().then(({ data }) => {
      if (data?.value && typeof data.value === "string") setFavaraLogoUrl(data.value);
    });
  }, []);

  // Track driver location for speed & ETA
  useEffect(() => {
    if (!tripId) return;

    const fetchDriverLocation = async () => {
      const { data: trip } = await supabase.from("trips").select("driver_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, duration_minutes, distance_km").eq("id", tripId).single();
      if (!trip?.driver_id) return;

      const { data: loc } = await supabase.from("driver_locations").select("lat, lng, heading").eq("driver_id", trip.driver_id).single();
      if (!loc) return;

      const now = Date.now();
      if (lastLocRef.current) {
        const dist = haversine(lastLocRef.current.lat, lastLocRef.current.lng, loc.lat, loc.lng);
        const timeDiffH = (now - lastLocRef.current.time) / 3600000;
        if (timeDiffH > 0) {
          const currentSpeed = Math.round(dist / timeDiffH);
          setSpeed(currentSpeed > 200 ? speed : currentSpeed);
        }
      }
      lastLocRef.current = { lat: loc.lat, lng: loc.lng, time: now };

      // Use driver's Google Directions data if available, otherwise fallback to haversine
      if (trip.distance_km && trip.duration_minutes) {
        setDistanceKm(Number(trip.distance_km));
        setEtaMinutes(Math.max(1, Number(trip.duration_minutes)));
        // Set total distance for progress bar
        if (totalDistanceKm === null && trip.pickup_lat && trip.pickup_lng && trip.dropoff_lat && trip.dropoff_lng) {
          const total = haversine(Number(trip.pickup_lat), Number(trip.pickup_lng), Number(trip.dropoff_lat), Number(trip.dropoff_lng)) * 1.4;
          if (total > 0) setTotalDistanceKm(Math.round(total * 10) / 10);
        }
      } else if (trip.dropoff_lat && trip.dropoff_lng) {
        // Fallback: haversine with road correction
        if (totalDistanceKm === null && trip.pickup_lat && trip.pickup_lng) {
          const total = haversine(Number(trip.pickup_lat), Number(trip.pickup_lng), Number(trip.dropoff_lat), Number(trip.dropoff_lng)) * 1.4;
          if (total > 0) setTotalDistanceKm(Math.round(total * 10) / 10);
        }
        const remaining = haversine(loc.lat, loc.lng, Number(trip.dropoff_lat), Number(trip.dropoff_lng)) * 1.4;
        setDistanceKm(Math.round(remaining * 10) / 10);
        const avgSpeed = speed > 5 ? speed : 30;
        setEtaMinutes(Math.max(1, Math.round((remaining / avgSpeed) * 60)));
      }
    };

    fetchDriverLocation();
    // Use admin-configured driver location interval for polling
    let pollMs = 3000;
    supabase.from("system_settings").select("value").eq("key", "driver_location_interval_ms").single().then(({ data }) => {
      if (data?.value) {
        const val = typeof data.value === "number" ? data.value : parseInt(String(data.value), 10);
        if (!isNaN(val) && val >= 1000) pollMs = val;
      }
    });
    const interval = setInterval(fetchDriverLocation, pollMs);
    return () => clearInterval(interval);
  }, [tripId, speed]);

  // Trip elapsed timer - based on started_at from DB so it persists across refreshes
  useEffect(() => {
    if (tripStatus !== "in_progress" || !tripId) return;

    let timer: ReturnType<typeof setInterval>;

    const initTimer = async () => {
      const { data } = await supabase.from("trips").select("started_at").eq("id", tripId).single();
      if (data?.started_at) {
        const startedAt = new Date(data.started_at).getTime();
        const calcElapsed = () => Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        setTripElapsed(calcElapsed());
        timer = setInterval(() => setTripElapsed(calcElapsed()), 1000);
      } else {
        timer = setInterval(() => setTripElapsed(prev => prev + 1), 1000);
      }
    };

    initTimer();
    return () => clearInterval(timer);
  }, [tripStatus, tripId]);

  // Accepted elapsed timer - time since driver accepted
  useEffect(() => {
    if (!tripId || tripStatus === "in_progress") return;
    if (tripStatus !== "accepted" && tripStatus !== "arrived") return;
    let timer: ReturnType<typeof setInterval>;
    const initTimer = async () => {
      const { data } = await supabase.from("trips").select("accepted_at").eq("id", tripId).single();
      if (data?.accepted_at) {
        const acceptedAt = new Date(data.accepted_at).getTime();
        const calcElapsed = () => Math.max(0, Math.floor((Date.now() - acceptedAt) / 1000));
        setAcceptedElapsed(calcElapsed());
        timer = setInterval(() => setAcceptedElapsed(calcElapsed()), 1000);
      } else {
        timer = setInterval(() => setAcceptedElapsed(prev => prev + 1), 1000);
      }
    };
    initTimer();
    return () => clearInterval(timer);
  }, [tripStatus, tripId]);


  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({ title: "Copied!", description: "Account number copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/live-map?trip=${tripId}`;
    const shareText = `🚕 Track my HDA Taxi ride live!\nDriver: ${driverName}\n${tripPickupName ? `From: ${tripPickupName}` : ""}${tripDropoffName ? `\nTo: ${tripDropoffName}` : ""}`;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Track my ride - HDA Taxi",
          text: shareText,
          url: shareUrl,
        });
        toast({ title: "Shared!", description: "Live trip link shared successfully" });
      } else {
        // Fallback: copy both text and URL
        const fullText = `${shareText}\n\n${shareUrl}`;
        await navigator.clipboard.writeText(fullText);
        toast({ title: "Link copied!", description: "Trip tracking link copied to clipboard. Share it with anyone!" });
      }
    } catch (err: any) {
      // If share was cancelled, silently ignore. Otherwise copy as fallback.
      if (err?.name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(shareUrl);
          toast({ title: "Link copied!", description: "Share this link for live tracking" });
        } catch {}
      }
    }
  };

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const primaryBank = bankAccounts.find((b) => b.is_primary) || bankAccounts[0];
  const otherBanks = bankAccounts.filter((b) => b.id !== primaryBank?.id);

  const statusConfig = {
    in_progress: { label: "Trip in progress", icon: Navigation, color: "text-primary" },
    arrived: { label: "Driver has arrived!", icon: MapPin, color: "text-green-500" },
    accepted: { label: "Driver is on the way", icon: Navigation, color: "text-primary" },
  };
  const status = statusConfig[tripStatus as keyof typeof statusConfig] || statusConfig.accepted;
  const StatusIcon = status.icon;

  return (
    <>
      {/* Minimized floating pill */}
      <AnimatePresence>
        {minimized && (
          <motion.button
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            onClick={() => setMinimized(false)}
            className="absolute bottom-6 left-4 right-4 z-10 bg-card rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.15)] px-4 py-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
          >
            <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center overflow-hidden shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Driver" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-foreground">{initials}</span>
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-bold text-foreground truncate">{driverName}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`font-semibold ${status.color}`}>{status.label}</span>
                {etaMinutes && tripStatus !== "arrived" && (
                  <span className="text-foreground font-mono">• {etaMinutes} min</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-primary">
              <span className="text-xs font-semibold">Open</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Full panel */}
      <AnimatePresence>
        {!minimized && (
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] z-10 max-h-[80vh] overflow-y-auto
                   lg:static lg:rounded-2xl lg:shadow-2xl lg:m-4 lg:max-h-[calc(100dvh-6rem)] lg:border lg:border-border/40"
      >
        <div className="p-4 pb-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="w-10" />
            <div className="w-10 h-1 rounded-full bg-border" />
            <button
              onClick={() => setMinimized(true)}
              className="w-8 h-8 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform"
            >
              <Minimize2 className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Driver info */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-3 h-3 rounded-full bg-primary animate-pulse-dot absolute -top-1 -right-1 z-10" />
              <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Driver" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-foreground">{initials}</span>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-foreground">{driverName}</h3>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Star className="w-4 h-4 text-primary fill-primary" />
                <span>{rating}</span>
                {vehicle && <><span>•</span><span className="truncate">{vehicle}</span></>}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {plate && <span className="text-sm font-bold text-foreground">{plate}</span>}
                {vehicleColor && (
                  <span className="text-xs text-muted-foreground">• {vehicleColor}</span>
                )}
              </div>
            </div>
            {vehicleImageUrl && (
              <div className="shrink-0 w-20 h-14 rounded-xl bg-surface overflow-hidden border border-border/40">
                <img src={vehicleImageUrl} alt="Vehicle" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {/* Enhanced Status Card */}
          <motion.div
            layout
            className="rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20"
          >
            {/* Status Header */}
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <motion.div
                animate={{ rotate: tripStatus === "in_progress" ? [0, 15, -15, 0] : 0 }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              >
                <StatusIcon className={`w-5 h-5 ${status.color}`} />
              </motion.div>
              <span className={`text-sm font-bold ${status.color}`}>{status.label}</span>
              {tripStatus === "in_progress" && (
                <span className="ml-auto flex items-center gap-1.5 text-xs font-mono text-muted-foreground bg-surface px-2.5 py-0.5 rounded-full">
                  <Clock className="w-3 h-3" />
                  <span>Trip time:</span>
                  <span className="font-bold text-foreground">{formatElapsed(tripElapsed)}</span>
                </span>
              )}
            </div>

            {/* Animated Progress Bar */}
            <div className="px-4 pb-3">
              <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: "5%" }}
                  animate={{
                    width: tripStatus === "arrived" ? "33%" 
                      : tripStatus === "in_progress" && totalDistanceKm && distanceKm !== null 
                        ? `${Math.min(95, Math.max(5, ((totalDistanceKm - distanceKm) / totalDistanceKm) * 100))}%`
                        : tripStatus === "in_progress" ? "50%" 
                        : "15%",
                  }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 max-w-[45%] truncate">
                  <MapPin className="w-3 h-3 shrink-0" /> {tripPickupName || "Pickup"}
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 max-w-[45%] truncate">
                  {tripDropoffName || "Dropoff"} <ArrowRight className="w-3 h-3 shrink-0" />
                </span>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-4 gap-0 border-t border-primary/10">
              {/* ETA */}
              <motion.div
                className="flex flex-col items-center py-2.5 border-r border-primary/10"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Clock className="w-3.5 h-3.5 text-primary mb-0.5" />
                <motion.span
                  key={etaMinutes}
                  initial={{ scale: 1.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-base font-bold text-foreground leading-none"
                >
                  {tripStatus === "arrived" ? "—" : etaMinutes ? `${etaMinutes}` : "..."}
                </motion.span>
                <span className="text-[9px] text-muted-foreground mt-0.5">
                  {tripStatus === "arrived" ? "Arrived" : "min ETA"}
                </span>
              </motion.div>

              {/* Distance */}
              <motion.div
                className="flex flex-col items-center py-2.5 border-r border-primary/10"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Route className="w-3.5 h-3.5 text-primary mb-0.5" />
                <motion.span
                  key={distanceKm}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-base font-bold text-foreground leading-none"
                >
                  {distanceKm !== null ? distanceKm : "..."}
                </motion.span>
                <span className="text-[9px] text-muted-foreground mt-0.5">km left</span>
              </motion.div>

              {/* Speed */}
              <motion.div
                className="flex flex-col items-center py-2.5 border-r border-primary/10"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Gauge className="w-3.5 h-3.5 text-primary mb-0.5" />
                <motion.span
                  key={speed}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-base font-bold text-foreground leading-none"
                >
                  {speed}
                </motion.span>
                <span className="text-[9px] text-muted-foreground mt-0.5">km/h</span>
              </motion.div>

              {/* Share */}
              <motion.button
                onClick={handleShare}
                className="flex flex-col items-center py-2.5 active:bg-primary/10 transition-colors"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                whileTap={{ scale: 0.95 }}
              >
                <Share2 className="w-3.5 h-3.5 text-primary mb-0.5" />
                <span className="text-[11px] font-semibold text-primary leading-none">Share</span>
                <span className="text-[9px] text-muted-foreground mt-0.5">Live trip</span>
              </motion.button>
            </div>
          </motion.div>

          {/* Actions */}
          <div className="flex gap-2">
            <a href={`tel:${phone}`} className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3 font-semibold active:scale-[0.98] transition-transform">
              <Phone className="w-4 h-4" />
              Call
            </a>
            <button
              onClick={() => { setShowChat(true); setUnreadMessages(0); }}
              className="flex-1 flex items-center justify-center gap-2 bg-surface text-foreground rounded-xl py-3 font-semibold active:scale-[0.98] transition-transform relative"
            >
              <MessageSquare className="w-4 h-4" />
              Message
              {unreadMessages > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                  {unreadMessages}
                </span>
              )}
            </button>
          </div>

          {/* Payment accounts - compact */}
          {(showBankDetails || tripStatus === "in_progress") && (primaryBank || favaraAccounts.length > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-primary" />
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Payment</p>
              </div>

              {(() => {
                const totalItems = (primaryBank ? 1 : 0) + otherBanks.length + favaraAccounts.length;
                const useGrid = totalItems > 1;
                const allItems: React.ReactNode[] = [];
                if (primaryBank) allItems.push(<BankCard key={primaryBank.id} bank={primaryBank} copiedId={copiedId} onCopy={copyToClipboard} logoUrl={bankLogos[primaryBank.bank_name]} />);
                otherBanks.forEach((bank) => allItems.push(<BankCard key={bank.id} bank={bank} copiedId={copiedId} onCopy={copyToClipboard} logoUrl={bankLogos[bank.bank_name]} />));
                favaraAccounts.forEach((favara) => allItems.push(
                  <div key={favara.id} className="bg-surface rounded-lg px-3 py-2 flex items-center gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {favaraLogoUrl ? <img src={favaraLogoUrl} alt="Favara" className="w-5 h-5 rounded object-contain shrink-0" /> : <Landmark className="w-4 h-4 text-primary shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">Favara</span>
                          {favara.is_primary && <span className="text-[8px] font-bold text-primary bg-primary/10 px-1.5 py-px rounded-full">Primary</span>}
                        </div>
                        <p className="text-xs font-mono font-semibold text-foreground truncate">{favara.favara_id}</p>
                        {favara.favara_name && <p className="text-[10px] text-muted-foreground truncate">{favara.favara_name}</p>}
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(favara.favara_id, favara.id)}
                      className="w-7 h-7 rounded-lg bg-card flex items-center justify-center active:scale-90 transition-transform shrink-0"
                    >
                      {copiedId === favara.id ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                    </button>
                  </div>
                ));
                return (
                  <div className={`grid gap-1.5 ${useGrid ? "grid-cols-2" : "grid-cols-1"}`}>
                    {allItems.map((item, idx) => {
                      const isLast = idx === allItems.length - 1;
                      const isOddLastInGrid = useGrid && isLast && totalItems % 2 !== 0;
                      return <div key={idx} className={isOddLastInGrid ? "col-span-2" : ""}>{item}</div>;
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Cancel */}
          {onCancelTrip && (
            <button
              onClick={onCancelTrip}
              className="w-full flex items-center justify-center gap-2 text-destructive text-sm font-medium py-2 active:scale-95 transition-transform"
            >
              <X className="w-4 h-4" />
              Cancel ride
            </button>
          )}
        </div>
      </motion.div>
        )}
      </AnimatePresence>

      {/* Chat modal */}
      {tripId && (
        <TripChat
          tripId={tripId}
          senderId={userId}
          senderName="Passenger"
          recipientId={driver?.id}
          senderType="passenger"
          isOpen={showChat}
          onClose={() => setShowChat(false)}
        />
      )}
    </>
  );
};

// Haversine formula for distance in km
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const BankCard = ({
  bank,
  copiedId,
  onCopy,
  logoUrl,
}: {
  bank: BankAccountInfo;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  logoUrl?: string;
}) => (
  <div className="bg-surface rounded-lg px-3 py-2 flex items-center gap-2">
    <div className="flex items-center gap-1.5 min-w-0 flex-1">
      {logoUrl && <img src={logoUrl} alt={bank.bank_name} className="w-5 h-5 rounded object-contain shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground">{bank.bank_name}</span>
          {bank.is_primary && <span className="text-[8px] font-bold text-primary bg-primary/10 px-1.5 py-px rounded-full">Primary</span>}
        </div>
        <p className="text-xs font-mono font-semibold text-foreground truncate">{bank.account_number}</p>
        {bank.account_name && <p className="text-[10px] text-muted-foreground truncate">{bank.account_name}</p>}
      </div>
    </div>
    <button
      onClick={() => onCopy(bank.account_number, bank.id)}
      className="w-7 h-7 rounded-lg bg-card flex items-center justify-center active:scale-90 transition-transform shrink-0"
    >
      {copiedId === bank.id ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
  </div>
);

export default DriverMatching;
