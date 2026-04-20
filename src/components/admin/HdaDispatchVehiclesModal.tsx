import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { X, Search, Loader2, Car, UserPlus, Save, Phone } from "lucide-react";

const HDA_DISPATCH_PHONE = "7320207";

type Vehicle = {
  id: string;
  plate_number: string;
  center_code: string | null;
  color: string | null;
  driver_id: string | null;
  vehicle_types?: { name: string } | null;
};

type DriverLite = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

const HdaDispatchVehiclesModal = ({ open, onClose, onUpdated }: Props) => {
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [hdaIds, setHdaIds] = useState<string[]>([]);
  const [drivers, setDrivers] = useState<DriverLite[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [reassignFor, setReassignFor] = useState<string | null>(null);
  const [reassignSearch, setReassignSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    const { data: hdaProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("phone_number", HDA_DISPATCH_PHONE);
    const ids = (hdaProfiles || []).map((p: any) => p.id);
    setHdaIds(ids);

    if (ids.length === 0) {
      setVehicles([]);
      setLoading(false);
      return;
    }

    const [vRes, dRes] = await Promise.all([
      supabase
        .from("vehicles")
        .select("id, plate_number, center_code, color, driver_id, vehicle_types(name)")
        .in("driver_id", ids)
        .order("center_code", { ascending: true, nullsFirst: false }),
      supabase
        .from("profiles")
        .select("id, first_name, last_name, phone_number")
        .ilike("user_type", "%Driver%"),
    ]);
    setVehicles((vRes.data as any) || []);
    setDrivers((dRes.data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      loadData();
      setSearch("");
      setTypeFilter("");
      setReassignFor(null);
    }
  }, [open]);

  const types = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => v.vehicle_types?.name && set.add(v.vehicle_types.name));
    return Array.from(set).sort();
  }, [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter(v => {
      const matchType = !typeFilter || v.vehicle_types?.name === typeFilter;
      if (!matchType) return false;
      if (!q) return true;
      return (
        v.plate_number?.toLowerCase().includes(q) ||
        v.center_code?.toLowerCase().includes(q) ||
        v.color?.toLowerCase().includes(q)
      );
    });
  }, [vehicles, search, typeFilter]);

  const filteredDrivers = useMemo(() => {
    const q = reassignSearch.trim().toLowerCase();
    if (!q) return [];
    return drivers
      .filter(d => !hdaIds.includes(d.id))
      .filter(d =>
        `${d.first_name} ${d.last_name}`.toLowerCase().includes(q) ||
        d.phone_number?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [drivers, reassignSearch, hdaIds]);

  const reassign = async (vehicleId: string, newDriverId: string, driverName: string) => {
    setSavingId(vehicleId);
    const { error } = await supabase
      .from("vehicles")
      .update({ driver_id: newDriverId })
      .eq("id", vehicleId);
    setSavingId(null);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Reassigned ✅", description: `Vehicle now linked to ${driverName}` });
    setReassignFor(null);
    setReassignSearch("");
    setVehicles(prev => prev.filter(v => v.id !== vehicleId));
    onUpdated?.();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
              <Car className="w-4 h-4 text-primary" />
              HDA DISPATCH Vehicles
              <span className="text-xs font-medium text-muted-foreground">({HDA_DISPATCH_PHONE})</span>
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {loading ? "Loading…" : `${filtered.length} of ${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"} parked under HDA DISPATCH`}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-surface text-muted-foreground hover:text-foreground flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-border space-y-2 shrink-0">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Plate, code, color…"
                className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 bg-surface border border-border rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Types</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-3 py-2">
          {loading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              <Car className="w-10 h-10 mx-auto mb-2 opacity-30" />
              No vehicles found.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((v) => {
                const isReassigning = reassignFor === v.id;
                return (
                  <li key={v.id} className="py-2.5 px-2 hover:bg-surface/50 rounded-lg transition-colors">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-extrabold text-sm shrink-0">
                        {v.center_code || "—"}
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <div className="text-sm font-bold text-foreground">{v.plate_number}</div>
                        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                          <span>{v.vehicle_types?.name || "Unknown type"}</span>
                          {v.color && <span>· {v.color}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => { setReassignFor(isReassigning ? null : v.id); setReassignSearch(""); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-[11px] font-semibold hover:bg-primary/20 transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {isReassigning ? "Cancel" : "Reassign"}
                      </button>
                    </div>

                    {isReassigning && (
                      <div className="mt-2 ml-0 sm:ml-15 bg-surface/70 border border-border rounded-xl p-2.5 space-y-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            autoFocus
                            value={reassignSearch}
                            onChange={(e) => setReassignSearch(e.target.value)}
                            placeholder="Search driver by name or phone…"
                            className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        {reassignSearch && (
                          <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
                            {filteredDrivers.length === 0 ? (
                              <div className="px-3 py-2 text-[11px] text-muted-foreground">No drivers match.</div>
                            ) : (
                              filteredDrivers.map(d => (
                                <button
                                  key={d.id}
                                  disabled={savingId === v.id}
                                  onClick={() => reassign(v.id, d.id, `${d.first_name} ${d.last_name}`)}
                                  className="w-full text-left px-3 py-2 hover:bg-surface flex items-center justify-between gap-2 disabled:opacity-50"
                                >
                                  <div>
                                    <div className="text-xs font-semibold text-foreground">{d.first_name} {d.last_name}</div>
                                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                      <Phone className="w-2.5 h-2.5" /> {d.phone_number}
                                    </div>
                                  </div>
                                  {savingId === v.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                  ) : (
                                    <Save className="w-3.5 h-3.5 text-primary" />
                                  )}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default HdaDispatchVehiclesModal;
