import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, ArrowRight, Loader2, X, Shield, FileText, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import SystemLogo from "@/components/SystemLogo";
import { useBranding } from "@/hooks/use-branding";

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
  const [legalContent, setLegalContent] = useState<{privacy: string;terms: string;}>({ privacy: "", terms: "" });
  const { appName } = useBranding();

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
      navigator.credentials.
      get({ otp: { transport: ["sms"] }, signal: ac.signal } as any).
      then((otpCredential: any) => {
        if (otpCredential?.code) {
          const digits = otpCredential.code.split("");
          setOtp(digits);
          digits.forEach((d: string, i: number) => {
            if (otpRefs.current[i]) otpRefs.current[i]!.value = d;
          });
          setTimeout(() => handleVerify(otpCredential.code), 300);
        }
      }).
      catch(() => {});
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
    <div className="fixed inset-0 z-40 bg-background flex flex-col overflow-hidden">
      {/* Animated background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="absolute -bottom-1/3 -left-1/3 w-2/3 h-2/3 rounded-full bg-primary/[0.06] blur-3xl" />
      </div>

      {/* Top hero section */}
      <div className="relative pt-[env(safe-area-inset-top,0px)]">
        <div className="relative overflow-hidden">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary-dark" />
          
          {/* Decorative circles */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="absolute -top-20 -right-20 w-56 h-56 rounded-full border border-primary-foreground/10" />
          
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
            className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full border border-primary-foreground/10" />
          

          <div className="relative flex flex-col items-center py-10 sm:py-14 px-6">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 15, stiffness: 200 }}
              className="w-28 h-28 rounded-[1.5rem] bg-primary-foreground/20 backdrop-blur-md flex items-center justify-center p-3 shadow-lg shadow-black/10 ring-1 ring-primary-foreground/20">
              
              <motion.div
                animate={{ rotateY: [0, 360] }}
                transition={{ duration: 2, delay: 0.5, ease: "easeInOut" }}
                className="w-full h-full"
              >
                <SystemLogo className="w-full h-full object-contain drop-shadow-sm" alt="HDA" />
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-4 text-center">
              
              <h1 className="text-2xl font-extrabold text-primary-foreground tracking-tight">
                {appName || "HDA"} 
              </h1>
              <div className="flex items-center justify-center gap-1.5 mt-1.5">
                <Sparkles className="w-3 h-3 text-primary-foreground/50" />
                <p className="text-[11px] text-primary-foreground/60 font-medium tracking-widest uppercase">
                  On Time · Every Time
                </p>
                <Sparkles className="w-3 h-3 text-primary-foreground/50" />
              </div>
            </motion.div>
          </div>

          {/* Curved bottom edge */}
          <div className="absolute bottom-0 left-0 right-0">
            <svg viewBox="0 0 1440 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
              <path d="M0 48h1440V0C1200 40 960 48 720 48S240 40 0 0v48z" fill="hsl(var(--background))" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col justify-between max-w-md mx-auto w-full relative z-10">
        <div className="flex-1 flex flex-col justify-center px-6">
          <AnimatePresence mode="wait">
            {error &&
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-destructive/10 border border-destructive/20 text-destructive text-xs px-4 py-3 rounded-2xl mb-4 font-medium flex items-center gap-2">
              
                <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                {error}
              </motion.div>
            }

            {step === "phone" ?
            <motion.div
              key="phone"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ type: "spring", damping: 20, stiffness: 200 }}
              className="space-y-5">
              
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {mode === "driver" ? "Driver Login" : "Welcome back"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {mode === "driver" ? "Enter your registered phone number" : "Enter your phone number to get started"}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-muted-foreground">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Phone className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="text-sm font-semibold text-foreground">+960</span>
                      <div className="w-px h-5 bg-border" />
                    </div>
                    <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 7))}
                    placeholder="7XX XXXX"
                    className="w-full pl-[7.5rem] pr-4 py-4 bg-surface rounded-2xl text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-background text-base font-medium transition-all border border-border/50 shadow-sm"
                    autoFocus
                    disabled={loading} />
                  
                  </div>

                  <motion.button
                  onClick={handlePhoneSubmit}
                  disabled={phone.length < 7 || loading}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-gradient-to-r from-primary to-primary-dark text-primary-foreground font-semibold py-4 rounded-2xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30">
                  
                    {loading ?
                  <Loader2 className="w-5 h-5 animate-spin" /> :

                  <>Continue <ArrowRight className="w-4 h-4" /></>
                  }
                  </motion.button>
                </div>
              </motion.div> :

            <motion.div
              key="otp"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 200 }}
              className="space-y-5">
              
                <div>
                  <h2 className="text-xl font-bold text-foreground">Verify your number</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    We sent a 6-digit code to <span className="font-semibold text-foreground">+960 {phone}</span>
                  </p>
                </div>

                <div className="flex gap-2.5 justify-center py-2">
                  {otp.map((digit, i) =>
                <motion.input
                  key={i}
                  ref={(el) => {otpRefs.current[i] = el;}}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  type="tel"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  maxLength={1}
                  className={`w-12 h-14 text-center text-xl font-bold rounded-2xl text-foreground focus:outline-none transition-all border shadow-sm ${
                  digit ?
                  "bg-primary/10 border-primary/30 ring-2 ring-primary/20" :
                  "bg-surface border-border/50 focus:ring-2 focus:ring-primary/30 focus:border-primary/30"}`
                  }
                  autoFocus={i === 0}
                  disabled={loading} />

                )}
                </div>

                {loading &&
              <div className="flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
              }

                <div className="flex items-center justify-center gap-4 pt-1">
                  <button
                  onClick={handleResend}
                  disabled={loading}
                  className="text-xs text-primary font-semibold py-2 px-4 rounded-xl hover:bg-primary/10 active:scale-95 transition-all disabled:opacity-40">
                  
                    Resend code
                  </button>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <button
                  onClick={() => {setStep("phone");setError("");setOtp(["", "", "", "", "", ""]);}}
                  className="text-xs text-muted-foreground font-medium py-2 px-3 rounded-xl hover:bg-muted active:scale-95 transition-all">
                  
                    Change number
                  </button>
                </div>
              </motion.div>
            }
          </AnimatePresence>
        </div>

        <div className="px-6 pb-6 pt-3">
          <p className="text-[10px] text-muted-foreground/70 text-center leading-relaxed">
            By continuing, you agree to our{" "}
            <button onClick={() => setLegalModal("terms")} className="text-primary/80 font-medium underline underline-offset-2 hover:text-primary">Terms</button>
            {" "}and{" "}
            <button onClick={() => setLegalModal("privacy")} className="text-primary/80 font-medium underline underline-offset-2 hover:text-primary">Privacy Policy</button>
          </p>
        </div>
      </div>

      {/* Legal Modal */}
      <AnimatePresence>
        {legalModal &&
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999] bg-foreground/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setLegalModal(null)}>
          
            <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    {legalModal === "privacy" ? <Shield className="w-4 h-4 text-primary" /> : <FileText className="w-4 h-4 text-primary" />}
                  </div>
                  <h3 className="text-sm font-bold text-foreground">{legalModal === "privacy" ? "Privacy Notice" : "Terms of Service"}</h3>
                </div>
                <button onClick={() => setLegalModal(null)} className="text-muted-foreground hover:text-foreground p-1.5 rounded-xl hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
              </div>
              <div className="px-5 py-5 overflow-y-auto flex-1">
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {legalModal === "privacy" ? legalContent.privacy : legalContent.terms}
                </p>
              </div>
              <div className="px-5 py-4 border-t border-border">
                <button onClick={() => setLegalModal(null)} className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-2xl text-xs shadow-md shadow-primary/20">
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        }
      </AnimatePresence>
    </div>);

};

export default AuthScreen;