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
    if (phone.length >= 9) {
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
      {/* Header */}
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
                <h2 className="text-2xl font-bold text-foreground">Bienvenue</h2>
                <p className="text-muted-foreground mt-1">Entrez votre numéro de téléphone pour continuer</p>
              </div>

              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  <span className="text-sm font-semibold">+212</span>
                  <div className="w-px h-5 bg-border" />
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="6XX XXX XXX"
                  className="w-full pl-24 pr-4 py-4 bg-surface rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary text-base font-medium"
                  autoFocus
                />
              </div>

              <button
                onClick={handlePhoneSubmit}
                disabled={phone.length < 9}
                className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl text-base transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Continuer
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
                <h2 className="text-2xl font-bold text-foreground">Vérification</h2>
                <p className="text-muted-foreground mt-1">
                  Code envoyé au <span className="font-semibold text-foreground">+212 {phone}</span>
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
                Renvoyer le code
              </button>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Footer */}
      <div className="px-8 pb-8">
        <p className="text-xs text-muted-foreground text-center">
          En continuant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité
        </p>
      </div>
    </div>
  );
};

export default AuthScreen;
