import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { Loader2, X, MapPin, Gift, Sparkles } from "lucide-react";

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

/**
 * Snap a lat/lng to the nearest road using Geocoder reverse geocoding.
 * Returns null if the point is in water.
 */
async function snapToNearestRoad(lat: number, lng: number): Promise<{ lat: number; lng: number } | null> {
  const g = (window as any).google;
  if (!g?.maps?.Geocoder) return { lat, lng };

  const geocoder = new g.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
      if (status !== "OK" || !results?.length) {
        resolve(null);
        return;
      }
      // Find a road/street result
      for (const r of results) {
        const types: string[] = r.types || [];
        if (types.some((t: string) => ["street_address", "route", "intersection"].includes(t))) {
          const loc = r.geometry?.location;
          if (loc) return resolve({ lat: loc.lat(), lng: loc.lng() });
        }
      }
      // Check if first result is water — hide the marker
      const first = results[0];
      const firstTypes: string[] = first.types || [];
      if (firstTypes.some((t: string) => ["natural_feature", "water", "ocean"].includes(t))) {
        resolve(null); // In water — don't show
      } else if (first.geometry?.location) {
        resolve({ lat: first.geometry.location.lat(), lng: first.geometry.location.lng() });
      } else {
        resolve(null);
      }
    });
  });
}

const WatermelonMapOverlay = ({ userType, userId, userLat, userLng, mapInstance }: WatermelonMapOverlayProps) => {
  const [items, setItems] = useState<PromoItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<PromoItem | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimedReward, setClaimedReward] = useState<{ type: string; description: string } | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const snappedCacheRef = useRef<Map<string, { lat: number; lng: number } | null>>(new Map());
  const fetchItems = useCallback(async () => {
    // Fetch rewards targeted at this user type OR "both"
    const { data } = await supabase
      .from("promo_watermelons")
      .select("id, lat, lng, promo_type, amount, fee_free_months, free_trips, target_user_type, claim_radius_m, icon_url")
      .eq("status", "active")
      .in("target_user_type", [userType, "both"])
      .limit(20);
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

  // Place markers on map — snap to roads, hide water markers
  useEffect(() => {
    if (!mapInstance || !window.google?.maps?.marker?.AdvancedMarkerElement) return;

    let cancelled = false;

    const placeMarkers = async () => {
      // Clear old markers
      markersRef.current.forEach(m => m.map = null);
      markersRef.current = [];

      for (const item of items) {
        if (cancelled) return;

        // Check cache first
        let snapped = snappedCacheRef.current.get(item.id);
        if (snapped === undefined) {
          snapped = await snapToNearestRoad(item.lat, item.lng);
          snappedCacheRef.current.set(item.id, snapped);
        }

        // Skip items that are in water
        if (!snapped) continue;

        const el = document.createElement("div");
        el.className = "promo-item-marker";

        if (item.icon_url) {
          el.innerHTML = `<img src="${item.icon_url}" style="width:36px;height:36px;cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.35));animation:promo-bob 2s ease-in-out infinite;object-fit:contain;border-radius:6px;" />`;
        } else {
          el.innerHTML = `<div style="font-size:30px;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));animation:promo-bob 2s ease-in-out infinite;transform-origin:center bottom;">🍉</div>`;
        }
        el.onclick = () => setSelectedItem(item);

        const marker = new google.maps.marker.AdvancedMarkerElement({
          position: snapped,
          map: mapInstance,
          content: el,
        });
        markersRef.current.push(marker);
      }
    };

    placeMarkers();

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
      cancelled = true;
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

  const distance = selectedItem && userLat != null && userLng != null
    ? Math.round(haversineDistance(userLat, userLng, selectedItem.lat, selectedItem.lng))
    : null;
  const inRange = distance != null && selectedItem ? distance <= selectedItem.claim_radius_m : false;

  const formatDistance = (d: number) => d >= 1000 ? `${(d / 1000).toFixed(1)}km` : `${d}m`;

  const [bannerDismissed, setBannerDismissed] = useState(false);

  return (
    <>
      {/* Nearby rewards banner */}
      {items.length > 0 && !selectedItem && !bannerDismissed && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[600] pointer-events-auto">
          <motion.div
            initial={{ y: -16, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            className="bg-card/95 backdrop-blur-md border border-border shadow-lg px-3 py-1.5 rounded-full flex items-center gap-2"
          >
            <span className="text-sm">🎁</span>
            <span className="text-[11px] font-semibold text-foreground">{items.length} reward{items.length !== 1 ? "s" : ""} nearby</span>
            <button onClick={() => setBannerDismissed(true)} className="w-4 h-4 rounded-full bg-muted flex items-center justify-center hover:bg-muted-foreground/20 transition-colors">
              <X className="w-2.5 h-2.5 text-muted-foreground" />
            </button>
          </motion.div>
        </div>
      )}

      {/* Claim sheet */}
      <AnimatePresence>
        {selectedItem && !claimedReward && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-end justify-center pointer-events-auto"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="bg-card rounded-t-2xl shadow-2xl w-full max-w-md overflow-hidden border-t border-border/50"
              onClick={e => e.stopPropagation()}
            >
              {/* Header strip */}
              <div className="relative bg-gradient-to-br from-primary/90 to-primary px-4 pt-5 pb-4">
                <button
                  onClick={() => setSelectedItem(null)}
                  className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  <X className="w-3 h-3 text-primary-foreground" />
                </button>
                <div className="flex items-center gap-3">
                  {selectedItem.icon_url ? (
                    <motion.img
                      src={selectedItem.icon_url}
                      alt="Reward"
                      animate={{ rotate: [0, -4, 4, -2, 2, 0] }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                      className="w-12 h-12 object-contain drop-shadow-md rounded-lg"
                    />
                  ) : (
                    <motion.div
                      animate={{ rotate: [0, -4, 4, -2, 2, 0] }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                      className="text-4xl"
                    >
                      🍉
                    </motion.div>
                  )}
                  <div>
                    <h3 className="text-primary-foreground text-sm font-bold leading-tight">Reward Found!</h3>
                    <p className="text-primary-foreground/70 text-[11px] mt-0.5">Claim to reveal your prize</p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="px-4 py-4 space-y-3">
                <div className="flex items-center gap-2.5 bg-muted/50 rounded-xl px-3 py-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Gift className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground">Mystery Reward</p>
                    <p className="text-[10px] text-muted-foreground">Claim to see what you won</p>
                  </div>
                </div>

                {distance != null && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-semibold ${
                    inRange
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                  }`}>
                    <MapPin className="w-3 h-3 shrink-0" />
                    {inRange ? "You're in range!" : `${formatDistance(distance)} away · get within ${selectedItem.claim_radius_m}m`}
                  </div>
                )}

                <button
                  onClick={handleClaim}
                  disabled={claiming || !inRange}
                  className={`w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                    inRange
                      ? "bg-primary text-primary-foreground shadow-md hover:opacity-90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  {claiming ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : inRange ? (
                    <Sparkles className="w-3.5 h-3.5" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5" />
                  )}
                  {claiming ? "Claiming..." : inRange ? "Claim Reward" : "Get Closer to Claim"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Claimed celebration */}
      <AnimatePresence>
        {claimedReward && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-6 pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", damping: 16, stiffness: 200 }}
              className="bg-card rounded-2xl shadow-2xl w-full max-w-[300px] p-6 text-center overflow-hidden relative"
            >
              {Array.from({ length: 10 }).map((_, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  animate={{ opacity: 0, scale: 0.5, x: (Math.random() - 0.5) * 160, y: (Math.random() - 0.5) * 160 }}
                  transition={{ duration: 0.8, delay: i * 0.04 }}
                  className="absolute top-1/3 left-1/2 text-base pointer-events-none"
                >
                  {["🎉", "✨", "💰", "⭐", "🎁"][i % 5]}
                </motion.span>
              ))}

              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
                className="text-5xl mb-3"
              >
                💥
              </motion.div>
              <h3 className="text-sm font-extrabold text-foreground mb-1">Reward Claimed! 🎉</h3>
              <p className="text-lg font-extrabold text-primary">{claimedReward.description}</p>
              <button
                onClick={() => { setClaimedReward(null); setSelectedItem(null); }}
                className="mt-4 w-full rounded-xl py-2.5 text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-all active:scale-[0.98]"
              >
                Awesome!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default WatermelonMapOverlay;
