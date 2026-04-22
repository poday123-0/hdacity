import { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Send, Bell, Users, User, Car, Loader2, Trash2, ImagePlus, X, Calendar, Clock, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  message: string;
  target_type: string;
  image_url: string | null;
  created_at: string;
  scheduled_at: string | null;
  sent_at: string | null;
  status: string;
}

const TARGET_OPTIONS = [
  { value: "all", label: "All Users", icon: Users, color: "from-violet-500 to-fuchsia-500" },
  { value: "passengers", label: "All Passengers", icon: User, color: "from-sky-500 to-cyan-500" },
  { value: "drivers", label: "All Drivers", icon: Car, color: "from-amber-500 to-orange-500" },
];

const AdminNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetType, setTargetType] = useState("all");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [tab, setTab] = useState<"sent" | "scheduled">("sent");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchNotifications = async () => {
    setLoading(true);
    // Paginate to bypass Supabase's default 1000-row cap and load full history.
    const PAGE = 1000;
    const all: Notification[] = [];
    for (let from = 0; from < 10000; from += PAGE) {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, target_type, image_url, created_at, scheduled_at, sent_at, status")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...(data as Notification[]));
      if (data.length < PAGE) break;
    }
    setNotifications(all);
    setLoading(false);
  };

  useEffect(() => { fetchNotifications(); }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Only PNG, JPG, GIF, and WebP are allowed", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File must be under 5MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `notifications/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("notification-images").upload(path, file);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } else {
      const { data: urlData } = supabase.storage.from("notification-images").getPublicUrl(path);
      setImageUrl(urlData.publicUrl);
      toast({ title: "Image uploaded!" });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetForm = () => {
    setTitle(""); setMessage(""); setImageUrl(null);
    setScheduleEnabled(false); setScheduleDate(""); setScheduleTime("");
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Title and message are required", variant: "destructive" });
      return;
    }

    let scheduledIso: string | null = null;
    if (scheduleEnabled) {
      if (!scheduleDate || !scheduleTime) {
        toast({ title: "Please pick a date and time to schedule", variant: "destructive" });
        return;
      }
      const dt = new Date(`${scheduleDate}T${scheduleTime}`);
      if (isNaN(dt.getTime())) {
        toast({ title: "Invalid schedule date/time", variant: "destructive" });
        return;
      }
      if (dt.getTime() < Date.now() - 60_000) {
        toast({ title: "Scheduled time must be in the future", variant: "destructive" });
        return;
      }
      scheduledIso = dt.toISOString();
    }

    setSending(true);

    const payload: any = {
      title: title.trim(),
      message: message.trim(),
      target_type: targetType,
      image_url: imageUrl ?? null,
      scheduled_at: scheduledIso,
      status: scheduledIso ? "scheduled" : "sent",
      sent_at: scheduledIso ? null : new Date().toISOString(),
    };

    const { error } = await supabase.from("notifications").insert(payload);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSending(false);
      return;
    }

    if (scheduledIso) {
      toast({
        title: "📅 Scheduled!",
        description: `Will send on ${new Date(scheduledIso).toLocaleString()}`,
      });
      setTab("scheduled");
    } else {
      toast({ title: "✅ Notification sent!" });
      // Send push immediately
      try {
        const userTypeFilter = targetType === "drivers" ? "driver" : targetType === "passengers" ? "passenger" : undefined;
        let tokenQuery = supabase.from("device_tokens").select("user_id").eq("is_active", true);
        if (userTypeFilter) tokenQuery = tokenQuery.eq("user_type", userTypeFilter);
        const { data: tokenUsers } = await tokenQuery;
        if (tokenUsers && tokenUsers.length > 0) {
          const userIds = [...new Set(tokenUsers.map((t: any) => t.user_id))];
          await supabase.functions.invoke("send-push-notification", {
            body: { user_ids: userIds, title: title.trim(), body: message.trim() },
          });
        }
      } catch (pushErr) {
        console.warn("Push notification failed:", pushErr);
      }
    }

    resetForm();
    fetchNotifications();
    setSending(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    toast({ title: "Notification deleted" });
  };

  const handleCancelSchedule = async (id: string) => {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) {
      toast({ title: "Could not cancel", description: error.message, variant: "destructive" });
    } else {
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast({ title: "Scheduled notification cancelled" });
    }
  };

  const sentList = useMemo(() => notifications.filter(n => n.status !== "scheduled"), [notifications]);
  const scheduledList = useMemo(
    () => notifications.filter(n => n.status === "scheduled").sort((a, b) =>
      new Date(a.scheduled_at || 0).getTime() - new Date(b.scheduled_at || 0).getTime()
    ),
    [notifications]
  );

  const getTargetMeta = (t: string) => TARGET_OPTIONS.find(o => o.value === t) || TARGET_OPTIONS[0];

  // Default schedule = now + 1 hour, formatted local
  const setQuickSchedule = (mins: number) => {
    const dt = new Date(Date.now() + mins * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    setScheduleDate(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`);
    setScheduleTime(`${pad(dt.getHours())}:${pad(dt.getMinutes())}`);
    setScheduleEnabled(true);
  };

  return (
    <div className="space-y-6">
      {/* Hero send card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-card to-card border border-border rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground leading-tight">Compose Notification</h2>
            <p className="text-xs text-muted-foreground">Send instantly or schedule for later</p>
          </div>
        </div>

        {/* Audience cards */}
        <div className="grid grid-cols-3 gap-2">
          {TARGET_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = targetType === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setTargetType(opt.value)}
                className={`relative overflow-hidden rounded-xl p-3 text-left transition-all border ${
                  active
                    ? "border-primary bg-primary/5 shadow-md shadow-primary/10 scale-[1.02]"
                    : "border-border bg-surface hover:border-primary/50"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${opt.color} flex items-center justify-center mb-1.5 shadow-sm`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <p className={`text-[11px] font-bold ${active ? "text-foreground" : "text-muted-foreground"}`}>{opt.label}</p>
                {active && <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />}
              </button>
            );
          })}
        </div>

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="✨ Notification title"
          className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {/* Message */}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write a clear, friendly message..."
          rows={3}
          className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
        />

        {/* Image */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleImageUpload}
            className="hidden"
          />
          {imageUrl ? (
            <div className="relative inline-block">
              <img src={imageUrl} alt="Preview" className="max-h-32 rounded-xl border border-border shadow-sm" />
              <button
                onClick={() => setImageUrl(null)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-dashed border-border rounded-xl text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
              {uploading ? "Uploading..." : "Add image / GIF"}
            </button>
          )}
        </div>

        {/* Schedule toggle */}
        <div className="border border-border rounded-xl p-3 bg-surface/50 space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs font-bold text-foreground">Schedule for later</p>
                <p className="text-[10px] text-muted-foreground">Sent automatically at the chosen time</p>
              </div>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-muted rounded-full peer-checked:bg-primary transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform peer-checked:translate-x-4" />
            </div>
          </label>

          {scheduleEnabled && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "+15m", m: 15 },
                  { label: "+1h", m: 60 },
                  { label: "+3h", m: 180 },
                  { label: "Tomorrow 9AM", m: -1 },
                ].map((q) => (
                  <button
                    key={q.label}
                    onClick={() => {
                      if (q.m === -1) {
                        const dt = new Date();
                        dt.setDate(dt.getDate() + 1);
                        dt.setHours(9, 0, 0, 0);
                        const pad = (n: number) => String(n).padStart(2, "0");
                        setScheduleDate(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`);
                        setScheduleTime("09:00");
                      } else {
                        setQuickSchedule(q.m);
                      }
                    }}
                    className="px-2.5 py-1 bg-background border border-border rounded-md text-[10px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={sending || !title.trim() || !message.trim()}
          className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl text-sm shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:opacity-95 disabled:opacity-40 disabled:shadow-none"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> :
            scheduleEnabled ? <Calendar className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          {sending ? "Sending..." : scheduleEnabled ? "Schedule Notification" : `Send to ${getTargetMeta(targetType).label}`}
        </button>
      </div>

      {/* History tabs */}
      <div className="flex items-center gap-1 bg-surface rounded-xl p-1 border border-border">
        <button
          onClick={() => setTab("sent")}
          className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            tab === "sent" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Sent ({sentList.length})
        </button>
        <button
          onClick={() => setTab("scheduled")}
          className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            tab === "scheduled" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Scheduled ({scheduledList.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-2">
          {(tab === "sent" ? sentList : scheduledList).length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground bg-card border border-border rounded-xl">
              {tab === "sent" ? "No notifications sent yet" : "No scheduled notifications"}
            </div>
          ) : (
            (tab === "sent" ? sentList : scheduledList).map((n) => {
              const meta = getTargetMeta(n.target_type);
              const Icon = meta.icon;
              const isScheduled = n.status === "scheduled";
              const isFailed = n.status === "failed";
              return (
                <div key={n.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3 hover:shadow-md transition-shadow">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center shrink-0 shadow-sm`}>
                    {n.image_url ? (
                      <img src={n.image_url} alt="" className="w-11 h-11 rounded-xl object-cover" />
                    ) : (
                      <Icon className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-foreground">{n.title}</p>
                      <span className="text-[10px] px-1.5 py-0.5 bg-surface rounded-md text-muted-foreground font-semibold">
                        {meta.label}
                      </span>
                      {isScheduled && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-md font-bold flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" /> SCHEDULED
                        </span>
                      )}
                      {isFailed && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-destructive/15 text-destructive rounded-md font-bold flex items-center gap-1">
                          <AlertCircle className="w-2.5 h-2.5" /> FAILED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{n.message}</p>
                    {n.image_url && (
                      <img src={n.image_url} alt="" className="mt-2 max-h-24 rounded-lg border border-border" />
                    )}
                    <p className="text-[10px] text-muted-foreground/70 mt-1.5 flex items-center gap-1">
                      {isScheduled ? (
                        <>
                          <Calendar className="w-3 h-3" />
                          Sends {new Date(n.scheduled_at!).toLocaleString()}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          Sent {new Date(n.sent_at || n.created_at).toLocaleString()}
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => isScheduled ? handleCancelSchedule(n.id) : handleDelete(n.id)}
                    className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 active:scale-90 hover:bg-destructive/20 transition-all"
                    title={isScheduled ? "Cancel scheduled send" : "Delete"}
                  >
                    {isScheduled ? <X className="w-3.5 h-3.5 text-destructive" /> : <Trash2 className="w-3.5 h-3.5 text-destructive" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
