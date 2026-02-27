import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, X, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DriverNotification {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
  created_at: string;
  target_type: string;
}

interface Props {
  userId?: string;
  userType?: "driver" | "passenger";
  onClose: () => void;
  visible: boolean;
}

const NotificationPanel = ({ userId, userType = "driver", onClose, visible }: Props) => {
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasLoadedRef = useRef(false);

  const targetTypes = userType === "driver" ? ["all", "drivers"] : ["all", "passengers"];

  // Play notification sound
  const playNotifSound = () => {
    try {
      const ctx = new AudioContext();
      // Two-tone chime
      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      playTone(880, 0, 0.15);
      playTone(1100, 0.15, 0.2);
    } catch {}
  };

  useEffect(() => {
    // Always listen for realtime notifications (even when panel is closed)
    const channel = supabase
      .channel(`notif-alert-${userType}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        const n = payload.new as any;
        if (targetTypes.includes(n.target_type)) {
          playNotifSound();
          setNotifications((prev) => [n, ...prev]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userType]);

  useEffect(() => {
    if (!visible && hasLoadedRef.current) return;
    if (!visible) return;
    hasLoadedRef.current = true;
    const fetchNotifs = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("notifications")
        .select("id, title, message, image_url, created_at, target_type")
        .in("target_type", targetTypes)
        .order("created_at", { ascending: false })
        .limit(30);
      setNotifications((data as any[]) || []);
      setLoading(false);
    };
    fetchNotifs();
  }, [visible]);

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[900] bg-foreground/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 max-h-[85vh] bg-card rounded-t-3xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-foreground">Notifications</h3>
                {notifications.length > 0 && (
                  <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">
                    {notifications.length}
                  </span>
                )}
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,20px)]">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-16">
                  <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                      className="w-full text-left px-5 py-3.5 hover:bg-surface/50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Bell className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground truncate">{n.title}</p>
                            <span className="text-[10px] text-muted-foreground/60 shrink-0">{timeAgo(n.created_at)}</span>
                          </div>
                          <p className={`text-xs text-muted-foreground mt-0.5 ${expandedId === n.id ? "" : "line-clamp-2"}`}>
                            {n.message}
                          </p>
                          {n.image_url && expandedId === n.id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="mt-2 rounded-xl overflow-hidden"
                            >
                              <img src={n.image_url} alt="Notification" className="w-full max-h-60 object-cover rounded-xl" />
                            </motion.div>
                          )}
                          {n.image_url && expandedId !== n.id && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[10px] text-primary font-medium">📷 Tap to view image</span>
                            </div>
                          )}
                        </div>
                        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground/40 shrink-0 mt-1 transition-transform ${expandedId === n.id ? "rotate-90" : ""}`} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationPanel;
