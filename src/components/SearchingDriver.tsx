import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Car, MapPin, Phone, RotateCcw } from "lucide-react";
import SystemLogo from "@/components/SystemLogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface SearchingDriverProps {
  onCancel: () => void;
  onRetry?: () => void;
  pickupName?: string;
  dropoffName?: string;
  tripId?: string | null;
  pickupLat?: number;
  pickupLng?: number;
  isScheduled?: boolean;
  scheduledAt?: string;
  vehicleTypeId?: string | null;
}

const SearchingDriver = ({ onCancel, onRetry, pickupName = "Pickup", dropoffName = "Destination", tripId, pickupLat, pickupLng, isScheduled = false, scheduledAt, vehicleTypeId }: SearchingDriverProps) => {
  const [showNoDriver, setShowNoDriver] = useState(false);
  const [callCenterNumber, setCallCenterNumber] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [dispatchMode, setDispatchMode] = useState<string>("broadcast");
  const [maxAutoDrivers, setMaxAutoDrivers] = useState(0);
  const [maxSearchRadius, setMaxSearchRadius] = useState(50);
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const currentAttemptRef = useRef(0);
  const [totalDriversAvailable, setTotalDriversAvailable] = useState(0);
  const [currentDriverName, setCurrentDriverName] = useState("");
  const driversListRef = useRef<Array<{ driver_id: string; distance: number; name: string }>>([]);
  const attemptTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noDriverCancelRef = useRef(false);

  const cancelTripNoDriver = useCallback(async () => {
    if (!tripId || noDriverCancelRef.current) return;
    noDriverCancelRef.current = true;
    const { error } = await supabase
      .from("trips")
      .update({ status: "cancelled", cancel_reason: "No driver found", cancelled_at: new Date().toISOString(), target_driver_id: null })
      .eq("id", tripId)
      .eq("status", "requested");
    if (error) {
      console.error("Failed to cancel timed-out trip:", error);
      noDriverCancelRef.current = false;
    }
  }, [tripId]);

  useEffect(() => { noDriverCancelRef.current = false; }, [tripId]);

  // Fetch settings
  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from("system_settings").select("key, value").in("key", [
        "call_center_number", "driver_accept_timeout_seconds", "dispatch_mode", "max_auto_drivers", "max_search_radius_km"
      ]);
      data?.forEach((s: any) => {
        if (s.key === "call_center_number") setCallCenterNumber(typeof s.value === "string" ? s.value : String(s.value || ""));
        if (s.key === "driver_accept_timeout_seconds") setTimeoutSeconds(typeof s.value === "number" ? s.value : parseInt(s.value) || 60);
        if (s.key === "dispatch_mode") setDispatchMode(typeof s.value === "string" ? s.value : "broadcast");
        if (s.key === "max_auto_drivers") setMaxAutoDrivers(typeof s.value === "number" ? s.value : parseInt(s.value) || 0);
        if (s.key === "max_search_radius_km") setMaxSearchRadius(typeof s.value === "number" ? s.value : parseInt(s.value) || 50);
      });
    };
    fetchSettings();
  }, []);

  // Find and sort drivers based on dispatch mode
  const findNearestDrivers = useCallback(async () => {
    if (!pickupLat || !pickupLng) return [];
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    let query = supabase
      .from("driver_locations").select("driver_id, lat, lng, vehicle_type_id")
      .eq("is_online", true).eq("is_on_trip", false).gte("updated_at", twoMinAgo);
    const { data: drivers } = await query;
    if (!drivers || drivers.length === 0) return [];

    // Filter by vehicle type: include drivers whose active vehicle type matches OR who are eligible via driver_vehicle_types
    let eligibleDriverIds: Set<string> | null = null;
    if (vehicleTypeId) {
      // Drivers currently broadcasting on this vehicle type
      const directMatch = new Set(drivers.filter(d => d.vehicle_type_id === vehicleTypeId).map(d => d.driver_id));
      // Also check driver_vehicle_types for drivers approved for this type
      const { data: dvtData } = await supabase
        .from("driver_vehicle_types").select("driver_id")
        .eq("vehicle_type_id", vehicleTypeId).eq("status", "approved");
      const dvtIds = new Set((dvtData || []).map((r: any) => r.driver_id));
      eligibleDriverIds = new Set([...directMatch, ...dvtIds]);
    }

    const withDistance = drivers.map(d => {
      const dlat = d.lat - pickupLat; const dlng = d.lng - pickupLng;
      return { driver_id: d.driver_id, distance: Math.sqrt(dlat * dlat + dlng * dlng) * 111, name: "", avg_rating: 0 };
    }).filter(d => d.distance <= maxSearchRadius);

    const limited = maxAutoDrivers > 0 ? withDistance.slice(0, Math.max(maxAutoDrivers * 3, 30)) : withDistance;
    if (limited.length === 0) return [];

    const ids = limited.map(d => d.driver_id);

    // Fetch profiles and ratings
    const [profilesRes, ratingsRes] = await Promise.all([
      supabase.from("profiles").select("id, first_name, last_name").in("id", ids),
      supabase.from("trips").select("driver_id, driver_rating").in("driver_id", ids).not("driver_rating", "is", null),
    ]);

    // Compute average ratings
    const ratingMap: Record<string, { sum: number; count: number }> = {};
    ratingsRes.data?.forEach((t: any) => {
      if (!ratingMap[t.driver_id]) ratingMap[t.driver_id] = { sum: 0, count: 0 };
      ratingMap[t.driver_id].sum += t.driver_rating;
      ratingMap[t.driver_id].count++;
    });

    profilesRes.data?.forEach((p: any) => {
      const d = limited.find(x => x.driver_id === p.id);
      if (d) d.name = `${p.first_name} ${p.last_name}`;
    });

    limited.forEach(d => {
      const r = ratingMap[d.driver_id];
      d.avg_rating = r ? r.sum / r.count : 0;
    });

    // Sort based on dispatch mode
    if (dispatchMode === "auto_rating") {
      // Highest rated first, then nearest as tiebreaker
      limited.sort((a, b) => b.avg_rating - a.avg_rating || a.distance - b.distance);
    } else if (dispatchMode === "auto_rating_nearest") {
      // Combined score: normalize rating (0-5 → 0-1) and distance, weighted 60% rating + 40% proximity
      const maxDist = Math.max(...limited.map(d => d.distance), 1);
      limited.sort((a, b) => {
        const scoreA = (a.avg_rating / 5) * 0.6 + (1 - a.distance / maxDist) * 0.4;
        const scoreB = (b.avg_rating / 5) * 0.6 + (1 - b.distance / maxDist) * 0.4;
        return scoreB - scoreA;
      });
    } else {
      // auto_nearest: nearest first
      limited.sort((a, b) => a.distance - b.distance);
    }

    return maxAutoDrivers > 0 ? limited.slice(0, maxAutoDrivers) : limited;
  }, [pickupLat, pickupLng, maxSearchRadius, maxAutoDrivers, dispatchMode]);

  const isAutoMode = ["auto_nearest", "auto_rating", "auto_rating_nearest"].includes(dispatchMode);

  // Initialize auto dispatch
  useEffect(() => {
    if (!isAutoMode || !tripId) return;
    const initDispatch = async () => {
      const drivers = await findNearestDrivers();
      driversListRef.current = drivers;
      setTotalDriversAvailable(drivers.length);
      if (drivers.length === 0) { setShowNoDriver(true); await cancelTripNoDriver(); return; }
      setCurrentAttempt(0); currentAttemptRef.current = 0;
      setCurrentDriverName(drivers[0]?.name || "Driver");
      await supabase.from("trips").update({ target_driver_id: drivers[0].driver_id, dispatch_attempt: 1 }).eq("id", tripId);
    };
    initDispatch();
  }, [isAutoMode, tripId, findNearestDrivers, cancelTripNoDriver]);

  // Timer — skip auto-cancel for scheduled rides
  useEffect(() => {
    if (isScheduled) return; // Scheduled rides don't timeout
    if (!isAutoMode || !tripId) {
      const interval = setInterval(() => {
        setElapsedSeconds(prev => {
          const next = prev + 1;
          if (next >= timeoutSeconds) { setShowNoDriver(true); void cancelTripNoDriver(); }
          return next;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
    let secondsForCurrentDriver = 0;
    attemptTimerRef.current = setInterval(async () => {
      secondsForCurrentDriver++; setElapsedSeconds(prev => prev + 1);
      if (secondsForCurrentDriver >= timeoutSeconds) {
        secondsForCurrentDriver = 0;
        const drivers = driversListRef.current;
        const nextAttempt = currentAttemptRef.current + 1;
        if (nextAttempt >= drivers.length) {
          setShowNoDriver(true);
          if (attemptTimerRef.current) clearInterval(attemptTimerRef.current);
          await cancelTripNoDriver(); return;
        }
        currentAttemptRef.current = nextAttempt; setCurrentAttempt(nextAttempt);
        setCurrentDriverName(drivers[nextAttempt]?.name || "Driver");
        await supabase.from("trips").update({ target_driver_id: drivers[nextAttempt].driver_id, dispatch_attempt: nextAttempt + 1 }).eq("id", tripId);
        toast({ title: "Trying next driver...", description: `Attempt ${nextAttempt + 1} of ${drivers.length}` });
      }
    }, 1000);
    return () => { if (attemptTimerRef.current) clearInterval(attemptTimerRef.current); };
  }, [isAutoMode, tripId, timeoutSeconds, cancelTripNoDriver, isScheduled]);


  // Vibrate when no driver found (no sound for passengers)
  useEffect(() => {
    if (showNoDriver) {
      try { navigator.vibrate?.([300, 100, 300, 100, 300]); } catch {}
    }
  }, [showNoDriver]);

  // ─── "No driver found" screen ───
  if (showNoDriver) {
    const cleanNumber = callCenterNumber.replace(/"/g, "").trim();
    const telHref = cleanNumber.startsWith("+") ? `tel:${cleanNumber}` : `tel:+960${cleanNumber}`;
    const displayNumber = cleanNumber.startsWith("+") ? cleanNumber : `+960 ${cleanNumber}`;

    return (
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
          className="bg-card rounded-3xl shadow-2xl w-full max-w-[340px] overflow-hidden border border-border/40"
        >
          {/* Header */}
          <div className="px-6 pt-8 pb-5 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 18 }}
              className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4"
            >
              <Car className="w-8 h-8 text-destructive" />
            </motion.div>
            <h3 className="text-lg font-bold text-foreground">No drivers available</h3>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              No driver accepted your trip. Please call our support center to arrange a ride.
            </p>
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 space-y-3">
            {cleanNumber && (
              <motion.a
                href={telHref}
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center justify-center gap-3 bg-primary text-primary-foreground py-4 rounded-2xl text-base font-bold shadow-lg shadow-primary/25 active:scale-95 transition-transform"
              >
                <Phone className="w-5 h-5" />
                Call Support: {displayNumber}
              </motion.a>
            )}

            {onRetry && (
              <button
                onClick={onRetry}
                className="w-full flex items-center justify-center gap-2 bg-secondary text-secondary-foreground py-3.5 rounded-2xl text-sm font-semibold active:scale-95 transition-transform"
              >
                <RotateCcw className="w-4 h-4" />
                Try Again
              </button>
            )}

            <button
              onClick={onCancel}
              className="w-full py-3 text-sm font-medium text-muted-foreground hover:text-foreground rounded-2xl transition-colors"
            >
              Go back
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Searching animation ───
  return (
    <motion.div
      initial={{ y: "100%" }} animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-10
                 lg:static lg:rounded-2xl lg:shadow-2xl lg:m-4 lg:border lg:border-border/40"
    >
      <div className="p-6 space-y-6">
        <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>

        <div className="flex flex-col items-center py-4">
          <div className="relative w-28 h-28">
            {[0, 1, 2].map((i) => (
              <motion.div key={i} animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border-2 border-primary" />
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden">
                <SystemLogo className="w-14 h-14 object-contain" alt="HDA" />
              </motion.div>
            </div>
          </div>
          <motion.h3 animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
            className="text-lg font-bold text-foreground mt-6">
            {isScheduled ? "Waiting for a driver..." : "Finding your driver..."}
          </motion.h3>
          <p className="text-sm text-muted-foreground mt-1">
            {isScheduled
              ? `Scheduled for ${scheduledAt ? new Date(scheduledAt).toLocaleString() : "later"}`
              : isAutoMode
              ? `Requesting driver ${currentAttempt + 1}${totalDriversAvailable > 0 ? ` of ${totalDriversAvailable}` : ""}...`
              : "Waiting for a driver to accept"}
          </p>

          {!isScheduled && (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div className="h-full bg-primary rounded-full"
                  style={{ width: `${Math.max(0, 100 - ((elapsedSeconds % timeoutSeconds) / timeoutSeconds) * 100)}%` }}
                  transition={{ duration: 0.5 }} />
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {Math.max(0, timeoutSeconds - (elapsedSeconds % timeoutSeconds))}s
              </span>
            </div>
          )}
        </div>

        <div className="bg-muted/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <div><p className="text-xs text-muted-foreground">Pickup</p><p className="text-sm font-medium text-foreground">{pickupName}</p></div>
          </div>
          <div className="ml-1.5 w-0.5 h-4 bg-border" />
          <div className="flex items-center gap-3">
            <MapPin className="w-3 h-3 text-foreground shrink-0" />
            <div><p className="text-xs text-muted-foreground">Destination</p><p className="text-sm font-medium text-foreground">{dropoffName}</p></div>
          </div>
        </div>

        <button onClick={onCancel} className="w-full py-3 text-sm font-medium text-destructive hover:bg-destructive/5 rounded-xl transition-colors">
          Cancel search
        </button>
      </div>
    </motion.div>
  );
};

export default SearchingDriver;
