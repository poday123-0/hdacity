import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { watermelon_id, user_id, user_lat, user_lng, user_type } = await req.json();

    if (!watermelon_id || !user_id || user_lat == null || user_lng == null) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if user already claimed a promo item today (max 1 per day)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayClaims } = await supabase
      .from("promo_watermelons")
      .select("id")
      .eq("claimed_by", user_id)
      .eq("status", "claimed")
      .gte("claimed_at", todayStart.toISOString())
      .limit(1);

    if (todayClaims && todayClaims.length > 0) {
      return new Response(JSON.stringify({ error: "You've already collected a reward today! Come back tomorrow." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the watermelon
    const { data: melon, error: findErr } = await supabase
      .from("promo_watermelons")
      .select("*")
      .eq("id", watermelon_id)
      .eq("status", "active")
      .single();

    if (findErr || !melon) {
      return new Response(JSON.stringify({ error: "Reward not found or already claimed" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check target_user_type matches
    if (melon.target_user_type !== "both" && melon.target_user_type !== user_type) {
      return new Response(JSON.stringify({ error: `This reward is for ${melon.target_user_type}s only` }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check distance
    const dist = haversineDistance(user_lat, user_lng, melon.lat, melon.lng);
    if (dist > melon.claim_radius_m) {
      return new Response(JSON.stringify({ error: "Too far away! Get closer to claim this reward.", distance: Math.round(dist) }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Claim the watermelon
    const { error: claimErr } = await supabase
      .from("promo_watermelons")
      .update({ status: "claimed", claimed_by: user_id, claimed_at: new Date().toISOString() })
      .eq("id", watermelon_id)
      .eq("status", "active");

    if (claimErr) throw claimErr;

    let reward_description = "";

    if (melon.promo_type === "wallet_amount") {
      let { data: wallet } = await supabase.from("wallets").select("id, balance").eq("user_id", user_id).single();
      if (!wallet) {
        const { data: nw } = await supabase.from("wallets").insert({ user_id, balance: 0 }).select().single();
        wallet = nw;
      }
      if (wallet) {
        const newBalance = Number(wallet.balance) + Number(melon.amount);
        await supabase.from("wallets").update({ balance: newBalance, updated_at: new Date().toISOString() }).eq("id", wallet.id);
        await supabase.from("wallet_transactions").insert({
          wallet_id: wallet.id, user_id, amount: melon.amount, type: "credit",
          reason: "🎁 Promo Reward", notes: `Collected a map reward!`, status: "completed",
        });
        reward_description = `${melon.amount} MVR added to wallet!`;
      }
    } else if (melon.promo_type === "fee_free") {
      const freeUntil = new Date();
      freeUntil.setMonth(freeUntil.getMonth() + melon.fee_free_months);
      await supabase.from("profiles").update({ fee_free_until: freeUntil.toISOString() }).eq("id", user_id);
      reward_description = `${melon.fee_free_months} month${melon.fee_free_months > 1 ? "s" : ""} center fee-free!`;
    } else if (melon.promo_type === "free_trip") {
      let { data: wallet } = await supabase.from("wallets").select("id, balance").eq("user_id", user_id).single();
      if (!wallet) {
        const { data: nw } = await supabase.from("wallets").insert({ user_id, balance: 0 }).select().single();
        wallet = nw;
      }
      if (wallet) {
        const tripValue = melon.free_trips * 50;
        const newBalance = Number(wallet.balance) + tripValue;
        await supabase.from("wallets").update({ balance: newBalance, updated_at: new Date().toISOString() }).eq("id", wallet.id);
        await supabase.from("wallet_transactions").insert({
          wallet_id: wallet.id, user_id, amount: tripValue, type: "credit",
          reason: "🎁 Free Trip Reward", notes: `${melon.free_trips} free trip${melon.free_trips > 1 ? "s" : ""}`, status: "completed",
        });
        reward_description = `${melon.free_trips} free trip${melon.free_trips > 1 ? "s" : ""} added!`;
      }
    }

    return new Response(JSON.stringify({
      success: true, promo_type: melon.promo_type, amount: melon.amount,
      fee_free_months: melon.fee_free_months, free_trips: melon.free_trips, reward_description,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
