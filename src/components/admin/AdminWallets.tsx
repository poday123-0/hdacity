import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Wallet, Plus, Minus, Search, History, ArrowDownCircle, Check, X, Upload, Image, Clock, User } from "lucide-react";

const getCurrentAdmin = (): { id: string | null; name: string } => {
  try {
    const stored = localStorage.getItem("hda_admin");
    if (stored) {
      const p = JSON.parse(stored);
      const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.phone_number || "Admin";
      return { id: p.id || null, name };
    }
  } catch {}
  return { id: null, name: "Admin" };
};

interface WalletRow {
  id: string;
  user_id: string;
  balance: number;
  updated_at: string;
  profile?: { first_name: string; last_name: string; phone_number: string; user_type: string };
}

interface TransactionRow {
  id: string;
  wallet_id: string;
  user_id: string;
  amount: number;
  type: string;
  reason: string;
  notes: string;
  status: string;
  proof_url: string | null;
  created_at: string;
  trip_id: string | null;
  processed_by?: string | null;
  processed_at?: string | null;
}

interface WithdrawalRow {
  id: string;
  wallet_id: string;
  user_id: string;
  amount: number;
  status: string;
  notes: string;
  admin_notes: string;
  created_at: string;
  processed_by?: string | null;
  processed_at?: string | null;
  profile?: { first_name: string; last_name: string; phone_number: string };
}

const AdminWallets = () => {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [pendingTopUps, setPendingTopUps] = useState<TransactionRow[]>([]);
  const [topUpHistory, setTopUpHistory] = useState<TransactionRow[]>([]);
  const [topUpsTab, setTopUpsTab] = useState<"pending" | "history">("pending");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedWallet, setSelectedWallet] = useState<WalletRow | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [activeView, setActiveView] = useState<"wallets" | "withdrawals" | "topups">("wallets");
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [topUpProfiles, setTopUpProfiles] = useState<Map<string, { first_name: string; last_name: string; phone_number: string }>>(new Map());
  const [adminProfiles, setAdminProfiles] = useState<Map<string, { first_name: string; last_name: string; phone_number: string }>>(new Map());
  const [showHistory, setShowHistory] = useState(false);
  const [historyTransactions, setHistoryTransactions] = useState<TransactionRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchWallets = async () => {
    setLoading(true);
    const { data: walletsData } = await supabase.from("wallets").select("*").order("updated_at", { ascending: false });
    if (!walletsData) { setLoading(false); return; }

    const userIds = walletsData.map(w => w.user_id);
    const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name, phone_number, user_type").in("id", userIds);

    const profileMap = new Map((profiles || []).map(p => [p.id, p]));
    const enriched: WalletRow[] = walletsData.map(w => ({
      ...w,
      balance: Number(w.balance),
      profile: profileMap.get(w.user_id) || undefined,
    }));
    setWallets(enriched);
    setLoading(false);
  };

  const fetchWithdrawals = async () => {
    const { data } = await supabase.from("wallet_withdrawals").select("*").order("created_at", { ascending: false }).limit(100);
    if (!data) return;
    const userIds = [...new Set(data.map(w => w.user_id))];
    const adminIds = [...new Set(data.map(w => w.processed_by).filter(Boolean) as string[])];
    const allIds = [...new Set([...userIds, ...adminIds])];
    const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name, phone_number").in("id", allIds);
    const profileMap = new Map((profiles || []).map(p => [p.id, p]));
    // Merge admin profiles into shared adminProfiles map for unified lookup
    if (adminIds.length > 0) {
      setAdminProfiles(prev => {
        const next = new Map(prev);
        adminIds.forEach(id => {
          const p = profileMap.get(id);
          if (p) next.set(id, p);
        });
        return next;
      });
    }
    setWithdrawals(data.map(w => ({ ...w, amount: Number(w.amount), profile: profileMap.get(w.user_id) })));
  };

  const fetchPendingTopUps = async () => {
    // Pending requests
    const { data: pendingData } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("status", "pending")
      .eq("type", "credit")
      .not("proof_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);

    // Processed history (approved or rejected) — only top-ups (originally had proof_url)
    const { data: historyData } = await supabase
      .from("wallet_transactions")
      .select("*")
      .in("status", ["completed", "rejected"])
      .eq("type", "credit")
      .not("proof_url", "is", null)
      .not("processed_at", "is", null)
      .order("processed_at", { ascending: false })
      .limit(200);

    const pending = (pendingData || []).map(t => ({ ...t, amount: Number(t.amount) }));
    const history = (historyData || []).map(t => ({ ...t, amount: Number(t.amount) }));
    setPendingTopUps(pending);
    setTopUpHistory(history);

    // Fetch profiles for all top-up users + admin processors
    const userIds = [...new Set([...pending, ...history].map(t => t.user_id))];
    const adminIds = [...new Set(history.map(t => t.processed_by).filter(Boolean) as string[])];
    const allIds = [...new Set([...userIds, ...adminIds])];
    if (allIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name, phone_number").in("id", allIds);
      const userMap = new Map<string, any>();
      const adminMap = new Map<string, any>();
      (profiles || []).forEach(p => {
        if (userIds.includes(p.id)) userMap.set(p.id, p);
        if (adminIds.includes(p.id)) adminMap.set(p.id, p);
      });
      setTopUpProfiles(userMap);
      setAdminProfiles(adminMap);
    }
  };

  const fetchTransactions = async (walletId: string) => {
    const { data } = await supabase.from("wallet_transactions").select("*").eq("wallet_id", walletId).order("created_at", { ascending: false }).limit(50);
    setTransactions((data || []).map(t => ({ ...t, amount: Number(t.amount) })));
  };

  const fetchFullHistory = async (walletId: string) => {
    setHistoryLoading(true);
    let all: any[] = [];
    let from = 0;
    const pageSize = 500;
    while (true) {
      const { data } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("wallet_id", walletId)
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    setHistoryTransactions(all.map(t => ({ ...t, amount: Number(t.amount) })).reverse());
    setHistoryLoading(false);
    setShowHistory(true);
  };

  useEffect(() => { fetchWallets(); fetchWithdrawals(); fetchPendingTopUps(); }, []);

  const handleAdjust = async () => {
    if (!selectedWallet || !adjustAmount || Number(adjustAmount) <= 0) return;
    const amount = Number(adjustAmount);
    const newBalance = adjustType === "credit" ? selectedWallet.balance + amount : selectedWallet.balance - amount;

    if (adjustType === "debit" && newBalance < 0) {
      toast({ title: "Insufficient balance", variant: "destructive" });
      return;
    }

    await supabase.from("wallets").update({ balance: newBalance, updated_at: new Date().toISOString() } as any).eq("id", selectedWallet.id);
    await supabase.from("wallet_transactions").insert({
      wallet_id: selectedWallet.id,
      user_id: selectedWallet.user_id,
      amount,
      type: adjustType,
      reason: adjustReason || (adjustType === "credit" ? "Admin credit" : "Admin debit"),
      notes: adjustNotes,
    } as any);

    toast({ title: `${adjustType === "credit" ? "Credited" : "Debited"} ${amount} MVR` });
    setShowAdjust(false);
    setAdjustAmount("");
    setAdjustReason("");
    setAdjustNotes("");
    fetchWallets();
    if (selectedWallet) fetchTransactions(selectedWallet.id);
  };

  const handleWithdrawal = async (withdrawal: WithdrawalRow, action: "approved" | "rejected") => {
    const now = new Date().toISOString();
    const admin = getCurrentAdmin();
    await supabase.from("wallet_withdrawals").update({
      status: action,
      processed_at: now,
      processed_by: admin.id,
    } as any).eq("id", withdrawal.id);

    if (action === "approved") {
      const { data: wallet } = await supabase.from("wallets").select("id, balance").eq("id", withdrawal.wallet_id).single();
      if (wallet) {
        const newBalance = Math.max(0, Number(wallet.balance) - withdrawal.amount);
        await supabase.from("wallets").update({ balance: newBalance, updated_at: now } as any).eq("id", wallet.id);
        await supabase.from("wallet_transactions").insert({
          wallet_id: wallet.id,
          user_id: withdrawal.user_id,
          amount: withdrawal.amount,
          type: "debit",
          reason: "Withdrawal approved",
          notes: withdrawal.notes,
          created_by: admin.id,
        } as any);
      }
    }

    toast({ title: `Withdrawal ${action}`, description: `By ${admin.name}` });
    fetchWithdrawals();
    fetchWallets();
  };

  const handleTopUpAction = async (tx: TransactionRow, action: "approved" | "rejected") => {
    const now = new Date().toISOString();
    const admin = getCurrentAdmin();

    if (action === "approved") {
      // Update transaction status to completed + audit
      await supabase.from("wallet_transactions").update({
        status: "completed",
        processed_by: admin.id,
        processed_at: now,
      } as any).eq("id", tx.id);

      // Credit the wallet balance
      const { data: wallet } = await supabase.from("wallets").select("id, balance").eq("id", tx.wallet_id).single();
      if (wallet) {
        const newBalance = Number(wallet.balance) + tx.amount;
        await supabase.from("wallets").update({ balance: newBalance, updated_at: now } as any).eq("id", wallet.id);
      }

      toast({ title: `Top-up approved`, description: `${tx.amount} MVR credited • By ${admin.name}` });
    } else {
      // Mark as rejected + audit
      await supabase.from("wallet_transactions").update({
        status: "rejected",
        processed_by: admin.id,
        processed_at: now,
      } as any).eq("id", tx.id);
      toast({ title: `Top-up rejected`, description: `By ${admin.name}` });
    }

    fetchPendingTopUps();
    fetchWallets();
  };

  const filtered = wallets.filter(w => {
    if (!search) return true;
    const s = search.toLowerCase();
    return w.profile?.first_name?.toLowerCase().includes(s) || w.profile?.last_name?.toLowerCase().includes(s) || w.profile?.phone_number?.includes(s);
  });

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);
  const pendingWithdrawals = withdrawals.filter(w => w.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Wallets</h2>
          <p className="text-sm text-muted-foreground">
            {wallets.length} wallets • Total: {totalBalance.toFixed(2)} MVR
            {pendingWithdrawals.length > 0 ? ` • ${pendingWithdrawals.length} pending withdrawals` : ""}
            {pendingTopUps.length > 0 ? ` • ${pendingTopUps.length} pending top-ups` : ""}
          </p>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex bg-surface rounded-xl p-1 gap-1">
        <button onClick={() => setActiveView("wallets")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeView === "wallets" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}>
          <Wallet className="w-3.5 h-3.5 inline mr-1" />Wallets
        </button>
        <button onClick={() => setActiveView("topups")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeView === "topups" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}>
          <Upload className="w-3.5 h-3.5 inline mr-1" />Top-ups{pendingTopUps.length > 0 ? ` (${pendingTopUps.length})` : ""}
        </button>
        <button onClick={() => setActiveView("withdrawals")} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${activeView === "withdrawals" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}>
          <ArrowDownCircle className="w-3.5 h-3.5 inline mr-1" />Withdrawals{pendingWithdrawals.length > 0 ? ` (${pendingWithdrawals.length})` : ""}
        </button>
      </div>

      {activeView === "wallets" && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading wallets...</div>
          ) : (
            <div className="grid gap-3">
              {filtered.map(w => (
                <div key={w.id} className={`bg-card rounded-xl border p-4 flex items-center gap-4 cursor-pointer transition-all ${selectedWallet?.id === w.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/30"}`} onClick={() => { setSelectedWallet(w); fetchFullHistory(w.id); }}>
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {w.profile ? `${w.profile.first_name} ${w.profile.last_name}` : "Unknown User"}
                    </p>
                    <p className="text-xs text-muted-foreground">{w.profile?.phone_number} • {w.profile?.user_type}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${w.balance > 0 ? "text-green-600" : "text-foreground"}`}>{w.balance.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground">MVR</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={e => { e.stopPropagation(); setSelectedWallet(w); fetchFullHistory(w.id); }} className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20" title="View full history">
                      <History className="w-4 h-4" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setSelectedWallet(w); setAdjustType("credit"); setShowAdjust(true); }} className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-600 hover:bg-green-500/20">
                      <Plus className="w-4 h-4" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setSelectedWallet(w); setAdjustType("debit"); setShowAdjust(true); }} className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500 hover:bg-red-500/20">
                      <Minus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <p className="text-center text-muted-foreground py-8">No wallets found</p>}
            </div>
          )}

          {/* Inline transaction list removed — use the history modal (clock icon) instead */}
        </>
      )}

      {/* Top-ups View */}
      {activeView === "topups" && (
        <div className="space-y-3">
          {/* Sub tabs */}
          <div className="flex bg-surface rounded-xl p-1 gap-1">
            <button
              onClick={() => setTopUpsTab("pending")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${topUpsTab === "pending" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              Pending {pendingTopUps.length > 0 ? `(${pendingTopUps.length})` : ""}
            </button>
            <button
              onClick={() => setTopUpsTab("history")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${topUpsTab === "history" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              History {topUpHistory.length > 0 ? `(${topUpHistory.length})` : ""}
            </button>
          </div>

          {topUpsTab === "pending" && (
            <div className="grid gap-3">
              {pendingTopUps.length === 0 ? (
                <div className="text-center py-12">
                  <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No pending top-up requests</p>
                </div>
              ) : (
                pendingTopUps.map(tx => {
                  const profile = topUpProfiles.get(tx.user_id);
                  return (
                    <div key={tx.id} className="bg-card rounded-xl border border-amber-500/30 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {profile ? `${profile.first_name} ${profile.last_name}` : "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground">{profile?.phone_number}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-amber-600">{tx.amount.toFixed(2)} MVR</p>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                            pending
                          </span>
                        </div>
                      </div>

                      {tx.notes && <p className="text-xs text-muted-foreground">{tx.notes}</p>}
                      <p className="text-[10px] text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>

                      {/* Proof image */}
                      {tx.proof_url && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted-foreground font-semibold uppercase">Transfer Proof</p>
                          <button onClick={() => setProofPreview(tx.proof_url)} className="block">
                            <img
                              src={tx.proof_url}
                              alt="Transfer slip"
                              className="w-full max-h-40 object-contain rounded-lg border border-border bg-surface cursor-pointer hover:opacity-80 transition-opacity"
                            />
                          </button>
                        </div>
                      )}

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleTopUpAction(tx, "approved")}
                          className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve & Credit
                        </button>
                        <button
                          onClick={() => handleTopUpAction(tx, "rejected")}
                          className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {topUpsTab === "history" && (
            <div className="grid gap-3">
              {topUpHistory.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No processed top-ups yet</p>
                </div>
              ) : (
                topUpHistory.map(tx => {
                  const profile = topUpProfiles.get(tx.user_id);
                  const admin = tx.processed_by ? adminProfiles.get(tx.processed_by) : null;
                  const isApproved = tx.status === "completed";
                  return (
                    <div key={tx.id} className={`bg-card rounded-xl border p-4 space-y-2 ${isApproved ? "border-green-500/20" : "border-destructive/20"}`}>
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {profile ? `${profile.first_name} ${profile.last_name}` : "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground">{profile?.phone_number}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-lg font-bold ${isApproved ? "text-green-600" : "text-muted-foreground line-through"}`}>
                            {tx.amount.toFixed(2)} MVR
                          </p>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isApproved ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
                            {isApproved ? "approved" : "rejected"}
                          </span>
                        </div>
                      </div>

                      {tx.notes && <p className="text-xs text-muted-foreground">{tx.notes}</p>}

                      {/* Audit info */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-border/50 text-[10px] text-muted-foreground">
                        <span>Requested: {new Date(tx.created_at).toLocaleString()}</span>
                        {tx.processed_at && (
                          <span>{isApproved ? "Approved" : "Rejected"}: {new Date(tx.processed_at).toLocaleString()}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <User className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">By</span>
                        <span className="font-semibold text-foreground">
                          {admin ? `${admin.first_name} ${admin.last_name}`.trim() || admin.phone_number : (tx.processed_by ? "Admin" : "Unknown")}
                        </span>
                        {admin?.phone_number && <span className="text-muted-foreground">• {admin.phone_number}</span>}
                      </div>

                      {tx.proof_url && (
                        <button onClick={() => setProofPreview(tx.proof_url)} className="text-[10px] text-primary underline">
                          View transfer slip
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Withdrawals View */}
      {activeView === "withdrawals" && (
        <div className="grid gap-3">
          {withdrawals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No withdrawal requests</p>
          ) : (
            withdrawals.map(w => (
              <div key={w.id} className={`bg-card rounded-xl border p-4 space-y-2 ${w.status === "pending" ? "border-amber-500/30" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {w.profile ? `${w.profile.first_name} ${w.profile.last_name}` : "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">{w.profile?.phone_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">{w.amount.toFixed(2)} MVR</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      w.status === "pending" ? "bg-amber-500/10 text-amber-600" :
                      w.status === "approved" ? "bg-green-500/10 text-green-600" :
                      "bg-destructive/10 text-destructive"
                    }`}>{w.status}</span>
                  </div>
                </div>
                {w.notes && <p className="text-xs text-muted-foreground">{w.notes}</p>}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span>Requested: {new Date(w.created_at).toLocaleString()}</span>
                  {w.processed_at && (
                    <span>{w.status === "approved" ? "Approved" : w.status === "rejected" ? "Rejected" : "Processed"}: {new Date(w.processed_at).toLocaleString()}</span>
                  )}
                </div>
                {w.status !== "pending" && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">By</span>
                    <span className="font-semibold text-foreground">
                      {(() => {
                        const a = w.processed_by ? adminProfiles.get(w.processed_by) : null;
                        return a ? `${a.first_name} ${a.last_name}`.trim() || a.phone_number : (w.processed_by ? "Admin" : "Unknown");
                      })()}
                    </span>
                  </div>
                )}
                {w.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => handleWithdrawal(w, "approved")} className="flex-1 py-2 rounded-xl bg-green-600 text-white text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform">
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button onClick={() => handleWithdrawal(w, "rejected")} className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform">
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Adjust Modal */}
      {showAdjust && selectedWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={() => setShowAdjust(false)}>
          <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground">{adjustType === "credit" ? "Credit" : "Debit"} Wallet</h3>
            <p className="text-sm text-muted-foreground">{selectedWallet.profile?.first_name} {selectedWallet.profile?.last_name} — Current: {selectedWallet.balance.toFixed(2)} MVR</p>
            <input type="number" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="Amount (MVR)" className="w-full px-4 py-3 rounded-xl bg-surface border border-border text-foreground text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary" />
            <input value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="Reason" className="w-full px-4 py-2.5 rounded-xl bg-surface border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            <input value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} placeholder="Notes (optional)" className="w-full px-4 py-2.5 rounded-xl bg-surface border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            <div className="flex gap-2">
              <button onClick={() => setShowAdjust(false)} className="flex-1 py-3 rounded-xl bg-surface text-foreground font-semibold text-sm">Cancel</button>
              <button onClick={handleAdjust} disabled={!adjustAmount || Number(adjustAmount) <= 0} className={`flex-1 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40 ${adjustType === "credit" ? "bg-green-600" : "bg-red-500"}`}>
                {adjustType === "credit" ? "Credit" : "Debit"} {adjustAmount ? `${adjustAmount} MVR` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Preview Modal */}
      {proofPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/60 backdrop-blur-sm" onClick={() => setProofPreview(null)}>
          <div className="relative max-w-lg w-full mx-4">
            <button
              onClick={() => setProofPreview(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center z-10"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
            <img src={proofPreview} alt="Transfer proof" className="w-full rounded-xl shadow-2xl" />
          </div>
        </div>
      )}

      {/* Full History Modal */}
      {showHistory && selectedWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm" onClick={() => setShowHistory(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-foreground">Wallet History</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedWallet.profile?.first_name} {selectedWallet.profile?.last_name} • {selectedWallet.profile?.phone_number}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Current balance: <span className="font-bold text-foreground">{selectedWallet.balance.toFixed(2)} MVR</span> • {historyTransactions.length} transactions
                </p>
              </div>
              <button onClick={() => setShowHistory(false)} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center hover:bg-destructive/10">
                <X className="w-4 h-4 text-foreground" />
              </button>
            </div>

            {/* Transaction list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {historyLoading ? (
                <div className="text-center py-12 text-muted-foreground">Loading transactions...</div>
              ) : historyTransactions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No transactions found</div>
              ) : (
                (() => {
                  // Calculate running balance (transactions are newest-first, so reverse to compute)
                  const reversed = [...historyTransactions].reverse();
                  const runningBalances: number[] = [];
                  let bal = 0;
                  reversed.forEach(t => {
                    if (t.status === "rejected") {
                      runningBalances.push(bal);
                    } else if (t.type === "credit") {
                      bal += t.amount;
                      runningBalances.push(bal);
                    } else {
                      bal -= t.amount;
                      runningBalances.push(bal);
                    }
                  });
                  runningBalances.reverse();

                  return historyTransactions.map((t, idx) => (
                    <div key={t.id} className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                        t.status === "pending" ? "bg-amber-500/10 text-amber-600" :
                        t.status === "rejected" ? "bg-destructive/10 text-destructive" :
                        t.type === "credit" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"
                      }`}>
                        {t.status === "pending" ? <Clock className="w-3.5 h-3.5" /> :
                         t.type === "credit" ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">{t.reason || t.type}</p>
                        {t.notes && <p className="text-[10px] text-muted-foreground truncate">{t.notes}</p>}
                        {t.trip_id && <p className="text-[9px] text-muted-foreground font-mono">Trip: {t.trip_id.slice(0, 8)}…</p>}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                          {t.status !== "completed" && (
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                              t.status === "pending" ? "bg-amber-500/10 text-amber-600" :
                              "bg-destructive/10 text-destructive"
                            }`}>{t.status}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${
                          t.status === "rejected" ? "text-muted-foreground line-through" :
                          t.status === "pending" ? "text-amber-600" :
                          t.type === "credit" ? "text-green-600" : "text-red-500"
                        }`}>
                          {t.type === "credit" ? "+" : "-"}{t.amount.toFixed(2)}
                        </p>
                        <p className="text-[9px] text-muted-foreground font-mono">
                          Bal: {runningBalances[idx]?.toFixed(2) ?? "—"}
                        </p>
                        {t.proof_url && (
                          <button onClick={() => setProofPreview(t.proof_url)} className="mt-0.5 text-[9px] text-primary underline">
                            View slip
                          </button>
                        )}
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWallets;
