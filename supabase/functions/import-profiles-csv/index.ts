import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let csvText: string;
    const contentType = req.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      const { csv_url } = await req.json();
      if (!csv_url) {
        return new Response(JSON.stringify({ error: "csv_url required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const resp = await fetch(csv_url);
      csvText = await resp.text();
    } else {
      csvText = await req.text();
    }

    const lines = csvText.split("\n").filter((l) => l.trim());
    
    if (lines.length < 2) {
      return new Response(JSON.stringify({ error: "No data rows found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = lines[0].split(";").map((h) => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(";");
      const row: Record<string, any> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx]?.trim() || "";
      });
      rows.push(row);
    }

    // Map CSV rows to profile inserts
    const profiles = rows.map((r) => {
      const p: Record<string, any> = {
        id: r.id || undefined,
        phone_number: r.phone_number,
        first_name: r.first_name || "",
        last_name: r.last_name || "",
        email: r.email || null,
        country_code: r.country_code || "960",
        gender: r.gender || "1",
        user_type: r.user_type || "Rider",
        status: r.status || "Active",
        legacy_id: r.legacy_id ? parseInt(r.legacy_id) : null,
        monthly_fee: r.monthly_fee ? parseFloat(r.monthly_fee) : 0,
        company_name: r.company_name || "",
        bank_name: r.bank_name || "",
        bank_account_number: r.bank_account_number || "",
        bank_account_name: r.bank_account_name || "",
        trip_radius_km: r.trip_radius_km ? parseFloat(r.trip_radius_km) : 10,
      };

      if (r.bank_id) p.bank_id = r.bank_id;
      if (r.company_id) p.company_id = r.company_id;
      if (r.avatar_url) p.avatar_url = r.avatar_url;
      if (r.license_front_url) p.license_front_url = r.license_front_url;
      if (r.license_back_url) p.license_back_url = r.license_back_url;
      if (r.id_card_front_url) p.id_card_front_url = r.id_card_front_url;
      if (r.id_card_back_url) p.id_card_back_url = r.id_card_back_url;
      if (r.taxi_permit_front_url) p.taxi_permit_front_url = r.taxi_permit_front_url;
      if (r.taxi_permit_back_url) p.taxi_permit_back_url = r.taxi_permit_back_url;
      if (r.trip_sound_id) p.trip_sound_id = r.trip_sound_id;
      if (r.fee_free_until) p.fee_free_until = r.fee_free_until;

      if (p.email === "") p.email = null;

      return p;
    });

    // Insert in batches of 50
    const batchSize = 50;
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < profiles.length; i += batchSize) {
      const batch = profiles.slice(i, i + batchSize);

      const { error } = await supabase.from("profiles").upsert(batch, {
        onConflict: "id",
        ignoreDuplicates: false,
      });

      if (error) {
        console.error(`Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
        for (const profile of batch) {
          const { error: singleError } = await supabase
            .from("profiles")
            .upsert(profile, { onConflict: "id", ignoreDuplicates: false });
          if (singleError) {
            skipped++;
            if (errors.length < 20) {
              errors.push(`${profile.phone_number} (${profile.id}): ${singleError.message}`);
            }
          } else {
            inserted++;
          }
        }
      } else {
        inserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_parsed: profiles.length,
        inserted,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Import error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
