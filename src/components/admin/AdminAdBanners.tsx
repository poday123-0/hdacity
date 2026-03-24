import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Image, Loader2, ArrowUp, ArrowDown, ExternalLink, Eye, EyeOff } from "lucide-react";

const AdminAdBanners = () => {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [rotationSeconds, setRotationSeconds] = useState(5);
  const [savingRotation, setSavingRotation] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [targetAudience, setTargetAudience] = useState("both");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLink, setEditLink] = useState("");
  const [editAudience, setEditAudience] = useState("both");

  const fetchAll = async () => {
    setLoading(true);
    const [{ data }, { data: settings }] = await Promise.all([
      supabase.from("ad_banners").select("*").order("sort_order"),
      supabase.from("system_settings").select("value").eq("key", "ad_banner_rotation_seconds").maybeSingle(),
    ]);
    setBanners(data || []);
    if (settings?.value) {
      const v = typeof settings.value === "number" ? settings.value : parseInt(String(settings.value));
      if (v > 0) setRotationSeconds(v);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `ad-banners/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("public-assets").upload(path, file, { upsert: true });
    if (error) { toast({ title: "Upload failed", description: error.message, variant: "destructive" }); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
    const maxOrder = banners.length > 0 ? Math.max(...banners.map(b => b.sort_order)) + 1 : 0;
    await supabase.from("ad_banners").insert({
      image_url: urlData.publicUrl,
      link_url: linkUrl || "",
      sort_order: maxOrder,
      target_audience: targetAudience,
    });
    setLinkUrl("");
    setTargetAudience("both");
    setUploading(false);
    toast({ title: "Banner added ✅" });
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this banner?")) return;
    await supabase.from("ad_banners").delete().eq("id", id);
    toast({ title: "Banner deleted" });
    fetchAll();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("ad_banners").update({ is_active: !current }).eq("id", id);
    toast({ title: current ? "Banner hidden" : "Banner visible" });
    fetchAll();
  };

  const moveOrder = async (id: string, direction: "up" | "down") => {
    const idx = banners.findIndex(b => b.id === id);
    if ((direction === "up" && idx === 0) || (direction === "down" && idx === banners.length - 1)) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const a = banners[idx], b = banners[swapIdx];
    await Promise.all([
      supabase.from("ad_banners").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("ad_banners").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    fetchAll();
  };

  const saveRotation = async () => {
    setSavingRotation(true);
    const { data: existing } = await supabase.from("system_settings").select("id").eq("key", "ad_banner_rotation_seconds").maybeSingle();
    if (existing) {
      await supabase.from("system_settings").update({ value: rotationSeconds }).eq("key", "ad_banner_rotation_seconds");
    } else {
      await supabase.from("system_settings").insert({ key: "ad_banner_rotation_seconds", value: rotationSeconds as any, description: "Seconds between ad banner rotations" });
    }
    setSavingRotation(false);
    toast({ title: "Rotation timing saved ✅" });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Ad Banners</h1>
        <p className="text-sm text-muted-foreground">{banners.length} banner{banners.length !== 1 ? "s" : ""} configured</p>
      </div>

      {/* Rotation timing */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-foreground">Rotation timing:</label>
        <input
          type="number" min={2} max={60} value={rotationSeconds}
          onChange={e => setRotationSeconds(parseInt(e.target.value) || 5)}
          className="w-20 px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <span className="text-xs text-muted-foreground">seconds</span>
        <button onClick={saveRotation} disabled={savingRotation}
          className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl disabled:opacity-50">
          {savingRotation ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Upload */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-foreground">Add Banner</h3>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text" placeholder="Link URL (optional)" value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <select value={targetAudience} onChange={e => setTargetAudience(e.target.value)}
            className="px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="both">Both</option>
            <option value="passengers">Passengers Only</option>
            <option value="drivers">Drivers Only</option>
          </select>
          <input ref={fileRef} type="file" accept="image/*,.gif" className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ""; }}
          />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl disabled:opacity-50">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Upload Image / GIF
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">Recommended: 728×90 or similar wide banner. Supports PNG, JPG, GIF.</p>
      </div>

      {/* Banner list */}
      <div className="space-y-2">
        {banners.map((b, idx) => (
          <div key={b.id} className={`bg-card border border-border rounded-xl p-3 flex items-center gap-3 ${!b.is_active ? "opacity-50" : ""}`}>
            <div className="w-[120px] h-[44px] rounded-lg overflow-hidden border border-border bg-muted shrink-0">
              <img src={b.image_url} alt="Banner" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">
                {b.link_url ? (
                  <a href={b.link_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                    <ExternalLink className="w-3 h-3" /> {b.link_url}
                  </a>
                ) : "No link"}
              </p>
              <p className="text-[10px] text-muted-foreground">Order: {b.sort_order} · {b.target_audience === "both" ? "All" : b.target_audience === "passengers" ? "Passengers" : "Drivers"}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => moveOrder(b.id, "up")} disabled={idx === 0} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-surface disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => moveOrder(b.id, "down")} disabled={idx === banners.length - 1} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-surface disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
              <button onClick={() => toggleActive(b.id, b.is_active)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-surface">
                {b.is_active ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => handleDelete(b.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
        {banners.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Image className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No banners yet. Upload your first ad banner above.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAdBanners;
