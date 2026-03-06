import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MSGOWL_API_KEY = Deno.env.get("MSGOWL_API_KEY");
    if (!MSGOWL_API_KEY) throw new Error("MSGOWL_API_KEY is not configured");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { message, target_type, sender_id, phone_numbers } = await req.json();

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let recipients: string[] = [];

    if (target_type === "custom" && Array.isArray(phone_numbers) && phone_numbers.length > 0) {
      // Custom: use provided phone numbers directly
      const seen = new Set<string>();
      for (const num of phone_numbers) {
        const phone = String(num).replace(/\D/g, "");
        if (phone.length >= 7 && !seen.has(phone)) {
          seen.add(phone);
          recipients.push(phone);
        }
      }
    } else {
      // Bulk: fetch from profiles
      let query = supabaseAdmin.from("profiles").select("phone_number, country_code");

      if (target_type === "passengers") {
        query = query.eq("user_type", "Rider");
      } else if (target_type === "drivers") {
        query = query.ilike("user_type", "%Driver%");
      }

      query = query.eq("status", "Active");

      const { data: profiles, error: profileErr } = await query;
      if (profileErr) throw new Error(profileErr.message);

      const seen = new Set<string>();
      for (const p of (profiles || [])) {
        const phone = String(p.phone_number).replace(/\D/g, "");
        if (!phone || phone.length < 7) continue;
        const cc = String(p.country_code || "960").replace(/\D/g, "");
        const full = phone.startsWith(cc) ? phone : `${cc}${phone}`;
        if (!seen.has(full)) {
          seen.add(full);
          recipients.push(full);
        }
      }
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: "No valid phone numbers", sent: 0, failed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const smsId = sender_id || "HDA TAXI";
    const BATCH_SIZE = 10;
    const BATCH_DELAY_MS = 1500;
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    // Send in batches
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      // Send each SMS in the batch concurrently
      const results = await Promise.allSettled(
        batch.map(async (phone) => {
          const res = await fetch("https://rest.msgowl.com/messages", {
            method: "POST",
            headers: {
              Authorization: `AccessKey ${MSGOWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              recipients: phone,
              sender_id: smsId,
              body: message.trim(),
            }),
          });
          if (!res.ok) {
            const err = await res.text();
            throw new Error(`${phone}: ${err}`);
          }
          return phone;
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          sent++;
        } else {
          failed++;
          errors.push(r.reason?.message || "Unknown error");
        }
      }

      // Delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    // Log the SMS blast as a notification record
    await supabaseAdmin.from("notifications").insert({
      title: `📱 SMS Blast (${target_type})`,
      message: `${message.trim()}\n\n— Sent: ${sent}, Failed: ${failed}, Total: ${recipients.length}`,
      target_type: "admin",
    });

    return new Response(
      JSON.stringify({ success: true, sent, failed, total: recipients.length, errors: errors.slice(0, 5) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-bulk-sms error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
