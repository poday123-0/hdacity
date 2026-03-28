import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ArrowUpRight, ArrowDownLeft, Clock, RefreshCw, Loader2, Banknote, TrendingUp, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";

interface WalletTransaction {
  id: string;
  amount: number;
  type: string;
  reason: string;
  status: string;
  created_at: string;
  notes: string | null;
  trip_id: string | null;
}

interface Withdrawal {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  processed_at: string | null;
  notes: string | null;
  admin_notes: string | null;
}

interface DriverWalletProps {
  driverId: string;
  walletId: string | null;
  balance: number;
  onRequestWithdraw: () => void;
  minWithdrawalAmount: number;
}

const DriverWallet = ({ driverId, walletId, balance, onRequestWithdraw, minWithdrawalAmount }: DriverWalletProps) => {
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "withdrawals">("overview");

  const fetchData = async (showRefresh = false) => {
    if (!walletId) return;
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    const [txnRes, withdrawalRes] = await Promise.all([
      supabase
        .from("wallet_transactions")
        .select("id, amount, type, reason, status, created_at, notes, trip_id")
        .eq("wallet_id", walletId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("wallet_withdrawals")
        .select("id, amount, status, created_at, processed_at, notes, admin_notes")
        .eq("wallet_id", walletId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    setTransactions((txnRes.data as WalletTransaction[]) || []);
    setWithdrawals((withdrawalRes.data as Withdrawal[]) || []);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    if (walletId) fetchData();
  }, [walletId]);

  const completedCredits = transactions.filter(t => t.type === "credit" && t.status === "completed");
  const completedDebits = transactions.filter(t => t.type === "debit" && t.status === "completed");
  const totalIn = completedCredits.reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = completedDebits.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const pendingWithdrawals = withdrawals.filter(w => w.status === "pending");
  const pendingAmount = pendingWithdrawals.reduce((s, w) => s + Number(w.amount), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Wallet Balance</p>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="w-7 h-7 rounded-full bg-card/50 flex items-center justify-center active:scale-90 transition-transform"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <p className="text-4xl font-bold text-primary tracking-tight">
          {balance.toFixed(2)} <span className="text-base font-semibold">MVR</span>
        </p>
        {pendingAmount > 0 && (
          <p className="text-xs text-amber-600 font-semibold">
            {pendingAmount.toFixed(2)} MVR pending withdrawal
          </p>
        )}
        <button
          onClick={onRequestWithdraw}
          disabled={balance < minWithdrawalAmount}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:scale-95 transition-transform disabled:opacity-40"
        >
          Request Withdrawal
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-green-500/10 rounded-xl p-2.5 text-center">
          <ArrowDownLeft className="w-4 h-4 text-green-600 mx-auto mb-0.5" />
          <p className="text-sm font-bold text-foreground">{totalIn.toFixed(0)}</p>
          <p className="text-[9px] text-muted-foreground">Total In</p>
        </div>
        <div className="bg-destructive/10 rounded-xl p-2.5 text-center">
          <ArrowUpRight className="w-4 h-4 text-destructive mx-auto mb-0.5" />
          <p className="text-sm font-bold text-foreground">{totalOut.toFixed(0)}</p>
          <p className="text-[9px] text-muted-foreground">Total Out</p>
        </div>
        <div className="bg-amber-500/10 rounded-xl p-2.5 text-center">
          <Banknote className="w-4 h-4 text-amber-600 mx-auto mb-0.5" />
          <p className="text-sm font-bold text-foreground">{withdrawals.length}</p>
          <p className="text-[9px] text-muted-foreground">Withdrawals</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-xl p-1">
        {([
          { key: "overview" as const, label: "Recent" },
          { key: "transactions" as const, label: `All (${transactions.length})` },
          { key: "withdrawals" as const, label: `Withdrawals (${withdrawals.length})` },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 py-2 rounded-lg text-[10px] font-semibold transition-all ${
              activeTab === key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex items-center justify-between w-full bg-surface rounded-xl px-3 py-2.5 active:bg-muted/30 transition-colors group">
            <span className="text-xs font-semibold text-foreground">Recent Transactions</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1.5 mt-1.5">
              {transactions.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No transactions yet</p>
                </div>
              ) : (
                transactions.slice(0, 10).map(tx => <TransactionRow key={tx.id} tx={tx} />)
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {activeTab === "transactions" && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex items-center justify-between w-full bg-surface rounded-xl px-3 py-2.5 active:bg-muted/30 transition-colors group">
            <span className="text-xs font-semibold text-foreground">All Transactions ({transactions.length})</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto mt-1.5">
              {transactions.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No transactions</p>
                </div>
              ) : (
                transactions.map(tx => <TransactionRow key={tx.id} tx={tx} />)
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {activeTab === "withdrawals" && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex items-center justify-between w-full bg-surface rounded-xl px-3 py-2.5 active:bg-muted/30 transition-colors group">
            <span className="text-xs font-semibold text-foreground">Withdrawals ({withdrawals.length})</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto mt-1.5">
              {withdrawals.length === 0 ? (
                <div className="text-center py-8">
                  <Banknote className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No withdrawal requests</p>
                </div>
              ) : (
                withdrawals.map(w => (
                  <div key={w.id} className="bg-surface rounded-xl px-3 py-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-foreground">{Number(w.amount).toFixed(2)} MVR</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        w.status === "pending" ? "bg-amber-500/10 text-amber-600" :
                        w.status === "approved" || w.status === "completed" ? "bg-green-500/10 text-green-600" :
                        "bg-destructive/10 text-destructive"
                      }`}>
                        {w.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Requested: {format(new Date(w.created_at), "MMM d, yyyy h:mm a")}
                    </p>
                    {w.processed_at && (
                      <p className="text-[10px] text-muted-foreground">
                        Processed: {format(new Date(w.processed_at), "MMM d, yyyy h:mm a")}
                      </p>
                    )}
                    {w.admin_notes && (
                      <p className="text-[10px] text-primary italic">{w.admin_notes}</p>
                    )}
                    {w.notes && (
                      <p className="text-[10px] text-muted-foreground italic">Note: {w.notes}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

const TransactionRow = ({ tx }: { tx: WalletTransaction }) => {
  const isCredit = tx.type === "credit";
  const [expanded, setExpanded] = useState(false);
  const [tripData, setTripData] = useState<any>(null);
  const [loadingTrip, setLoadingTrip] = useState(false);

  const toggleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && tx.trip_id && !tripData) {
      setLoadingTrip(true);
      const { data } = await supabase
        .from("trips")
        .select("id, pickup_address, dropoff_address, estimated_fare, actual_fare, status, created_at, completed_at, customer_name, customer_phone, vehicle:vehicles!trips_vehicle_id_fkey(plate_number, center_code)")
        .eq("id", tx.trip_id)
        .maybeSingle();
      setTripData(data);
      setLoadingTrip(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl overflow-hidden">
      <button onClick={toggleExpand} className="flex items-center gap-3 w-full px-3 py-2.5 text-left active:bg-muted/30 transition-colors">
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
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2.5 pt-0 space-y-1.5 border-t border-border/50">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2">
                <DetailItem label="Type" value={tx.type} />
                <DetailItem label="Reason" value={tx.reason || "-"} />
                <DetailItem label="Status" value={tx.status} />
                <DetailItem label="Amount" value={`${Math.abs(Number(tx.amount)).toFixed(2)} MVR`} />
                {tx.notes && <DetailItem label="Notes" value={tx.notes} span />}
              </div>

              {tx.trip_id && (
                <>
                  {loadingTrip ? (
                    <div className="flex items-center gap-2 py-1.5">
                      <Loader2 className="w-3 h-3 animate-spin text-primary" />
                      <span className="text-[10px] text-muted-foreground">Loading trip...</span>
                    </div>
                  ) : tripData ? (
                    <div className="bg-card rounded-lg p-2 space-y-1 border border-border/30">
                      <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">Trip Details</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        <DetailItem label="Pickup" value={tripData.pickup_address} span />
                        <DetailItem label="Dropoff" value={tripData.dropoff_address} span />
                        <DetailItem label="Fare" value={`${(tripData.actual_fare || tripData.estimated_fare || 0).toFixed(0)} MVR`} />
                        <DetailItem label="Status" value={tripData.status} />
                        {tripData.vehicle?.center_code && <DetailItem label="Center" value={tripData.vehicle.center_code} />}
                        {tripData.vehicle?.plate_number && <DetailItem label="Plate" value={tripData.vehicle.plate_number} />}
                        {tripData.customer_name && <DetailItem label="Customer" value={tripData.customer_name} />}
                        {tripData.customer_phone && <DetailItem label="Phone" value={tripData.customer_phone} />}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic">Trip not found</p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DetailItem = ({ label, value, span }: { label: string; value: string; span?: boolean }) => (
  <div className={span ? "col-span-2" : ""}>
    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
    <p className="text-[11px] font-medium text-foreground truncate">{value}</p>
  </div>
);

export default DriverWallet;
