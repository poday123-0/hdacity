/**
 * Native background geolocation using @capgo/background-geolocation.
 * Falls back gracefully on web (no-op).
 */
import { Capacitor } from "@capacitor/core";
import { registerPlugin } from "@capacitor/core";

interface BgGeoLocation {
  latitude: number;
  longitude: number;
}

interface BgGeoError {
  code: string;
}

interface BgGeoPlugin {
  addWatcher(
    options: {
      backgroundMessage: string;
      backgroundTitle: string;
      requestPermissions: boolean;
      stale: boolean;
      distanceFilter: number;
    },
    callback: (location: BgGeoLocation | undefined, error: BgGeoError | undefined) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BgGeoPlugin>("BackgroundGeolocation");

const isNative = Capacitor.isNativePlatform();

let activeWatcherId: string | null = null;

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
  if (activeWatcherId) return true; // already running

  try {
    const watcherId = await BackgroundGeolocation.addWatcher(
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
          }
          return;
        }
        if (location) {
          callback(location.latitude, location.longitude);
        }
      }
    );
    activeWatcherId = watcherId;
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
  if (!isNative || !activeWatcherId) return;
  try {
    await BackgroundGeolocation.removeWatcher({ id: activeWatcherId });
  } catch (e) {
    console.warn("Failed to stop background geolocation:", e);
  }
  activeWatcherId = null;
}

/**
 * Check if background location is currently active.
 */
export function isBackgroundLocationActive(): boolean {
  return activeWatcherId !== null;
}
