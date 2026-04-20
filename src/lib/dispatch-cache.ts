// Lightweight localStorage cache for dispatch data so the dashboard
// opens instantly with stale data, then refreshes in the background.

const PREFIX = "hda_dispatch_cache_v1:";
const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 minutes

export type DispatchCacheKey =
  | "recent_trips"
  | "app_request_trips"
  | "lost_trips"
  | "online_drivers"
  | "vehicle_types";

interface CacheEntry<T> {
  ts: number;
  data: T;
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
