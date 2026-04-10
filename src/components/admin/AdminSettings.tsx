import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Save, Upload, Play, Pause, Trash2, Star, Volume2, Building2, User, Download, Car, Users, Smartphone, Bell, Plus, X, Mail, Phone, MessageSquare, Wallet, ToggleLeft, Flame, Image, Globe, Settings, ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { invalidateBranding } from "@/hooks/use-branding";

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
  { key: "driver_trip_accepted", label: "Driver: Trip Accepted" },
  { key: "driver_arrived", label: "Driver: Arrived at Pickup" },
  { key: "driver_trip_started", label: "Driver: Trip Started" },
  { key: "driver_trip_completed", label: "Driver: Trip Completed" },
  { key: "driver_trip_cancelled", label: "Driver: Trip Cancelled" },
  { key: "driver_message_received", label: "Driver: Message Received" },
  { key: "passenger_accepted", label: "Passenger: Driver Accepted" },
  { key: "passenger_arrived", label: "Passenger: Driver Arrived" },
  { key: "passenger_started", label: "Passenger: Trip Started" },
  { key: "passenger_completed", label: "Passenger: Trip Completed" },
  { key: "passenger_cancelled", label: "Passenger: Trip Cancelled" },
  { key: "passenger_message_received", label: "Passenger: Message Received" },
];

const adminBankFields = [
  { key: "bank_name", label: "Bank Name", placeholder: "e.g. Bank of Maldives" },
  { key: "account_number", label: "Account Number", placeholder: "7730000000000" },
  { key: "account_name", label: "Account Holder Name", placeholder: "Company name or person" },
];

const featureToggles = [
  { key: "feature_scheduled_rides", label: "Scheduled Rides", description: "Allow passengers to pre-book rides for a future date/time" },
  { key: "feature_hourly_booking", label: "Hourly Booking", description: "Allow passengers to book rides by the hour" },
];

type SettingsSection = "branding" | "general" | "dispatch" | "features" | "finance" | "notifications" | "sounds" | "chat" | "firebase" | "system";

const sections: { id: SettingsSection; label: string; icon: typeof Settings; description: string }[] = [
  { id: "branding", label: "Branding", icon: Image, description: "Logo, favicon & share image" },
  { id: "general", label: "General", icon: Settings, description: "App name, legal & display" },
  { id: "dispatch", label: "Dispatch", icon: Car, description: "Dispatch mode & driver settings" },
  { id: "features", label: "Features", icon: ToggleLeft, description: "Toggle app features" },
  { id: "finance", label: "Finance", icon: Wallet, description: "Rewards, wallets & payments" },
  { id: "notifications", label: "Alerts", icon: Bell, description: "Admin alert recipients" },
  { id: "sounds", label: "Sounds", icon: Volume2, description: "Notification sounds" },
  { id: "chat", label: "Chat", icon: MessageSquare, description: "Quick reply messages" },
  { id: "firebase", label: "Push", icon: Flame, description: "Firebase push config" },
  { id: "system", label: "System", icon: Download, description: "Icons, updates & advanced" },
];

const SectionCard = ({ title, description, icon: Icon, children }: { title: string; description?: string; icon: any; children: React.ReactNode }) => (
  <div className="bg-card border border-border rounded-2xl overflow-hidden">
    <div className="px-6 py-4 border-b border-border bg-muted/30">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><Icon className="w-4 h-4 text-primary" /></div>
        <div>
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </div>
      </div>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const AdminSettings = () => {
  const [activeSection, setActiveSection] = useState<SettingsSection>(() => {
    return (localStorage.getItem("hda_settings_tab") as SettingsSection) || "branding";
  });
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [sounds, setSounds] = useState<SoundFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const passengerIconInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState("");
  const [adminBank, setAdminBank] = useState<Record<string, string>>({ bank_name: "", account_number: "", account_name: "" });
  const [passengerMapIconUrl, setPassengerMapIconUrl] = useState<string | null>(null);
  const [notifyEmails, setNotifyEmails] = useState<string[]>([]);
  const [notifyPhones, setNotifyPhones] = useState<string[]>([]);
  const [newNotifyEmail, setNewNotifyEmail] = useState("");
  const [newNotifyPhone, setNewNotifyPhone] = useState("");
  const [uploadingPassengerIcon, setUploadingPassengerIcon] = useState(false);
  const [pwaAppIconUrl, setPwaAppIconUrl] = useState<string | null>(null);
  const [uploadingPwaIcon, setUploadingPwaIcon] = useState(false);
  const pwaIconInputRef = useRef<HTMLInputElement>(null);
  const [driverAppIconUrl, setDriverAppIconUrl] = useState<string | null>(null);
  const [uploadingDriverIcon, setUploadingDriverIcon] = useState(false);
  const driverIconInputRef = useRef<HTMLInputElement>(null);
  const [otaBundleVersion, setOtaBundleVersion] = useState("");
  const [quickReplies, setQuickReplies] = useState<{ text: string; target: string }[]>([]);
  const [newQuickReply, setNewQuickReply] = useState("");
  const [newQuickReplyTarget, setNewQuickReplyTarget] = useState("both");
  const [firebaseConfig, setFirebaseConfig] = useState("");
  const [firebaseVapidKey, setFirebaseVapidKey] = useState("");
  const [companies, setCompanies] = useState<any[]>([]);
  const [defaultCompanyId, setDefaultCompanyId] = useState("");
  const [blockedCodes, setBlockedCodes] = useState<string[]>([]);
  const [newBlockedCode, setNewBlockedCode] = useState("");
  const [systemLogoUrl, setSystemLogoUrl] = useState<string | null>(null);
  const [shareImageUrl, setShareImageUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [uploadingBranding, setUploadingBranding] = useState<string | null>(null);
  const brandingInputRef = useRef<HTMLInputElement>(null);
  const [brandingUploadKey, setBrandingUploadKey] = useState("");
  const [clearingData, setClearingData] = useState<string | null>(null);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("");
  const [googleMapsMapId, setGoogleMapsMapId] = useState("");
  const [versionConfig, setVersionConfig] = useState({
    android_latest_version: "1.0.0",
    android_min_version: "1.0.0",
    ios_latest_version: "1.0.0",
    ios_min_version: "1.0.0",
    force_update: false,
    play_store_url: "",
    app_store_url: "",
    update_message: "",
  });

  useEffect(() => {
    localStorage.setItem("hda_settings_tab", activeSection);
  }, [activeSection]);

  const fetchSettings = async () => {
    setLoading(true);
    const [settingsRes, soundsRes, companiesRes] = await Promise.all([
      supabase.from("system_settings").select("*"),
      supabase.from("notification_sounds").select("*").order("created_at", { ascending: false }),
      supabase.from("companies").select("id, name").eq("is_active", true).order("name"),
    ]);
    setCompanies(companiesRes.data || []);
    const map: Record<string, any> = {};
    settingsRes.data?.forEach((s: any) => { map[s.key] = s.value; });
    setSettings(map);
    setSounds((soundsRes.data as SoundFile[]) || []);
    if (map["admin_bank_info"]) {
      const bankVal = typeof map["admin_bank_info"] === "string" ? JSON.parse(map["admin_bank_info"]) : map["admin_bank_info"];
      setAdminBank({ bank_name: bankVal.bank_name || "", account_number: bankVal.account_number || "", account_name: bankVal.account_name || "" });
    }
    if (map["passenger_map_icon_url"] && typeof map["passenger_map_icon_url"] === "string") setPassengerMapIconUrl(map["passenger_map_icon_url"]);
    if (map["pwa_app_icon_url"] && typeof map["pwa_app_icon_url"] === "string") setPwaAppIconUrl(map["pwa_app_icon_url"]);
    if (map["driver_app_icon_url"] && typeof map["driver_app_icon_url"] === "string") setDriverAppIconUrl(map["driver_app_icon_url"]);
    if (map["driver_registration_notify"]) {
      const nv = typeof map["driver_registration_notify"] === "string" ? JSON.parse(map["driver_registration_notify"]) : map["driver_registration_notify"];
      setNotifyEmails(nv.emails || []);
      setNotifyPhones(nv.phones || []);
    }
    if (map["chat_quick_replies"] && Array.isArray(map["chat_quick_replies"])) setQuickReplies(map["chat_quick_replies"]);
    if (map["firebase_config"]) {
      const fc = map["firebase_config"];
      setFirebaseConfig(typeof fc === "string" ? fc : JSON.stringify(fc, null, 2));
    }
    if (map["firebase_vapid_key"]) {
      const fv = map["firebase_vapid_key"];
      setFirebaseVapidKey(typeof fv === "string" ? fv : String(fv));
    }
    if (map["default_company_id"]) setDefaultCompanyId(typeof map["default_company_id"] === "string" ? map["default_company_id"] : "");
    if (map["blocked_center_codes"] && Array.isArray(map["blocked_center_codes"])) setBlockedCodes(map["blocked_center_codes"].map(String));
    if (map["system_logo_url"] && typeof map["system_logo_url"] === "string") setSystemLogoUrl(map["system_logo_url"]);
    if (map["system_share_image_url"] && typeof map["system_share_image_url"] === "string") setShareImageUrl(map["system_share_image_url"]);
    if (map["system_favicon_url"] && typeof map["system_favicon_url"] === "string") setFaviconUrl(map["system_favicon_url"]);
    if (map["app_version_control"]) {
      const vc = typeof map["app_version_control"] === "string" ? JSON.parse(map["app_version_control"]) : map["app_version_control"];
      setVersionConfig(prev => ({ ...prev, ...vc }));
    }
    if (map["web_bundle_version"]) {
      const wbv = map["web_bundle_version"];
      setOtaBundleVersion(typeof wbv === "object" && wbv.version ? wbv.version : typeof wbv === "string" ? wbv : "");
    }
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
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); setUploading(null); return; }
    const { data: urlData } = supabase.storage.from("notification-sounds").getPublicUrl(path);
    const name = file.name.replace(/\.[^/.]+$/, "");
    const { data, error: insertErr } = await supabase.from("notification_sounds").insert({
      name, category, file_url: urlData.publicUrl, is_default: sounds.filter(s => s.category === category).length === 0,
    } as any).select().single();
    if (insertErr) { toast({ title: "Error", description: insertErr.message, variant: "destructive" }); }
    else { setSounds([data as SoundFile, ...sounds]); toast({ title: "Sound uploaded!", description: name }); }
    setUploading(null);
  };

  const toggleDefault = async (sound: SoundFile) => {
    await supabase.from("notification_sounds").update({ is_default: false } as any).eq("category", sound.category);
    await supabase.from("notification_sounds").update({ is_default: true } as any).eq("id", sound.id);
    setSounds(sounds.map(s => s.category === sound.category ? { ...s, is_default: s.id === sound.id } : s));
    const settingsKeyMap: Record<string, string> = {
      passenger_accepted: "passenger_sound_accepted", passenger_arrived: "passenger_sound_arrived",
      passenger_started: "passenger_sound_started", passenger_completed: "passenger_sound_completed",
      passenger_cancelled: "passenger_sound_cancelled", passenger_message_received: "passenger_sound_message",
      trip_request: "trip_request_sound_url", driver_trip_accepted: "driver_sound_accepted",
      driver_arrived: "driver_sound_arrived", driver_trip_started: "driver_sound_started",
      driver_trip_completed: "driver_sound_completed", driver_trip_cancelled: "driver_sound_cancelled",
      driver_message_received: "driver_sound_message",
    };
    const settingsKey = settingsKeyMap[sound.category];
    if (settingsKey) await updateSetting(settingsKey, sound.file_url);
    toast({ title: "Default sound set" });
  };

  const deleteSound = async (sound: SoundFile) => {
    // Delete from storage first
    const { deleteStorageFile } = await import("@/lib/storage-utils");
    await deleteStorageFile(sound.file_url);
    await supabase.from("notification_sounds").delete().eq("id", sound.id);
    setSounds(sounds.filter(s => s.id !== sound.id));
    toast({ title: "Sound deleted from database & storage" });
  };

  const playSound = (sound: SoundFile) => {
    if (playingId === sound.id) { audioRef.current?.pause(); setPlayingId(null); return; }
    if (audioRef.current) audioRef.current.pause();
    audioRef.current = new Audio(sound.file_url);
    audioRef.current.onended = () => setPlayingId(null);
    audioRef.current.play().catch(() => {});
    setPlayingId(sound.id);
  };

  // Helper for setting field with inline save
  const renderSettingField = (label: string, settingKey: string, type = "text", placeholder = "") => (
    <div className="space-y-1.5" key={settingKey}>
      <label className="text-xs font-semibold text-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={settings[settingKey] ?? ""}
          onChange={(e) => setSettings((prev: any) => ({ ...prev, [settingKey]: type === "number" ? (parseFloat(e.target.value) || 0) : e.target.value }))}
          placeholder={placeholder}
          className="flex-1 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
        <button onClick={() => updateSetting(settingKey, settings[settingKey])} className="p-2.5 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity active:scale-95">
          <Save className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const renderSettingTextarea = (label: string, settingKey: string, placeholder = "", rows = 5) => (
    <div className="space-y-1.5" key={settingKey}>
      <label className="text-xs font-semibold text-foreground">{label}</label>
      <textarea
        value={typeof settings[settingKey] === "string" ? settings[settingKey] : (settings[settingKey] ?? "")}
        onChange={(e) => setSettings((prev: any) => ({ ...prev, [settingKey]: e.target.value }))}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-y"
      />
      <button onClick={() => updateSetting(settingKey, settings[settingKey] || "")} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity active:scale-95">
        <Save className="w-4 h-4" /> Save
      </button>
    </div>
  );

  const renderSettingSelect = (label: string, settingKey: string, options: { value: string; label: string }[]) => (
    <div className="space-y-1.5" key={settingKey}>
      <label className="text-xs font-semibold text-foreground">{label}</label>
      <select
        value={JSON.stringify(settings[settingKey])}
        onChange={(e) => { const val = JSON.parse(e.target.value); setSettings((prev: any) => ({ ...prev, [settingKey]: val })); updateSetting(settingKey, val); }}
        className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
      >
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );

  // SectionCard moved outside component to prevent remounting

  if (loading) return <div className="text-muted-foreground flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  const renderBranding = () => (
    <div className="space-y-5">
      <input ref={brandingInputRef} type="file" accept="image/*,.gif,.webp,.apng" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0]; if (!file || !brandingUploadKey) return;
        setUploadingBranding(brandingUploadKey);
        const path = `branding/${brandingUploadKey}_${Date.now()}.${file.name.split(".").pop()}`;
        const { error } = await supabase.storage.from("vehicle-images").upload(path, file, { upsert: true, contentType: file.type });
        if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); setUploadingBranding(null); return; }
        const { data: urlData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
        const url = `${urlData.publicUrl}?t=${Date.now()}`;
        await updateSetting(brandingUploadKey, url);
        if (brandingUploadKey === "system_logo_url") setSystemLogoUrl(url);
        if (brandingUploadKey === "system_share_image_url") setShareImageUrl(url);
        if (brandingUploadKey === "system_favicon_url") setFaviconUrl(url);
        if (brandingUploadKey.startsWith("onboarding_slide_")) setSettings((s: any) => ({ ...s, [brandingUploadKey]: url }));
        invalidateBranding(); setUploadingBranding(null); toast({ title: "Branding updated!" }); e.target.value = "";
      }} />

      <SectionCard title="Brand Assets" description="Logo, share image & favicon used across the app" icon={Image}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Logo */}
          <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="w-20 h-20 rounded-2xl bg-background border-2 border-border flex items-center justify-center overflow-hidden shadow-sm">
              {systemLogoUrl ? <img src={systemLogoUrl} alt="Logo" className="w-full h-full object-contain p-1" /> : <Image className="w-8 h-8 text-muted-foreground" />}
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-foreground">System Logo</p>
              <p className="text-[10px] text-muted-foreground">Sidebar, splash, login</p>
            </div>
            <button onClick={() => { setBrandingUploadKey("system_logo_url"); setTimeout(() => brandingInputRef.current?.click(), 50); }} disabled={uploadingBranding === "system_logo_url"} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all active:scale-95">
              <Upload className="w-3.5 h-3.5" /> {uploadingBranding === "system_logo_url" ? "Uploading..." : "Upload"}
            </button>
          </div>
          {/* Share Image */}
          <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="w-full aspect-[1200/630] rounded-xl bg-background border-2 border-border flex items-center justify-center overflow-hidden shadow-sm">
              {shareImageUrl ? <img src={shareImageUrl} alt="Share" className="w-full h-full object-cover" /> : <Image className="w-8 h-8 text-muted-foreground" />}
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-foreground">Share Image (OG)</p>
              <p className="text-[10px] text-muted-foreground">1200×630px recommended</p>
            </div>
            <button onClick={() => { setBrandingUploadKey("system_share_image_url"); setTimeout(() => brandingInputRef.current?.click(), 50); }} disabled={uploadingBranding === "system_share_image_url"} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all active:scale-95">
              <Upload className="w-3.5 h-3.5" /> {uploadingBranding === "system_share_image_url" ? "Uploading..." : "Upload"}
            </button>
          </div>
          {/* Favicon */}
          <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="w-16 h-16 rounded-xl bg-background border-2 border-border flex items-center justify-center overflow-hidden shadow-sm">
              {faviconUrl ? <img src={faviconUrl} alt="Favicon" className="w-full h-full object-contain p-1" /> : <Globe className="w-6 h-6 text-muted-foreground" />}
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-foreground">Favicon</p>
              <p className="text-[10px] text-muted-foreground">32×32 or 64×64 PNG/ICO</p>
            </div>
            <button onClick={() => { setBrandingUploadKey("system_favicon_url"); setTimeout(() => brandingInputRef.current?.click(), 50); }} disabled={uploadingBranding === "system_favicon_url"} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all active:scale-95">
              <Upload className="w-3.5 h-3.5" /> {uploadingBranding === "system_favicon_url" ? "Uploading..." : "Upload"}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Onboarding Slides */}
      <SectionCard title="Onboarding Slides" description="Welcome screens shown to first-time users (upload up to 4 images)" icon={Smartphone}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => {
            const key = `onboarding_slide_${i}`;
            const url = settings[key] && typeof settings[key] === "string" ? settings[key] : null;
            return (
              <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="w-full aspect-[9/16] rounded-lg bg-background border-2 border-border flex items-center justify-center overflow-hidden">
                  {url ? <img src={url} alt={`Slide ${i}`} className="w-full h-full object-cover" /> : <Image className="w-6 h-6 text-muted-foreground" />}
                </div>
                <p className="text-[10px] font-semibold text-foreground">Slide {i}</p>
                <div className="flex gap-1.5">
                  <button onClick={() => { setBrandingUploadKey(key); setTimeout(() => brandingInputRef.current?.click(), 50); }} disabled={uploadingBranding === key} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all active:scale-95">
                    <Upload className="w-3 h-3" /> {uploadingBranding === key ? "..." : "Upload"}
                  </button>
                  {url && (
                    <button onClick={async () => { await updateSetting(key, ""); setSettings((s: any) => ({ ...s, [key]: "" })); toast({ title: `Slide ${i} removed` }); }} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all active:scale-95">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

    </div>
  );

  const renderGeneral = () => (
    <div className="space-y-5">
      <SectionCard title="App Identity" description="App name and basic configuration" icon={Globe}>
        <div className="space-y-5">
          {renderSettingField('App Name (shown in PWA install prompt)', 'system_app_name')}
        </div>
      </SectionCard>

      <SectionCard title="Legal" description="Privacy policy, terms of service" icon={Settings}>
        <div className="space-y-6">
          {renderSettingTextarea('Privacy Notice', 'privacy_notice', 'Enter your privacy policy...', 8)}
          {renderSettingTextarea('Terms of Service', 'terms_of_service', 'Enter terms of service...', 8)}
        </div>
      </SectionCard>

      <SectionCard title="Display" description="Font sizes for driver and passenger apps" icon={User}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {renderSettingField('Default Driver Font Size (%)', 'default_driver_font_size', 'number')}
          {renderSettingField('Default Passenger Font Size (%)', 'default_passenger_font_size', 'number')}
        </div>
      </SectionCard>

      <SectionCard title="Location & Battery" description="GPS intervals, accuracy and battery optimization for drivers" icon={Globe}>
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {renderSettingField("Driver Location Update Interval (ms)", "driver_location_interval_ms", "number", "30000")}
            {renderSettingField("Passenger Location Update Interval (ms)", "passenger_location_interval_ms", "number", "5000")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {renderSettingSelect('Driver GPS Accuracy', 'driver_gps_accuracy', [
              { value: '"high"', label: "High (Best accuracy, more battery)" },
              { value: '"balanced"', label: "Balanced (Default — good accuracy, less battery)" },
              { value: '"low"', label: "Low (Approximate, least battery)" },
            ])}
            {renderSettingField("GPS Max Age (ms)", "driver_gps_max_age_ms", "number", "15000")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {renderSettingField("Session Check Interval (ms)", "session_check_interval_ms", "number", "15000")}
            {renderSettingField("Map Auto-Follow Resume (sec)", "map_auto_follow_resume_sec", "number", "8")}
          </div>
          <p className="text-[11px] text-muted-foreground">
            💡 Higher intervals = less battery drain. Recommended: Driver GPS 10000ms, GPS Max Age 3000-5000ms, Balanced accuracy.
          </p>
        </div>
      </SectionCard>
    </div>
  );

  const renderDispatch = () => (
    <div className="space-y-5">
      <SectionCard title="Dispatch Configuration" description="How trips are matched to drivers" icon={Car}>
        <div className="space-y-5">
          {renderSettingSelect('Dispatch Mode', 'dispatch_mode', [
            { value: '"broadcast"', label: "Broadcast to All Nearby" },
            { value: '"auto_nearest"', label: "Auto - Nearest Driver First" },
            { value: '"auto_rating"', label: "Auto - Highest Rated Driver First" },
            { value: '"auto_rating_nearest"', label: "Auto - Highest Rated + Nearest" },
            { value: '"manual"', label: "Manual Admin Dispatch" },
          ])}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {renderSettingField('Surge Multiplier', 'surge_multiplier', 'number')}
            {renderSettingField('Max Search Radius (km)', 'max_search_radius_km', 'number')}
            {renderSettingField('Driver Accept Timeout (sec)', 'driver_accept_timeout_seconds', 'number')}
            {renderSettingField("Dispatch Broadcast Timeout (sec)", "dispatch_broadcast_timeout_seconds", "number", "60")}
            {renderSettingField('Max Drivers to Try (0 = unlimited)', 'max_auto_drivers', 'number')}
            {renderSettingField('Default Driver Trip Radius (km)', 'default_trip_radius_km', 'number')}
            {renderSettingField("Min Scheduled Lead Time (min)", "min_scheduled_lead_minutes", "number", "30")}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="No Vehicle SMS" description="SMS sent to passenger when no driver is available" icon={MessageSquare}>
        {renderSettingField("SMS Message Text", "no_vehicle_sms_text", "text", "HDA: No drivers available right now. Book directly & find available drivers at https://hda.taxi")}
      </SectionCard>

      <SectionCard title="Emergency Numbers" description="Shown in SOS dialog for passengers and drivers" icon={Phone}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {renderSettingField('Call Center Phone Number', 'call_center_number', 'text', 'e.g. 3001234')}
          {renderSettingField('Local Police Number', 'local_police_number', 'text', 'e.g. 119')}
        </div>
      </SectionCard>

      <SectionCard title="Default Company & Center Codes" description="Set default company for dispatch and reserved codes" icon={Building2}>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Default Company</label>
            <select value={defaultCompanyId} onChange={(e) => { setDefaultCompanyId(e.target.value); updateSetting("default_company_id", e.target.value); }}
              className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all">
              <option value="">— None —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Blocked / Reserved Center Codes</label>
            <p className="text-[11px] text-muted-foreground">These codes cannot be assigned to any vehicle.</p>
            <div className="flex flex-wrap gap-2">
              {blockedCodes.map((code, i) => (
                <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-destructive/10 text-destructive rounded-lg text-xs font-bold">
                  #{code}
                  <button onClick={() => { const updated = blockedCodes.filter((_, idx) => idx !== i); setBlockedCodes(updated); updateSetting("blocked_center_codes", updated); }} className="hover:text-destructive/70"><X className="w-3 h-3" /></button>
                </span>
              ))}
              {blockedCodes.length === 0 && <span className="text-[11px] text-muted-foreground/60">No blocked codes yet</span>}
            </div>
            <div className="flex gap-2">
              <input value={newBlockedCode} onChange={(e) => setNewBlockedCode(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 20"
                className="flex-1 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                onKeyDown={(e) => { if (e.key === "Enter" && newBlockedCode.trim()) { const updated = [...blockedCodes, newBlockedCode.trim()]; setBlockedCodes(updated); setNewBlockedCode(""); updateSetting("blocked_center_codes", updated); } }} />
              <button onClick={() => { if (!newBlockedCode.trim()) return; if (blockedCodes.includes(newBlockedCode.trim())) { toast({ title: "Already blocked" }); return; } const updated = [...blockedCodes, newBlockedCode.trim()]; setBlockedCodes(updated); setNewBlockedCode(""); updateSetting("blocked_center_codes", updated); }}
                className="p-2.5 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity active:scale-95"><Plus className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderFeatures = () => (
    <SectionCard title="Feature Toggles" description="Enable or disable features across passenger and driver apps" icon={ToggleLeft}>
      <div className="divide-y divide-border -mx-6">
        {featureToggles.map((ft) => (
          <div key={ft.key} className="px-6 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{ft.label}</p>
              <p className="text-xs text-muted-foreground">{ft.description}</p>
            </div>
            <Switch checked={settings[ft.key] === true || settings[ft.key] === "true"} onCheckedChange={(checked) => { setSettings({ ...settings, [ft.key]: checked }); updateSetting(ft.key, checked); }} />
          </div>
        ))}
      </div>
    </SectionCard>
  );

  const renderFinance = () => (
    <div className="space-y-5">
      <SectionCard title="Trip Rewards" description="Reward passengers and drivers per trip" icon={Wallet}>
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {renderSettingField('Passenger Trip Reward', 'passenger_trip_reward', 'text', 'e.g. 5')}
            {renderSettingSelect('Passenger Reward Type', 'passenger_trip_reward_type', [
              { value: '"fixed"', label: "Fixed Amount (MVR)" }, { value: '"percentage"', label: "Percentage of Fare" },
            ])}
            {renderSettingField('Driver Trip Reward', 'driver_trip_reward', 'text', 'e.g. 5')}
            {renderSettingSelect('Driver Reward Type', 'driver_trip_reward_type', [
              { value: '"fixed"', label: "Fixed Amount (MVR)" }, { value: '"percentage"', label: "Percentage of Fare" },
            ])}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Wallet Settings" description="Withdrawal limits and passenger boost" icon={Wallet}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {renderSettingField('Min Withdrawal Amount (MVR)', 'min_withdrawal_amount', 'number')}
          {renderSettingField('Max Passenger Boost (MVR)', 'max_passenger_boost', 'number')}
          {renderSettingField('Boost Step Amount (MVR)', 'boost_step_amount', 'number')}
        </div>
      </SectionCard>

      <SectionCard title="Admin Payment Account" description="Bank account shown to drivers for monthly fee transfers" icon={Building2}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {adminBankFields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">{f.label}</label>
                <input value={adminBank[f.key] || ""} onChange={(e) => setAdminBank({ ...adminBank, [f.key]: e.target.value })} placeholder={f.placeholder}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
              </div>
            ))}
          </div>
          <button onClick={() => updateSetting("admin_bank_info", adminBank)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity active:scale-95">
            <Save className="w-4 h-4" /> Save Payment Account
          </button>
        </div>
      </SectionCard>
    </div>
  );

  const renderNotifications = () => (
    <SectionCard title="Admin Notification Recipients" description="Phones & emails for driver registrations, billing, vehicle updates, and admin alerts" icon={Bell}>
      <div className="space-y-6">
        {/* Emails */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-primary" /> Email Addresses</label>
          <div className="flex flex-wrap gap-2">
            {notifyEmails.map((em, i) => (
              <span key={i} className="flex items-center gap-1 px-2.5 py-1.5 bg-muted rounded-lg text-xs font-medium text-foreground">
                {em}
                <button onClick={() => { const updated = notifyEmails.filter((_, idx) => idx !== i); setNotifyEmails(updated); updateSetting("driver_registration_notify", { emails: updated, phones: notifyPhones }); }} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newNotifyEmail} onChange={(e) => setNewNotifyEmail(e.target.value)} placeholder="admin@example.com" type="email"
              className="flex-1 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
            <button onClick={() => { if (!newNotifyEmail.trim() || !newNotifyEmail.includes("@")) return; const updated = [...notifyEmails, newNotifyEmail.trim()]; setNotifyEmails(updated); setNewNotifyEmail(""); updateSetting("driver_registration_notify", { emails: updated, phones: notifyPhones }); }}
              className="p-2.5 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity active:scale-95"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        {/* Phones */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-primary" /> SMS Phone Numbers</label>
          <div className="flex flex-wrap gap-2">
            {notifyPhones.map((ph, i) => (
              <span key={i} className="flex items-center gap-1 px-2.5 py-1.5 bg-muted rounded-lg text-xs font-medium text-foreground">
                {ph}
                <button onClick={() => { const updated = notifyPhones.filter((_, idx) => idx !== i); setNotifyPhones(updated); updateSetting("driver_registration_notify", { emails: notifyEmails, phones: updated }); }} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newNotifyPhone} onChange={(e) => setNewNotifyPhone(e.target.value.replace(/[^\d+]/g, ""))} placeholder="7XXXXXX"
              className="flex-1 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
            <button onClick={() => { if (!newNotifyPhone.trim()) return; const updated = [...notifyPhones, newNotifyPhone.trim()]; setNotifyPhones(updated); setNewNotifyPhone(""); updateSetting("driver_registration_notify", { emails: notifyEmails, phones: updated }); }}
              className="p-2.5 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity active:scale-95"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const renderSounds = () => (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file && uploadCategory) uploadSound(uploadCategory, file); e.target.value = ""; }} />
      {soundCategories.map((cat) => {
        const catSounds = sounds.filter(s => s.category === cat.key);
        return (
          <div key={cat.key} className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">{cat.label}</p>
                <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground font-medium">{catSounds.length}</span>
              </div>
              <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${uploading === cat.key ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"}`}
                onClick={() => { setUploadCategory(cat.key); setTimeout(() => fileInputRef.current?.click(), 50); }}>
                <Upload className="w-3.5 h-3.5" /> {uploading === cat.key ? "Uploading..." : "Upload MP3"}
              </button>
            </div>
            {catSounds.length === 0 ? (
              <p className="px-5 py-4 text-xs text-muted-foreground">No sounds uploaded yet</p>
            ) : (
              <div className="divide-y divide-border">
                {catSounds.map((sound) => (
                  <div key={sound.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <button onClick={() => playSound(sound)} className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${playingId === sound.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                        {playingId === sound.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{sound.name}</p>
                        {sound.is_default && <span className="text-[10px] font-bold text-primary">★ Default</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!sound.is_default && <button onClick={() => toggleDefault(sound)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"><Star className="w-3 h-3" /> Set Default</button>}
                      <button onClick={() => deleteSound(sound)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderChat = () => (
    <SectionCard title="Quick Reply Messages" description="Pre-configured messages for trip chat" icon={MessageSquare}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <input value={newQuickReply} onChange={(e) => setNewQuickReply(e.target.value)} placeholder="e.g. I'm waiting outside"
            className="flex-1 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
          <select value={newQuickReplyTarget} onChange={(e) => setNewQuickReplyTarget(e.target.value)}
            className="px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none">
            <option value="both">Both</option>
            <option value="passenger">Passenger</option>
            <option value="driver">Driver</option>
          </select>
          <button onClick={() => { if (!newQuickReply.trim()) return; const updated = [...quickReplies, { text: newQuickReply.trim(), target: newQuickReplyTarget }]; setQuickReplies(updated); setNewQuickReply(""); updateSetting("chat_quick_replies", updated); }}
            className="p-2.5 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity active:scale-95"><Plus className="w-4 h-4" /></button>
        </div>
        {quickReplies.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No quick replies configured yet.</p>
        ) : (
          <div className="space-y-2">
            {quickReplies.map((qr, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-3 bg-muted/30 rounded-xl border border-border/50">
                <span className="flex-1 text-sm text-foreground">{qr.text}</span>
                <span className="text-[10px] font-semibold text-muted-foreground bg-background px-2 py-0.5 rounded-full capitalize border border-border">{qr.target}</span>
                <button onClick={() => { const updated = quickReplies.filter((_, idx) => idx !== i); setQuickReplies(updated); updateSetting("chat_quick_replies", updated); }} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );

  const renderFirebase = () => (
    <SectionCard title="Push Notifications (Firebase)" description="Configure Firebase Cloud Messaging for push notifications" icon={Flame}>
      <div className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Firebase Config (JSON)</label>
          <textarea value={firebaseConfig} onChange={(e) => setFirebaseConfig(e.target.value)} rows={8}
            placeholder='{"apiKey":"...","authDomain":"...","projectId":"...","storageBucket":"...","messagingSenderId":"...","appId":"..."}'
            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-y" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">VAPID Key (Web Push Certificate)</label>
          <input value={firebaseVapidKey} onChange={(e) => setFirebaseVapidKey(e.target.value)} placeholder="Bxxxxx...xxxQ="
            className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={async () => { try { const parsed = JSON.parse(firebaseConfig.trim()); await updateSetting("firebase_config", parsed); if (firebaseVapidKey.trim()) await updateSetting("firebase_vapid_key", firebaseVapidKey.trim()); toast({ title: "Firebase config saved!" }); } catch { toast({ title: "Invalid JSON", variant: "destructive" }); } }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity active:scale-95">
            <Save className="w-4 h-4" /> Save Firebase Config
          </button>
          <button onClick={async () => {
            try {
              toast({ title: "Sending test notification…" });
              const { data: tokens } = await supabase.from("device_tokens").select("user_id").eq("is_active", true);
              const userIds = [...new Set((tokens || []).map((t: any) => t.user_id))];
              if (userIds.length === 0) { toast({ title: "No devices registered", variant: "destructive" }); return; }
              const { error } = await supabase.functions.invoke("send-push-notification", { body: { user_ids: userIds, title: "🔔 Test Notification", body: "Push notifications are working!", data: { type: "test" } } });
              if (error) throw error;
              toast({ title: "✅ Test sent!", description: `Sent to ${userIds.length} user(s).` });
            } catch (err: any) { toast({ title: "Test failed", description: err?.message, variant: "destructive" }); }
          }} className="flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity active:scale-95">
            <Bell className="w-4 h-4" /> Send Test
          </button>
        </div>
      </div>
    </SectionCard>
  );


  const clearData = async (tables: string[], label: string) => {
    if (!confirm(`⚠️ Are you sure you want to clear ALL ${label}? This cannot be undone!`)) return;
    if (!confirm(`🚨 FINAL WARNING: This will permanently delete all ${label}. Type OK to proceed.`)) return;
    setClearingData(label);
    try {
      const { data, error } = await supabase.functions.invoke("clear-data", {
        body: { tables },
      });
      if (error) throw error;
      toast({ title: `${label} cleared!`, description: JSON.stringify(data?.results || {}) });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setClearingData(null);
  };

  const renderSystem = () => (
    <div className="space-y-5">
      {/* Data Management */}
      <SectionCard title="Data Management" description="Clear test data before going to production" icon={Trash2}>
        <div className="space-y-3">
          <p className="text-xs text-destructive font-medium">⚠️ These actions are irreversible. Use with extreme caution.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { tables: ["trips"], label: "All Trips & History", desc: "Trips, messages, stops, declines, lost items" },
              { tables: ["wallets"], label: "All Wallet Data", desc: "Transactions, withdrawals, reset balances to 0" },
              { tables: ["sos_alerts"], label: "All SOS Alerts", desc: "Emergency alert history" },
              { tables: ["notifications"], label: "All Notifications", desc: "System notifications" },
              { tables: ["driver_payments"], label: "All Driver Payments", desc: "Monthly payment records" },
              { tables: ["trips", "wallets", "sos_alerts", "notifications", "driver_payments"], label: "🔴 CLEAR EVERYTHING", desc: "All of the above at once" },
            ].map(({ tables, label, desc }) => (
              <button
                key={label}
                onClick={() => clearData(tables, label)}
                disabled={!!clearingData}
                className={`text-left p-3 rounded-xl border transition-all active:scale-[0.98] ${
                  label.includes("EVERYTHING")
                    ? "border-destructive/50 bg-destructive/10 hover:bg-destructive/20"
                    : "border-border bg-surface hover:bg-muted/50"
                } disabled:opacity-40`}
              >
                <p className={`text-xs font-bold ${label.includes("EVERYTHING") ? "text-destructive" : "text-foreground"}`}>
                  {clearingData === label ? "Clearing..." : label}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Map Icons */}
      <SectionCard title="Passenger Map Icon" description="Icon drivers see on the map for passengers (~60x60px PNG)" icon={User}>
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-xl bg-background border-2 border-border flex items-center justify-center overflow-hidden shrink-0">
            {passengerMapIconUrl ? <img src={passengerMapIconUrl} alt="Passenger icon" className="w-12 h-12 object-contain" /> : <User className="w-8 h-8 text-muted-foreground" />}
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-sm text-foreground font-medium">{passengerMapIconUrl ? "Icon uploaded ✓" : "No icon set"}</p>
            <input ref={passengerIconInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return;
              setUploadingPassengerIcon(true);
              const path = `map-icons/passenger_${Date.now()}.${file.name.split(".").pop()}`;
              const { error } = await supabase.storage.from("vehicle-images").upload(path, file, { upsert: true });
              if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); setUploadingPassengerIcon(false); return; }
              const { data: urlData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
              await updateSetting("passenger_map_icon_url", urlData.publicUrl);
              setPassengerMapIconUrl(urlData.publicUrl); setUploadingPassengerIcon(false);
              toast({ title: "Passenger map icon updated!" }); e.target.value = "";
            }} />
            <button onClick={() => passengerIconInputRef.current?.click()} disabled={uploadingPassengerIcon}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 active:scale-95 transition-all">
              <Upload className="w-3.5 h-3.5" /> {uploadingPassengerIcon ? "Uploading..." : "Upload Icon"}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* App Icons */}
      <SectionCard title="App Icons" description="Passenger & Driver home screen icons (512×512px PNG)" icon={Smartphone}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Passenger */}
          <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="w-24 h-24 rounded-[22px] bg-background border-2 border-border flex items-center justify-center overflow-hidden shadow-lg">
              {pwaAppIconUrl ? <img src={pwaAppIconUrl} alt="Passenger" className="w-full h-full object-cover" /> : <Users className="w-10 h-10 text-muted-foreground" />}
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-foreground">Passenger App</p>
              <p className="text-[10px] text-muted-foreground">{pwaAppIconUrl ? "Icon set ✓" : "Uses default"}</p>
            </div>
            <input ref={pwaIconInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return;
              setUploadingPwaIcon(true);
              const path = `pwa-icons/passenger_${Date.now()}.${file.name.split(".").pop()}`;
              const { error } = await supabase.storage.from("vehicle-images").upload(path, file, { upsert: true });
              if (error) { toast({ title: "Upload failed", variant: "destructive" }); setUploadingPwaIcon(false); return; }
              const { data: urlData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
              const url = `${urlData.publicUrl}?t=${Date.now()}`;
              await updateSetting("pwa_app_icon_url", url); setPwaAppIconUrl(url); setUploadingPwaIcon(false);
              toast({ title: "Passenger app icon updated!" }); e.target.value = "";
            }} />
            <button onClick={() => pwaIconInputRef.current?.click()} disabled={uploadingPwaIcon}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 active:scale-95 transition-all">
              <Upload className="w-3.5 h-3.5" /> {uploadingPwaIcon ? "Uploading..." : "Upload"}
            </button>
          </div>
          {/* Driver */}
          <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="w-24 h-24 rounded-[22px] bg-background border-2 border-border flex items-center justify-center overflow-hidden shadow-lg">
              {driverAppIconUrl ? <img src={driverAppIconUrl} alt="Driver" className="w-full h-full object-cover" /> : <Car className="w-10 h-10 text-muted-foreground" />}
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-foreground">Driver App</p>
              <p className="text-[10px] text-muted-foreground">{driverAppIconUrl ? "Icon set ✓" : "Uses default"}</p>
            </div>
            <input ref={driverIconInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return;
              setUploadingDriverIcon(true);
              const path = `pwa-icons/driver_${Date.now()}.${file.name.split(".").pop()}`;
              const { error } = await supabase.storage.from("vehicle-images").upload(path, file, { upsert: true });
              if (error) { toast({ title: "Upload failed", variant: "destructive" }); setUploadingDriverIcon(false); return; }
              const { data: urlData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
              const url = `${urlData.publicUrl}?t=${Date.now()}`;
              await updateSetting("driver_app_icon_url", url); setDriverAppIconUrl(url); setUploadingDriverIcon(false);
              toast({ title: "Driver app icon updated!" }); e.target.value = "";
            }} />
            <button onClick={() => driverIconInputRef.current?.click()} disabled={uploadingDriverIcon}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 active:scale-95 transition-all">
              <Upload className="w-3.5 h-3.5" /> {uploadingDriverIcon ? "Uploading..." : "Upload"}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Force Update */}
      <SectionCard title="Push App Update" description="Force all connected devices to reload with the latest version" icon={Download}>
        <div className="flex flex-wrap gap-2">
          {[
            { target: "all", label: "🔄 Update All Devices" },
            { target: "passengers", label: "👤 Passengers Only" },
            { target: "drivers", label: "🚗 Drivers Only" },
          ].map(({ target, label }) => (
            <button key={target} onClick={async () => {
              const ts = new Date().toISOString();
              await updateSetting("force_refresh", JSON.stringify({ target, triggered_at: ts }));
              toast({ title: "Update pushed!", description: `All ${target === "all" ? "" : target + " "}devices will refresh.` });
            }} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold active:scale-95 transition-transform hover:opacity-90">
              {label}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* OTA Web Bundle Version */}
      <SectionCard title="OTA Web Update" description="Push web updates to native app users without app store release" icon={Globe}>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Native apps compare their built-in version against this value. If a newer version is set here, the app will load the latest code from <span className="font-mono text-foreground">app.hda.taxi</span> instead of the local bundle.
          </p>
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">Web Bundle Version</label>
            <input
              type="text"
              value={otaBundleVersion}
              onChange={e => setOtaBundleVersion(e.target.value)}
              placeholder="1.0.0"
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Use semver (e.g. 1.1.0). Bump this after publishing changes to push OTA updates.</p>
          </div>
          <button
            onClick={async () => {
              if (!otaBundleVersion.trim()) {
                toast({ title: "Enter a version", variant: "destructive" });
                return;
              }
              await updateSetting("web_bundle_version", { version: otaBundleVersion.trim() });
              toast({ title: "OTA version updated!", description: `Native apps will now load v${otaBundleVersion.trim()} from the web.` });
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold active:scale-95 transition-transform hover:opacity-90"
          >
            <Globe className="w-4 h-4" /> Push OTA Update
          </button>
        </div>
      </SectionCard>

      {/* Native App Version Control */}
      <SectionCard title="Native App Version Control" description="Manage version requirements for iOS & Android apps" icon={Smartphone}>
        <div className="space-y-3">
          <p className="text-xs font-bold text-primary flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5" /> Android
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">Latest Version</label>
              <input
                type="text"
                value={versionConfig.android_latest_version}
                onChange={e => setVersionConfig(prev => ({ ...prev, android_latest_version: e.target.value }))}
                placeholder="2.0.4"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Users below this see an update prompt</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">Minimum Version (Required)</label>
              <input
                type="text"
                value={versionConfig.android_min_version}
                onChange={e => setVersionConfig(prev => ({ ...prev, android_min_version: e.target.value }))}
                placeholder="2.0.3"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Users below this MUST update (can't skip)</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">Play Store URL</label>
              <input
                type="url"
                value={versionConfig.play_store_url}
                onChange={e => setVersionConfig(prev => ({ ...prev, play_store_url: e.target.value }))}
                placeholder="https://play.google.com/store/apps/details?id=com.hda.app"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground"
              />
            </div>
          </div>

          <div className="border-t border-border pt-3 mt-3" />
          <p className="text-xs font-bold text-primary flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5" /> iOS
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">Latest Version</label>
              <input
                type="text"
                value={versionConfig.ios_latest_version}
                onChange={e => setVersionConfig(prev => ({ ...prev, ios_latest_version: e.target.value }))}
                placeholder="20.0"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Users below this see an update prompt</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">Minimum Version (Required)</label>
              <input
                type="text"
                value={versionConfig.ios_min_version}
                onChange={e => setVersionConfig(prev => ({ ...prev, ios_min_version: e.target.value }))}
                placeholder="20.0"
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Users below this MUST update (can't skip)</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">App Store URL</label>
              <input
                type="url"
                value={versionConfig.app_store_url}
                onChange={e => setVersionConfig(prev => ({ ...prev, app_store_url: e.target.value }))}
                placeholder="https://apps.apple.com/app/hda-app/id..."
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground"
              />
            </div>
          </div>

          <div className="border-t border-border pt-3 mt-3" />
          <p className="text-xs font-bold text-muted-foreground">Shared Settings</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-foreground block mb-1.5">Update Message (optional)</label>
              <input
                type="text"
                value={versionConfig.update_message}
                onChange={e => setVersionConfig(prev => ({ ...prev, update_message: e.target.value }))}
                placeholder="A new version is available with improvements and fixes."
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground"
              />
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50">
            <div>
              <p className="text-xs font-semibold text-foreground">Force Update</p>
              <p className="text-[10px] text-muted-foreground">Block app usage until user updates (even if above min version)</p>
            </div>
            <Switch
              checked={versionConfig.force_update}
              onCheckedChange={v => setVersionConfig(prev => ({ ...prev, force_update: v }))}
            />
          </div>
          <button
            onClick={async () => {
              await updateSetting("app_version_control", versionConfig);
              toast({ title: "Version control saved!", description: `Android: ${versionConfig.android_latest_version}, iOS: ${versionConfig.ios_latest_version}` });
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold active:scale-95 transition-transform hover:opacity-90"
          >
            <Save className="w-4 h-4" /> Save Version Settings
          </button>
        </div>
      </SectionCard>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case "branding": return renderBranding();
      case "general": return renderGeneral();
      case "dispatch": return renderDispatch();
      case "features": return renderFeatures();
      case "finance": return renderFinance();
      case "notifications": return renderNotifications();
      case "sounds": return renderSounds();
      case "chat": return renderChat();
      case "firebase": return renderFirebase();
      case "system": return renderSystem();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-0">
      {/* Section navigation */}
      <div className="lg:w-56 shrink-0">
        <div className="lg:sticky lg:top-20">
          {/* Mobile: horizontal scroll */}
          <div className="flex lg:hidden gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
            {sections.map((s) => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  activeSection === s.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}>
                <s.icon className="w-3.5 h-3.5" />
                {s.label}
              </button>
            ))}
          </div>
          {/* Desktop: vertical nav */}
          <nav className="hidden lg:flex flex-col gap-1 bg-card border border-border rounded-2xl p-2">
            {sections.map((s) => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left ${
                  activeSection === s.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}>
                <s.icon className="w-4 h-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate">{s.label}</p>
                  <p className={`text-[10px] truncate ${activeSection === s.id ? "text-primary-foreground/70" : "text-muted-foreground/60"}`}>{s.description}</p>
                </div>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {renderContent()}
      </div>
    </div>
  );
};

export default AdminSettings;
