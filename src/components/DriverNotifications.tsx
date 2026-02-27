import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, X, Check, Trash2, CheckCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";

interface DriverNotification {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
  created_at: string;
  target_type: string;
  read_by: string[];
}

interface Props {
  userId?: string;
  userType?: "driver" | "passenger";
  onClose: () => void;
  visible: boolean;
}

type Tab = "unread" | "read";

const NotificationPanel = ({ userId, userType = "driver", onClose, visible }: Props) => {
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("unread");
  const hasLoadedRef = useRef(false);

  const targetTypes = userType === "driver" ? ["all", "drivers"] : ["all", "passengers"];

  const isRead = useCallback((n: DriverNotification) => {
    if (!userId) return false;
    return Array.isArray(n.read_by) && n.read_by.includes(userId);
  }, [userId]);

  const unreadNotifs = notifications.filter((n) => !isRead(n));
  const readNotifs = notifications.filter((n) => isRead(n));
  const displayedNotifs = activeTab === "unread" ? unreadNotifs : readNotifs;

  // Play notification sound
  const playNotifSound = () => {
    try {
      const ctx = new AudioContext();
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
    const channel = supabase
      .channel(`notif-alert-${userType}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        const n = payload.new as any;
        if (targetTypes.includes(n.target_type)) {
          playNotifSound();
          setNotifications((prev) => [{ ...n, read_by: n.read_by || [] }, ...prev]);
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
        .select("id, title, message, image_url, created_at, target_type, read_by")
        .in("target_type", targetTypes)
        .order("created_at", { ascending: false })
        .limit(50);
      setNotifications((data as any[]) || []);
      setLoading(false);
    };
    fetchNotifs();
  }, [visible]);

  const markAsRead = async (notifId: string) => {
    if (!userId) return;
    const notif = notifications.find((n) => n.id === notifId);
    if (!notif || isRead(notif)) return;

    const newReadBy = [...(notif.read_by || []), userId];
    await supabase.from("notifications").update({ read_by: newReadBy } as any).eq("id", notifId);
    setNotifications((prev) =>
      prev.map((n) => n.id === notifId ? { ...n, read_by: newReadBy } : n)
    );
  };

  const markAllAsRead = async () => {
    if (!userId || unreadNotifs.length === 0) return;
    const updates = unreadNotifs.map((n) => {
      const newReadBy = [...(n.read_by || []), userId];
      return supabase.from("notifications").update({ read_by: newReadBy } as any).eq("id", n.id);
    });
    await Promise.all(updates);
    setNotifications((prev) =>
      prev.map((n) => {
        if (!isRead(n)) return { ...n, read_by: [...(n.read_by || []), userId] };
        return n;
      })
    );
    toast({ title: "All marked as read" });
  };

  const removeNotification = async (notifId: string) => {
    // For per-user removal, we mark it read and remove from local state
    // (We don't delete from DB as it's shared — just hide for this user)
    if (userId) {
      const notif = notifications.find((n) => n.id === notifId);
      if (notif && !isRead(notif)) {
        const newReadBy = [...(notif.read_by || []), userId];
        await supabase.from("notifications").update({ read_by: newReadBy } as any).eq("id", notifId);
      }
    }
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
  };

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
            <div className="px-5 pt-4 pb-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  <h3 className="text-base font-bold text-foreground">Notifications</h3>
                  {unreadNotifs.length > 0 && (
                    <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">
                      {unreadNotifs.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadNotifs.length > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-[10px] text-primary font-semibold px-2 py-1 rounded-lg bg-primary/10 active:scale-95 transition-transform"
                    >
                      Read all
                    </button>
                  )}
                  <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-surface rounded-xl p-1">
                <button
                  onClick={() => setActiveTab("unread")}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${activeTab === "unread" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  Unread {unreadNotifs.length > 0 && `(${unreadNotifs.length})`}
                </button>
                <button
                  onClick={() => setActiveTab("read")}
                  className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${activeTab === "read" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                >
                  History {readNotifs.length > 0 && `(${readNotifs.length})`}
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,20px)] mt-2">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : displayedNotifs.length === 0 ? (
                <div className="text-center py-16">
                  <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {activeTab === "unread" ? "No unread notifications" : "No read notifications yet"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {displayedNotifs.map((n) => (
                    <div key={n.id} className="relative group">
                      <button
                        onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                        className="w-full text-left px-5 py-3.5 hover:bg-surface/50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isRead(n) ? "bg-muted/50" : "bg-primary/10"}`}>
                            {n.image_url ? (
                              <img src={n.image_url} alt="" className="w-full h-full object-cover rounded-xl" />
                            ) : (
                              <Bell className={`w-4 h-4 ${isRead(n) ? "text-muted-foreground" : "text-primary"}`} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-sm font-semibold truncate ${isRead(n) ? "text-muted-foreground" : "text-foreground"}`}>{n.title}</p>
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
                          </div>
                          {!isRead(n) && (
                            <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                          )}
                        </div>
                      </button>

                      {/* Action buttons on expand */}
                      {expandedId === n.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="px-5 pb-3 flex gap-2"
                        >
                          {!isRead(n) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-semibold active:scale-95 transition-transform"
                            >
                              <Check className="w-3 h-3" />
                              Mark as read
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg text-xs font-semibold active:scale-95 transition-transform"
                          >
                            <Trash2 className="w-3 h-3" />
                            Remove
                          </button>
                        </motion.div>
                      )}
                    </div>
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
