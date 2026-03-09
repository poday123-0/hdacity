import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, ChevronLeft, Medal, Clock, Target, ScrollText, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";

interface Competition {
  id: string;
  title: string;
  description: string;
  period_type: string;
  start_date: string;
  end_date: string;
  status: string;
  vehicle_type_id: string | null;
  rules_text?: string;
}

interface Entry {
  id: string;
  driver_id: string;
  trip_count: number;
  rank: number | null;
  prize_awarded: boolean;
  driver_name?: string;
  avatar_url?: string | null;
}

interface Prize {
  id: string;
  tier_rank: number;
  tier_name: string;
  prize_type: string;
  wallet_amount: number;
  fee_free_months: number;
  badge_label: string;
  custom_description: string;
}

interface Props {
  driverId: string;
  onClose: () => void;
}

const TIER_COLORS: Record<number, string> = {
  1: "from-yellow-400 to-amber-500",
  2: "from-gray-300 to-gray-400",
  3: "from-amber-600 to-orange-700",
};

const TIER_BG: Record<number, string> = {
  1: "bg-yellow-500/10 border-yellow-500/30",
  2: "bg-gray-400/10 border-gray-400/30",
  3: "bg-amber-600/10 border-amber-600/30",
};

const TIER_ICONS: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

const DriverLeaderboard = ({ driverId, onClose }: Props) => {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedComp, setSelectedComp] = useState<Competition | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myTrips, setMyTrips] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    fetchCompetitions();
  }, []);

  // Realtime subscription for live leaderboard updates
  useEffect(() => {
    if (!selectedComp) return;

    const channel = supabase
      .channel(`leaderboard-${selectedComp.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'competition_entries',
          filter: `competition_id=eq.${selectedComp.id}`,
        },
        () => {
          // Re-fetch entries when any change happens
          loadCompetition(selectedComp);
        }
      )
      .subscribe();

    // Also poll every 60s as fallback
    const pollId = setInterval(() => {
      loadCompetition(selectedComp);
    }, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [selectedComp?.id]);

  const fetchCompetitions = async () => {
    setLoading(true);
    
    // Get driver's approved vehicle types
    const { data: driverVTs } = await supabase
      .from("driver_vehicle_types")
      .select("vehicle_type_id")
      .eq("driver_id", driverId)
      .eq("status", "approved");
    const myVehicleTypeIds = (driverVTs || []).map((d: any) => d.vehicle_type_id);

    const { data } = await supabase
      .from("competitions")
      .select("*")
      .in("status", ["active", "completed"])
      .eq("is_active", true)
      .order("start_date", { ascending: false })
      .limit(20);
    
    // Filter: show competitions that have no vehicle type filter OR match driver's vehicle types
    const allComps = (data || []) as Competition[];
    const comps = allComps.filter(c => 
      !c.vehicle_type_id || myVehicleTypeIds.includes(c.vehicle_type_id)
    );
    setCompetitions(comps);

    // Auto-select first active competition
    const active = comps.find(c => c.status === "active" && new Date(c.end_date) > new Date());
    if (active) {
      await loadCompetition(active);
    } else if (comps.length > 0) {
      await loadCompetition(comps[0]);
    }
    setLoading(false);
  };

  const loadCompetition = async (comp: Competition) => {
    setSelectedComp(comp);
    const [entriesRes, prizesRes] = await Promise.all([
      supabase.from("competition_entries").select("*").eq("competition_id", comp.id).order("trip_count", { ascending: false }).limit(50),
      supabase.from("competition_prizes").select("*").eq("competition_id", comp.id).order("tier_rank"),
    ]);

    const entryData = (entriesRes.data || []) as Entry[];

    // Fetch driver names
    if (entryData.length > 0) {
      const driverIds = entryData.map(e => e.driver_id);
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name, avatar_url").in("id", driverIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      entryData.forEach(e => {
        const p = profileMap.get(e.driver_id);
        e.driver_name = p ? `${p.first_name} ${p.last_name}` : "Driver";
        e.avatar_url = p?.avatar_url || null;
      });
    }

    setEntries(entryData);
    setPrizes((prizesRes.data || []) as Prize[]);

    const myEntry = entryData.find(e => e.driver_id === driverId);
    setMyRank(myEntry?.rank || null);
    setMyTrips(myEntry?.trip_count || 0);
  };

  const daysLeft = selectedComp ? Math.max(0, Math.ceil((new Date(selectedComp.end_date).getTime() - Date.now()) / 86400000)) : 0;
  const isEnded = selectedComp ? new Date(selectedComp.end_date) <= new Date() : false;

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 280 }}
      className="fixed inset-0 z-[9999] bg-background flex flex-col"
    >
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary/80 px-4 pt-[calc(env(safe-area-inset-top,12px)+8px)] pb-5">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-primary-foreground/20 flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft className="w-5 h-5 text-primary-foreground" />
          </button>
          <h1 className="text-lg font-bold text-primary-foreground flex items-center gap-2">
            <Trophy className="w-5 h-5" /> Competitions
          </h1>
        </div>

        {/* My rank card */}
        {selectedComp && (
          <div className="bg-primary-foreground/15 backdrop-blur-sm rounded-2xl p-4">
            <p className="text-xs text-primary-foreground/70 font-medium">{selectedComp.title}</p>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-3">
                <div className="text-3xl font-black text-primary-foreground">
                  {myRank ? (TIER_ICONS[myRank] || `#${myRank}`) : "—"}
                </div>
                <div>
                  <p className="text-sm font-bold text-primary-foreground">
                    {myRank ? `Rank #${myRank}` : "Not ranked yet"}
                  </p>
                  <p className="text-xs text-primary-foreground/70">{myTrips} trips completed</p>
                </div>
              </div>
              <div className="text-right">
                {isEnded ? (
                  <span className="text-xs bg-primary-foreground/20 text-primary-foreground px-3 py-1 rounded-full font-bold">Ended</span>
                ) : (
                  <div>
                    <p className="text-xl font-black text-primary-foreground">{daysLeft}</p>
                    <p className="text-[10px] text-primary-foreground/60">days left</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Competition tabs */}
      {competitions.length > 1 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
          {competitions.map(comp => (
            <button
              key={comp.id}
              onClick={() => loadCompetition(comp)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                selectedComp?.id === comp.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-muted-foreground"
              }`}
            >
              {comp.title}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : !selectedComp ? (
          <div className="text-center py-12">
            <Trophy className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No active competitions</p>
          </div>
        ) : (
          <>
            {/* Prizes section */}
            {prizes.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Medal className="w-3.5 h-3.5" /> Prizes
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {prizes.map(p => (
                    <div key={p.id} className={`rounded-xl p-3 border ${TIER_BG[p.tier_rank] || "bg-surface border-border/30"} text-center`}>
                      <span className="text-2xl block mb-1">{TIER_ICONS[p.tier_rank] || `#${p.tier_rank}`}</span>
                      <p className="text-xs font-bold text-foreground">{p.tier_name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {p.prize_type === "wallet_credit" && `${p.wallet_amount} MVR`}
                        {p.prize_type === "fee_free" && `${p.fee_free_months}mo free`}
                        {p.prize_type === "badge" && p.badge_label}
                        {p.prize_type === "custom" && p.custom_description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Info bar */}
            <div className="flex items-center gap-3 bg-surface rounded-xl px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>{format(new Date(selectedComp.start_date), "MMM d")} — {format(new Date(selectedComp.end_date), "MMM d")}</span>
              </div>
              <span className="text-muted-foreground/30">|</span>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Target className="w-3.5 h-3.5" />
                <span>Most trips wins</span>
              </div>
              {selectedComp.rules_text && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <button
                    onClick={() => setShowRules(true)}
                    className="flex items-center gap-1.5 text-xs text-primary font-semibold active:scale-95 transition-transform"
                  >
                    <ScrollText className="w-3.5 h-3.5" />
                    <span>Terms</span>
                  </button>
                </>
              )}
            </div>

            {/* Leaderboard */}
            <div>
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Leaderboard</h3>
              {entries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Rankings will appear once trips are counted
                </div>
              ) : (
                <div className="space-y-1.5">
                  {entries.map((entry, idx) => {
                    const isMe = entry.driver_id === driverId;
                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                          isMe ? "bg-primary/10 border border-primary/30" : idx < 3 ? "bg-surface" : ""
                        }`}
                      >
                        <span className={`text-sm font-bold w-8 text-center ${
                          idx === 0 ? "text-yellow-500" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-amber-600" : "text-muted-foreground"
                        }`}>
                          {TIER_ICONS[idx + 1] || `#${idx + 1}`}
                        </span>

                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {entry.avatar_url ? (
                            <img src={entry.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-muted-foreground">
                              {(entry.driver_name || "D").slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isMe ? "text-primary font-bold" : "text-foreground"}`}>
                            {entry.driver_name}{isMe ? " (You)" : ""}
                          </p>
                        </div>

                        <span className={`text-sm font-bold ${isMe ? "text-primary" : "text-foreground"}`}>
                          {entry.trip_count}
                        </span>
                        <span className="text-[10px] text-muted-foreground">trips</span>

                        {entry.prize_awarded && (
                          <span className="text-xs">🏆</span>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Rules Popup */}
      <AnimatePresence>
        {showRules && selectedComp?.rules_text && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowRules(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-background rounded-2xl w-full max-w-md max-h-[80vh] overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-primary to-primary/80 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ScrollText className="w-5 h-5 text-primary-foreground" />
                  <h3 className="text-base font-bold text-primary-foreground">Competition Rules</h3>
                </div>
                <button
                  onClick={() => setShowRules(false)}
                  className="w-8 h-8 rounded-xl bg-primary-foreground/20 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <X className="w-4 h-4 text-primary-foreground" />
                </button>
              </div>

              {/* Content */}
              <div className="px-5 py-4 overflow-y-auto max-h-[calc(80vh-64px)]">
                <p className="text-xs font-semibold text-primary mb-3">{selectedComp.title}</p>
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                  {selectedComp.rules_text}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default DriverLeaderboard;
