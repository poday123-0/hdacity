import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Parse MySQL INSERT VALUES tuples from raw SQL text
function parseUsersFromSQL(sql: string): any[] {
  const users: any[] = [];
  
  // Match all tuples in INSERT INTO `users` ... VALUES (...), (...);
  const tupleRegex = /\((\d+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'[^']*',\s*'([^']*)',\s*(?:NULL|\d+),\s*(?:NULL|'[^']*'),\s*(?:NULL|'[^']*'),\s*(?:NULL|'[^']*'),\s*(?:NULL|'[^']*'),\s*(?:NULL|'[^']*'),\s*'([^']*)'/g;
  
  let match;
  while ((match = tupleRegex.exec(sql)) !== null) {
    users.push({
      id: parseInt(match[1]),
      first_name: match[2],
      last_name: match[3],
      email: match[4],
      country_code: match[5],
      gender: match[6],
      mobile_number: match[7],
      user_type: match[8],
      status: match[9],
    });
  }
  
  return users;
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

    const contentType = req.headers.get("content-type") || "";
    
    let usersToInsert: any[] = [];

    if (contentType.includes("text/plain")) {
      // Raw SQL mode - parse INSERT statements
      const sqlText = await req.text();
      const parsed = parseUsersFromSQL(sqlText);
      usersToInsert = parsed.map((u) => ({
        phone_number: u.mobile_number,
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        email: u.email || null,
        country_code: u.country_code || '960',
        gender: u.gender || '1',
        user_type: u.user_type || 'Rider',
        status: u.status || 'Active',
        legacy_id: u.id || null,
      }));
    } else {
      // JSON mode (backward compatible)
      const { users } = await req.json();
      if (!users || !Array.isArray(users)) {
        return new Response(JSON.stringify({ error: "users array required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      usersToInsert = users.map((u: any) => ({
        phone_number: u.mobile_number,
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        email: u.email || null,
        country_code: u.country_code || '960',
        gender: u.gender || '1',
        user_type: u.user_type || 'Rider',
        status: u.status || 'Active',
        legacy_id: u.id || null,
      }));
    }

    if (usersToInsert.length === 0) {
      return new Response(JSON.stringify({ error: "No users found to import", parsed: 0 }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate by phone_number + user_type (keep first occurrence)
    const seen = new Set<string>();
    const deduped = usersToInsert.filter((u) => {
      const key = `${u.phone_number}_${u.user_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Insert in batches of 100, using upsert to skip duplicates
    const batchSize = 100;
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < deduped.length; i += batchSize) {
      const batch = deduped.slice(i, i + batchSize);

      const { error } = await supabase.from("profiles").upsert(batch, {
        onConflict: "phone_number,user_type",
        ignoreDuplicates: true,
      });
      
      if (error) {
        // If upsert fails due to no unique constraint, fall back to insert with ignore
        console.error("Batch upsert error:", error.message);
        // Try individual inserts to skip duplicates
        for (const user of batch) {
          const { error: singleError } = await supabase.from("profiles").insert(user);
          if (singleError) {
            if (singleError.message.includes("duplicate") || singleError.code === "23505") {
              skipped++;
            } else {
              console.error("Single insert error:", singleError.message);
              skipped++;
            }
          } else {
            inserted++;
          }
        }
        continue;
      }
      inserted += batch.length;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      parsed: usersToInsert.length,
      deduped: deduped.length,
      inserted, 
      skipped,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Import error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
