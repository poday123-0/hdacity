import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Branding {
  logoUrl: string | null;
  shareImageUrl: string | null;
  faviconUrl: string | null;
  appName: string | null;
}

let cachedBranding: Branding | null = null;
let brandingPromise: Promise<Branding> | null = null;

const fetchBranding = (): Promise<Branding> => {
  if (cachedBranding) return Promise.resolve(cachedBranding);
  if (!brandingPromise) {
    brandingPromise = (async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("key, value")
        .in("key", ["system_logo_url", "system_share_image_url", "system_favicon_url", "system_app_name"]);
      const map: Record<string, any> = {};
      data?.forEach((s: any) => { map[s.key] = s.value; });
      cachedBranding = {
        logoUrl: (typeof map.system_logo_url === "string" ? map.system_logo_url : null),
        shareImageUrl: (typeof map.system_share_image_url === "string" ? map.system_share_image_url : null),
        faviconUrl: (typeof map.system_favicon_url === "string" ? map.system_favicon_url : null),
        appName: (typeof map.system_app_name === "string" ? map.system_app_name : null),
      };
      return cachedBranding;
    })();
  }
  return brandingPromise;
};

// Start fetching immediately on module load
fetchBranding();

/** Invalidate cache so next useBranding call re-fetches */
export const invalidateBranding = () => {
  cachedBranding = null;
  brandingPromise = null;
};

export const useBranding = () => {
  const [branding, setBranding] = useState<Branding>(cachedBranding || { logoUrl: null, shareImageUrl: null, faviconUrl: null, appName: null });

  useEffect(() => {
    fetchBranding().then(setBranding);
  }, []);

  // Apply favicon dynamically
  useEffect(() => {
    if (branding.faviconUrl) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = branding.faviconUrl;
    }
  }, [branding.faviconUrl]);

  // Apply OG share image dynamically
  useEffect(() => {
    if (branding.shareImageUrl) {
      const selectors = [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
      ];
      selectors.forEach(sel => {
        let el = document.querySelector(sel) as HTMLMetaElement;
        if (el) el.content = branding.shareImageUrl!;
      });
    }
  }, [branding.shareImageUrl]);

  return branding;
};
