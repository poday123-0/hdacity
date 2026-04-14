/**
 * Keep the device screen awake while the driver is online/on trip.
 * Uses @capacitor-community/keep-awake on native, Screen Wake Lock API on web.
 */

let isKeepingAwake = false;
let wakeLock: any = null;

export async function enableKeepAwake(): Promise<void> {
  if (isKeepingAwake) return;
  
  try {
    // Try Capacitor plugin first (native)
    const { KeepAwake } = await import("@capacitor-community/keep-awake");
    await KeepAwake.keepAwake();
    isKeepingAwake = true;
    console.log("[KeepAwake] Enabled via Capacitor plugin");
    return;
  } catch {
    // Not native or plugin not available
  }

  // Web fallback: Screen Wake Lock API
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await (navigator as any).wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        isKeepingAwake = false;
        wakeLock = null;
      });
      isKeepingAwake = true;
      console.log("[KeepAwake] Enabled via Wake Lock API");
    }
  } catch (e) {
    console.warn("[KeepAwake] Wake Lock failed:", e);
  }
}

export async function disableKeepAwake(): Promise<void> {
  if (!isKeepingAwake) return;

  try {
    const { KeepAwake } = await import("@capacitor-community/keep-awake");
    await KeepAwake.allowSleep();
    isKeepingAwake = false;
    console.log("[KeepAwake] Disabled via Capacitor plugin");
    return;
  } catch {}

  // Web fallback
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
    isKeepingAwake = false;
  } catch {}
}

export function isScreenAwake(): boolean {
  return isKeepingAwake;
}
