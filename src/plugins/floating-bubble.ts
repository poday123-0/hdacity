import { registerPlugin } from "@capacitor/core";

export interface FloatingBubblePlugin {
  /** Show the floating bubble overlay with trip info */
  show(options: {
    tripId: string;
    pickupAddress: string;
    dropoffAddress: string;
    vehicleType?: string;
    estimatedFare?: number;
  }): Promise<void>;

  /**
   * Show an idle/persistent bubble (just the app logo) — Messenger chat-head style.
   * Visible while the app is minimized so the driver always sees the app is active.
   */
  showIdle(): Promise<void>;

  /** Hide/dismiss the floating bubble */
  hide(): Promise<void>;

  /** Check if the overlay permission is granted */
  checkPermission(): Promise<{ granted: boolean }>;

  /** Open Android settings to grant overlay permission */
  requestPermission(): Promise<void>;

  /**
   * Listen for when the user taps the bubble.
   * The app should navigate to the trip request screen.
   */
  addListener(
    eventName: "bubbleTapped",
    callback: (data: { tripId: string }) => void
  ): Promise<{ remove: () => void }>;

  /** Listen for when the user dismisses the bubble */
  addListener(
    eventName: "bubbleDismissed",
    callback: () => void
  ): Promise<{ remove: () => void }>;
}

const FloatingBubble = registerPlugin<FloatingBubblePlugin>("FloatingBubble");

export default FloatingBubble;
