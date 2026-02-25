import { Phone, MessageSquare, X, Star, Landmark, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import TripChat from "./TripChat";

interface BankAccountInfo {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  is_primary: boolean;
}

interface DriverInfo {
  name?: string;
  initials?: string;
  rating?: number;
  vehicle?: string;
  plate?: string;
  phone?: string;
  avatar_url?: string | null;
  bank_accounts?: BankAccountInfo[];
}

interface DriverMatchingProps {
  onCancel: () => void;
  driver?: DriverInfo;
  tripId?: string;
  userId?: string;
  tripStatus?: string;
  showBankDetails?: boolean;
}

const DriverMatching = ({ onCancel, driver, tripId, userId, tripStatus, showBankDetails = false }: DriverMatchingProps) => {
  const driverName = driver?.name || "Driver";
  const initials = driver?.initials || driverName.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const rating = driver?.rating || 4.9;
  const vehicle = driver?.vehicle || "";
  const plate = driver?.plate || "";
  const phone = driver?.phone || "";
  const avatarUrl = driver?.avatar_url;
  const bankAccounts = driver?.bank_accounts || [];
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllBanks, setShowAllBanks] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [bankLogos, setBankLogos] = useState<Record<string, string>>({});

  // Fetch bank logos
  useEffect(() => {
    supabase.from("banks").select("name, logo_url").eq("is_active", true).then(({ data }) => {
      if (data) {
        const logos: Record<string, string> = {};
        data.forEach((b: any) => { if (b.logo_url) logos[b.name] = b.logo_url; });
        setBankLogos(logos);
      }
    });
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast({ title: "Copied!", description: "Account number copied to clipboard" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const primaryBank = bankAccounts.find((b) => b.is_primary) || bankAccounts[0];
  const otherBanks = bankAccounts.filter((b) => b.id !== primaryBank?.id);

  const statusLabel = tripStatus === "in_progress"
    ? "Trip in progress"
    : tripStatus === "arrived"
      ? "Driver has arrived!"
      : "Driver is on the way";

  const etaLabel = tripStatus === "in_progress"
    ? "In progress"
    : tripStatus === "arrived"
      ? "At pickup"
      : "3 min";

  return (
    <>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] z-10 max-h-[80vh] overflow-y-auto"
      >
        <div className="p-4 pb-6 space-y-4">
          <div className="flex justify-center">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>

          {/* Driver info */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-3 h-3 rounded-full bg-primary animate-pulse-dot absolute -top-1 -right-1 z-10" />
              <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Driver" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-foreground">{initials}</span>
                )}
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-foreground">{driverName}</h3>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Star className="w-4 h-4 text-primary fill-primary" />
                <span>{rating}</span>
                {vehicle && <><span>•</span><span className="truncate">{vehicle}</span></>}
              </div>
              {plate && <p className="text-xs text-muted-foreground mt-0.5">{plate}</p>}
            </div>
          </div>

          {/* ETA / Status */}
          <div className="bg-primary/10 rounded-xl p-4 text-center">
            <p className="text-xs text-primary font-semibold">
              {tripStatus === "arrived" ? "Driver arrived" : tripStatus === "in_progress" ? "Trip status" : "Estimated arrival"}
            </p>
            <p className="text-2xl font-bold text-primary">{etaLabel}</p>
            <p className="text-xs text-muted-foreground">{statusLabel}</p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <a href={`tel:${phone}`} className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3 font-semibold active:scale-[0.98] transition-transform">
              <Phone className="w-4 h-4" />
              Call
            </a>
            <button
              onClick={() => setShowChat(true)}
              className="flex-1 flex items-center justify-center gap-2 bg-surface text-foreground rounded-xl py-3 font-semibold active:scale-[0.98] transition-transform"
            >
              <MessageSquare className="w-4 h-4" />
              Message
            </button>
          </div>

          {/* Bank accounts - show during trip or when explicitly requested */}
          {(showBankDetails || tripStatus === "in_progress") && primaryBank && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-primary" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment Details</p>
              </div>

              <BankCard bank={primaryBank} copiedId={copiedId} onCopy={copyToClipboard} logoUrl={bankLogos[primaryBank.bank_name]} />

              {otherBanks.length > 0 && (
                <>
                  <button
                    onClick={() => setShowAllBanks(!showAllBanks)}
                    className="w-full flex items-center justify-center gap-1 text-xs text-primary font-semibold py-1"
                  >
                    {showAllBanks ? "Hide" : `Show ${otherBanks.length} more`}
                    {showAllBanks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <AnimatePresence>
                    {showAllBanks && otherBanks.map((bank) => (
                      <motion.div key={bank.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                        <BankCard bank={bank} copiedId={copiedId} onCopy={copyToClipboard} logoUrl={bankLogos[bank.bank_name]} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </>
              )}
            </div>
          )}

          {/* Cancel */}
          {tripStatus !== "in_progress" && (
            <button
              onClick={onCancel}
              className="w-full flex items-center justify-center gap-2 text-destructive text-sm font-medium py-2 active:scale-95 transition-transform"
            >
              <X className="w-4 h-4" />
              Cancel ride
            </button>
          )}
        </div>
      </motion.div>

      {/* Chat modal */}
      {tripId && (
        <TripChat
          tripId={tripId}
          senderId={userId}
          senderType="passenger"
          isOpen={showChat}
          onClose={() => setShowChat(false)}
        />
      )}
    </>
  );
};

const BankCard = ({
  bank,
  copiedId,
  onCopy,
  logoUrl,
}: {
  bank: BankAccountInfo;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  logoUrl?: string;
}) => (
  <div className="bg-surface rounded-xl p-3 space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {logoUrl ? (
          <img src={logoUrl} alt={bank.bank_name} className="w-6 h-6 rounded object-contain" />
        ) : null}
        <span className="text-sm font-semibold text-foreground">{bank.bank_name}</span>
      </div>
      {bank.is_primary && (
        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Primary</span>
      )}
    </div>
    <div className="flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Account number</p>
        <p className="text-sm font-mono font-semibold text-foreground">{bank.account_number}</p>
      </div>
      <button
        onClick={() => onCopy(bank.account_number, bank.id)}
        className="w-9 h-9 rounded-xl bg-card flex items-center justify-center active:scale-90 transition-transform"
      >
        {copiedId === bank.id ? (
          <Check className="w-4 h-4 text-primary" />
        ) : (
          <Copy className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
    </div>
    {bank.account_name && (
      <p className="text-xs text-muted-foreground">Name: <span className="font-medium text-foreground">{bank.account_name}</span></p>
    )}
  </div>
);

export default DriverMatching;
