import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const ImportUsers = () => {
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [importing, setImporting] = useState(false);

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

        <a href="/" className="text-sm text-primary underline block">
          ← Back to app
        </a>
      </div>
    </div>
  );
};

export default ImportUsers;
