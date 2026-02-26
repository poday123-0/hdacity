import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Car, MapPin, Phone, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface SearchingDriverProps {
  onCancel: () => void;
  pickupName?: string;
  dropoffName?: string;
  tripId?: string | null;
  pickupLat?: number;
  pickupLng?: number;
}

const SearchingDriver = ({ onCancel, pickupName = "Pickup", dropoffName = "Destination", tripId, pickupLat, pickupLng }: SearchingDriverProps) => {
  const [showCallCenter, setShowCallCenter] = useState(false);
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
      .update({
        status: "cancelled",
        cancel_reason: "No driver found",
        cancelled_at: new Date().toISOString(),
        target_driver_id: null,
      })
      .eq("id", tripId)
      .eq("status", "requested");

    if (error) {
      console.error("Failed to cancel timed-out trip:", error);
      noDriverCancelRef.current = false;
    }
  }, [tripId]);

  useEffect(() => {
    noDriverCancelRef.current = false;
  }, [tripId]);

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

  // Find and sort nearest drivers for auto-nearest mode
  const findNearestDrivers = useCallback(async () => {
    if (!pickupLat || !pickupLng) return [];
    
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: drivers } = await supabase
      .from("driver_locations")
      .select("driver_id, lat, lng")
      .eq("is_online", true)
      .eq("is_on_trip", false)
      .gte("updated_at", twoMinAgo);

    if (!drivers || drivers.length === 0) return [];

    // Calculate distance and sort
    const withDistance = drivers.map(d => {
      const dlat = d.lat - pickupLat;
      const dlng = d.lng - pickupLng;
      const distance = Math.sqrt(dlat * dlat + dlng * dlng) * 111; // rough km
      return { driver_id: d.driver_id, distance, name: "" };
    }).filter(d => d.distance <= maxSearchRadius).sort((a, b) => a.distance - b.distance);

    // Limit if max is set
    const limited = maxAutoDrivers > 0 ? withDistance.slice(0, maxAutoDrivers) : withDistance;

    // Fetch driver names
    if (limited.length > 0) {
      const ids = limited.map(d => d.driver_id);
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name").in("id", ids);
      if (profiles) {
        profiles.forEach(p => {
          const d = limited.find(x => x.driver_id === p.id);
          if (d) d.name = `${p.first_name} ${p.last_name}`;
        });
      }
    }

    return limited;
  }, [pickupLat, pickupLng, maxSearchRadius, maxAutoDrivers]);

  // Initialize auto-nearest dispatch
  useEffect(() => {
    if (dispatchMode !== "auto_nearest" || !tripId) return;

    const initDispatch = async () => {
      const drivers = await findNearestDrivers();
      driversListRef.current = drivers;
      setTotalDriversAvailable(drivers.length);

      if (drivers.length === 0) {
        setShowCallCenter(true);
        await cancelTripNoDriver();
        return;
      }

      // Target first driver
      setCurrentAttempt(0);
      currentAttemptRef.current = 0;
      setCurrentDriverName(drivers[0]?.name || "Driver");
      await supabase.from("trips").update({
        target_driver_id: drivers[0].driver_id,
        dispatch_attempt: 1,
      }).eq("id", tripId);
    };

    initDispatch();
  }, [dispatchMode, tripId, findNearestDrivers, cancelTripNoDriver]);

  // Timer for auto-nearest: cycle drivers on timeout
  useEffect(() => {
    if (dispatchMode !== "auto_nearest" || !tripId) {
      // Broadcast mode: simple overall timeout
      const interval = setInterval(() => {
        setElapsedSeconds(prev => {
          const next = prev + 1;
          if (next >= timeoutSeconds) {
            setShowCallCenter(true);
            void cancelTripNoDriver();
          }
          return next;
        });
      }, 1000);
      return () => clearInterval(interval);
    }

    // Auto-nearest mode: per-driver timeout
    let secondsForCurrentDriver = 0;

    attemptTimerRef.current = setInterval(async () => {
      secondsForCurrentDriver++;
      setElapsedSeconds(prev => prev + 1);

      if (secondsForCurrentDriver >= timeoutSeconds) {
        // Time's up for current driver — move to next
        secondsForCurrentDriver = 0;
        const drivers = driversListRef.current;
        const nextAttempt = currentAttemptRef.current + 1;

        if (nextAttempt >= drivers.length) {
          // All drivers tried
          setShowCallCenter(true);
          if (attemptTimerRef.current) clearInterval(attemptTimerRef.current);
          await cancelTripNoDriver();
          return;
        }

        // Target next driver
        currentAttemptRef.current = nextAttempt;
        setCurrentAttempt(nextAttempt);
        setCurrentDriverName(drivers[nextAttempt]?.name || "Driver");
        await supabase.from("trips").update({
          target_driver_id: drivers[nextAttempt].driver_id,
          dispatch_attempt: nextAttempt + 1,
        }).eq("id", tripId);

        toast({ title: "Trying next driver...", description: `Attempt ${nextAttempt + 1} of ${drivers.length}` });
      }
    }, 1000);

    return () => {
      if (attemptTimerRef.current) clearInterval(attemptTimerRef.current);
    };
  }, [dispatchMode, tripId, timeoutSeconds, cancelTripNoDriver]);

  const isAutoNearest = dispatchMode === "auto_nearest";

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.1)] z-10"
    >
      <div className="p-6 space-y-6">
        <div className="flex justify-center">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Searching animation */}
        <div className="flex flex-col items-center py-4">
          <div className="relative w-28 h-28">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border-2 border-primary"
              />
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 rounded-full bg-primary flex items-center justify-center"
              >
                <Car className="w-8 h-8 text-primary-foreground" />
              </motion.div>
            </div>
          </div>

          <motion.h3
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-lg font-bold text-foreground mt-6"
          >
            {showCallCenter ? "No drivers available" : "Finding your driver..."}
          </motion.h3>
          <p className="text-sm text-muted-foreground mt-1">
            {showCallCenter
              ? "Try calling our support center"
              : isAutoNearest
                ? `Requesting driver ${currentAttempt + 1}${totalDriversAvailable > 0 ? ` of ${totalDriversAvailable}` : ""}...`
                : "Waiting for a driver to accept"
            }
          </p>

          {/* Countdown timer */}
          {!showCallCenter && (
            <div className="mt-3 flex items-center gap-2">
              <div className="w-32 h-1.5 bg-surface rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  style={{
                    width: `${Math.max(0, 100 - ((elapsedSeconds % timeoutSeconds) / timeoutSeconds) * 100)}%`,
                  }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {Math.max(0, timeoutSeconds - (elapsedSeconds % timeoutSeconds))}s
              </span>
            </div>
          )}
        </div>

        {/* Call center option */}
        {showCallCenter && callCenterNumber && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-primary/10 rounded-xl p-4 space-y-3"
          >
            <p className="text-sm font-semibold text-foreground text-center">No driver accepted your request</p>
            <a
              href={`tel:+960${callCenterNumber}`}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
            >
              <Phone className="w-4 h-4" />
              Call Support: +960 {callCenterNumber}
            </a>
          </motion.div>
        )}

        {/* Route info */}
        <div className="bg-surface rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Pickup</p>
              <p className="text-sm font-medium text-foreground">{pickupName}</p>
            </div>
          </div>
          <div className="ml-1.5 w-0.5 h-4 bg-border" />
          <div className="flex items-center gap-3">
            <MapPin className="w-3 h-3 text-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Destination</p>
              <p className="text-sm font-medium text-foreground">{dropoffName}</p>
            </div>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="w-full py-3 text-sm font-medium text-destructive hover:bg-destructive/5 rounded-xl transition-colors"
        >
          Cancel search
        </button>
      </div>
    </motion.div>
  );
};

export default SearchingDriver;
