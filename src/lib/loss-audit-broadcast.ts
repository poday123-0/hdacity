import { supabase } from "@/integrations/supabase/client";

const CHANNEL_NAME = "loss-audit-broadcast";

export type LossAuditActorPayload = {
  trip_id: string;
  vehicle_id: string | null;
  action: "set" | "cleared";
  actor_name: string;
  actor_role: "dispatcher" | "driver" | "admin" | "system";
  ts: number;
};

let _channel: ReturnType<typeof supabase.channel> | null = null;
function getChannel() {
  if (!_channel) {
    _channel = supabase.channel(CHANNEL_NAME, { config: { broadcast: { self: true } } });
    _channel.subscribe();
  }
  return _channel;
}

/**
 * Broadcast that someone changed the is_loss flag.
 * Subscribers (DispatchTripForm) merge this with the postgres_changes event
 * to display "who" did it in the realtime audit log.
 */
export async function broadcastLossActor(payload: LossAuditActorPayload) {
  try {
    const ch = getChannel();
    await ch.send({ type: "broadcast", event: "loss_changed", payload });
  } catch {
    // best-effort; audit log will simply omit the actor name
  }
}

/**
 * Subscribe to actor broadcasts. Returns an unsubscribe function.
 */
export function subscribeLossActor(
  handler: (payload: LossAuditActorPayload) => void,
) {
  const ch = supabase.channel(`${CHANNEL_NAME}-listener-${Math.random().toString(36).slice(2, 8)}`, {
    config: { broadcast: { self: true } },
  });
  ch.on("broadcast", { event: "loss_changed" }, ({ payload }) => {
    if (payload && typeof payload === "object") {
      handler(payload as LossAuditActorPayload);
    }
  }).subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}

export function actorNameFromProfile(profile: any | null | undefined): string {
  if (!profile) return "Unknown";
  const first = profile.first_name || "";
  const last = profile.last_name || "";
  const full = `${first} ${last}`.trim();
  return full || profile.phone_number || "Unknown";
}
