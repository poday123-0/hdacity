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
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
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
    // Clean #N/A values
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (row[key] === "#N/A" || row[key] === "N/A") {
          row[key] = "";
        }
      }
    }
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No data rows found in CSV" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get vehicle type mapping
    const { data: vtData } = await supabase.from("vehicle_types").select("id, name");
    const vtMap: Record<string, string> = {};
    vtData?.forEach((vt: any) => {
      vtMap[vt.name.toLowerCase()] = vt.id;
    });

    // Get company mapping
    const { data: companyData } = await supabase.from("companies").select("id, name");
    const companyMap: Record<string, string> = {};
    companyData?.forEach((c: any) => {
      companyMap[c.name.toLowerCase()] = c.id;
    });

    let driversCreated = 0;
    let driversSkipped = 0;
    let vehiclesCreated = 0;
    let vehiclesSkipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const phone = (row.phone_number || row.phone || row.mobile || "").replace(/\D/g, "");
      if (!phone) {
        errors.push(`Row skipped: no phone number`);
        driversSkipped++;
        continue;
      }

      const firstName = row.first_name || row.firstname || "";
      const lastName = row.last_name || row.lastname || "";

      if (!firstName) {
        errors.push(`Row skipped for ${phone}: no first name`);
        driversSkipped++;
        continue;
      }

      // Check if driver profile already exists
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone_number", phone)
        .ilike("user_type", "%Driver%")
        .maybeSingle();

      let driverId: string;

      if (existing) {
        driverId = existing.id;
        driversSkipped++;
      } else {
        // Resolve company
        const companyName = row.company || row.company_name || "";
        const companyId = companyName ? companyMap[companyName.toLowerCase()] || null : null;

        const { data: newProfile, error: profileError } = await supabase
          .from("profiles")
          .insert({
            phone_number: phone,
            first_name: firstName,
            last_name: lastName,
            email: row.email || null,
            country_code: row.country_code || "960",
            gender: row.gender || "1",
            user_type: "Driver",
            status: row.status || "Pending",
            company_id: companyId,
            company_name: companyName,
            monthly_fee: parseFloat(row.monthly_fee || "0") || 0,
          })
          .select("id")
          .single();

        if (profileError) {
          errors.push(`Driver ${phone}: ${profileError.message}`);
          driversSkipped++;
          continue;
        }
        driverId = newProfile.id;
        driversCreated++;
      }

      // Create vehicle if plate_number is provided
      const plateNumber = row.plate_number || row.vehicle_number || row.plate || "";
      if (plateNumber) {
        // Check duplicate
        const { data: existingVehicle } = await supabase
          .from("vehicles")
          .select("id")
          .eq("driver_id", driverId)
          .eq("plate_number", plateNumber)
          .maybeSingle();

        if (existingVehicle) {
          vehiclesSkipped++;
        } else {
          const vehicleTypeName = (row.vehicle_type || row.type || "car").toLowerCase();
          const vehicleTypeId = vtMap[vehicleTypeName] || vtMap["car"] || null;

          const { error: vehError } = await supabase.from("vehicles").insert({
            driver_id: driverId,
            plate_number: plateNumber,
            make: row.make || row.vehicle_make || "",
            model: row.model || row.vehicle_model || "",
            color: row.color || row.vehicle_color || "",
            year: parseInt(row.year || "0") || null,
            vehicle_type_id: vehicleTypeId,
            is_active: true,
          });

          if (vehError) {
            errors.push(`Vehicle ${plateNumber}: ${vehError.message}`);
            vehiclesSkipped++;
          } else {
            vehiclesCreated++;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_rows: rows.length,
        drivers_created: driversCreated,
        drivers_skipped: driversSkipped,
        vehicles_created: vehiclesCreated,
        vehicles_skipped: vehiclesSkipped,
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
