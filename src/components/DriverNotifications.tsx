import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, X, Check, Trash2, CheckCheck, ChevronDown, Inbox, Clock } from "lucide-react";
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
    if (mins < 1) return "Now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  };

  // Group notifications by date
  const groupedNotifs = displayedNotifs.reduce<Record<string, DriverNotification[]>>((groups, n) => {
    const key = formatDate(n.created_at);
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
    return groups;
  }, {});

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[900] bg-foreground/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-0 left-0 right-0 max-h-[88vh] bg-background rounded-t-[28px] overflow-hidden flex flex-col shadow-[0_-8px_40px_rgba(0,0,0,0.15)]"
          >
            {/* Drag indicator */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
            </div>

            {/* Header */}
            <div className="px-5 pb-3">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-foreground tracking-tight">Notifications</h3>
                    <p className="text-[11px] text-muted-foreground">
                      {unreadNotifs.length > 0 
                        ? `${unreadNotifs.length} unread notification${unreadNotifs.length > 1 ? "s" : ""}`
                        : "You're all caught up"
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {unreadNotifs.length > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="flex items-center gap-1.5 text-[11px] text-primary font-bold px-3 py-1.5 rounded-full bg-primary/10 active:scale-95 transition-transform"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Read all
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-muted rounded-2xl p-1">
                {([
                  { key: "unread" as Tab, label: "Unread", count: unreadNotifs.length, icon: Bell },
                  { key: "read" as Tab, label: "History", count: readNotifs.length, icon: Clock },
                ]).map(({ key, label, count, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-xl transition-all ${
                      activeTab === key
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                    {count > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        activeTab === key && key === "unread"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted-foreground/15 text-muted-foreground"
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Notification List */}
            <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom,20px)]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground">Loading notifications…</p>
                </div>
              ) : displayedNotifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 px-8">
                  <div className="w-16 h-16 rounded-3xl bg-muted flex items-center justify-center">
                    <Inbox className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">
                    {activeTab === "unread" ? "No new notifications" : "No past notifications"}
                  </p>
                  <p className="text-xs text-muted-foreground/60 text-center">
                    {activeTab === "unread"
                      ? "When you receive new notifications, they'll appear here"
                      : "Notifications you've read will appear here"
                    }
                  </p>
                </div>
              ) : (
                <div className="px-4 space-y-4 pb-4">
                  {Object.entries(groupedNotifs).map(([dateLabel, notifs]) => (
                    <div key={dateLabel}>
                      <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider px-2 mb-2">{dateLabel}</p>
                      <div className="space-y-2">
                        {notifs.map((n, idx) => {
                          const read = isRead(n);
                          const expanded = expandedId === n.id;
                          return (
                            <motion.div
                              key={n.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.03 }}
                              className={`rounded-2xl border transition-all ${
                                expanded
                                  ? "bg-card border-primary/20 shadow-md"
                                  : read
                                    ? "bg-card/50 border-border/50"
                                    : "bg-card border-border shadow-sm"
                              }`}
                            >
                              <button
                                onClick={() => {
                                  setExpandedId(expanded ? null : n.id);
                                  if (!read) markAsRead(n.id);
                                }}
                                className="w-full text-left px-4 py-3.5"
                              >
                                <div className="flex items-start gap-3">
                                  {/* Icon / Image */}
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${
                                    read ? "bg-muted" : "bg-primary/10"
                                  }`}>
                                    {n.image_url ? (
                                      <img src={n.image_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <Bell className={`w-4.5 h-4.5 ${read ? "text-muted-foreground/50" : "text-primary"}`} />
                                    )}
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className={`text-[13px] font-bold leading-tight ${read ? "text-muted-foreground" : "text-foreground"}`}>
                                        {n.title}
                                      </p>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-[10px] text-muted-foreground/50 font-medium">{timeAgo(n.created_at)}</span>
                                        {!read && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
                                      </div>
                                    </div>
                                    <p className={`text-xs mt-1 leading-relaxed ${
                                      read ? "text-muted-foreground/60" : "text-muted-foreground"
                                    } ${expanded ? "" : "line-clamp-2"}`}>
                                      {n.message}
                                    </p>
                                  </div>
                                </div>
                              </button>

                              {/* Expanded content */}
                              <AnimatePresence>
                                {expanded && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    {n.image_url && (
                                      <div className="px-4 pb-2">
                                        <img
                                          src={n.image_url}
                                          alt="Notification"
                                          className="w-full max-h-52 object-cover rounded-xl border border-border"
                                        />
                                      </div>
                                    )}
                                    <div className="px-4 pb-3 flex items-center gap-2">
                                      <span className="text-[10px] text-muted-foreground/50 flex-1">
                                        {new Date(n.created_at).toLocaleString("en-US", {
                                          month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
                                        })}
                                      </span>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-destructive/10 text-destructive rounded-lg text-[11px] font-semibold active:scale-95 transition-transform"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        Remove
                                      </button>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          );
                        })}
                      </div>
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
