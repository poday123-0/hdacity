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
