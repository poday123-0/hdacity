import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, DollarSign, ShieldCheck, Calendar, X } from "lucide-react";

const AdminBilling = () => {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [freeUntilDriver, setFreeUntilDriver] = useState<string | null>(null);
  const [freeUntilDate, setFreeUntilDate] = useState("");

  const fetchDrivers = async () => {
    setLoading(true);
    const [driversRes, companiesRes] = await Promise.all([
      (() => {
        let q = supabase.from("profiles").select("id, first_name, last_name, phone_number, company_id, company_name, monthly_fee, status, fee_free_until").ilike("user_type", "%Driver%").order("first_name");
        if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone_number.ilike.%${search}%`);
        return q;
      })(),
      supabase.from("companies").select("id, name, fee_free, monthly_fee").eq("is_active", true),
    ]);
    setDrivers((driversRes.data as any[]) || []);
    setCompanies((companiesRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchDrivers(); }, [search]);

  const toggleFeeFree = async (driverId: string, currentFee: number) => {
    const newFee = currentFee === 0 ? 500 : 0;
    await supabase.from("profiles").update({ monthly_fee: newFee } as any).eq("id", driverId);
    toast({ title: newFee === 0 ? "Driver set to fee-free" : "Monthly fee restored" });
    fetchDrivers();
  };

  const setFreeUntil = async () => {
    if (!freeUntilDriver || !freeUntilDate) return;
    await supabase.from("profiles").update({ fee_free_until: freeUntilDate } as any).eq("id", freeUntilDriver);
    toast({ title: "Fee-free period set", description: `Free until ${freeUntilDate}` });
    setFreeUntilDriver(null);
    setFreeUntilDate("");
    fetchDrivers();
  };

  const clearFreeUntil = async (driverId: string) => {
    await supabase.from("profiles").update({ fee_free_until: null } as any).eq("id", driverId);
    toast({ title: "Fee-free period removed" });
    fetchDrivers();
  };

  const getCompanyName = (d: any) => companies.find(c => c.id === d.company_id)?.name || d.company_name || "—";
  const isCompanyFeeFree = (d: any) => companies.find(c => c.id === d.company_id)?.fee_free || false;
  const isFreeUntilActive = (d: any) => d.fee_free_until && new Date(d.fee_free_until) > new Date();

  const totalMonthlyRevenue = drivers.reduce((sum, d) => {
    if (d.monthly_fee === 0 || isCompanyFeeFree(d) || isFreeUntilActive(d)) return sum;
    return sum + (d.monthly_fee || 0);
  }, 0);

  const freeDriversCount = drivers.filter(d => d.monthly_fee === 0 || isCompanyFeeFree(d) || isFreeUntilActive(d)).length;
  const payingDriversCount = drivers.length - freeDriversCount;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Driver Billing</h2>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Expected Monthly Revenue</p>
          <p className="text-2xl font-bold text-foreground mt-1">{totalMonthlyRevenue.toLocaleString()} MVR</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Paying Drivers</p>
          <p className="text-2xl font-bold text-foreground mt-1">{payingDriversCount}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm text-muted-foreground">Fee-Free Drivers</p>
          <p className="text-2xl font-bold text-primary mt-1">{freeDriversCount}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search drivers..." className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>

      {/* Free-until modal */}
      {freeUntilDriver && (
        <div className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setFreeUntilDriver(null)}>
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Set Fee-Free Period</h3>
              <button onClick={() => setFreeUntilDriver(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground">Driver: <span className="font-medium text-foreground">{drivers.find(d => d.id === freeUntilDriver)?.first_name} {drivers.find(d => d.id === freeUntilDriver)?.last_name}</span></p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Free until date</label>
              <input type="date" value={freeUntilDate} onChange={(e) => setFreeUntilDate(e.target.value)} className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <button onClick={setFreeUntil} disabled={!freeUntilDate} className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-semibold disabled:opacity-50">Set Fee-Free Period</button>
          </div>
        </div>
      )}

      {/* Drivers billing table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Driver</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Phone</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Company</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Monthly Fee</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : drivers.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No drivers found</td></tr>
            ) : (
              drivers.map((d) => {
                const companyFeeFree = isCompanyFeeFree(d);
                const temporaryFree = isFreeUntilActive(d);
                const effectivelyFree = d.monthly_fee === 0 || companyFeeFree || temporaryFree;

                return (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{d.first_name} {d.last_name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">+960 {d.phone_number}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {getCompanyName(d)}
                      {companyFeeFree && <span className="ml-1 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Fee Free</span>}
                    </td>
                    <td className="px-4 py-3">
                      {effectivelyFree ? (
                        <span className="text-sm font-semibold text-primary">FREE</span>
                      ) : (
                        <span className="text-sm font-semibold text-foreground">{d.monthly_fee} MVR</span>
                      )}
                      {temporaryFree && (
                        <p className="text-[10px] text-muted-foreground">until {new Date(d.fee_free_until).toLocaleDateString()}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${d.status === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {!companyFeeFree && (
                          <button
                            onClick={() => toggleFeeFree(d.id, d.monthly_fee)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              d.monthly_fee === 0
                                ? "text-destructive bg-destructive/10 hover:bg-destructive/20"
                                : "text-primary bg-primary/10 hover:bg-primary/20"
                            }`}
                          >
                            <ShieldCheck className="w-3 h-3" />
                            {d.monthly_fee === 0 ? "Set Fee" : "Make Free"}
                          </button>
                        )}
                        {temporaryFree ? (
                          <button
                            onClick={() => clearFreeUntil(d.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors"
                          >
                            <X className="w-3 h-3" /> Clear Period
                          </button>
                        ) : (
                          <button
                            onClick={() => { setFreeUntilDriver(d.id); setFreeUntilDate(""); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground bg-surface hover:bg-muted transition-colors"
                          >
                            <Calendar className="w-3 h-3" /> Free Period
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminBilling;
