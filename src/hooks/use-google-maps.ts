import { useState, useEffect } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { supabase } from "@/integrations/supabase/client";

let cachedKey: string | null = null;
let cachedMapId: string | null = null;
let loaderInstance: Loader | null = null;
let loadPromise: Promise<void> | null = null;

export const useGoogleMaps = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapId, setMapId] = useState<string | null>(cachedMapId);

  useEffect(() => {
    const load = async () => {
      try {
        if (!cachedKey) {
          const { data, error } = await supabase.functions.invoke("get-maps-key");
          if (error || !data?.key) throw new Error("Failed to load maps key");
          cachedKey = data.key;
          if (data.mapId) {
            cachedMapId = data.mapId;
            setMapId(data.mapId);
          }
        }

        if (!loaderInstance) {
          loaderInstance = new Loader({
            apiKey: cachedKey,
            version: "weekly",
            libraries: ["places", "geometry", "marker"],
          });
        }

        if (!loadPromise) {
          loadPromise = loaderInstance.importLibrary("maps").then(() => {});
        }

        await loadPromise;
        setIsLoaded(true);
      } catch (err: any) {
        console.error("Google Maps load error:", err);
        setError(err.message);
      }
    };

    load();
  }, []);

  return { isLoaded, error, mapId };
};
