import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight, fire-and-forget diagnostic logger.
 * Used to record why the driver app accepts/rejects/handles trip requests
 * so we can debug "got notification, no screen" reports per device.
 *
 * Never throws. Never blocks the caller.
 */

let cachedDevice: string | null = null;
let cachedPlatform: string | null = null;
let cachedAppVersion: string | null = null;

const getDevice = (): string => {
  if (cachedDevice) return cachedDevice;
  try {
    const ua = navigator.userAgent || "";
    // Trim to keep payload small but keep enough info
    cachedDevice = ua.slice(0, 180);
  } catch {
    cachedDevice = "unknown";
  }
  return cachedDevice;
};

const getPlatform = (): string => {
  if (cachedPlatform) return cachedPlatform;
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      cachedPlatform = cap.getPlatform?.() || "native";
    } else {
      cachedPlatform = "web";
    }
  } catch {
    cachedPlatform = "web";
  }
  return cachedPlatform;
};

const getAppVersion = (): string => {
  if (cachedAppVersion) return cachedAppVersion;
  try {
    cachedAppVersion =
      (window as any).__APP_VERSION__ ||
      localStorage.getItem("hda_app_version") ||
      "unknown";
  } catch {
    cachedAppVersion = "unknown";
  }
  return cachedAppVersion!;
};

export interface DebugLogPayload {
  event: string;
  driver_id?: string | null;
  trip_id?: string | null;
  details?: Record<string, any>;
  source?: string;
}

export function debugLog(payload: DebugLogPayload): void {
  // Fire-and-forget — never await, never throw
  try {
    const row = {
      source: payload.source || "driver_app",
      event: payload.event,
      driver_id: payload.driver_id || null,
      trip_id: payload.trip_id || null,
      device: getDevice(),
      platform: getPlatform(),
      app_version: getAppVersion(),
      details: payload.details || {},
    };
    void supabase.from("debug_logs").insert(row as any).then(({ error }) => {
      if (error) console.warn("[debugLog] insert failed:", error.message);
    });
  } catch (err) {
    console.warn("[debugLog] threw:", err);
  }
}
