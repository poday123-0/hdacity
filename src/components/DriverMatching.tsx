import { Phone, MessageSquare, X, Star, Landmark, Copy, Check, ChevronDown, ChevronUp, Share2, Navigation, Gauge, Clock, MapPin, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import TripChat from "./TripChat";

interface BankAccountInfo {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_primary: boolean;
}

interface DriverInfo {
  name?: string;
  initials?: string;
  rating?: number;
  vehicle?: string;
  plate?: string;
  phone?: string;
  avatar_url?: string | null;
  bank_accounts?: BankAccountInfo[];
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
}

const DriverMatching = ({ onCancel, driver, tripId, userId, tripStatus, showBankDetails = false, pickupName, dropoffName }: DriverMatchingProps) => {
  const driverName = driver?.name || "Driver";
  const initials = driver?.initials || driverName.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const rating = driver?.rating || 4.9;
  const vehicle = driver?.vehicle || "";
  const plate = driver?.plate || "";
  const phone = driver?.phone || "";
  const avatarUrl = driver?.avatar_url;
  const bankAccounts = driver?.bank_accounts || [];
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllBanks, setShowAllBanks] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [bankLogos, setBankLogos] = useState<Record<string, string>>({});
  const [speed, setSpeed] = useState(0);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [tripElapsed, setTripElapsed] = useState(0);
  const lastLocRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const [tripPickupName, setTripPickupName] = useState(pickupName || "");
  const [tripDropoffName, setTripDropoffName] = useState(dropoffName || "");

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

  // Fetch bank logos
  useEffect(() => {
    supabase.from("banks").select("name, logo_url").eq("is_active", true).then(({ data }) => {
      if (data) {
        const logos: Record<string, string> = {};
        data.forEach((b: any) => { if (b.logo_url) logos[b.name] = b.logo_url; });
        setBankLogos(logos);
      }
    });
  }, []);

  // Track driver location for speed & ETA
  useEffect(() => {
    if (!tripId) return;

    const fetchDriverLocation = async () => {
      const { data: trip } = await supabase.from("trips").select("driver_id, dropoff_lat, dropoff_lng").eq("id", tripId).single();
      if (!trip?.driver_id) return;

      const { data: loc } = await supabase.from("driver_locations").select("lat, lng, heading").eq("driver_id", trip.driver_id).single();
      if (!loc) return;

      const now = Date.now();
      if (lastLocRef.current) {
        const dist = haversine(lastLocRef.current.lat, lastLocRef.current.lng, loc.lat, loc.lng);
        const timeDiffH = (now - lastLocRef.current.time) / 3600000;
        if (timeDiffH > 0) {
          const currentSpeed = Math.round(dist / timeDiffH);
          setSpeed(currentSpeed > 200 ? speed : currentSpeed); // filter GPS noise
        }
      }
      lastLocRef.current = { lat: loc.lat, lng: loc.lng, time: now };

      // Calculate ETA to dropoff
      if (trip.dropoff_lat && trip.dropoff_lng) {
        const remaining = haversine(loc.lat, loc.lng, Number(trip.dropoff_lat), Number(trip.dropoff_lng));
        const avgSpeed = speed > 5 ? speed : 30; // default 30km/h in city
        const eta = Math.max(1, Math.round((remaining / avgSpeed) * 60));
        setEtaMinutes(eta);
      }
    };

    fetchDriverLocation();
    const interval = setInterval(fetchDriverLocation, 5000);
    return () => clearInterval(interval);
  }, [tripId, speed]);

  // Trip elapsed timer
  useEffect(() => {
    if (tripStatus !== "in_progress") return;
    const timer = setInterval(() => setTripElapsed(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [tripStatus]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({ title: "Copied!", description: "Account number copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/live-map?trip=${tripId}`;
    const shareData = {
      title: "Track my ride - HDA Taxi",
      text: `Follow my live trip with ${driverName}`,
      url: shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: "Link copied!", description: "Share this link for live tracking" });
      }
    } catch {
      // User cancelled share
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
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] z-10 max-h-[80vh] overflow-y-auto"
      >
        <div className="p-4 pb-6 space-y-4">
          <div className="flex justify-center">
            <div className="w-10 h-1 rounded-full bg-border" />
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
              {plate && <p className="text-xs text-muted-foreground mt-0.5">{plate}</p>}
            </div>
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
                  initial={{ width: "0%" }}
                  animate={{
                    width: tripStatus === "arrived" ? "33%" : tripStatus === "in_progress" ? "66%" : "15%",
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
            <div className="grid grid-cols-3 gap-0 border-t border-primary/10">
              {/* ETA */}
              <motion.div
                className="flex flex-col items-center py-3 border-r border-primary/10"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Clock className="w-4 h-4 text-primary mb-1" />
                <motion.span
                  key={etaMinutes}
                  initial={{ scale: 1.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-lg font-bold text-foreground leading-none"
                >
                  {tripStatus === "arrived" ? "—" : etaMinutes ? `${etaMinutes}` : "..."}
                </motion.span>
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {tripStatus === "arrived" ? "Arrived" : "min ETA"}
                </span>
              </motion.div>

              {/* Speed */}
              <motion.div
                className="flex flex-col items-center py-3 border-r border-primary/10"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Gauge className="w-4 h-4 text-primary mb-1" />
                <motion.span
                  key={speed}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-lg font-bold text-foreground leading-none"
                >
                  {speed}
                </motion.span>
                <span className="text-[10px] text-muted-foreground mt-0.5">km/h</span>
              </motion.div>

              {/* Share */}
              <motion.button
                onClick={handleShare}
                className="flex flex-col items-center py-3 active:bg-primary/10 transition-colors"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                whileTap={{ scale: 0.95 }}
              >
                <Share2 className="w-4 h-4 text-primary mb-1" />
                <span className="text-xs font-semibold text-primary leading-none">Share</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">Live trip</span>
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
              onClick={() => setShowChat(true)}
              className="flex-1 flex items-center justify-center gap-2 bg-surface text-foreground rounded-xl py-3 font-semibold active:scale-[0.98] transition-transform"
            >
              <MessageSquare className="w-4 h-4" />
              Message
            </button>
          </div>

          {/* Bank accounts */}
          {(showBankDetails || tripStatus === "in_progress") && primaryBank && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Details</p>
              </div>

              <BankCard bank={primaryBank} copiedId={copiedId} onCopy={copyToClipboard} logoUrl={bankLogos[primaryBank.bank_name]} />

              {otherBanks.length > 0 && (
                <>
                  <button
                    onClick={() => setShowAllBanks(!showAllBanks)}
                    className="w-full flex items-center justify-center gap-1 text-xs text-primary font-semibold py-1"
                  >
                    {showAllBanks ? "Hide" : `Show ${otherBanks.length} more`}
                    {showAllBanks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <AnimatePresence>
                    {showAllBanks && otherBanks.map((bank) => (
                      <motion.div key={bank.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                        <BankCard bank={bank} copiedId={copiedId} onCopy={copyToClipboard} logoUrl={bankLogos[bank.bank_name]} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </>
              )}
            </div>
          )}

          {/* Cancel */}
          {tripStatus !== "in_progress" && (
            <button
              onClick={onCancel}
              className="w-full flex items-center justify-center gap-2 text-destructive text-sm font-medium py-2 active:scale-95 transition-transform"
            >
              <X className="w-4 h-4" />
              Cancel ride
            </button>
          )}
        </div>
      </motion.div>

      {/* Chat modal */}
      {tripId && (
        <TripChat
          tripId={tripId}
          senderId={userId}
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
  <div className="bg-surface rounded-xl p-3 space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {logoUrl ? (
          <img src={logoUrl} alt={bank.bank_name} className="w-6 h-6 rounded object-contain" />
        ) : null}
        <span className="text-sm font-semibold text-foreground">{bank.bank_name}</span>
      </div>
      {bank.is_primary && (
        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Primary</span>
      )}
    </div>
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Account number</p>
        <p className="text-sm font-mono font-semibold text-foreground">{bank.account_number}</p>
      </div>
      <button
        onClick={() => onCopy(bank.account_number, bank.id)}
        className="w-9 h-9 rounded-xl bg-card flex items-center justify-center active:scale-90 transition-transform"
      >
        {copiedId === bank.id ? (
          <Check className="w-4 h-4 text-primary" />
        ) : (
          <Copy className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
    </div>
    {bank.account_name && (
      <p className="text-xs text-muted-foreground">Name: <span className="font-medium text-foreground">{bank.account_name}</span></p>
    )}
  </div>
);

export default DriverMatching;
