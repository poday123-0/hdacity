import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const ImportUsers = () => {
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [importing, setImporting] = useState(false);
  const [vehicleStatus, setVehicleStatus] = useState("");
  const [vehicleImporting, setVehicleImporting] = useState(false);

  const parseUsersFromSQL = (sql: string) => {
    const users: any[] = [];
    // Match user tuples - captures id, first_name, last_name, email, country_code, gender, mobile_number, then skips password, then user_type, then skips to status
    const regex = /\((\d+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'[^']*',\s*'(Rider|Driver)',\s*(?:NULL|\d+),\s*(?:NULL|'[^']*'),\s*(?:NULL|'[^']*'),\s*(?:NULL|'[^']*'),\s*(?:NULL|'[^']*'),\s*(?:NULL|'[^']*'),\s*'([^']*)'/g;
    
    let match;
    while ((match = regex.exec(sql)) !== null) {
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
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setStatus("Reading file...");

    const text = await file.text();
    setStatus("Parsing users from SQL...");

    const users = parseUsersFromSQL(text);
    setTotal(users.length);
    setStatus(`Found ${users.length} user records. Importing...`);

    // Send in batches of 200
    const batchSize = 200;
    let imported = 0;
    let errors = 0;

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      
      try {
        const { data, error } = await supabase.functions.invoke("import-users", {
          body: { users: batch.map(u => ({
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            email: u.email,
            country_code: u.country_code,
            gender: u.gender,
            mobile_number: u.mobile_number,
            user_type: u.user_type,
            status: u.status,
          }))},
        });

        if (error) {
          console.error("Batch error:", error);
          errors++;
        } else {
          imported += data?.inserted || batch.length;
        }
      } catch (err) {
        console.error("Request error:", err);
        errors++;
      }

      setProgress(Math.min(i + batchSize, users.length));
      setStatus(`Imported ${Math.min(i + batchSize, users.length)} / ${users.length} users${errors ? ` (${errors} batch errors)` : ""}`);
    }

    setStatus(`✅ Done! Imported ${imported} users from ${users.length} records. ${errors ? `${errors} batch errors.` : ""}`);
    setImporting(false);
  };

  const parseVehiclesFromSQL = (sql: string) => {
    const vehicles: any[] = [];
    const regex = /\((\d+),\s*(\d+),\s*(?:(\d+)|NULL),\s*\d+,\s*\d+,\s*'[^']*',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+),\s*'([^']*)',\s*'([^']*)',\s*'[^']*',\s*'([^']*)'\)/g;
    let match;
    while ((match = regex.exec(sql)) !== null) {
      vehicles.push({
        id: parseInt(match[1]),
        user_id: parseInt(match[2]),
        company_id: match[3] ? parseInt(match[3]) : null,
        vehicle_type: match[4],
        vehicle_name: match[5],
        vehicle_number: match[6],
        is_active: parseInt(match[7]),
        year: match[8],
        color: match[9],
        status: match[10],
      });
    }
    return vehicles;
  };

  const handleVehicleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVehicleImporting(true);
    setVehicleStatus("Reading file...");
    const text = await file.text();
    const vehicles = parseVehiclesFromSQL(text);
    setVehicleStatus(`Found ${vehicles.length} vehicles. Importing...`);

    try {
      const { data, error } = await supabase.functions.invoke("import-vehicles", {
        body: { vehicles },
      });
      if (error) {
        setVehicleStatus(`❌ Error: ${error.message}`);
      } else {
        setVehicleStatus(`✅ Done! Inserted: ${data.inserted}, Skipped: ${data.skipped}${data.drivers_not_found?.length ? `. Drivers not found (legacy IDs): ${data.drivers_not_found.join(", ")}` : ""}`);
      }
    } catch (err: any) {
      setVehicleStatus(`❌ Error: ${err.message}`);
    }
    setVehicleImporting(false);
  };
  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Import Users</h1>
        <p className="text-muted-foreground text-sm">
          Upload your MySQL SQL dump file to import all users into the database.
        </p>

        <input
          type="file"
          accept=".sql"
          onChange={handleFileUpload}
          disabled={importing}
          className="w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-semibold hover:file:opacity-90"
        />

        {status && (
          <div className="bg-surface rounded-xl p-4 space-y-2">
            <p className="text-sm text-foreground">{status}</p>
            {total > 0 && (
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${(progress / total) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        <hr className="border-border" />

        <h2 className="text-xl font-bold text-foreground">Import Vehicles</h2>
        <p className="text-muted-foreground text-sm">
          Upload the MySQL SQL dump for vehicles. Vehicles will be matched to drivers via legacy user IDs.
        </p>

        <input
          type="file"
          accept=".sql"
          onChange={handleVehicleUpload}
          disabled={vehicleImporting}
          className="w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-semibold hover:file:opacity-90"
        />

        {vehicleStatus && (
          <div className="bg-surface rounded-xl p-4">
            <p className="text-sm text-foreground">{vehicleStatus}</p>
          </div>
        )}

        <a href="/" className="text-sm text-primary underline block">
          ← Back to app
        </a>
      </div>
    </div>
  );
};

export default ImportUsers;
