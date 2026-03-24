import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/hooks/use-branding";
import { Shield, ArrowLeft } from "lucide-react";

const Privacy = () => {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const { appName, logoUrl } = useBranding();
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "privacy_notice")
      .single()
      .then(({ data }) => {
        setContent(typeof data?.value === "string" ? data.value : JSON.stringify(data?.value || ""));
        setLoading(false);
      });
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col overflow-y-auto" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-foreground" />
        </button>
        <div className="flex items-center gap-2.5">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-7 h-7 rounded-lg object-contain" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
          )}
          <h1 className="text-sm font-bold text-foreground">Privacy Policy</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-card rounded-2xl border p-5 shadow-sm">
            {loading ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-3 bg-muted rounded-full animate-pulse" style={{ width: `${70 + Math.random() * 30}%` }} />
                ))}
              </div>
            ) : content ? (
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{content}</p>
            ) : (
              <div className="text-center py-10">
                <Shield className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No privacy policy has been configured yet.</p>
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-6 text-center">{appName || "HDA APP"}</p>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
