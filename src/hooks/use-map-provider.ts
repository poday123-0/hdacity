import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MapProvider = "leaflet" | "google";

const CACHE_KEY = "hda_map_provider";
let cachedProvider: MapProvider | null = null;

export const useMapProvider = () => {
  const [provider, setProvider] = useState<MapProvider>(() => {
    if (cachedProvider) return cachedProvider;
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored === "google" || stored === "leaflet") return stored;
    } catch {}
    return "leaflet";
  });
  const [loading, setLoading] = useState(!cachedProvider);

  useEffect(() => {
    if (cachedProvider) { setProvider(cachedProvider); setLoading(false); return; }

    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "map_provider")
      .maybeSingle()
      .then(({ data }) => {
        const val = data?.value;
        const p: MapProvider =
          (typeof val === "string" && val === "google") ? "google" :
          (typeof val === "object" && val && (val as any).provider === "google") ? "google" :
          "leaflet";
        cachedProvider = p;
        try { localStorage.setItem(CACHE_KEY, p); } catch {}
        setProvider(p);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { provider, loading };
};

// Allow clearing cache when admin changes the setting
export const clearMapProviderCache = () => {
  cachedProvider = null;
  try { localStorage.removeItem(CACHE_KEY); } catch {}
};
