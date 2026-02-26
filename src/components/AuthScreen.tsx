import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Phone, ArrowRight, Loader2, X, Shield, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import hdaLogo from "@/assets/hda-logo.png";

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_number: string;
  gender: string;
  status: string;
  monthly_fee?: number;
  fee_free_until?: string | null;
}

interface AuthScreenProps {
  onLogin: (profile: UserProfile | null, isDriver: boolean, phoneNumber?: string) => void;
  mode?: "passenger" | "driver";
}

const AuthScreen = ({ onLogin, mode = "passenger" }: AuthScreenProps) => {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [legalModal, setLegalModal] = useState<"privacy" | "terms" | null>(null);
  const [legalContent, setLegalContent] = useState<{ privacy: string; terms: string }>({ privacy: "", terms: "" });

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("system_settings").select("key, value").in("key", ["privacy_notice", "terms_of_service"]);
      const privacy = data?.find((s: any) => s.key === "privacy_notice")?.value || "";
      const terms = data?.find((s: any) => s.key === "terms_of_service")?.value || "";
      setLegalContent({ privacy: typeof privacy === "string" ? privacy : JSON.stringify(privacy), terms: typeof terms === "string" ? terms : JSON.stringify(terms) });
    };
    load();
  }, []);

  const handlePhoneSubmit = async () => {
    if (phone.length < 7) return;
    setLoading(true);
    setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("send-otp", {
        body: { phone_number: phone },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      setStep("otp");
      toast({ title: "OTP sent!", description: `Code sent to +960 ${phone}` });
    } catch (err: any) {
      console.error("Send OTP failed:", err);
      setError(err.message || "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (code: string) => {
    setLoading(true);
    setError("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-otp", {
        body: { phone_number: phone, code },
      });

      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || "Invalid code");

      // After OTP verified, look up the user profile
      const { data: profileData, error: profileError } = await supabase.functions.invoke("lookup-profile", {
        body: { phone_number: phone },
      });

      if (profileError) {
        console.error("Profile lookup failed:", profileError);
      }

      const profile = profileData?.found ? profileData.profile : null;
      const isDriver = profileData?.is_driver || false;

      toast({ 
        title: "Verified!", 
        description: profile 
          ? `Welcome back, ${profile.first_name}!` 
          : "Login successful" 
      });
      
      onLogin(profile, isDriver, phone);
    } catch (err: any) {
      console.error("Verify OTP failed:", err);
      setError(err.message || "Invalid code. Please try again.");
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setOtp(["", "", "", "", "", ""]);
    setError("");
    setLoading(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("send-otp", {
        body: { phone_number: phone },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: "Code resent!", description: `New code sent to +960 ${phone}` });
    } catch (err: any) {
      setError(err.message || "Failed to resend. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    if (newOtp.every((d) => d !== "")) {
      const code = newOtp.join("");
      setTimeout(() => handleVerify(code), 300);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col max-w-md mx-auto">
      <div className="flex-1 flex flex-col justify-center px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-16 h-16 rounded-2xl overflow-hidden">
              <img src={hdaLogo} alt="HDA Taxi" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
                HDA <span className="text-primary">{mode === "driver" ? "DRIVER" : "TAXI"}</span>
              </h1>
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {step === "phone" ? (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-2xl font-bold text-foreground">{mode === "driver" ? "Driver Login" : "Welcome"}</h2>
                <p className="text-muted-foreground mt-1">{mode === "driver" ? "Enter your registered driver phone number" : "Enter your phone number to continue"}</p>
              </div>

              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  <span className="text-sm font-semibold">+960</span>
                  <div className="w-px h-5 bg-border" />
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 7))}
                  placeholder="7XX XXXX"
                  className="w-full pl-24 pr-4 py-4 bg-surface rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-base font-medium"
                  autoFocus
                  disabled={loading}
                />
              </div>

              <button
                onClick={handlePhoneSubmit}
                disabled={phone.length < 7 || loading}
                className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="otp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-2xl font-bold text-foreground">Verification</h2>
                <p className="text-muted-foreground mt-1">
                  Code sent to <span className="font-semibold text-foreground">+960 {phone}</span>
                </p>
              </div>

              <div className="flex gap-3 justify-center py-4">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="tel"
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    maxLength={1}
                    className="w-12 h-14 text-center text-2xl font-bold bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus={i === 0}
                    disabled={loading}
                  />
                ))}
              </div>

              {loading && (
                <div className="flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}

              <button
                onClick={handleResend}
                disabled={loading}
                className="w-full text-center text-sm text-primary font-medium py-2 disabled:opacity-40"
              >
                Resend code
              </button>

              <button
                onClick={() => { setStep("phone"); setError(""); setOtp(["", "", "", "", "", ""]); }}
                className="w-full text-center text-sm text-muted-foreground font-medium py-1"
              >
                Change number
              </button>
            </motion.div>
          )}
        </motion.div>
      </div>

      <div className="px-8 pb-8">
        <p className="text-xs text-muted-foreground text-center">
          By continuing, you agree to our{" "}
          <button onClick={() => setLegalModal("terms")} className="text-primary underline">Terms of Service</button>
          {" "}and{" "}
          <button onClick={() => setLegalModal("privacy")} className="text-primary underline">Privacy Policy</button>
        </p>
      </div>

      {/* Legal Modal */}
      {legalModal && (
        <div className="fixed inset-0 z-[999] bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLegalModal(null)}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                {legalModal === "privacy" ? <Shield className="w-5 h-5 text-primary" /> : <FileText className="w-5 h-5 text-primary" />}
                <h3 className="font-semibold text-foreground">{legalModal === "privacy" ? "Privacy Notice" : "Terms of Service"}</h3>
              </div>
              <button onClick={() => setLegalModal(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {legalModal === "privacy" ? legalContent.privacy : legalContent.terms}
              </p>
            </div>
            <div className="p-4 border-t border-border">
              <button onClick={() => setLegalModal(null)} className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl text-sm">
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default AuthScreen;
