import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Save, Upload, Play, Pause, Trash2, Star, Volume2 } from "lucide-react";

interface SoundFile {
  id: string;
  name: string;
  category: string;
  file_url: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
}

const soundCategories = [
  { key: "trip_request", label: "Driver: Trip Request" },
  { key: "passenger_accepted", label: "Passenger: Driver Accepted" },
  { key: "passenger_arrived", label: "Passenger: Driver Arrived" },
  { key: "passenger_started", label: "Passenger: Trip Started" },
  { key: "passenger_completed", label: "Passenger: Trip Completed" },
  { key: "passenger_cancelled", label: "Passenger: Trip Cancelled" },
];

const settingsConfig = [
  { key: "dispatch_mode", label: "Dispatch Mode", type: "select", options: [
    { value: '"auto_nearest"', label: "Auto - Nearest Driver" },
    { value: '"broadcast"', label: "Broadcast to All Nearby" },
    { value: '"manual"', label: "Manual Admin Dispatch" },
  ]},
  { key: "surge_multiplier", label: "Surge Multiplier", type: "number" },
  { key: "max_search_radius_km", label: "Max Search Radius (km)", type: "number" },
  { key: "driver_accept_timeout_seconds", label: "Driver Accept Timeout (seconds)", type: "number" },
  { key: "default_trip_radius_km", label: "Default Driver Trip Radius (km)", type: "number" },
  { key: "privacy_notice", label: "Privacy Notice", type: "textarea" },
  { key: "terms_of_service", label: "Terms of Service", type: "textarea" },
];

const AdminSettings = () => {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [sounds, setSounds] = useState<SoundFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState("");

  const fetchSettings = async () => {
    setLoading(true);
    const [settingsRes, soundsRes] = await Promise.all([
      supabase.from("system_settings").select("*"),
      supabase.from("notification_sounds").select("*").order("created_at", { ascending: false }),
    ]);
    const map: Record<string, any> = {};
    settingsRes.data?.forEach((s: any) => { map[s.key] = s.value; });
    setSettings(map);
    setSounds((soundsRes.data as SoundFile[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); }, []);

  const updateSetting = async (key: string, value: any) => {
    const { data: existing } = await supabase.from("system_settings").select("id").eq("key", key).single();
    if (existing) {
      await supabase.from("system_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
    } else {
      await supabase.from("system_settings").insert({ key, value });
    }
    toast({ title: "Setting updated" });
  };

  const uploadSound = async (category: string, file: File) => {
    setUploading(category);
    const ext = file.name.split(".").pop();
    const path = `${category}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("notification-sounds").upload(path, file);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(null);
      return;
    }
    const { data: urlData } = supabase.storage.from("notification-sounds").getPublicUrl(path);
    const name = file.name.replace(/\.[^/.]+$/, "");

    const { data, error: insertErr } = await supabase.from("notification_sounds").insert({
      name,
      category,
      file_url: urlData.publicUrl,
      is_default: sounds.filter(s => s.category === category).length === 0,
    } as any).select().single();

    if (insertErr) {
      toast({ title: "Error", description: insertErr.message, variant: "destructive" });
    } else {
      setSounds([data as SoundFile, ...sounds]);
      toast({ title: "Sound uploaded!", description: name });
    }
    setUploading(null);
  };

  const toggleDefault = async (sound: SoundFile) => {
    // Unset all defaults for this category, then set this one
    await supabase.from("notification_sounds").update({ is_default: false } as any).eq("category", sound.category);
    await supabase.from("notification_sounds").update({ is_default: true } as any).eq("id", sound.id);
    setSounds(sounds.map(s => s.category === sound.category ? { ...s, is_default: s.id === sound.id } : s));

    // Also update system_settings for passenger sounds
    const settingsKeyMap: Record<string, string> = {
      passenger_accepted: "passenger_sound_accepted",
      passenger_arrived: "passenger_sound_arrived",
      passenger_started: "passenger_sound_started",
      passenger_completed: "passenger_sound_completed",
      passenger_cancelled: "passenger_sound_cancelled",
      trip_request: "trip_request_sound_url",
    };
    const settingsKey = settingsKeyMap[sound.category];
    if (settingsKey) {
      await updateSetting(settingsKey, sound.file_url);
    }

    toast({ title: "Default sound set" });
  };

  const deleteSound = async (sound: SoundFile) => {
    await supabase.from("notification_sounds").delete().eq("id", sound.id);
    setSounds(sounds.filter(s => s.id !== sound.id));
    toast({ title: "Sound deleted" });
  };

  const playSound = (sound: SoundFile) => {
    if (playingId === sound.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); }
    audioRef.current = new Audio(sound.file_url);
    audioRef.current.onended = () => setPlayingId(null);
    audioRef.current.play().catch(() => {});
    setPlayingId(sound.id);
  };

  if (loading) return <div className="text-muted-foreground">Loading settings...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">System Settings</h2>

      {/* General Settings */}
      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {settingsConfig.map((cfg) => (
          <div key={cfg.key} className={`px-5 py-4 ${cfg.type === "textarea" ? "space-y-3" : "flex items-center justify-between"}`}>
            <div>
              <p className="text-sm font-medium text-foreground">{cfg.label}</p>
              <p className="text-xs text-muted-foreground">{cfg.key}</p>
            </div>
            {cfg.type === "select" ? (
              <select
                value={JSON.stringify(settings[cfg.key])}
                onChange={(e) => {
                  const val = JSON.parse(e.target.value);
                  setSettings({ ...settings, [cfg.key]: val });
                  updateSetting(cfg.key, val);
                }}
                className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {cfg.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : cfg.type === "textarea" ? (
              <div className="flex-1 max-w-xl space-y-2">
                <textarea
                  value={typeof settings[cfg.key] === "string" ? settings[cfg.key] : (settings[cfg.key] ?? "")}
                  onChange={(e) => setSettings({ ...settings, [cfg.key]: e.target.value })}
                  rows={6}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  placeholder={`Enter ${cfg.label}...`}
                />
                <button
                  onClick={() => updateSetting(cfg.key, settings[cfg.key] || "")}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={settings[cfg.key] ?? ""}
                  onChange={(e) => setSettings({ ...settings, [cfg.key]: parseFloat(e.target.value) || 0 })}
                  className="w-24 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => updateSetting(cfg.key, settings[cfg.key])}
                  className="p-2 bg-primary text-primary-foreground rounded-lg"
                >
                  <Save className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Notification Sounds */}
      <h2 className="text-2xl font-bold text-foreground">Notification Sounds</h2>
      <p className="text-sm text-muted-foreground">Upload MP3 files for each notification type. Drivers can choose their preferred trip request sound.</p>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadCategory) uploadSound(uploadCategory, file);
          e.target.value = "";
        }}
      />

      <div className="space-y-4">
        {soundCategories.map((cat) => {
          const catSounds = sounds.filter(s => s.category === cat.key);
          return (
            <div key={cat.key} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-surface">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">{cat.label}</p>
                  <span className="text-xs text-muted-foreground">({catSounds.length} sound{catSounds.length !== 1 ? "s" : ""})</span>
                </div>
                <label
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    uploading === cat.key ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"
                  }`}
                  onClick={() => { setUploadCategory(cat.key); setTimeout(() => fileInputRef.current?.click(), 50); }}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploading === cat.key ? "Uploading..." : "Upload MP3"}
                </label>
              </div>

              {catSounds.length === 0 ? (
                <p className="px-5 py-4 text-xs text-muted-foreground">No sounds uploaded yet</p>
              ) : (
                <div className="divide-y divide-border">
                  {catSounds.map((sound) => (
                    <div key={sound.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={() => playSound(sound)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                            playingId === sound.id ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {playingId === sound.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{sound.name}</p>
                          {sound.is_default && (
                            <span className="text-[10px] font-bold text-primary">★ Default</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!sound.is_default && (
                          <button
                            onClick={() => toggleDefault(sound)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                          >
                            <Star className="w-3 h-3" /> Set Default
                          </button>
                        )}
                        <button
                          onClick={() => deleteSound(sound)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminSettings;
