// Lightweight localStorage cache for dispatch data so the dashboard
// opens instantly with stale data, then refreshes in the background.
//
// Offline-aware: while the device is offline, cached data is treated as
// always fresh so the dispatcher can keep working without internet.

const PREFIX = "hda_dispatch_cache_v1:";
// 10 minutes online: cached data is shown instantly and a background refresh
// runs whenever it's older than this. Realtime channels keep critical data
// (trips, drivers, center codes) fresh in between, so a longer TTL doesn't
// cause stale UI but dramatically reduces blocking network waits on tab/route
// changes.
const DEFAULT_TTL_MS = 10 * 60 * 1000;

export type DispatchCacheKey =
  | "recent_trips"
  | "app_request_trips"
  | "lost_trips"
  | "online_drivers"
  | "vehicle_types"
  | "form_locations"
  | "center_code_index";

interface CacheEntry<T> {
  ts: number;
  data: T;
}

function isOffline(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

export function readCache<T>(key: DispatchCacheKey): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed: CacheEntry<T> = JSON.parse(raw);
    if (!parsed?.ts) return null;
    // Always return cached data on load — caller decides whether to refresh.
    return parsed.data;
  } catch {
    return null;
  }
}

export function isCacheFresh(key: DispatchCacheKey, ttlMs = DEFAULT_TTL_MS): boolean {
  // While offline, treat any existing cache as fresh so dispatch keeps working.
  if (isOffline()) {
    try {
      return localStorage.getItem(PREFIX + key) !== null;
    } catch {
      return false;
    }
  }
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return false;
    const parsed: CacheEntry<unknown> = JSON.parse(raw);
    return !!parsed?.ts && Date.now() - parsed.ts < ttlMs;
  } catch {
    return false;
  }
}

export function writeCache<T>(key: DispatchCacheKey, data: T): void {
  try {
    const entry: CacheEntry<T> = { ts: Date.now(), data };
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage unavailable — silently ignore.
  }
}

export function clearDispatchCache(): void {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
}
