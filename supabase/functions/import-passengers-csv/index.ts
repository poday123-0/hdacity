import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    if (values.length < 2) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
    rows.push(row);
  }
  return rows;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { csv } = await req.json();
    if (!csv || typeof csv !== "string") {
      return new Response(JSON.stringify({ error: "csv string required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = parseCSV(csv);
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No data rows found in CSV" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const phone = (row.phone_number || row.phone || row.mobile || "").replace(/\D/g, "");
      const firstName = row.first_name || row.firstname || "";

      if (!phone) { skipped++; errors.push("Row skipped: no phone number"); continue; }
      if (!firstName) { skipped++; errors.push(`Row skipped for ${phone}: no first name`); continue; }

      // Check if passenger already exists
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone_number", phone)
        .eq("user_type", "Rider")
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const { error } = await supabase.from("profiles").insert({
        phone_number: phone,
        first_name: firstName,
        last_name: row.last_name || row.lastname || "",
        email: row.email || null,
        country_code: row.country_code || "960",
        gender: row.gender || "1",
        user_type: "Rider",
        status: row.status || "Active",
      });

      if (error) { skipped++; errors.push(`${phone}: ${error.message}`); }
      else { created++; }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_rows: rows.length,
        created,
        skipped,
        errors: errors.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Import error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});