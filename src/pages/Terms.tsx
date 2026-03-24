import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/hooks/use-branding";
import { FileText } from "lucide-react";

const Terms = () => {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const { appName } = useBranding();

  useEffect(() => {
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "terms_of_service")
      .single()
      .then(({ data }) => {
        setContent(typeof data?.value === "string" ? data.value : JSON.stringify(data?.value || ""));
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Terms of Service</h1>
        </div>
        <div className="bg-card rounded-2xl border p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : content ? (
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{content}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No terms of service have been configured yet.</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-4 text-center">{appName || "HDA APP"}</p>
      </div>
    </div>
  );
};

export default Terms;
