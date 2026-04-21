import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { X, Search, Loader2, UserPlus, Save, Phone, MessageSquare, Send, Pencil, Check, Download } from "lucide-react";
import { toPng } from "html-to-image";
import SystemLogo from "@/components/SystemLogo";
import { useBranding } from "@/hooks/use-branding";
import hdaLogoFallback from "@/assets/hda-logo.png";

const HDA_DISPATCH_PHONE = "7320207";
const STORAGE_KEY = "hda_dispatch_vehicle_contacts_v1";
const DEFAULT_SMS = "Reminder: Please install the HDA Taxi Driver app to receive trips. Download: https://hda.taxi";

type Vehicle = {
  id: string;
  plate_number: string;
  center_code: string | null;
  color: string | null;
  driver_id: string | null;
  vehicle_types?: { name: string; image_url?: string | null; map_icon_url?: string | null } | null;
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

// Local persistence for per-vehicle contact phone numbers
const loadContacts = (): Record<string, string> => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
};
const saveContacts = (c: Record<string, string>) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch {}
};

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

  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState("");
  const [sendingSmsId, setSendingSmsId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMessage, setBulkMessage] = useState(DEFAULT_SMS);
  const [bulkSending, setBulkSending] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const { logoUrl } = useBranding();
  const exportLogoSrc = logoUrl || hdaLogoFallback;

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
        .select("id, plate_number, center_code, color, driver_id, vehicle_types(name, image_url, map_icon_url)")
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
      setContacts(loadContacts());
      setSearch("");
      setTypeFilter("");
      setReassignFor(null);
      setBulkOpen(false);
      setExpandedId(null);
    }
  }, [open]);

  const types = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => v.vehicle_types?.name && set.add(v.vehicle_types.name));
    return Array.from(set).sort();
  }, [vehicles]);

  // Type breakdown stats with contact counts
  const typeStats = useMemo(() => {
    const map = new Map<string, { total: number; withContact: number }>();
    vehicles.forEach(v => {
      const name = v.vehicle_types?.name || "Unknown";
      const entry = map.get(name) || { total: 0, withContact: 0 };
      entry.total += 1;
      if (contacts[v.id]?.trim()) entry.withContact += 1;
      map.set(name, entry);
    });
    return Array.from(map.entries())
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.total - a.total);
  }, [vehicles, contacts]);

  const totalWithContact = useMemo(
    () => vehicles.filter(v => contacts[v.id]?.trim()).length,
    [vehicles, contacts]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter(v => {
      const matchType = !typeFilter || v.vehicle_types?.name === typeFilter;
      if (!matchType) return false;
      if (!q) return true;
      return (
        v.plate_number?.toLowerCase().includes(q) ||
        v.center_code?.toLowerCase().includes(q) ||
        v.color?.toLowerCase().includes(q) ||
        contacts[v.id]?.toLowerCase().includes(q)
      );
    });
  }, [vehicles, search, typeFilter, contacts]);

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

  const startEditContact = (vehicleId: string) => {
    setEditingContact(vehicleId);
    setContactDraft(contacts[vehicleId] || "");
  };

  const saveContact = (vehicleId: string) => {
    const cleaned = contactDraft.replace(/\D/g, "");
    const next = { ...contacts };
    if (cleaned) next[vehicleId] = cleaned;
    else delete next[vehicleId];
    setContacts(next);
    saveContacts(next);
    setEditingContact(null);
    setContactDraft("");
  };

  const normalizePhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return digits.startsWith("960") ? digits : `960${digits}`;
  };

  const sendSingleSms = async (vehicleId: string) => {
    const phone = contacts[vehicleId];
    if (!phone) return;
    const full = normalizePhone(phone);
    if (full.length < 7) {
      toast({ title: "Invalid phone", variant: "destructive" });
      return;
    }
    setSendingSmsId(vehicleId);
    try {
      const { data, error } = await supabase.functions.invoke("send-bulk-sms", {
        body: { message: DEFAULT_SMS, target_type: "custom", phone_numbers: [full] },
      });
      if (error) throw error;
      if (data?.sent > 0) {
        toast({ title: "SMS sent ✅", description: `Reminder delivered to ${phone}` });
      } else {
        toast({ title: "SMS failed", description: data?.error || "No messages sent", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "SMS failed", description: err.message, variant: "destructive" });
    }
    setSendingSmsId(null);
  };

  const sendBulkSms = async () => {
    const phones = Array.from(new Set(
      Object.values(contacts).map(normalizePhone).filter(p => p.length >= 7)
    ));
    if (phones.length === 0) {
      toast({ title: "No contacts saved", description: "Add contact numbers first", variant: "destructive" });
      return;
    }
    if (!bulkMessage.trim()) {
      toast({ title: "Message is required", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Send SMS to ${phones.length} contact${phones.length === 1 ? "" : "s"}?`)) return;

    setBulkSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-bulk-sms", {
        body: { message: bulkMessage.trim(), target_type: "custom", phone_numbers: phones },
      });
      if (error) throw error;
      toast({
        title: `Bulk SMS: ${data?.sent || 0} of ${data?.total || phones.length} sent`,
        description: data?.failed > 0 ? `${data.failed} failed` : undefined,
      });
      setBulkOpen(false);
    } catch (err: any) {
      toast({ title: "Bulk SMS failed", description: err.message, variant: "destructive" });
    }
    setBulkSending(false);
  };

  // Convert remote image URL to data URL so html-to-image can embed it without CORS taint
  const urlToDataUrl = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url, { mode: "cors", cache: "force-cache" });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const fr = new FileReader();
        fr.onloadend = () => resolve(typeof fr.result === "string" ? fr.result : null);
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
      });
    } catch { return null; }
  };

  const [exportLogoData, setExportLogoData] = useState<string | null>(null);
  const [exportVehicleImgs, setExportVehicleImgs] = useState<Record<string, string>>({});

  const exportAsPng = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    try {
      // Pre-load logo + unique vehicle type images as data URLs (avoids CORS-tainted canvases)
      const logoData = await urlToDataUrl(exportLogoSrc);
      setExportLogoData(logoData);

      const uniqueImgUrls = Array.from(new Set(
        filtered
          .map(v => v.vehicle_types?.image_url || v.vehicle_types?.map_icon_url)
          .filter((u): u is string => !!u)
      ));
      const entries = await Promise.all(
        uniqueImgUrls.map(async (u) => [u, await urlToDataUrl(u)] as const)
      );
      const imgMap: Record<string, string> = {};
      entries.forEach(([u, d]) => { if (d) imgMap[u] = d; });
      setExportVehicleImgs(imgMap);

      // Let React commit the data URLs into the hidden export node
      await new Promise(r => setTimeout(r, 120));

      const dataUrl = await toPng(exportRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      const filterTag = typeFilter ? `_${typeFilter.replace(/\s+/g, "-")}` : "";
      link.download = `HDA-Dispatch-Vehicles${filterTag}_${stamp}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Exported ✅", description: `${filtered.length} vehicles saved as PNG` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
    setExporting(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
              <SystemLogo className="w-5 h-5 object-contain" alt="HDA" />
              HDA DISPATCH Vehicles
              <span className="text-xs font-medium text-muted-foreground">({HDA_DISPATCH_PHONE})</span>
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {loading ? "Loading…" : `${filtered.length} of ${vehicles.length} vehicles · ${totalWithContact} with contact`}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-surface text-muted-foreground hover:text-foreground flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Type breakdown stats */}
        {!loading && typeStats.length > 0 && (
          <div className="px-5 py-3 border-b border-border shrink-0 bg-surface/30">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {typeStats.map(s => (
                <button
                  key={s.name}
                  onClick={() => setTypeFilter(typeFilter === s.name ? "" : s.name)}
                  className={`text-left rounded-xl px-3 py-2 border transition-all ${
                    typeFilter === s.name
                      ? "bg-primary/10 border-primary"
                      : "bg-card border-border hover:bg-surface"
                  }`}
                >
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider truncate">{s.name}</div>
                  <div className="text-lg font-extrabold text-foreground leading-tight">{s.total}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{s.withContact} contact{s.withContact === 1 ? "" : "s"}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filters + Bulk SMS */}
        <div className="px-5 py-3 border-b border-border space-y-2 shrink-0">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Plate, code, color, contact…"
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
            <button
              onClick={exportAsPng}
              disabled={exporting || filtered.length === 0}
              title="Export current view as PNG"
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-br from-accent to-accent/80 text-accent-foreground rounded-xl text-xs font-bold hover:opacity-90 disabled:opacity-40 transition-all shadow-sm"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Export PNG
            </button>
            <button
              onClick={() => setBulkOpen(o => !o)}
              disabled={totalWithContact === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 disabled:opacity-40 transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              Bulk SMS ({totalWithContact})
            </button>
          </div>

          {bulkOpen && (
            <div className="bg-surface/70 border border-primary/20 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-primary" />
                  Bulk reminder to {totalWithContact} saved contact{totalWithContact === 1 ? "" : "s"}
                </p>
              </div>
              <textarea
                value={bulkMessage}
                onChange={(e) => setBulkMessage(e.target.value)}
                rows={3}
                maxLength={320}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">{bulkMessage.length}/320 chars</span>
                <button
                  onClick={sendBulkSms}
                  disabled={bulkSending}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50"
                >
                  {bulkSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send to {totalWithContact}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Hidden printable export canvas — uses inline hex colors so html-to-image renders cleanly */}
        <div style={{ position: "fixed", left: "-10000px", top: 0, pointerEvents: "none" }} aria-hidden>
          <div
            ref={exportRef}
            style={{
              width: "1400px",
              padding: "48px",
              background: "linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)",
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              color: "#0f172a",
            }}
          >
            {/* Branded header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "16px", borderBottom: "1px solid #e2e8f0", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "14px",
                  background: "linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
                }}>
                  <img src={exportLogoData || exportLogoSrc} alt="HDA" crossOrigin="anonymous" style={{ width: "44px", height: "44px", objectFit: "contain" }} />
                </div>
                <div>
                  <div style={{ fontSize: "20px", fontWeight: 900, color: "#0f172a", letterSpacing: "-0.01em", display: "flex", alignItems: "baseline", gap: "8px" }}>
                    HDA DISPATCH Vehicles
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#64748b" }}>({HDA_DISPATCH_PHONE})</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#475569", marginTop: "2px" }}>
                    {filtered.length} of {vehicles.length} vehicles · {totalWithContact} with contact
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "10px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Generated</div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                  {new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                </div>
              </div>
            </div>

            {/* Section title */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", letterSpacing: "0.18em", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Fleet Roster</div>
              <div style={{ fontSize: "26px", fontWeight: 900, lineHeight: 1.1, marginTop: "4px", letterSpacing: "-0.02em", color: "#0f172a" }}>
                {typeFilter ? `${typeFilter} Vehicles` : "All Vehicles"}
              </div>
            </div>

            {/* Grid — 7 per row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "12px" }}>
              {filtered.map((v) => {
                const contact = contacts[v.id];
                const typeName = v.vehicle_types?.name || "—";
                return (
                  <div
                    key={`exp-${v.id}`}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "14px",
                      overflow: "hidden",
                      boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
                    }}
                  >
                    <div style={{
                      background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
                      padding: "8px 10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}>
                      <span style={{
                        background: "#ffffff",
                        color: "#1e40af",
                        fontSize: "11px",
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: "6px",
                        letterSpacing: "0.02em",
                      }}>{v.center_code || "—"}</span>
                      <span style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "999px",
                        background: contact ? "#22c55e" : "rgba(255,255,255,0.35)",
                        boxShadow: contact ? "0 0 6px #22c55e" : "none",
                      }} />
                    </div>
                    <div style={{ padding: "10px 10px 12px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {v.plate_number}
                      </div>
                      <div style={{ fontSize: "10px", color: "#64748b", marginTop: "3px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {typeName}{v.color ? ` · ${v.color}` : ""}
                      </div>
                      {contact && (
                        <div style={{ fontSize: "10px", color: "#1e40af", marginTop: "6px", fontWeight: 700, paddingTop: "6px", borderTop: "1px dashed #e2e8f0" }}>
                          📞 {contact}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ marginTop: "32px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#94a3b8", letterSpacing: "0.05em" }}>
              <span>HDA TAXI · DISPATCH OPERATIONS</span>
              <span>hda.taxi</span>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3">
          {loading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              <SystemLogo className="w-10 h-10 mx-auto mb-2 opacity-30 object-contain" alt="" />
              No vehicles found.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2">
              {filtered.map((v) => {
                const isExpanded = expandedId === v.id;
                const isReassigning = reassignFor === v.id;
                const isEditingC = editingContact === v.id;
                const contact = contacts[v.id];
                const typeName = v.vehicle_types?.name || "—";
                return (
                  <div key={v.id} className="contents">
                    <button
                      onClick={() => {
                        setExpandedId(isExpanded ? null : v.id);
                        if (isExpanded) { setReassignFor(null); setEditingContact(null); }
                      }}
                      className={`group relative text-left rounded-xl overflow-hidden transition-all duration-200 bg-card border shadow-sm ${
                        isExpanded
                          ? "border-primary ring-2 ring-primary/40 scale-[0.98]"
                          : "border-border hover:shadow-md hover:-translate-y-0.5"
                      }`}
                    >
                      {/* Top blue gradient strip — center code + status dot */}
                      <div
                        className="px-2.5 py-2 flex items-center justify-between"
                        style={{ background: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)" }}
                      >
                        <span className="inline-flex items-center justify-center min-w-[28px] h-5 px-2 rounded-md bg-white text-[11px] font-extrabold tracking-wide" style={{ color: "#1e40af" }}>
                          {v.center_code || "—"}
                        </span>
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            background: contact ? "#22c55e" : "rgba(255,255,255,0.35)",
                            boxShadow: contact ? "0 0 6px #22c55e" : "none",
                          }}
                          title={contact ? "Has contact" : "No contact"}
                        />
                      </div>
                      {/* Body — plate + type on left, vehicle image on right */}
                      <div className="px-2.5 py-2 flex items-end justify-between gap-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-extrabold text-foreground truncate leading-tight tracking-tight">{v.plate_number}</div>
                          <div className="text-[10px] text-muted-foreground truncate font-medium mt-0.5">
                            {typeName}{v.color ? ` · ${v.color}` : ""}
                          </div>
                          {contact && (
                            <div className="text-[10px] text-primary font-bold mt-1 pt-1 border-t border-dashed border-border truncate">
                              📞 {contact}
                            </div>
                          )}
                        </div>
                        {(v.vehicle_types?.image_url || v.vehicle_types?.map_icon_url) && (
                          <img
                            src={v.vehicle_types.image_url || v.vehicle_types.map_icon_url}
                            alt={typeName}
                            className="w-8 h-8 object-contain shrink-0 drop-shadow-sm"
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="col-span-2 sm:col-span-4 md:col-span-5 lg:col-span-7 -mt-1 mb-1 bg-surface/70 border border-primary/30 rounded-xl p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center font-extrabold text-xs">
                              {v.center_code || "—"}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-foreground">{v.plate_number}</div>
                              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2">
                                <span>{typeName}</span>
                                {v.color && <span>· {v.color}</span>}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => { setExpandedId(null); setReassignFor(null); setEditingContact(null); }}
                            className="w-7 h-7 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground flex items-center justify-center"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isEditingC ? (
                            <>
                              <input
                                autoFocus
                                value={contactDraft}
                                onChange={(e) => setContactDraft(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && saveContact(v.id)}
                                placeholder="7XXXXXX"
                                className="px-2 py-1 bg-card border border-primary rounded text-[11px] w-32 focus:outline-none"
                              />
                              <button
                                onClick={() => saveContact(v.id)}
                                className="w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => { setEditingContact(null); setContactDraft(""); }}
                                className="w-6 h-6 rounded bg-card text-muted-foreground flex items-center justify-center hover:bg-muted"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </>
                          ) : contact ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground bg-card px-2 py-0.5 rounded">
                                <Phone className="w-2.5 h-2.5 text-primary" /> {contact}
                              </span>
                              <button
                                onClick={() => startEditContact(v.id)}
                                className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                              >
                                <Pencil className="w-2.5 h-2.5" /> Edit
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => startEditContact(v.id)}
                              className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-medium"
                            >
                              <Phone className="w-2.5 h-2.5" /> Add contact
                            </button>
                          )}

                          <div className="ml-auto flex items-center gap-1.5">
                            {contact && !isEditingC && (
                              <button
                                onClick={() => sendSingleSms(v.id)}
                                disabled={sendingSmsId === v.id}
                                title="Send install reminder SMS"
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-accent text-accent-foreground rounded-lg text-[11px] font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
                              >
                                {sendingSmsId === v.id
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <MessageSquare className="w-3 h-3" />}
                                SMS
                              </button>
                            )}
                            <button
                              onClick={() => { setReassignFor(isReassigning ? null : v.id); setReassignSearch(""); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/15 text-primary rounded-lg text-[11px] font-semibold hover:bg-primary/25 transition-colors"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              {isReassigning ? "Cancel" : "Reassign"}
                            </button>
                          </div>
                        </div>

                        {isReassigning && (
                          <div className="bg-card border border-border rounded-xl p-2.5 space-y-2">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                              <input
                                autoFocus
                                value={reassignSearch}
                                onChange={(e) => setReassignSearch(e.target.value)}
                                placeholder="Search driver by name or phone…"
                                className="w-full pl-9 pr-3 py-2 bg-surface border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                            </div>
                            {reassignSearch && (
                              <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface">
                                {filteredDrivers.length === 0 ? (
                                  <div className="px-3 py-2 text-[11px] text-muted-foreground">No drivers match.</div>
                                ) : (
                                  filteredDrivers.map(d => (
                                    <button
                                      key={d.id}
                                      disabled={savingId === v.id}
                                      onClick={() => reassign(v.id, d.id, `${d.first_name} ${d.last_name}`)}
                                      className="w-full text-left px-3 py-2 hover:bg-card flex items-center justify-between gap-2 disabled:opacity-50"
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HdaDispatchVehiclesModal;
