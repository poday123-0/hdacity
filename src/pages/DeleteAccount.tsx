import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/hooks/use-branding";
import { Trash2, ArrowLeft, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

const DeleteAccount = () => {
  const { appName, logoUrl } = useBranding();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "verify" | "done">("phone");
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!phone || phone.length < 7) {
      toast({ title: "Enter a valid phone number", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const fullPhone = phone.startsWith("+") ? phone : `+960${phone.replace(/^0+/, "")}`;
      const { error } = await supabase.functions.invoke("send-otp", {
        body: { phone_number: fullPhone },
      });
      if (error) throw error;
      setStep("verify");
      toast({ title: "Verification code sent" });
    } catch {
      toast({ title: "Failed to send code", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleVerifyAndDelete = async () => {
    if (!otp || otp.length < 4) {
      toast({ title: "Enter the verification code", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const fullPhone = phone.startsWith("+") ? phone : `+960${phone.replace(/^0+/, "")}`;
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify-otp", {
        body: { phone_number: fullPhone, code: otp },
      });
      if (verifyError || !verifyData?.valid) {
        toast({ title: "Invalid or expired code", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Look up user by phone and delete
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone_number", fullPhone)
        .single();

      if (!profile) {
        toast({ title: "No account found with this number", variant: "destructive" });
        setLoading(false);
        return;
      }

      const { error: deleteError } = await supabase.functions.invoke("delete-account", {
        body: { user_id: profile.id },
      });
      if (deleteError) throw deleteError;

      setStep("done");
    } catch {
      toast({ title: "Failed to delete account", variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col overflow-y-auto" style={{ height: "100dvh" }}>
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b px-4 pt-[env(safe-area-inset-top,12px)] pb-3 flex items-center gap-3">
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
            <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Trash2 className="w-4 h-4 text-destructive" />
            </div>
          )}
          <h1 className="text-sm font-bold text-foreground">Delete Account</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-md mx-auto space-y-6">
          <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">This action is permanent</p>
              <p className="text-xs text-muted-foreground mt-1">
                Deleting your account will remove all your personal data, trip history, and wallet balance. This cannot be undone.
              </p>
            </div>
          </div>

          {step === "done" ? (
            <div className="bg-card rounded-2xl border p-6 text-center space-y-3">
              <Trash2 className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-semibold text-foreground">Account Deleted</p>
              <p className="text-xs text-muted-foreground">
                Your account and personal data have been removed from our system.
              </p>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                To delete your account, verify your phone number first.
              </p>

              <div>
                <label className="text-xs font-medium text-foreground">Phone Number</label>
                <input
                  type="tel"
                  placeholder="e.g. 7771234"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={step === "verify"}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                />
              </div>

              {step === "verify" && (
                <div>
                  <label className="text-xs font-medium text-foreground">Verification Code</label>
                  <input
                    type="text"
                    placeholder="Enter code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full mt-1 px-3 py-2.5 rounded-xl border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              )}

              {step === "phone" ? (
                <button
                  onClick={handleSendOtp}
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send Verification Code"}
                </button>
              ) : (
                <button
                  onClick={handleVerifyAndDelete}
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-50"
                >
                  {loading ? "Deleting..." : "Verify & Delete My Account"}
                </button>
              )}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground/60 text-center">{appName || "HDA APP"}</p>
        </div>
      </div>
    </div>
  );
};

export default DeleteAccount;
