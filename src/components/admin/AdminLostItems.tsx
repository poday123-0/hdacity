import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PackageX, Search, CheckCircle, Clock, X, AlertTriangle } from "lucide-react";

const statusOptions = ["reported", "investigating", "found", "returned", "closed"];
const statusColors: Record<string, string> = {
  reported: "bg-accent text-accent-foreground",
  investigating: "bg-primary/10 text-primary",
  found: "bg-primary/10 text-primary",
  returned: "bg-primary/10 text-primary",
  closed: "bg-muted text-muted-foreground",
};

const AdminLostItems = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const fetchItems = async () => {
    setLoading(true);
    let query = supabase
      .from("lost_item_reports")
      .select("*, trip:trips!lost_item_reports_trip_id_fkey(id, pickup_address, dropoff_address, driver_id, passenger_id, profiles:driver_id(first_name, last_name, phone_number)), reporter:profiles!lost_item_reports_reporter_id_fkey(first_name, last_name, phone_number)")
      .order("created_at", { ascending: false });

    if (filter !== "all") query = query.eq("status", filter);
    const { data } = await query;
    setItems((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, [filter]);

  const updateStatus = async (itemId: string, newStatus: string) => {
    await supabase.from("lost_item_reports").update({ status: newStatus, updated_at: new Date().toISOString() } as any).eq("id", itemId);
    toast({ title: "Status updated", description: `Set to ${newStatus}` });
    fetchItems();
    if (selectedItem?.id === itemId) setSelectedItem({ ...selectedItem, status: newStatus });
  };

  const filtered = items.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return item.description?.toLowerCase().includes(q) ||
      item.reporter?.first_name?.toLowerCase().includes(q) ||
      item.reporter?.last_name?.toLowerCase().includes(q) ||
      item.trip?.profiles?.first_name?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageX className="w-6 h-6 text-primary" /> Lost Item Reports
        </h2>
        <div className="flex items-center gap-3">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="all">All Reports</option>
            {statusOptions.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-10 pr-4 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Reports", value: items.length, icon: PackageX },
          { label: "Open", value: items.filter(i => ["reported", "investigating"].includes(i.status)).length, icon: AlertTriangle },
          { label: "Found", value: items.filter(i => i.status === "found").length, icon: CheckCircle },
          { label: "Returned", value: items.filter(i => i.status === "returned").length, icon: CheckCircle },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold text-foreground mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Description</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Reporter</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Driver</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Trip Route</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Date</th>
              <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No lost item reports</td></tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 cursor-pointer hover:bg-surface/50" onClick={() => setSelectedItem(item)}>
                  <td className="px-4 py-3 text-sm text-foreground max-w-[200px] truncate">{item.description}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {item.reporter ? `${item.reporter.first_name} ${item.reporter.last_name}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {item.trip?.profiles ? `${item.trip.profiles.first_name} ${item.trip.profiles.last_name}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[150px] truncate">
                    {item.trip ? `${item.trip.pickup_address} → ${item.trip.dropoff_address}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[item.status] || "bg-muted text-muted-foreground"}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <select
                      value={item.status}
                      onChange={(e) => { e.stopPropagation(); updateStatus(item.id, e.target.value); }}
                      onClick={(e) => e.stopPropagation()}
                      className="px-2 py-1 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {statusOptions.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl mx-4 w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground flex items-center gap-2"><PackageX className="w-4 h-4 text-destructive" /> Lost Item Detail</h3>
              <button onClick={() => setSelectedItem(null)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-surface rounded-xl p-3 space-y-2">
                <p className="text-sm text-foreground">{selectedItem.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
                  <div className="text-muted-foreground">Reporter: <span className="text-foreground font-medium">{selectedItem.reporter ? `${selectedItem.reporter.first_name} ${selectedItem.reporter.last_name}` : "—"}</span></div>
                  <div className="text-muted-foreground">Phone: <span className="text-foreground font-medium">{selectedItem.reporter?.phone_number ? `+960 ${selectedItem.reporter.phone_number}` : "—"}</span></div>
                  <div className="text-muted-foreground">Driver: <span className="text-foreground font-medium">{selectedItem.trip?.profiles ? `${selectedItem.trip.profiles.first_name} ${selectedItem.trip.profiles.last_name}` : "—"}</span></div>
                  <div className="text-muted-foreground">Driver Phone: <span className="text-foreground font-medium">{selectedItem.trip?.profiles?.phone_number ? `+960 ${selectedItem.trip.profiles.phone_number}` : "—"}</span></div>
                </div>
                {selectedItem.trip && (
                  <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                    Route: {selectedItem.trip.pickup_address} → {selectedItem.trip.dropoff_address}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Update Status</label>
                <select
                  value={selectedItem.status}
                  onChange={(e) => updateStatus(selectedItem.id, e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {statusOptions.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLostItems;
