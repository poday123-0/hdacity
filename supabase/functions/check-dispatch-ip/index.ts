import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Normalize an IP: strip IPv6 brackets, IPv4-mapped IPv6 prefix, whitespace
function normalizeIp(raw: string): string {
  let ip = (raw || "").trim();
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  // Strip port if present (e.g. 1.2.3.4:5678)
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.split(":")[0];
  // IPv4-mapped IPv6 -> IPv4 (::ffff:1.2.3.4)
  const m = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (m) ip = m[1];
  return ip.toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Collect all forwarded IPs from common headers; first match in allowlist wins
    const candidates: string[] = [];
    const xff = req.headers.get("x-forwarded-for");
    if (xff) xff.split(",").forEach((p) => candidates.push(normalizeIp(p)));
    const cf = req.headers.get("cf-connecting-ip");
    if (cf) candidates.push(normalizeIp(cf));
    const xreal = req.headers.get("x-real-ip");
    if (xreal) candidates.push(normalizeIp(xreal));
    const clientIp = candidates[0] || "unknown";

    console.log("[check-dispatch-ip] candidates:", candidates, "primary:", clientIp);

    const { data: setting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "dispatch_allowed_ips")
      .single();

    if (!setting) {
      return new Response(JSON.stringify({ allowed: true, ip: clientIp }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = setting.value as any;
    const enabled = config?.enabled === true;
    const allowedIps: string[] = Array.isArray(config?.ips) ? config.ips.map((s: string) => normalizeIp(s)) : [];

    if (!enabled || allowedIps.length === 0) {
      return new Response(JSON.stringify({ allowed: true, ip: clientIp }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAllowed = candidates.some((c) => allowedIps.includes(c));
    console.log("[check-dispatch-ip] allowedIps:", allowedIps, "isAllowed:", isAllowed);

    return new Response(JSON.stringify({ allowed: isAllowed, ip: clientIp, candidates }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, allowed: true }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
