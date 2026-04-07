/**
 * Background geolocation for native apps.
 * - Android: uses @capgo/background-geolocation (full background support)
 * - iOS: uses @capacitor/geolocation watchPosition (works with Background Modes > Location updates)
 * - Web: no-op
 */
import { Capacitor } from "@capacitor/core";

interface BgGeoLocation {
  latitude: number;
  longitude: number;
}

const isNative = Capacitor.isNativePlatform();
const isIOS = Capacitor.getPlatform() === "ios";

let isTracking = false;
let iosWatchId: string | null = null;

export type BgLocationCallback = (lat: number, lng: number, heading?: number | null) => void;

/**
 * Start background location tracking (native only).
 * Returns true if started, false if not native or already running.
 */
export async function startBackgroundLocation(
  callback: BgLocationCallback,
  options?: { distanceFilter?: number }
): Promise<boolean> {
  if (!isNative) return false;
  if (isTracking) return true;

  if (isIOS) {
    // iOS: use @capacitor/geolocation watchPosition
    // With Background Modes > Location updates enabled in Xcode,
    // iOS keeps the app alive and continues delivering locations.
    try {
      const { Geolocation } = await import("@capacitor/geolocation");

      // Request always-on permission first
      const perm = await Geolocation.requestPermissions({ permissions: ["location"] });
      console.log("iOS geolocation permission:", perm.location);

      iosWatchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true },
        (position, err) => {
          if (err) {
            console.warn("iOS watchPosition error:", err);
            return;
          }
          if (position) {
            const h = position.coords.heading;
            callback(position.coords.latitude, position.coords.longitude, (h != null && !isNaN(h)) ? h : null);
          }
        }
      );
      isTracking = true;
      console.log("iOS background location started via watchPosition");
      return true;
    } catch (e) {
      console.warn("Failed to start iOS background location:", e);
      return false;
    }
  } else {
    // Android: use @capgo/background-geolocation
    try {
      const { BackgroundGeolocation } = await import("@capgo/background-geolocation");

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
            const h = (location as any).bearing ?? (location as any).heading ?? null;
            callback(location.latitude, location.longitude, (h != null && !isNaN(h)) ? h : null);
          }
        }
      );
      isTracking = true;
      return true;
    } catch (e) {
      console.warn("Failed to start Android background geolocation:", e);
      return false;
    }
  }
}

/**
 * Stop background location tracking.
 */
export async function stopBackgroundLocation(): Promise<void> {
  if (!isNative || !isTracking) return;

  try {
    if (isIOS && iosWatchId !== null) {
      const { Geolocation } = await import("@capacitor/geolocation");
      await Geolocation.clearWatch({ id: iosWatchId });
      iosWatchId = null;
    } else if (!isIOS) {
      const { BackgroundGeolocation } = await import("@capgo/background-geolocation");
      await BackgroundGeolocation.stop();
    }
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
