import { useState, useEffect } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { supabase } from "@/integrations/supabase/client";

const MAPS_CACHE_KEY = "hda_maps_key_cache";

type MapsCache = {
  key: string;
  mapId: string;
};

let cachedKey: string | null = null;
let cachedMapId: string | null = null;
let loaderInstance: Loader | null = null;
let loadPromise: Promise<void> | null = null;

// Start fetching the key immediately on module load (not on component mount)
let keyPromise: Promise<{ key: string; mapId: string }> | null = null;

const readLocalCache = (): MapsCache | null => {
  try {
    const raw = localStorage.getItem(MAPS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MapsCache;
    if (!parsed?.key) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeLocalCache = (cache: MapsCache) => {
  try {
    localStorage.setItem(MAPS_CACHE_KEY, JSON.stringify(cache));
  } catch {}
};

const fetchKey = () => {
  if (cachedKey) return Promise.resolve({ key: cachedKey, mapId: cachedMapId || "" });

  const localCache = readLocalCache();
  if (localCache?.key) {
    cachedKey = localCache.key;
    cachedMapId = localCache.mapId || "";
    return Promise.resolve({ key: cachedKey, mapId: cachedMapId });
  }

  if (!keyPromise) {
    keyPromise = supabase.functions
      .invoke("get-maps-key")
      .then(({ data, error }) => {
        if (error || !data?.key) throw new Error("Failed to load maps key");
        cachedKey = data.key;
        cachedMapId = data.mapId || "";
        writeLocalCache({ key: cachedKey, mapId: cachedMapId });
        return { key: cachedKey, mapId: cachedMapId };
      });
  }
  return keyPromise;
};

// Eagerly start fetching API key as soon as this module is imported
fetchKey();

export const useGoogleMaps = () => {
  const [isLoaded, setIsLoaded] = useState(!!loadPromise && !!cachedKey);
  const [error, setError] = useState<string | null>(null);
  const [mapId, setMapId] = useState<string | null>(cachedMapId);

  useEffect(() => {
    // Already fully loaded from a previous hook call
    if (isLoaded && cachedKey) return;

    let cancelled = false;

    const load = async () => {
      try {
        const { mapId: fetchedMapId } = await fetchKey();
        if (cancelled) return;

        if (fetchedMapId) setMapId(fetchedMapId);

        if (!loaderInstance) {
          loaderInstance = new Loader({
            apiKey: cachedKey!,
            version: "weekly",
            libraries: ["places", "geometry", "marker"],
          });
        }

        if (!loadPromise) {
          loadPromise = loaderInstance.importLibrary("maps").then(() => {});
        }

        await loadPromise;
        if (!cancelled) setIsLoaded(true);
      } catch (err: any) {
        console.error("Google Maps load error:", err);
        if (!cancelled) setError(err.message);
      }
    };

    load();

    return () => { cancelled = true; };
  }, [isLoaded]);

  return { isLoaded, error, mapId };
};
