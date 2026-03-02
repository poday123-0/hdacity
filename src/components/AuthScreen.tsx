import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, ArrowRight, Loader2, X, Shield, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import SystemLogo from "@/components/SystemLogo";

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
  avatar_url?: string | null;
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

  // WebOTP API
  useEffect(() => {
    if (step !== "otp") return;
    const ac = new AbortController();
    if ("OTPCredential" in window) {
      navigator.credentials
        .get({ otp: { transport: ["sms"] }, signal: ac.signal } as any)
        .then((otpCredential: any) => {
          if (otpCredential?.code) {
            const digits = otpCredential.code.split("");
            setOtp(digits);
            digits.forEach((d: string, i: number) => {
              if (otpRefs.current[i]) otpRefs.current[i]!.value = d;
            });
            setTimeout(() => handleVerify(otpCredential.code), 300);
          }
        })
        .catch(() => {});
    }
    return () => ac.abort();
  }, [step]);

  const handlePhoneSubmit = async () => {
    if (phone.length < 7) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("send-otp", { body: { phone_number: phone } });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);
      setStep("otp");
      toast({ title: "OTP sent!", description: `Code sent to +960 ${phone}` });
    } catch (err: any) {
      setError(err.message || "Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (code: string) => {
    setLoading(true);
    setError("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-otp", { body: { phone_number: phone, code } });
      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || "Invalid code");
      const { data: profileData, error: profileError } = await supabase.functions.invoke("lookup-profile", { body: { phone_number: phone } });
      if (profileError) console.error("Profile lookup failed:", profileError);
      const profile = profileData?.found ? profileData.profile : null;
      const isDriver = profileData?.is_driver || false;
      toast({ title: "Verified!", description: profile ? `Welcome back, ${profile.first_name}!` : "Login successful" });
      onLogin(profile, isDriver, phone);
    } catch (err: any) {
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
      const { data, error: fnError } = await supabase.functions.invoke("send-otp", { body: { phone_number: phone } });
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
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (newOtp.every((d) => d !== "")) handleVerify(newOtp.join(""));
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      {/* Compact header with gradient */}
      <div className="relative bg-gradient-to-br from-primary to-primary-dark pt-[env(safe-area-inset-top,0px)]">
        <div className="flex items-center justify-center gap-3 py-6 sm:py-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 18, stiffness: 220 }}
            className="w-12 h-12 rounded-xl bg-primary-foreground/15 backdrop-blur-sm flex items-center justify-center p-1.5 shadow-md"
          >
            <SystemLogo className="w-full h-full object-contain" alt="HDA" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h1 className="text-lg font-extrabold text-primary-foreground tracking-tight leading-none">
              HDA <span className="opacity-70 font-bold">{mode === "driver" ? "DRIVER" : "TAXI"}</span>
            </h1>
            <p className="text-[10px] text-primary-foreground/60 font-medium tracking-wider uppercase mt-0.5">
              On Time · Every Time
            </p>
          </motion.div>
        </div>
        {/* Subtle curve */}
        <div className="absolute -bottom-px left-0 right-0">
          <svg viewBox="0 0 1440 40" fill="none" className="w-full h-4">
            <path d="M0 0h1440v16C1200 38 240 38 0 16V0z" className="fill-background" />
          </svg>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col justify-between max-w-md mx-auto w-full">
        <div className="flex-1 flex flex-col justify-center px-6">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-destructive/10 text-destructive text-xs px-3 py-2.5 rounded-xl mb-3 font-medium"
              >
                {error}
              </motion.div>
            )}

            {step === "phone" ? (
              <motion.div
                key="phone"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-4"
              >
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    {mode === "driver" ? "Driver Login" : "Welcome back"}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {mode === "driver" ? "Enter your registered phone number" : "Enter your phone number to continue"}
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">+960</span>
                    <div className="w-px h-4 bg-border" />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 7))}
                    placeholder="7XX XXXX"
                    className="w-full pl-[5.5rem] pr-3 py-3.5 bg-surface rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm font-medium transition-shadow"
                    autoFocus
                    disabled={loading}
                  />
                </div>

                <button
                  onClick={handlePhoneSubmit}
                  disabled={phone.length < 7 || loading}
                  className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl text-sm transition-all active:scale-[0.98] hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-md shadow-primary/20"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Continue <ArrowRight className="w-3.5 h-3.5" /></>
                  )}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="otp"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div>
                  <h2 className="text-base font-bold text-foreground">Verify your number</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Code sent to <span className="font-semibold text-foreground">+960 {phone}</span>
                  </p>
                </div>

                <div className="flex gap-2 justify-center py-1">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      type="tel"
                      inputMode="numeric"
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      maxLength={1}
                      className="w-11 h-12 text-center text-lg font-bold bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      autoFocus={i === 0}
                      disabled={loading}
                    />
                  ))}
                </div>

                {loading && (
                  <div className="flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                )}

                <div className="flex items-center justify-center gap-3 pt-1">
                  <button
                    onClick={handleResend}
                    disabled={loading}
                    className="text-xs text-primary font-semibold py-1.5 px-3 rounded-lg active:scale-95 transition-transform disabled:opacity-40"
                  >
                    Resend code
                  </button>
                  <span className="text-border">·</span>
                  <button
                    onClick={() => { setStep("phone"); setError(""); setOtp(["", "", "", "", "", ""]); }}
                    className="text-xs text-muted-foreground font-medium py-1.5"
                  >
                    Change number
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="px-6 pb-5 pt-3">
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            By continuing, you agree to our{" "}
            <button onClick={() => setLegalModal("terms")} className="text-primary font-medium underline underline-offset-2">Terms</button>
            {" "}and{" "}
            <button onClick={() => setLegalModal("privacy")} className="text-primary font-medium underline underline-offset-2">Privacy Policy</button>
          </p>
        </div>
      </div>

      {/* Legal Modal */}
      <AnimatePresence>
        {legalModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setLegalModal(null)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  {legalModal === "privacy" ? <Shield className="w-4 h-4 text-primary" /> : <FileText className="w-4 h-4 text-primary" />}
                  <h3 className="text-sm font-semibold text-foreground">{legalModal === "privacy" ? "Privacy Notice" : "Terms of Service"}</h3>
                </div>
                <button onClick={() => setLegalModal(null)} className="text-muted-foreground hover:text-foreground p-1"><X className="w-4 h-4" /></button>
              </div>
              <div className="px-4 py-4 overflow-y-auto flex-1">
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {legalModal === "privacy" ? legalContent.privacy : legalContent.terms}
                </p>
              </div>
              <div className="px-4 py-3 border-t border-border">
                <button onClick={() => setLegalModal(null)} className="w-full bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl text-xs">
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AuthScreen;
