/**
 * Background geolocation using the standard Web Geolocation API.
 * Works in Capacitor WebView on iOS/Android with proper Info.plist keys.
 */

let activeWatcherId: number | null = null;

export type BgLocationCallback = (lat: number, lng: number) => void;

/**
 * Start location tracking using the browser Geolocation API.
 * Returns true if started, false if already running or unavailable.
 */
export async function startBackgroundLocation(
  callback: BgLocationCallback,
  options?: { distanceFilter?: number }
): Promise<boolean> {
  if (activeWatcherId !== null) return true; // already running
  if (!navigator.geolocation) return false;

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      callback(position.coords.latitude, position.coords.longitude);
    },
    (error) => {
      console.warn("Geolocation error:", error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    }
  );

  activeWatcherId = watchId;
  return true;
}

/**
 * Stop location tracking.
 */
export async function stopBackgroundLocation(): Promise<void> {
  if (activeWatcherId === null) return;
  navigator.geolocation.clearWatch(activeWatcherId);
  activeWatcherId = null;
}

/**
 * Check if location tracking is currently active.
 */
export function isBackgroundLocationActive(): boolean {
  return activeWatcherId !== null;
}
