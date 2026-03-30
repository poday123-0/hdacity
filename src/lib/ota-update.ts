/**
 * OTA Update System for Capacitor native apps.
 *
 * How it works:
 * 1. Each build embeds a WEB_BUNDLE_VERSION (set via env or defaults to build timestamp).
 * 2. On startup the app fetches the "web_bundle_version" system setting.
 * 3. If the remote version is newer AND the device is online, the WebView
 *    redirects to the published URL so the user always sees the latest code.
 * 4. If offline or up-to-date, the local bundle is used (fast, works offline).
 *
 * Admin: bump the "web_bundle_version" value in system_settings after publishing
 * to push updates to all native users on next app open.
 */

import { supabase } from "@/integrations/supabase/client";

// Embedded at build time — bump this when you publish + want native users to update
export const WEB_BUNDLE_VERSION = import.meta.env.VITE_WEB_BUNDLE_VERSION || "1.0.0";

const PUBLISHED_URL = "https://app.hda.taxi";
const OTA_CHECK_KEY = "ota_last_check";
const OTA_THROTTLE_MS = 5 * 60 * 1000; // Don't check more than once every 5 min

function isNative(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

function isOnline(): boolean {
  return navigator.onLine;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function shouldThrottle(): boolean {
  try {
    const last = localStorage.getItem(OTA_CHECK_KEY);
    if (last && Date.now() - Number(last) < OTA_THROTTLE_MS) return true;
  } catch {}
  return false;
}

export async function checkOTAUpdate(): Promise<void> {
  // Disable OTA redirect for native apps — native should always use bundled code
  // Users get updates by rebuilding the APK, not by redirecting to a browser URL
  return;

  // Already loading from remote? Skip.
  if (window.location.origin === PUBLISHED_URL) return;

  // Throttle checks
  if (shouldThrottle()) return;

  try {
    localStorage.setItem(OTA_CHECK_KEY, String(Date.now()));
  } catch {}

  if (!isOnline()) {
    console.log("[OTA] Offline — using local bundle v" + WEB_BUNDLE_VERSION);
    return;
  }

  try {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "web_bundle_version")
      .single();

    if (!data?.value) return;

    const remote = (data.value as any).version as string;
    if (!remote) return;

    if (compareVersions(WEB_BUNDLE_VERSION, remote) < 0) {
      console.log(`[OTA] Update available: local=${WEB_BUNDLE_VERSION} remote=${remote} — redirecting to ${PUBLISHED_URL}`);
      window.location.href = PUBLISHED_URL;
    } else {
      console.log(`[OTA] Bundle is up-to-date (v${WEB_BUNDLE_VERSION})`);
    }
  } catch (err) {
    console.warn("[OTA] Check failed, using local bundle:", err);
  }
}
