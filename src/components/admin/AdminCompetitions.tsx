import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Trophy, Plus, Trash2, Edit, Eye, Award, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

interface Competition {
  id: string;
  title: string;
  description: string;
  metric: string;
  period_type: string;
  start_date: string;
  end_date: string;
  service_location_id: string | null;
  vehicle_type_id: string | null;
  is_active: boolean;
  status: string;
  created_at: string;
}

interface VehicleType {
  id: string;
  name: string;
}

interface Prize {
  id: string;
  competition_id: string;
  tier_rank: number;
  tier_name: string;
  prize_type: string;
  wallet_amount: number;
  fee_free_months: number;
  badge_label: string;
  custom_description: string;
}

interface Entry {
  id: string;
  competition_id: string;
  driver_id: string;
  trip_count: number;
  rank: number | null;
  prize_awarded: boolean;
  prize_id: string | null;
  driver_name?: string;
}

interface ServiceLocation {
  id: string;
  name: string;
}

const TIER_COLORS: Record<number, string> = {
  1: "text-yellow-500",
  2: "text-gray-400",
  3: "text-amber-600",
};

const TIER_ICONS: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

const AdminCompetitions = () => {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [serviceLocations, setServiceLocations] = useState<ServiceLocation[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [form, setForm] = useState({
    title: "",
    description: "",
    metric: "most_trips",
    period_type: "weekly",
    start_date: "",
    end_date: "",
    service_location_id: "",
    vehicle_type_id: "",
  });

  // Prize form
  const [prizeRows, setPrizeRows] = useState<Array<{
    tier_rank: number;
    tier_name: string;
    prize_type: string;
    wallet_amount: number;
    fee_free_months: number;
    badge_label: string;
    custom_description: string;
  }>>([
    { tier_rank: 1, tier_name: "Gold", prize_type: "wallet_credit", wallet_amount: 500, fee_free_months: 0, badge_label: "🥇 Champion", custom_description: "" },
    { tier_rank: 2, tier_name: "Silver", prize_type: "wallet_credit", wallet_amount: 300, fee_free_months: 0, badge_label: "🥈 Runner-up", custom_description: "" },
    { tier_rank: 3, tier_name: "Bronze", prize_type: "wallet_credit", wallet_amount: 100, fee_free_months: 0, badge_label: "🥉 3rd Place", custom_description: "" },
  ]);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const [compRes, locRes, vtRes] = await Promise.all([
      supabase.from("competitions").select("*").order("created_at", { ascending: false }),
      supabase.from("service_locations").select("id, name").eq("is_active", true).order("name"),
      supabase.from("vehicle_types").select("id, name").eq("is_active", true).order("sort_order"),
    ]);
    setCompetitions((compRes.data as Competition[]) || []);
    setServiceLocations((locRes.data as ServiceLocation[]) || []);
    setVehicleTypes((vtRes.data as VehicleType[]) || []);
  };

  const fetchCompetitionDetails = async (compId: string) => {
    const [prizesRes, entriesRes] = await Promise.all([
      supabase.from("competition_prizes").select("*").eq("competition_id", compId).order("tier_rank"),
      supabase.from("competition_entries").select("*").eq("competition_id", compId).order("trip_count", { ascending: false }),
    ]);
    setPrizes((prizesRes.data as Prize[]) || []);

    // Fetch driver names
    const entryData = (entriesRes.data || []) as Entry[];
    if (entryData.length > 0) {
      const driverIds = entryData.map(e => e.driver_id);
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name").in("id", driverIds);
      const nameMap = new Map((profiles || []).map(p => [p.id, `${p.first_name} ${p.last_name}`]));
      entryData.forEach(e => { e.driver_name = nameMap.get(e.driver_id) || "Unknown"; });
    }
    setEntries(entryData);
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      await fetchCompetitionDetails(id);
    }
  };

  const resetForm = () => {
    setForm({ title: "", description: "", metric: "most_trips", period_type: "weekly", start_date: "", end_date: "", service_location_id: "", vehicle_type_id: "" });
    setPrizeRows([
      { tier_rank: 1, tier_name: "Gold", prize_type: "wallet_credit", wallet_amount: 500, fee_free_months: 0, badge_label: "🥇 Champion", custom_description: "" },
      { tier_rank: 2, tier_name: "Silver", prize_type: "wallet_credit", wallet_amount: 300, fee_free_months: 0, badge_label: "🥈 Runner-up", custom_description: "" },
      { tier_rank: 3, tier_name: "Bronze", prize_type: "wallet_credit", wallet_amount: 100, fee_free_months: 0, badge_label: "🥉 3rd Place", custom_description: "" },
    ]);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.title || !form.start_date || !form.end_date) {
      toast({ title: "Missing fields", description: "Title, start and end dates are required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        metric: form.metric,
        period_type: form.period_type,
        start_date: new Date(form.start_date).toISOString(),
        end_date: new Date(form.end_date).toISOString(),
        service_location_id: form.service_location_id || null,
      };

      let compId = editingId;
      if (editingId) {
        await supabase.from("competitions").update(payload).eq("id", editingId);
        // Delete old prizes and re-insert
        await supabase.from("competition_prizes").delete().eq("competition_id", editingId);
      } else {
        const { data, error } = await supabase.from("competitions").insert(payload).select().single();
        if (error) throw error;
        compId = (data as any).id;
      }

      // Insert prizes
      if (compId) {
        const prizeInserts = prizeRows.map(p => ({ ...p, competition_id: compId }));
        await supabase.from("competition_prizes").insert(prizeInserts);
      }

      toast({ title: editingId ? "Competition updated!" : "Competition created! 🏆" });
      resetForm();
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleEdit = async (comp: Competition) => {
    setForm({
      title: comp.title,
      description: comp.description,
      metric: comp.metric,
      period_type: comp.period_type,
      start_date: comp.start_date.slice(0, 16),
      end_date: comp.end_date.slice(0, 16),
      service_location_id: comp.service_location_id || "",
    });
    setEditingId(comp.id);
    // Load prizes
    const { data } = await supabase.from("competition_prizes").select("*").eq("competition_id", comp.id).order("tier_rank");
    if (data && data.length > 0) {
      setPrizeRows(data.map((p: any) => ({
        tier_rank: p.tier_rank,
        tier_name: p.tier_name,
        prize_type: p.prize_type,
        wallet_amount: p.wallet_amount,
        fee_free_months: p.fee_free_months,
        badge_label: p.badge_label,
        custom_description: p.custom_description,
      })));
    }
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this competition?")) return;
    await supabase.from("competitions").delete().eq("id", id);
    toast({ title: "Competition deleted" });
    fetchAll();
  };

  const handleRefreshLeaderboard = async (comp: Competition) => {
    setLoading(true);
    try {
      // Count completed trips for each driver in the date range, optionally filtered by service location
      let query = supabase
        .from("trips")
        .select("driver_id")
        .eq("status", "completed")
        .gte("completed_at", comp.start_date)
        .lte("completed_at", comp.end_date)
        .not("driver_id", "is", null);

      const { data: trips } = await query;
      if (!trips) { setLoading(false); return; }

      // Count per driver
      const counts = new Map<string, number>();
      trips.forEach((t: any) => {
        counts.set(t.driver_id, (counts.get(t.driver_id) || 0) + 1);
      });

      // Sort and rank
      const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

      // Delete old entries
      await supabase.from("competition_entries").delete().eq("competition_id", comp.id);

      // Insert new entries
      if (sorted.length > 0) {
        const inserts = sorted.map(([driver_id, trip_count], idx) => ({
          competition_id: comp.id,
          driver_id,
          trip_count,
          rank: idx + 1,
        }));
        await supabase.from("competition_entries").insert(inserts);
      }

      toast({ title: `Leaderboard refreshed! ${sorted.length} drivers ranked.` });
      await fetchCompetitionDetails(comp.id);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleAwardPrizes = async (comp: Competition) => {
    if (!confirm("Award prizes to top drivers? This will credit wallets and/or set fee-free periods.")) return;
    setLoading(true);
    try {
      const { data: compPrizes } = await supabase.from("competition_prizes").select("*").eq("competition_id", comp.id).order("tier_rank");
      const { data: compEntries } = await supabase.from("competition_entries").select("*").eq("competition_id", comp.id).eq("prize_awarded", false).order("rank");

      if (!compPrizes || !compEntries) { setLoading(false); return; }

      for (const prize of compPrizes as Prize[]) {
        const winner = compEntries.find((e: any) => e.rank === prize.tier_rank);
        if (!winner) continue;

        if (prize.prize_type === "wallet_credit" && prize.wallet_amount > 0) {
          let { data: wallet } = await supabase.from("wallets").select("id, balance").eq("user_id", (winner as any).driver_id).single();
          if (!wallet) {
            const { data: nw } = await supabase.from("wallets").insert({ user_id: (winner as any).driver_id, balance: 0 }).select().single();
            wallet = nw;
          }
          if (wallet) {
            await supabase.from("wallets").update({ balance: Number(wallet.balance) + prize.wallet_amount }).eq("id", wallet.id);
            await supabase.from("wallet_transactions").insert({
              wallet_id: wallet.id,
              user_id: (winner as any).driver_id,
              amount: prize.wallet_amount,
              type: "credit",
              reason: `🏆 Competition Prize: ${comp.title}`,
              notes: `${prize.tier_name} winner - ${prize.wallet_amount} MVR`,
              status: "completed",
            });
          }
        }

        if (prize.prize_type === "fee_free" && prize.fee_free_months > 0) {
          const freeUntil = new Date();
          freeUntil.setMonth(freeUntil.getMonth() + prize.fee_free_months);
          await supabase.from("profiles").update({ fee_free_until: freeUntil.toISOString() }).eq("id", (winner as any).driver_id);
        }

        // Mark as awarded
        await supabase.from("competition_entries").update({ prize_awarded: true, prize_id: prize.id }).eq("id", (winner as any).id);
      }

      // Mark competition as completed
      await supabase.from("competitions").update({ status: "completed" }).eq("id", comp.id);

      toast({ title: "🏆 Prizes awarded successfully!" });
      fetchAll();
      await fetchCompetitionDetails(comp.id);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const isActive = (comp: Competition) => new Date(comp.end_date) > new Date() && comp.status === "active";

  const inputCls = "w-full px-3 py-2.5 bg-surface rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary border border-border/40";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" /> Driver Competitions
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Create competitions, set prizes, and track driver rankings</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Competition
        </Button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-card border border-border/40 rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-foreground">{editingId ? "Edit" : "Create"} Competition</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="Weekly Trip Challenge" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls} placeholder="Complete the most trips to win!" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Period</label>
              <select value={form.period_type} onChange={e => setForm(f => ({ ...f, period_type: e.target.value }))} className={inputCls}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Service Zone (optional)</label>
              <select value={form.service_location_id} onChange={e => setForm(f => ({ ...f, service_location_id: e.target.value }))} className={inputCls}>
                <option value="">All Zones</option>
                {serviceLocations.map(sl => (
                  <option key={sl.id} value={sl.id}>{sl.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Start Date *</label>
              <input type="datetime-local" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">End Date *</label>
              <input type="datetime-local" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inputCls} />
            </div>
          </div>

          {/* Prize Tiers */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">Prize Tiers</h4>
              <Button variant="outline" size="sm" onClick={() => setPrizeRows(prev => [...prev, {
                tier_rank: prev.length + 1,
                tier_name: `Tier ${prev.length + 1}`,
                prize_type: "wallet_credit",
                wallet_amount: 0,
                fee_free_months: 0,
                badge_label: "",
                custom_description: "",
              }])}>
                <Plus className="w-3 h-3 mr-1" /> Add Tier
              </Button>
            </div>

            {prizeRows.map((prize, idx) => (
              <div key={idx} className="bg-surface rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{TIER_ICONS[prize.tier_rank] || `#${prize.tier_rank}`}</span>
                  <input
                    value={prize.tier_name}
                    onChange={e => setPrizeRows(prev => prev.map((p, i) => i === idx ? { ...p, tier_name: e.target.value } : p))}
                    className="flex-1 px-2 py-1.5 bg-background rounded-lg text-sm font-bold text-foreground border border-border/30"
                    placeholder="Tier name"
                  />
                  <select
                    value={prize.prize_type}
                    onChange={e => setPrizeRows(prev => prev.map((p, i) => i === idx ? { ...p, prize_type: e.target.value } : p))}
                    className="px-2 py-1.5 bg-background rounded-lg text-xs border border-border/30 text-foreground"
                  >
                    <option value="wallet_credit">Wallet Credit</option>
                    <option value="fee_free">Fee-Free</option>
                    <option value="badge">Badge Only</option>
                    <option value="custom">Custom Prize</option>
                  </select>
                  {prizeRows.length > 1 && (
                    <button onClick={() => setPrizeRows(prev => prev.filter((_, i) => i !== idx))} className="text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(prize.prize_type === "wallet_credit" || prize.prize_type === "custom") && (
                    <div>
                      <label className="text-[10px] text-muted-foreground">Amount (MVR)</label>
                      <input type="number" value={prize.wallet_amount} onChange={e => setPrizeRows(prev => prev.map((p, i) => i === idx ? { ...p, wallet_amount: Number(e.target.value) } : p))} className="w-full px-2 py-1.5 bg-background rounded-lg text-sm border border-border/30 text-foreground" />
                    </div>
                  )}
                  {prize.prize_type === "fee_free" && (
                    <div>
                      <label className="text-[10px] text-muted-foreground">Fee-Free Months</label>
                      <input type="number" value={prize.fee_free_months} onChange={e => setPrizeRows(prev => prev.map((p, i) => i === idx ? { ...p, fee_free_months: Number(e.target.value) } : p))} className="w-full px-2 py-1.5 bg-background rounded-lg text-sm border border-border/30 text-foreground" />
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] text-muted-foreground">Badge Label</label>
                    <input value={prize.badge_label} onChange={e => setPrizeRows(prev => prev.map((p, i) => i === idx ? { ...p, badge_label: e.target.value } : p))} className="w-full px-2 py-1.5 bg-background rounded-lg text-sm border border-border/30 text-foreground" placeholder="🥇 Champion" />
                  </div>
                  {prize.prize_type === "custom" && (
                    <div className="col-span-2">
                      <label className="text-[10px] text-muted-foreground">Custom Description</label>
                      <input value={prize.custom_description} onChange={e => setPrizeRows(prev => prev.map((p, i) => i === idx ? { ...p, custom_description: e.target.value } : p))} className="w-full px-2 py-1.5 bg-background rounded-lg text-sm border border-border/30 text-foreground" placeholder="iPhone 15, Gift card, etc." />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={loading}>{loading ? "Saving..." : editingId ? "Update" : "Create Competition"}</Button>
            <Button variant="outline" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Competition List */}
      <div className="space-y-3">
        {competitions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No competitions yet. Create one to get started!</div>
        )}

        {competitions.map(comp => (
          <div key={comp.id} className="bg-card border border-border/40 rounded-2xl overflow-hidden">
            <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => toggleExpand(comp.id)}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isActive(comp) ? "bg-primary/10" : "bg-muted"}`}>
                <Trophy className={`w-5 h-5 ${isActive(comp) ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-foreground truncate">{comp.title}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    comp.status === "completed" ? "bg-green-500/10 text-green-600" :
                    isActive(comp) ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {comp.status === "completed" ? "Completed" : isActive(comp) ? "Active" : "Ended"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(comp.start_date), "MMM d")} — {format(new Date(comp.end_date), "MMM d, yyyy")} · {comp.period_type}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={e => { e.stopPropagation(); handleEdit(comp); }} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center hover:bg-muted transition-colors">
                  <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={e => { e.stopPropagation(); handleDelete(comp.id); }} className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center hover:bg-destructive/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
                {expandedId === comp.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>

            {/* Expanded details */}
            {expandedId === comp.id && (
              <div className="border-t border-border/30 p-4 space-y-4">
                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => handleRefreshLeaderboard(comp)} disabled={loading}>
                    <Eye className="w-3.5 h-3.5 mr-1.5" /> Refresh Leaderboard
                  </Button>
                  {comp.status !== "completed" && (
                    <Button size="sm" onClick={() => handleAwardPrizes(comp)} disabled={loading}>
                      <Award className="w-3.5 h-3.5 mr-1.5" /> Award Prizes
                    </Button>
                  )}
                </div>

                {/* Prizes */}
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Prizes</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {prizes.map(p => (
                      <div key={p.id} className="bg-surface rounded-xl p-3 flex items-center gap-2">
                        <span className="text-xl">{TIER_ICONS[p.tier_rank] || `#${p.tier_rank}`}</span>
                        <div>
                          <p className="text-sm font-bold text-foreground">{p.tier_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.prize_type === "wallet_credit" && `${p.wallet_amount} MVR`}
                            {p.prize_type === "fee_free" && `${p.fee_free_months}mo fee-free`}
                            {p.prize_type === "badge" && p.badge_label}
                            {p.prize_type === "custom" && p.custom_description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Leaderboard */}
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Leaderboard ({entries.length} drivers)</h4>
                  {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No entries yet. Click "Refresh Leaderboard" to calculate rankings.</p>
                  ) : (
                    <div className="space-y-1">
                      {entries.slice(0, 20).map((entry, idx) => (
                        <div key={entry.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${idx < 3 ? "bg-primary/5" : "bg-surface"}`}>
                          <span className={`text-sm font-bold w-8 text-center ${TIER_COLORS[idx + 1] || "text-muted-foreground"}`}>
                            {TIER_ICONS[idx + 1] || `#${idx + 1}`}
                          </span>
                          <span className="flex-1 text-sm font-medium text-foreground">{entry.driver_name || entry.driver_id.slice(0, 8)}</span>
                          <span className="text-sm font-bold text-primary">{entry.trip_count} trips</span>
                          {entry.prize_awarded && <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-bold">Awarded</span>}
                        </div>
                      ))}
                      {entries.length > 20 && (
                        <p className="text-xs text-muted-foreground text-center py-2">+{entries.length - 20} more drivers</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminCompetitions;
