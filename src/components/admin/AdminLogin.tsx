import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Phone, ArrowRight, Loader2, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import SystemLogo from "@/components/SystemLogo";

interface AdminLoginProps {
  onLogin: (phone: string) => Promise<boolean>;
}

const AdminLogin = ({ onLogin }: AdminLoginProps) => {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

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
      setError(err.message || "Failed to send OTP");
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
      const success = await onLogin(phone);
      if (!success) {
        setError("You don't have admin access");
        setOtp(["", "", "", "", "", ""]);
      }
    } catch (err: any) {
      setError(err.message || "Verification failed");
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
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
    <div className="min-h-screen bg-background flex items-center justify-center p-5">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xs space-y-5"
      >
        {/* Logo + branding */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center mx-auto shadow-sm">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <SystemLogo className="w-6 h-6 object-contain" alt="Admin" />
            <h1 className="text-lg font-extrabold text-foreground">
              <span className="text-primary">ADMIN</span>
            </h1>
          </div>
          <p className="text-[11px] text-muted-foreground">Login with your admin phone number</p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive text-xs px-3 py-2.5 rounded-xl font-medium">{error}</div>
        )}

        {step === "phone" ? (
          <div className="space-y-3">
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
                className="w-full pl-[5.5rem] pr-3 py-3 bg-surface rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm font-medium transition-shadow"
                autoFocus
                disabled={loading}
              />
            </div>
            <button
              onClick={handlePhoneSubmit}
              disabled={phone.length < 7 || loading}
              className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98] transition-all shadow-md shadow-primary/20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-3.5 h-3.5" /></>}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              Code sent to <span className="font-semibold text-foreground">+960 {phone}</span>
            </p>
            <div className="flex gap-2 justify-center py-1">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="tel"
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  maxLength={1}
                   className="w-10 h-11 text-center text-lg font-bold bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                   autoComplete={i === 0 ? "one-time-code" : "off"}
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
            <button
              onClick={() => { setStep("phone"); setError(""); setOtp(["", "", "", "", "", ""]); }}
              className="w-full text-center text-xs text-muted-foreground font-medium py-1"
            >
              ← Change number
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AdminLogin;
