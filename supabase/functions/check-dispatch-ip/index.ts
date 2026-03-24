import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get client IP from headers
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
      || req.headers.get("cf-connecting-ip") 
      || req.headers.get("x-real-ip") 
      || "unknown";

    // Check if IP restriction is enabled
    const { data: setting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "dispatch_allowed_ips")
      .single();

    if (!setting) {
      // No setting = no restriction
      return new Response(JSON.stringify({ allowed: true, ip: clientIp }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = setting.value as any;
    const enabled = config?.enabled === true;
    const allowedIps: string[] = Array.isArray(config?.ips) ? config.ips : [];

    if (!enabled || allowedIps.length === 0) {
      return new Response(JSON.stringify({ allowed: true, ip: clientIp }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAllowed = allowedIps.some((ip: string) => clientIp === ip.trim());

    return new Response(JSON.stringify({ allowed: isAllowed, ip: clientIp }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, allowed: true }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
