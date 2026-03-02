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

  // WebOTP API: auto-read OTP from SMS on supported devices
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
      handleVerify(code);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      {/* Top decorative section */}
      <div className="relative bg-primary pt-[env(safe-area-inset-top,0px)]">
        <div className="flex flex-col items-center justify-center py-10 sm:py-14">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 15, stiffness: 200 }}
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-primary-foreground/15 backdrop-blur-sm flex items-center justify-center p-2.5 shadow-lg"
          >
            <SystemLogo className="w-full h-full object-contain" alt="HDA Taxi" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-2xl sm:text-3xl font-extrabold text-primary-foreground tracking-tight mt-4"
          >
            HDA <span className="opacity-80">{mode === "driver" ? "DRIVER" : "TAXI"}</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-primary-foreground/70 text-xs sm:text-sm mt-1 font-medium"
          >
            On Time . Every Time
          </motion.p>
        </div>
        {/* Curved bottom */}
        <div className="absolute -bottom-px left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" className="w-full h-6 sm:h-8">
            <path d="M0 0h1440v30C1240 58 200 58 0 30V0z" className="fill-background" />
          </svg>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col justify-between max-w-lg mx-auto w-full">
        <div className="flex-1 flex flex-col justify-center px-6 sm:px-8">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-xl mb-4"
              >
                {error}
              </motion.div>
            )}

            {step === "phone" ? (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                    {mode === "driver" ? "Driver Login" : "Welcome"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {mode === "driver" ? "Enter your registered phone number" : "Enter your phone number to get started"}
                  </p>
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
                    className="w-full pl-24 pr-4 py-4 sm:py-5 bg-surface rounded-2xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-base sm:text-lg font-medium"
                    autoFocus
                    disabled={loading}
                  />
                </div>

                <button
                  onClick={handlePhoneSubmit}
                  disabled={phone.length < 7 || loading}
                  className="w-full bg-primary text-primary-foreground font-bold py-4 sm:py-5 rounded-2xl text-base sm:text-lg transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-foreground">Verification</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Code sent to <span className="font-semibold text-foreground">+960 {phone}</span>
                  </p>
                </div>

                <div className="flex gap-2.5 sm:gap-3 justify-center py-3">
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
                      className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl sm:text-3xl font-bold bg-surface rounded-2xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
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

                <div className="flex flex-col items-center gap-2 pt-2">
                  <button
                    onClick={handleResend}
                    disabled={loading}
                    className="text-sm text-primary font-semibold py-2 px-4 rounded-xl active:scale-95 transition-transform disabled:opacity-40"
                  >
                    Resend code
                  </button>

                  <button
                    onClick={() => { setStep("phone"); setError(""); setOtp(["", "", "", "", "", ""]); }}
                    className="text-sm text-muted-foreground font-medium py-1"
                  >
                    ← Change number
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="px-6 sm:px-8 pb-6 sm:pb-8 pt-4">
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            By continuing, you agree to our{" "}
            <button onClick={() => setLegalModal("terms")} className="text-primary font-medium underline underline-offset-2">Terms of Service</button>
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
            className="fixed inset-0 z-[999] bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setLegalModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AuthScreen;
