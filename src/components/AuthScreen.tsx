import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Phone, ArrowRight, Car } from "lucide-react";

interface AuthScreenProps {
  onLogin: () => void;
}

const AuthScreen = ({ onLogin }: AuthScreenProps) => {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handlePhoneSubmit = () => {
    if (phone.length >= 7) {
      setStep("otp");
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 3) {
      otpRefs.current[index + 1]?.focus();
    }

    if (newOtp.every((d) => d !== "")) {
      setTimeout(onLogin, 500);
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
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
              <Car className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
                HDA <span className="text-primary">TAXI</span>
              </h1>
            </div>
          </div>

          {step === "phone" ? (
            <motion.div
              key="phone"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-2xl font-bold text-foreground">Welcome</h2>
                <p className="text-muted-foreground mt-1">Enter your phone number to continue</p>
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
                />
              </div>

              <button
                onClick={handlePhoneSubmit}
                disabled={phone.length < 7}
                className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
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
                    className="w-16 h-16 text-center text-2xl font-bold bg-surface rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <button
                onClick={() => setStep("phone")}
                className="w-full text-center text-sm text-primary font-medium py-2"
              >
                Resend code
              </button>
            </motion.div>
          )}
        </motion.div>
      </div>

      <div className="px-8 pb-8">
        <p className="text-xs text-muted-foreground text-center">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
};

export default AuthScreen;
