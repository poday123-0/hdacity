import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Send, Bell, Users, User, Car, Loader2, Trash2, ImagePlus, X } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  message: string;
  target_type: string;
  image_url: string | null;
  created_at: string;
}

const TARGET_OPTIONS = [
  { value: "all", label: "All Users", icon: Users },
  { value: "passengers", label: "All Passengers", icon: User },
  { value: "drivers", label: "All Drivers", icon: Car },
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchNotifications = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("id, title, message, target_type, image_url, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications((data as Notification[]) || []);
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

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Title and message are required", variant: "destructive" });
      return;
    }
    setSending(true);

    const payload: any = {
      title: title.trim(),
      message: message.trim(),
      target_type: targetType,
    };
    if (imageUrl) payload.image_url = imageUrl;

    const { error } = await supabase.from("notifications").insert(payload);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Notification sent!" });

      // Send push notification to all relevant devices
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

      setTitle("");
      setMessage("");
      setImageUrl(null);
      fetchNotifications();
    }
    setSending(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    toast({ title: "Notification deleted" });
  };

  const getTargetLabel = (t: string) => TARGET_OPTIONS.find(o => o.value === t)?.label || t;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Send Notification</h2>

      {/* Send Form */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Target Audience</label>
          <div className="flex gap-2 mt-1.5">
            {TARGET_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTargetType(opt.value)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    targetType === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notification title..."
            className="w-full mt-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your notification message..."
            rows={3}
            className="w-full mt-1 px-3 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
          />
        </div>

        {/* Image/GIF Upload */}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Image / GIF (optional)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleImageUpload}
            className="hidden"
          />
          {imageUrl ? (
            <div className="mt-2 relative inline-block">
              <img src={imageUrl} alt="Preview" className="max-h-40 rounded-xl border border-border" />
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
              className="mt-1.5 flex items-center gap-2 px-4 py-2.5 bg-surface border border-dashed border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImagePlus className="w-4 h-4" />
              )}
              {uploading ? "Uploading..." : "Add image or GIF"}
            </button>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !title.trim() || !message.trim()}
          className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl text-sm transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? "Sending..." : "Send Notification"}
        </button>
      </div>

      {/* History */}
      <h2 className="text-2xl font-bold text-foreground">Notification History</h2>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">No notifications sent yet</div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                {n.image_url ? (
                  <img src={n.image_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                ) : (
                  <Bell className="w-5 h-5 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{n.title}</p>
                  <span className="text-[10px] px-1.5 py-0.5 bg-surface rounded-md text-muted-foreground font-medium">{getTargetLabel(n.target_type)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                {n.image_url && (
                  <img src={n.image_url} alt="" className="mt-2 max-h-24 rounded-lg border border-border" />
                )}
                <p className="text-[10px] text-muted-foreground/60 mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => handleDelete(n.id)} className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 active:scale-90 transition-transform">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminNotifications;
