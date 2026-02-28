import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet, ArrowUpRight, ArrowDownLeft, Clock, TrendingUp, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface WalletTransaction {
  id: string;
  amount: number;
  type: string;
  reason: string;
  status: string;
  created_at: string;
  notes: string | null;
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
        .select("id, amount, type, reason, status, created_at, notes")
        .eq("wallet_id", wallet.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setTransactions((txns as WalletTransaction[]) || []);
    }

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    if (isOpen && userId) fetchWallet();
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const credits = transactions.filter(t => t.type === "credit" && t.status === "completed");
  const debits = transactions.filter(t => t.type === "debit" && t.status === "completed");
  const totalIn = credits.reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = debits.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

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
                <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent rounded-2xl p-5 space-y-1">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Available Balance</p>
                  <p className="text-4xl font-bold text-primary tracking-tight">
                    {balance.toFixed(2)} <span className="text-base font-semibold">MVR</span>
                  </p>
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
                    <p className="text-xs text-muted-foreground mt-1">Your wallet activity will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {transactions.map(tx => {
                      const isCredit = tx.type === "credit";
                      return (
                        <div key={tx.id} className="flex items-center gap-3 bg-surface rounded-xl px-3 py-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isCredit ? "bg-green-500/15" : "bg-destructive/15"}`}>
                            {isCredit ? (
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
                                  tx.status === "pending" ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"
                                }`}>
                                  {tx.status}
                                </span>
                              )}
                            </p>
                          </div>
                          <p className={`text-sm font-bold shrink-0 ${isCredit ? "text-green-600" : "text-destructive"}`}>
                            {isCredit ? "+" : "-"}{Math.abs(Number(tx.amount)).toFixed(2)}
                          </p>
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
