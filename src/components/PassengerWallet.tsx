import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet, ArrowUpRight, ArrowDownLeft, Clock, RefreshCw, Loader2, Plus, Upload, CreditCard, ArrowLeft, CheckCircle, Image } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface WalletTransaction {
  id: string;
  amount: number;
  type: string;
  reason: string;
  status: string;
  created_at: string;
  notes: string | null;
  proof_url: string | null;
}

interface AdminBankInfo {
  bank_name?: string;
  account_number?: string;
  account_name?: string;
}

interface PassengerWalletProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

const PassengerWallet = ({ userId, isOpen, onClose }: PassengerWalletProps) => {
  const [balance, setBalance] = useState(0);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Top-up state
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpSlip, setTopUpSlip] = useState<File | null>(null);
  const [topUpSlipPreview, setTopUpSlipPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [adminBank, setAdminBank] = useState<AdminBankInfo | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchWallet = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    // Get or create wallet
    let { data: wallet } = await supabase.from("wallets").select("id, balance").eq("user_id", userId).maybeSingle();
    if (!wallet) {
      const { data: newWallet } = await supabase.from("wallets").insert({ user_id: userId, balance: 0 } as any).select().single();
      wallet = newWallet;
    }

    if (wallet) {
      setBalance(Number(wallet.balance));
      setWalletId(wallet.id);

      // Fetch transactions
      const { data: txns } = await supabase
        .from("wallet_transactions")
        .select("id, amount, type, reason, status, created_at, notes, proof_url")
        .eq("wallet_id", wallet.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setTransactions((txns as WalletTransaction[]) || []);
    }

    setLoading(false);
    setRefreshing(false);
  };

  // Fetch admin bank info
  useEffect(() => {
    if (!isOpen) return;
    supabase.from("system_settings").select("value").eq("key", "admin_bank_info").single().then(({ data }) => {
      if (data?.value) {
        const val = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
        setAdminBank(val as AdminBankInfo);
      }
    });
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && userId) fetchWallet();
  }, [isOpen, userId]);

  const handleSlipSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB", variant: "destructive" });
      return;
    }
    setTopUpSlip(file);
    const reader = new FileReader();
    reader.onload = (ev) => setTopUpSlipPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmitTopUp = async () => {
    const amount = Number(topUpAmount);
    if (!amount || amount <= 0 || amount > 100000) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (!topUpSlip) {
      toast({ title: "Please upload transfer slip", variant: "destructive" });
      return;
    }
    if (!walletId) return;

    setSubmitting(true);

    try {
      // Upload slip
      const ext = topUpSlip.name.split(".").pop() || "jpg";
      const path = `topup-slips/${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("payment-slips").upload(path, topUpSlip);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("payment-slips").getPublicUrl(path);
      const proofUrl = urlData.publicUrl;

      // Create pending transaction
      await supabase.from("wallet_transactions").insert({
        wallet_id: walletId,
        user_id: userId,
        amount,
        type: "credit",
        reason: "Top-up via bank transfer",
        status: "pending",
        proof_url: proofUrl,
        notes: `Top-up request: ${amount} MVR`,
      } as any);

      setSubmitted(true);
      setTopUpAmount("");
      setTopUpSlip(null);
      setTopUpSlipPreview(null);

      // Refresh after short delay
      setTimeout(() => {
        fetchWallet();
      }, 500);
    } catch (err: any) {
      toast({ title: "Failed to submit", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  if (!isOpen) return null;

  const credits = transactions.filter(t => t.type === "credit" && t.status === "completed");
  const debits = transactions.filter(t => t.type === "debit" && t.status === "completed");
  const totalIn = credits.reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = debits.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const pendingTopUps = transactions.filter(t => t.type === "credit" && t.status === "pending");

  // Top-up flow screen
  if (showTopUp) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[700] flex items-end justify-center bg-foreground/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <button
                onClick={() => { setShowTopUp(false); setSubmitted(false); }}
                className="w-9 h-9 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform"
              >
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
              <div>
                <h3 className="font-bold text-foreground">Top Up Wallet</h3>
                <p className="text-xs text-muted-foreground">Transfer & upload proof</p>
              </div>
            </div>

            {submitted ? (
              /* Success state */
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h4 className="text-lg font-bold text-foreground">Request Submitted!</h4>
                <p className="text-sm text-muted-foreground">
                  Your top-up request has been submitted for review. Once approved, the funds will be added to your wallet.
                </p>
                <button
                  onClick={() => { setShowTopUp(false); setSubmitted(false); }}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-transform"
                >
                  Back to Wallet
                </button>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* Step 1: Bank Details */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">1</div>
                    <p className="text-sm font-semibold text-foreground">Transfer to this account</p>
                  </div>
                  {adminBank ? (
                    <div className="bg-surface rounded-xl divide-y divide-border">
                      {adminBank.bank_name && (
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <span className="text-xs text-muted-foreground">Bank</span>
                          <span className="text-sm font-semibold text-foreground">{adminBank.bank_name}</span>
                        </div>
                      )}
                      {adminBank.account_number && (
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <span className="text-xs text-muted-foreground">Account</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(adminBank.account_number!);
                              toast({ title: "Copied!", description: "Account number copied" });
                            }}
                            className="text-sm font-semibold text-primary flex items-center gap-1"
                          >
                            {adminBank.account_number}
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      {adminBank.account_name && (
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <span className="text-xs text-muted-foreground">Name</span>
                          <span className="text-sm font-medium text-foreground">{adminBank.account_name}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-surface rounded-xl p-3">
                      <p className="text-xs text-muted-foreground">Bank details not available. Please contact support.</p>
                    </div>
                  )}
                </div>

                {/* Step 2: Amount */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">2</div>
                    <p className="text-sm font-semibold text-foreground">Enter amount transferred</p>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={topUpAmount}
                      onChange={e => setTopUpAmount(e.target.value)}
                      placeholder="0.00"
                      min="1"
                      max="100000"
                      className="w-full px-4 py-3.5 rounded-xl bg-surface border border-border text-2xl font-bold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/40"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">MVR</span>
                  </div>
                  {/* Quick amount buttons */}
                  <div className="flex gap-2">
                    {[100, 500, 1000, 2000].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setTopUpAmount(String(amt))}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                          topUpAmount === String(amt)
                            ? "bg-primary text-primary-foreground"
                            : "bg-surface text-muted-foreground border border-border"
                        }`}
                      >
                        {amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 3: Upload Slip */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">3</div>
                    <p className="text-sm font-semibold text-foreground">Upload transfer slip</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleSlipSelect}
                    className="hidden"
                  />
                  {topUpSlipPreview ? (
                    <div className="relative">
                      <img
                        src={topUpSlipPreview}
                        alt="Transfer slip"
                        className="w-full max-h-48 object-contain rounded-xl border border-border bg-surface"
                      />
                      <button
                        onClick={() => { setTopUpSlip(null); setTopUpSlipPreview(null); }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-foreground/70 flex items-center justify-center"
                      >
                        <X className="w-4 h-4 text-background" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-full py-8 rounded-xl border-2 border-dashed border-border bg-surface/50 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform"
                    >
                      <Upload className="w-6 h-6 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground font-medium">Tap to upload screenshot</p>
                      <p className="text-[10px] text-muted-foreground">JPG, PNG • Max 5MB</p>
                    </button>
                  )}
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmitTopUp}
                  disabled={!topUpAmount || Number(topUpAmount) <= 0 || !topUpSlip || submitting}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Submit Top-Up Request
                    </>
                  )}
                </button>

                <p className="text-[10px] text-muted-foreground text-center">
                  Your balance will be updated once admin approves the transfer
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[700] flex items-end justify-center bg-foreground/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-foreground">My Wallet</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchWallet(true)}
                disabled={refreshing}
                className="w-8 h-8 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform"
              >
                <RefreshCw className={`w-4 h-4 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                <X className="w-4 h-4 text-foreground" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Balance Card */}
              <div className="px-4 pt-4">
                <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent rounded-2xl p-5 space-y-3">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Available Balance</p>
                  <p className="text-4xl font-bold text-primary tracking-tight">
                    {balance.toFixed(2)} <span className="text-base font-semibold">MVR</span>
                  </p>
                  {pendingTopUps.length > 0 && (
                    <p className="text-xs text-amber-600 font-semibold">
                      {pendingTopUps.length} top-up{pendingTopUps.length > 1 ? "s" : ""} pending approval
                    </p>
                  )}
                  <button
                    onClick={() => setShowTopUp(true)}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:scale-95 transition-transform flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Top Up Wallet
                  </button>
                </div>
              </div>

              {/* Summary row */}
              <div className="px-4 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-green-500/10 rounded-xl p-3 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                      <ArrowDownLeft className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">{totalIn.toFixed(0)} MVR</p>
                      <p className="text-[10px] text-muted-foreground">Total In</p>
                    </div>
                  </div>
                  <div className="bg-destructive/10 rounded-xl p-3 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-destructive/20 flex items-center justify-center shrink-0">
                      <ArrowUpRight className="w-4 h-4 text-destructive" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">{totalOut.toFixed(0)} MVR</p>
                      <p className="text-[10px] text-muted-foreground">Total Out</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transaction History */}
              <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 min-h-[120px]">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Transaction History ({transactions.length})
                </p>

                {transactions.length === 0 ? (
                  <div className="text-center py-10">
                    <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No transactions yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Top up your wallet to get started</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {transactions.map(tx => {
                      const isCredit = tx.type === "credit";
                      const isPending = tx.status === "pending";
                      const isRejected = tx.status === "rejected";
                      return (
                        <div key={tx.id} className={`flex items-center gap-3 bg-surface rounded-xl px-3 py-2.5 ${isPending ? "ring-1 ring-amber-500/20" : ""}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isRejected ? "bg-destructive/15" :
                            isPending ? "bg-amber-500/15" :
                            isCredit ? "bg-green-500/15" : "bg-destructive/15"
                          }`}>
                            {isPending ? (
                              <Clock className="w-4 h-4 text-amber-600" />
                            ) : isCredit ? (
                              <ArrowDownLeft className="w-4 h-4 text-green-600" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 text-destructive" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground capitalize truncate">{tx.reason || tx.type}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(tx.created_at), "MMM d, h:mm a")}
                              {tx.status !== "completed" && (
                                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${
                                  tx.status === "pending" ? "bg-amber-500/10 text-amber-600" :
                                  tx.status === "rejected" ? "bg-destructive/10 text-destructive" :
                                  "bg-muted text-muted-foreground"
                                }`}>
                                  {tx.status}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {tx.proof_url && (
                              <a href={tx.proof_url} target="_blank" rel="noopener noreferrer" className="w-6 h-6 rounded-md bg-card flex items-center justify-center">
                                <Image className="w-3 h-3 text-muted-foreground" />
                              </a>
                            )}
                            <p className={`text-sm font-bold ${
                              isRejected ? "text-muted-foreground line-through" :
                              isPending ? "text-amber-600" :
                              isCredit ? "text-green-600" : "text-destructive"
                            }`}>
                              {isCredit ? "+" : "-"}{Math.abs(Number(tx.amount)).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PassengerWallet;
