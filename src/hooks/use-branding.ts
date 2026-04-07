import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Branding {
  logoUrl: string | null;
  shareImageUrl: string | null;
  faviconUrl: string | null;
  appName: string | null;
  pwaAppIconUrl: string | null;
  _loaded: boolean;
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
        .in("key", ["system_logo_url", "system_share_image_url", "system_favicon_url", "system_app_name", "pwa_app_icon_url"]);
      const map: Record<string, any> = {};
      data?.forEach((s: any) => { map[s.key] = s.value; });
      cachedBranding = {
        logoUrl: (typeof map.system_logo_url === "string" ? map.system_logo_url : null),
        shareImageUrl: (typeof map.system_share_image_url === "string" ? map.system_share_image_url : null),
        faviconUrl: (typeof map.system_favicon_url === "string" ? map.system_favicon_url : null),
        appName: (typeof map.system_app_name === "string" ? map.system_app_name : null),
        pwaAppIconUrl: (typeof map.pwa_app_icon_url === "string" ? map.pwa_app_icon_url : null),
        _loaded: true,
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
  const [branding, setBranding] = useState<Branding>(cachedBranding || { logoUrl: null, shareImageUrl: null, faviconUrl: null, appName: null, pwaAppIconUrl: null, _loaded: false });

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

  // Apply app name to document title and apple meta tag
  useEffect(() => {
    if (branding.appName) {
      document.title = branding.appName;
      const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement;
      if (appleMeta) appleMeta.content = branding.appName;
    }
  }, [branding.appName]);

  // Apply dynamic install icons (PWA + iOS)
  useEffect(() => {
    const iconUrl = branding.pwaAppIconUrl || branding.logoUrl;
    if (!iconUrl) return;

    // Update all apple-touch-icon links (with and without sizes)
    const allAppleIcons = document.querySelectorAll("link[rel='apple-touch-icon']") as NodeListOf<HTMLLinkElement>;
    allAppleIcons.forEach(icon => { icon.href = iconUrl; });

    const upsertAppleIcon = (size: string) => {
      let icon = document.querySelector(`link[rel='apple-touch-icon'][sizes='${size}']`) as HTMLLinkElement | null;
      if (!icon) {
        icon = document.createElement("link");
        icon.rel = "apple-touch-icon";
        icon.sizes = size;
        document.head.appendChild(icon);
      }
      icon.href = iconUrl;
    };

    upsertAppleIcon("180x180");
    upsertAppleIcon("192x192");
    upsertAppleIcon("512x512");
  }, [branding.pwaAppIconUrl, branding.logoUrl]);

  // Apply dynamic PWA manifest so install icon/name reflect admin branding immediately
  useEffect(() => {
    const iconUrl = branding.pwaAppIconUrl || branding.logoUrl;
    const appName = branding.appName || "Hda App";

    const manifest = {
      id: "/",
      name: appName,
      short_name: appName,
      description: "On Time · Every Time",
      theme_color: "#40A3DB",
      background_color: "#0f172a",
      display: "standalone",
      orientation: "portrait",
      start_url: "/",
      scope: "/",
      categories: ["transportation", "travel"],
      prefer_related_applications: false,
      icons: iconUrl
        ? [
            { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any" },
            { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any" },
            { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
          ]
        : [
            { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
    };

    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const manifestUrl = URL.createObjectURL(blob);

    let link = document.querySelector("link[rel='manifest'][data-dynamic='true']") as HTMLLinkElement | null;
    if (!link) {
      link = (document.querySelector("link[rel='manifest']") as HTMLLinkElement | null) || document.createElement("link");
      link.rel = "manifest";
      link.setAttribute("data-dynamic", "true");
      if (!link.parentElement) document.head.appendChild(link);
    }
    link.href = manifestUrl;

    return () => {
      URL.revokeObjectURL(manifestUrl);
    };
  }, [branding.pwaAppIconUrl, branding.logoUrl, branding.appName]);

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
