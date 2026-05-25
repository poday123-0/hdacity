import { registerPlugin } from "@capacitor/core";

export interface FloatingBubblePlugin {
  show(options: {
    tripId: string;
    pickupAddress: string;
    dropoffAddress: string;
    vehicleType?: string;
    estimatedFare?: number;
  }): Promise<void>;

  showIdle(): Promise<void>;
  hide(): Promise<void>;

  /**
   * Posts a heads-up Android system notification for an incoming trip with
   * Accept and Decline action buttons. Works without overlay permission and
   * shows even on the lock screen / over other apps.
   */
  showHeadsUp(options: {
    tripId: string;
    pickupAddress: string;
    dropoffAddress: string;
    vehicleType?: string;
    estimatedFare?: number;
  }): Promise<void>;

  hideHeadsUp(): Promise<void>;

  /**
   * Drains any pending Accept/Decline action queued by the native side
   * (notification action button or overlay button press) while the WebView
   * was not running. Returns `{ action: "", tripId: "" }` when nothing is queued.
   */
  getPendingAction(): Promise<{ action: "" | "accept" | "decline" | "open"; tripId: string }>;

  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<void>;

  addListener(
    eventName: "bubbleTapped",
    callback: (data: { tripId: string }) => void
  ): Promise<{ remove: () => void }>;

  addListener(
    eventName: "bubbleAccepted",
    callback: (data: { tripId: string }) => void
  ): Promise<{ remove: () => void }>;

  addListener(
    eventName: "bubbleDeclined",
    callback: (data: { tripId: string }) => void
  ): Promise<{ remove: () => void }>;

  addListener(
    eventName: "bubbleDismissed",
    callback: () => void
  ): Promise<{ remove: () => void }>;
}

const FloatingBubble = registerPlugin<FloatingBubblePlugin>("FloatingBubble");

export default FloatingBubble;
