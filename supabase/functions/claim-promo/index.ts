import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, user_id, claim_type } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "User ID required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (claim_type === "topup_card") {
      // Claim a topup card by code
      if (!code) {
        return new Response(JSON.stringify({ error: "Card code required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find the card
      const { data: card, error: findErr } = await supabase
        .from("topup_cards")
        .select("*")
        .eq("code", code)
        .single();

      if (findErr || !card) {
        return new Response(JSON.stringify({ error: "Invalid card code" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (card.status === "claimed") {
        return new Response(JSON.stringify({ error: "This card has already been claimed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get or create wallet
      let { data: wallet } = await supabase.from("wallets").select("id, balance").eq("user_id", user_id).single();
      if (!wallet) {
        const { data: newWallet } = await supabase.from("wallets").insert({ user_id, balance: 0 }).select().single();
        wallet = newWallet;
      }
      if (!wallet) {
        return new Response(JSON.stringify({ error: "Could not find or create wallet" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Claim card
      const { error: claimErr } = await supabase
        .from("topup_cards")
        .update({ status: "claimed", claimed_by: user_id, claimed_at: new Date().toISOString() })
        .eq("id", card.id)
        .eq("status", "active");

      if (claimErr) throw claimErr;

      // Add to wallet
      const newBalance = Number(wallet.balance) + Number(card.amount);
      await supabase.from("wallets").update({ balance: newBalance, updated_at: new Date().toISOString() }).eq("id", wallet.id);

      // Record transaction
      await supabase.from("wallet_transactions").insert({
        wallet_id: wallet.id,
        user_id,
        amount: card.amount,
        type: "credit",
        reason: "Topup card redeemed",
        notes: `Card: ${card.code}`,
        status: "completed",
      });

      return new Response(JSON.stringify({ success: true, amount: card.amount, new_balance: newBalance }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (claim_type === "watermelon") {
      const { watermelon_id, user_lat, user_lng } = await req.json().catch(() => ({}));

      // This is handled separately - we parse from the original body
      return new Response(JSON.stringify({ error: "Use dedicated watermelon endpoint logic" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid claim_type" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
