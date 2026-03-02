import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PromoItem {
  id: string;
  lat: number;
  lng: number;
  promo_type: string;
  amount: number;
  fee_free_months: number;
  free_trips: number;
  target_user_type: string;
  claim_radius_m: number;
  icon_url: string | null;
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
  const [items, setItems] = useState<PromoItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<PromoItem | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimedReward, setClaimedReward] = useState<{ type: string; description: string } | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from("promo_watermelons")
      .select("id, lat, lng, promo_type, amount, fee_free_months, free_trips, target_user_type, claim_radius_m, icon_url")
      .eq("status", "active")
      .eq("target_user_type", userType)
      .limit(20); // Don't show too many
    if (data) setItems(data as any);
  }, [userType]);

  useEffect(() => {
    fetchItems();
    const channel = supabase
      .channel(`promo-items-${userType}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "promo_watermelons" }, () => fetchItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchItems, userType]);

  // Place markers on map
  useEffect(() => {
    if (!mapInstance || !window.google?.maps?.marker?.AdvancedMarkerElement) return;

    markersRef.current.forEach(m => m.map = null);
    markersRef.current = [];

    items.forEach(item => {
      const el = document.createElement("div");
      el.className = "promo-item-marker";

      if (item.icon_url) {
        el.innerHTML = `<img src="${item.icon_url}" style="width:40px;height:40px;cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.35));animation:promo-bob 2s ease-in-out infinite;object-fit:contain;border-radius:6px;" />`;
      } else {
        el.innerHTML = `<div style="font-size:36px;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));animation:promo-bob 2s ease-in-out infinite;transform-origin:center bottom;">🍉</div>`;
      }
      el.onclick = () => setSelectedItem(item);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: item.lat, lng: item.lng },
        map: mapInstance,
        content: el,
      });
      markersRef.current.push(marker);
    });

    if (!document.getElementById("promo-item-styles")) {
      const style = document.createElement("style");
      style.id = "promo-item-styles";
      style.textContent = `
        @keyframes promo-bob {
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
  }, [items, mapInstance]);

  const handleClaim = async () => {
    if (!selectedItem || claiming || !userId) return;

    if (userLat == null || userLng == null) {
      toast({ title: "Location needed", description: "Enable GPS to claim this reward!", variant: "destructive" });
      return;
    }

    const dist = haversineDistance(userLat, userLng, selectedItem.lat, selectedItem.lng);
    if (dist > selectedItem.claim_radius_m) {
      toast({
        title: "Too far away!",
        description: `Get within ${selectedItem.claim_radius_m}m to claim. You're ${Math.round(dist)}m away.`,
        variant: "destructive",
      });
      return;
    }

    setClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke("claim-watermelon", {
        body: { watermelon_id: selectedItem.id, user_id: userId, user_lat: userLat, user_lng: userLng, user_type: userType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setClaimedReward({ type: data.promo_type, description: data.reward_description });
      setItems(prev => prev.filter(m => m.id !== selectedItem.id));
      toast({ title: "🎉 Reward Claimed!", description: data.reward_description });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setClaiming(false);
    }
  };

  const promoLabel = (m: PromoItem) => {
    if (m.promo_type === "wallet_amount") return `${m.amount} MVR`;
    if (m.promo_type === "fee_free") return `${m.fee_free_months}mo Fee-Free`;
    if (m.promo_type === "free_trip") return `${m.free_trips} Free Trip${m.free_trips > 1 ? "s" : ""}`;
    return "";
  };

  const distance = selectedItem && userLat != null && userLng != null
    ? Math.round(haversineDistance(userLat, userLng, selectedItem.lat, selectedItem.lng))
    : null;
  const inRange = distance != null && selectedItem ? distance <= selectedItem.claim_radius_m : false;

  return (
    <>
      {items.length > 0 && !selectedItem && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] pointer-events-auto">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-emerald-600 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5"
          >
            🎁 {items.length} reward{items.length !== 1 ? "s" : ""} nearby!
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {selectedItem && !claimedReward && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end justify-center p-4 pointer-events-auto"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 22 }}
              className="bg-card rounded-3xl shadow-2xl w-full max-w-[360px] overflow-hidden border border-border/40 mb-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 px-6 pt-8 pb-6 text-center relative overflow-hidden">
                {selectedItem.icon_url ? (
                  <motion.img
                    src={selectedItem.icon_url}
                    alt="Reward"
                    animate={{ rotate: [0, -5, 5, -3, 3, 0] }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="w-20 h-20 mx-auto mb-3 object-contain drop-shadow-lg"
                  />
                ) : (
                  <motion.div
                    animate={{ rotate: [0, -5, 5, -3, 3, 0] }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="text-6xl mb-3 relative"
                  >
                    🍉
                  </motion.div>
                )}
                <h3 className="text-white text-xl font-extrabold">Reward Found!</h3>
                <p className="text-white/80 text-sm mt-1">Tap to claim your prize</p>
              </div>

              <div className="px-6 py-5 text-center">
                <p className="text-3xl font-extrabold text-primary mb-1">🎁 Mystery Reward</p>
                <p className="text-sm text-muted-foreground">Claim to reveal your prize!</p>
                {distance != null && (
                  <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                    inRange ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  }`}>
                    {inRange ? "✅ In range!" : `📍 ${distance}m away (need ${selectedItem.claim_radius_m}m)`}
                  </div>
                )}
              </div>

              <div className="px-6 pb-6 space-y-2">
                <Button
                  onClick={handleClaim}
                  disabled={claiming || !inRange}
                  className="w-full py-6 text-base font-bold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl"
                >
                  {claiming ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="text-xl">🎁</span>}
                  {claiming ? "Claiming..." : inRange ? "Claim Reward!" : "Get Closer to Claim"}
                </Button>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              {Array.from({ length: 12 }).map((_, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  animate={{ opacity: 0, scale: 0.5, x: (Math.random() - 0.5) * 200, y: (Math.random() - 0.5) * 200 }}
                  transition={{ duration: 1, delay: i * 0.05 }}
                  className="absolute top-1/3 left-1/2 text-xl pointer-events-none"
                >
                  {["🎉", "✨", "💰", "⭐", "🎁"][i % 5]}
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
              <h3 className="text-xl font-extrabold text-foreground mb-2">Reward Claimed! 🎉</h3>
              <p className="text-2xl font-extrabold text-primary mb-1">{claimedReward.description}</p>
              <Button
                onClick={() => { setClaimedReward(null); setSelectedItem(null); }}
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
