import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

const settingsConfig = [
  { key: "dispatch_mode", label: "Dispatch Mode", type: "select", options: [
    { value: '"auto_nearest"', label: "Auto - Nearest Driver" },
    { value: '"broadcast"', label: "Broadcast to All Nearby" },
    { value: '"manual"', label: "Manual Admin Dispatch" },
  ]},
  { key: "surge_multiplier", label: "Surge Multiplier", type: "number" },
  { key: "max_search_radius_km", label: "Max Search Radius (km)", type: "number" },
  { key: "driver_accept_timeout_seconds", label: "Driver Accept Timeout (seconds)", type: "number" },
];

const AdminSettings = () => {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from("system_settings").select("*");
    const map: Record<string, any> = {};
    data?.forEach((s: any) => { map[s.key] = s.value; });
    setSettings(map);
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); }, []);

  const updateSetting = async (key: string, value: any) => {
    await supabase.from("system_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
    toast({ title: "Setting updated" });
  };

  if (loading) return <div className="text-muted-foreground">Loading settings...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">System Settings</h2>

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {settingsConfig.map((cfg) => (
          <div key={cfg.key} className="flex items-center justify-between px-5 py-4">
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
    </div>
  );
};

export default AdminSettings;
