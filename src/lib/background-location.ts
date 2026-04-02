/**
 * Native background geolocation using @capgo/background-geolocation.
 * Falls back gracefully on web (no-op).
 */
import { Capacitor } from "@capacitor/core";
import { BackgroundGeolocation } from "@capgo/background-geolocation";

interface BgGeoLocation {
  latitude: number;
  longitude: number;
}

interface BgGeoError {
  code: string;
  message?: string;
}

const isNative = Capacitor.isNativePlatform();

let isTracking = false;

export type BgLocationCallback = (lat: number, lng: number) => void;

/**
 * Start background location tracking (native only).
 * Returns true if started, false if not native or already running.
 */
export async function startBackgroundLocation(
  callback: BgLocationCallback,
  options?: { distanceFilter?: number }
): Promise<boolean> {
  if (!isNative) return false;
  if (isTracking) return true; // already running

  try {
    await BackgroundGeolocation.start(
      {
        backgroundMessage: "Delivering every journey on time, every time.",
        backgroundTitle: "HDA Driver Active",
        requestPermissions: true,
        stale: false,
        distanceFilter: options?.distanceFilter ?? 10,
      },
      (location, error) => {
        if (error) {
          if (error.code === "NOT_AUTHORIZED") {
            console.warn("Background location not authorized");
          } else {
            console.warn("Background location error:", error);
          }
          return;
        }
        if (location) {
          callback(location.latitude, location.longitude);
        }
      }
    );
    isTracking = true;
    return true;
  } catch (e) {
    console.warn("Failed to start background geolocation:", e);
    return false;
  }
}

/**
 * Stop background location tracking.
 */
export async function stopBackgroundLocation(): Promise<void> {
  if (!isNative || !isTracking) return;
  try {
    await BackgroundGeolocation.stop();
  } catch (e) {
    console.warn("Failed to stop background geolocation:", e);
  }
  isTracking = false;
}

/**
 * Check if background location is currently active.
 */
export function isBackgroundLocationActive(): boolean {
  return isTracking;
}
