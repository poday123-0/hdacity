import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Compact network indicator: shows effective connection type / downlink (free,
 * via the Network Information API) plus a periodic lightweight RTT ping to the
 * Supabase REST endpoint so dispatchers can instantly tell when the network is
 * slow. Falls back gracefully on browsers without `navigator.connection`.
 */
type NetInfo = {
  effectiveType?: string; // 'slow-2g' | '2g' | '3g' | '4g'
  downlink?: number; // Mbps
  rtt?: number; // ms
  saveData?: boolean;
};

export function NetworkSpeedIndicator({ online }: { online: boolean }) {
  const [info, setInfo] = useState<NetInfo>({});
  const [pingMs, setPingMs] = useState<number | null>(null);

  // 1) Subscribe to navigator.connection (zero-cost, browser-provided)
  useEffect(() => {
    const conn: any =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;
    if (!conn) return;
    const update = () =>
      setInfo({
        effectiveType: conn.effectiveType,
        downlink: conn.downlink,
        rtt: conn.rtt,
        saveData: conn.saveData,
      });
    update();
    conn.addEventListener?.("change", update);
    return () => conn.removeEventListener?.("change", update);
  }, []);

  // 2) Lightweight RTT probe to Supabase REST root every 15s (HEAD-ish, ~0 KB)
  useEffect(() => {
    if (!online) {
      setPingMs(null);
      return;
    }
    let cancelled = false;
    const probe = async () => {
      const start = performance.now();
      try {
        // tiny request: HEAD on the REST root returns instantly
        await supabase
          .from("system_settings")
          .select("id", { head: true, count: "exact" })
          .limit(1);
        if (!cancelled) setPingMs(Math.round(performance.now() - start));
      } catch {
        if (!cancelled) setPingMs(null);
      }
    };
    probe();
    const iv = setInterval(probe, 15_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [online]);

  if (!online) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tabular-nums bg-destructive/15 text-destructive"
        title="Offline"
      >
        <WifiOff className="w-3 h-3" />
        Offline
      </span>
    );
  }

  // Color scale: based on effective type or measured ping
  const eff = info.effectiveType ?? "";
  const isSlow = eff === "slow-2g" || eff === "2g" || (pingMs !== null && pingMs > 800);
  const isOk = eff === "3g" || (pingMs !== null && pingMs > 300 && pingMs <= 800);
  const tone = isSlow
    ? "bg-destructive/15 text-destructive"
    : isOk
      ? "bg-orange-500/15 text-orange-500"
      : "bg-success/15 text-success";

  // Label preference: ping (most accurate to user latency) > downlink > eff type
  const label =
    pingMs !== null
      ? `${pingMs}ms`
      : info.downlink
        ? `${info.downlink}Mb`
        : eff
          ? eff.toUpperCase()
          : "—";

  const title = [
    eff && `Connection: ${eff}`,
    info.downlink != null && `Downlink: ${info.downlink} Mbps`,
    info.rtt != null && `RTT (browser): ${info.rtt} ms`,
    pingMs !== null && `Live ping: ${pingMs} ms`,
    info.saveData && "Data saver: on",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tabular-nums ${tone}`}
      title={title || "Network status"}
    >
      <Wifi className="w-3 h-3" />
      {label}
    </span>
  );
}

export default NetworkSpeedIndicator;
