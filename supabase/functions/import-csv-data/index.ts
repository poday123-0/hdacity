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

    const { csv_url, table_name } = await req.json();
    if (!csv_url || !table_name) {
      return new Response(JSON.stringify({ error: "csv_url and table_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allowedTables = ["vehicle_models", "vehicles"];
    if (!allowedTables.includes(table_name)) {
      return new Response(JSON.stringify({ error: `Table ${table_name} not allowed` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resp = await fetch(csv_url);
    const csvText = await resp.text();

    const lines = csvText.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      return new Response(JSON.stringify({ error: "No data rows found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = lines[0].split(";").map((h) => h.trim());
    const rows: Record<string, any>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(";");
      const row: Record<string, any> = {};
      headers.forEach((h, idx) => {
        let val = values[idx]?.trim() || "";
        if (val === "#N/A" || val === "N/A") val = "";
        row[h] = val;
      });
      rows.push(row);
    }

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    if (table_name === "vehicle_models") {
      const records = rows.map((r) => ({
        id: r.id,
        make_id: r.make_id,
        name: r.name,
        is_active: r.is_active === "true",
        created_at: r.created_at || new Date().toISOString(),
      }));

      const batchSize = 50;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const { error } = await supabase.from("vehicle_models").upsert(batch, {
          onConflict: "id",
          ignoreDuplicates: false,
        });
        if (error) {
          for (const rec of batch) {
            const { error: sErr } = await supabase.from("vehicle_models").upsert(rec, {
              onConflict: "id",
              ignoreDuplicates: false,
            });
            if (sErr) {
              skipped++;
              if (errors.length < 20) errors.push(`${rec.name}: ${sErr.message}`);
            } else {
              inserted++;
            }
          }
        } else {
          inserted += batch.length;
        }
      }
    } else if (table_name === "vehicles") {
      const records = rows.map((r) => {
        const rec: Record<string, any> = {
          id: r.id,
          plate_number: r.plate_number || "#N/A",
          make: r.make || "",
          model: r.model || "",
          color: r.color || "",
          is_active: r.is_active === "true",
          vehicle_status: r.vehicle_status || "pending",
          created_at: r.created_at || new Date().toISOString(),
          updated_at: r.updated_at || new Date().toISOString(),
        };
        if (r.driver_id) rec.driver_id = r.driver_id;
        if (r.vehicle_type_id) rec.vehicle_type_id = r.vehicle_type_id;
        if (r.year && r.year !== "#N/A") rec.year = parseInt(r.year) || null;
        if (r.registration_url) rec.registration_url = r.registration_url;
        if (r.insurance_url) rec.insurance_url = r.insurance_url;
        if (r.image_url) rec.image_url = r.image_url;
        if (r.rejection_reason) rec.rejection_reason = r.rejection_reason;
        if (r.center_code) rec.center_code = r.center_code;
        return rec;
      });

      const batchSize = 50;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const { error } = await supabase.from("vehicles").upsert(batch, {
          onConflict: "id",
          ignoreDuplicates: false,
        });
        if (error) {
          for (const rec of batch) {
            const { error: sErr } = await supabase.from("vehicles").upsert(rec, {
              onConflict: "id",
              ignoreDuplicates: false,
            });
            if (sErr) {
              skipped++;
              if (errors.length < 20) errors.push(`${rec.plate_number}: ${sErr.message}`);
            } else {
              inserted++;
            }
          }
        } else {
          inserted += batch.length;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        table: table_name,
        total_parsed: rows.length,
        inserted,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
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
