import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Watermelon {
  id: string;
  lat: number;
  lng: number;
  promo_type: string;
  amount: number;
  fee_free_months: number;
  free_trips: number;
  target_user_type: string;
  claim_radius_m: number;
}

interface WatermelonMapOverlayProps {
  userType: "driver" | "passenger";
  userId: string;
  userLat: number | null;
  userLng: number | null;
  mapInstance: google.maps.Map | null;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const WatermelonMapOverlay = ({ userType, userId, userLat, userLng, mapInstance }: WatermelonMapOverlayProps) => {
  const [melons, setMelons] = useState<Watermelon[]>([]);
  const [selectedMelon, setSelectedMelon] = useState<Watermelon | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimedReward, setClaimedReward] = useState<{ type: string; description: string } | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const fetchedRef = useRef(false);

  // Fetch active watermelons for this user type
  const fetchMelons = useCallback(async () => {
    const { data } = await supabase
      .from("promo_watermelons")
      .select("id, lat, lng, promo_type, amount, fee_free_months, free_trips, target_user_type, claim_radius_m")
      .eq("status", "active")
      .eq("target_user_type", userType);
    if (data) setMelons(data as any);
  }, [userType]);

  useEffect(() => {
    fetchMelons();
    // Subscribe to changes
    const channel = supabase
      .channel(`watermelons-${userType}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "promo_watermelons",
      }, () => {
        fetchMelons();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchMelons, userType]);

  // Place markers on map
  useEffect(() => {
    if (!mapInstance || !window.google?.maps?.marker?.AdvancedMarkerElement) return;

    // Clear old markers
    markersRef.current.forEach(m => m.map = null);
    markersRef.current = [];

    melons.forEach(melon => {
      const el = document.createElement("div");
      el.className = "watermelon-marker";
      el.innerHTML = `<div style="font-size:32px;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));animation:watermelon-bob 2s ease-in-out infinite;transform-origin:center bottom;">🍉</div>`;
      el.onclick = () => setSelectedMelon(melon);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: melon.lat, lng: melon.lng },
        map: mapInstance,
        content: el,
      });
      markersRef.current.push(marker);
    });

    // Add bobbing animation CSS if not present
    if (!document.getElementById("watermelon-styles")) {
      const style = document.createElement("style");
      style.id = "watermelon-styles";
      style.textContent = `
        @keyframes watermelon-bob {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-6px) scale(1.05); }
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      markersRef.current.forEach(m => m.map = null);
      markersRef.current = [];
    };
  }, [melons, mapInstance]);

  const handleClaim = async () => {
    if (!selectedMelon || claiming || !userId) return;

    if (userLat == null || userLng == null) {
      toast({ title: "Location needed", description: "Enable GPS to pop watermelons!", variant: "destructive" });
      return;
    }

    // Client-side distance check
    const dist = haversineDistance(userLat, userLng, selectedMelon.lat, selectedMelon.lng);
    if (dist > selectedMelon.claim_radius_m) {
      toast({
        title: "Too far away! 🍉",
        description: `Get within ${selectedMelon.claim_radius_m}m to pop this watermelon. You're ${Math.round(dist)}m away.`,
        variant: "destructive",
      });
      return;
    }

    setClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke("claim-watermelon", {
        body: {
          watermelon_id: selectedMelon.id,
          user_id: userId,
          user_lat: userLat,
          user_lng: userLng,
          user_type: userType,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setClaimedReward({ type: data.promo_type, description: data.reward_description });
      setMelons(prev => prev.filter(m => m.id !== selectedMelon.id));
      toast({ title: "🍉 Watermelon Popped!", description: data.reward_description });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setClaiming(false);
    }
  };

  const promoLabel = (m: Watermelon) => {
    if (m.promo_type === "wallet_amount") return `${m.amount} MVR`;
    if (m.promo_type === "fee_free") return `${m.fee_free_months}mo Fee-Free`;
    if (m.promo_type === "free_trip") return `${m.free_trips} Free Trip${m.free_trips > 1 ? "s" : ""}`;
    return "";
  };

  const distance = selectedMelon && userLat != null && userLng != null
    ? Math.round(haversineDistance(userLat, userLng, selectedMelon.lat, selectedMelon.lng))
    : null;

  const inRange = distance != null && selectedMelon ? distance <= selectedMelon.claim_radius_m : false;

  return (
    <>
      {/* Watermelon count indicator */}
      {melons.length > 0 && !selectedMelon && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] pointer-events-auto">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-emerald-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5"
          >
            🍉 {melons.length} watermelon{melons.length !== 1 ? "s" : ""} nearby!
          </motion.div>
        </div>
      )}

      {/* Selected Watermelon Popup */}
      <AnimatePresence>
        {selectedMelon && !claimedReward && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end justify-center p-4 pointer-events-auto"
            onClick={() => setSelectedMelon(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 22 }}
              className="bg-card rounded-3xl shadow-2xl w-full max-w-[360px] overflow-hidden border border-border/40 mb-4"
              onClick={e => e.stopPropagation()}
            >
              {/* Watermelon header */}
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 px-6 pt-8 pb-6 text-center relative overflow-hidden">
                <div className="absolute inset-0 opacity-10">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <span key={i} className="absolute text-4xl" style={{
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                      transform: `rotate(${Math.random() * 360}deg)`,
                    }}>🍉</span>
                  ))}
                </div>
                <motion.div
                  animate={{ rotate: [0, -5, 5, -3, 3, 0] }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-6xl mb-3 relative"
                >
                  🍉
                </motion.div>
                <h3 className="text-white text-xl font-extrabold">Ramadan Watermelon!</h3>
                <p className="text-white/80 text-sm mt-1">Pop it to claim your reward</p>
              </div>

              {/* Reward info */}
              <div className="px-6 py-5 text-center">
                <p className="text-3xl font-extrabold text-primary mb-1">{promoLabel(selectedMelon)}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedMelon.promo_type === "wallet_amount" && "Wallet credit"}
                  {selectedMelon.promo_type === "fee_free" && "Center fee waived"}
                  {selectedMelon.promo_type === "free_trip" && "Free ride credit"}
                </p>

                {distance != null && (
                  <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                    inRange ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  }`}>
                    {inRange ? "✅ In range!" : `📍 ${distance}m away (need ${selectedMelon.claim_radius_m}m)`}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 space-y-2">
                <Button
                  onClick={handleClaim}
                  disabled={claiming || !inRange}
                  className="w-full py-6 text-base font-bold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl"
                >
                  {claiming ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="text-xl">🍉</span>}
                  {claiming ? "Popping..." : inRange ? "Pop Watermelon!" : "Get Closer to Pop"}
                </Button>
                <button
                  onClick={() => setSelectedMelon(null)}
                  className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Claimed Reward Celebration */}
      <AnimatePresence>
        {claimedReward && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={{ type: "spring", damping: 15, stiffness: 200 }}
              className="bg-card rounded-3xl shadow-2xl w-full max-w-[340px] p-8 text-center overflow-hidden relative"
            >
              {/* Confetti-like particles */}
              {Array.from({ length: 12 }).map((_, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  animate={{
                    opacity: 0,
                    scale: 0.5,
                    x: (Math.random() - 0.5) * 200,
                    y: (Math.random() - 0.5) * 200,
                  }}
                  transition={{ duration: 1, delay: i * 0.05 }}
                  className="absolute top-1/3 left-1/2 text-xl pointer-events-none"
                >
                  {["🍉", "✨", "🎉", "💰", "⭐"][i % 5]}
                </motion.span>
              ))}

              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="text-7xl mb-4"
              >
                💥
              </motion.div>
              <h3 className="text-xl font-extrabold text-foreground mb-2">Watermelon Popped! 🎉</h3>
              <p className="text-2xl font-extrabold text-primary mb-1">{claimedReward.description}</p>
              <p className="text-sm text-muted-foreground mt-2">Ramadan Mubarak! 🌙</p>
              <Button
                onClick={() => { setClaimedReward(null); setSelectedMelon(null); }}
                className="mt-6 w-full rounded-2xl py-5 text-base font-bold"
              >
                Awesome!
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default WatermelonMapOverlay;
