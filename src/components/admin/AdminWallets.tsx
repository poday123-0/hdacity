import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Wallet, Plus, Minus, Search, ArrowUpDown, History } from "lucide-react";

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
  created_at: string;
  trip_id: string | null;
}

const AdminWallets = () => {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedWallet, setSelectedWallet] = useState<WalletRow | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustType, setAdjustType] = useState<"credit" | "debit">("credit");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");

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

  const fetchTransactions = async (walletId: string) => {
    const { data } = await supabase.from("wallet_transactions").select("*").eq("wallet_id", walletId).order("created_at", { ascending: false }).limit(50);
    setTransactions((data || []).map(t => ({ ...t, amount: Number(t.amount) })));
  };

  useEffect(() => { fetchWallets(); }, []);

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

  const filtered = wallets.filter(w => {
    if (!search) return true;
    const s = search.toLowerCase();
    return w.profile?.first_name?.toLowerCase().includes(s) || w.profile?.last_name?.toLowerCase().includes(s) || w.profile?.phone_number?.includes(s);
  });

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Wallets</h2>
          <p className="text-sm text-muted-foreground">{wallets.length} wallets • Total balance: {totalBalance.toFixed(2)} MVR</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading wallets...</div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(w => (
            <div key={w.id} className={`bg-card rounded-xl border p-4 flex items-center gap-4 cursor-pointer transition-all ${selectedWallet?.id === w.id ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/30"}`} onClick={() => { setSelectedWallet(w); fetchTransactions(w.id); }}>
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

      {/* Transaction History */}
      {selectedWallet && transactions.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Recent Transactions — {selectedWallet.profile?.first_name}</h3>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {transactions.map(t => (
              <div key={t.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${t.type === "credit" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"}`}>
                  {t.type === "credit" ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{t.reason || t.type}</p>
                  {t.notes && <p className="text-[10px] text-muted-foreground truncate">{t.notes}</p>}
                  <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                </div>
                <p className={`text-sm font-bold ${t.type === "credit" ? "text-green-600" : "text-red-500"}`}>
                  {t.type === "credit" ? "+" : "-"}{t.amount.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
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
    </div>
  );
};

export default AdminWallets;