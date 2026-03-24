import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/hooks/use-branding";
import { format } from "date-fns";
import { Search, FileText, Download, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { toPng } from "html-to-image";

interface InvoiceLineItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
}

const newLine = (): InvoiceLineItem => ({
  id: crypto.randomUUID(),
  description: "",
  qty: 1,
  unitPrice: 0,
});

const AdminDriverInvoice = () => {
  const branding = useBranding();
  const companyName = branding.appName || "HDA TAXI";
  const logoUrl = branding.logoUrl;

  // Driver selection
  const [drivers, setDrivers] = useState<any[]>([]);
  const [driverSearch, setDriverSearch] = useState("");
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [showDriverList, setShowDriverList] = useState(false);

  // Invoice fields
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${Date.now().toString(36).toUpperCase()}`);
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([newLine()]);

  // Preview / export
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDrivers = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone_number, company_name, email")
        .ilike("user_type", "%Driver%")
        .order("first_name");
      setDrivers(data || []);
    };
    fetchDrivers();
  }, []);

  const filteredDrivers = drivers.filter(d => {
    const q = driverSearch.toLowerCase();
    return (
      `${d.first_name} ${d.last_name}`.toLowerCase().includes(q) ||
      d.phone_number?.includes(q)
    );
  });

  const subtotal = lineItems.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  const updateLine = (id: string, field: keyof InvoiceLineItem, value: any) => {
    setLineItems(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const removeLine = (id: string) => {
    setLineItems(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  };

  const handleExportPng = async () => {
    if (!invoiceRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(invoiceRef.current, { pixelRatio: 3, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `${invoiceNumber}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Invoice exported as PNG ✅" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
    setExporting(false);
  };

  const handleExportPdf = async () => {
    if (!invoiceRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(invoiceRef.current, { pixelRatio: 3, backgroundColor: "#ffffff" });
      // Create a printable window with the image
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(`
          <html><head><title>${invoiceNumber}</title>
          <style>
            @media print { @page { margin: 0; } body { margin: 0; } }
            body { margin: 0; display: flex; justify-content: center; }
            img { max-width: 100%; height: auto; }
          </style></head><body>
          <img src="${dataUrl}" onload="window.print(); window.close();" />
          </body></html>
        `);
        win.document.close();
      }
      toast({ title: "Print dialog opened — save as PDF ✅" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
    setExporting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" /> Driver Invoice Generator
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Form */}
        <div className="space-y-4">
          {/* Driver picker */}
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select Driver</label>
            {selectedDriver ? (
              <div className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {selectedDriver.first_name} {selectedDriver.last_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">+960 {selectedDriver.phone_number}</p>
                </div>
                <button onClick={() => setSelectedDriver(null)} className="text-muted-foreground hover:text-destructive">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={driverSearch}
                  onChange={e => { setDriverSearch(e.target.value); setShowDriverList(true); }}
                  onFocus={() => setShowDriverList(true)}
                  placeholder="Search driver by name or phone..."
                  className="w-full pl-9 pr-3 py-2.5 bg-surface rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {showDriverList && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {filteredDrivers.slice(0, 20).map(d => (
                      <button
                        key={d.id}
                        onClick={() => { setSelectedDriver(d); setShowDriverList(false); setDriverSearch(""); }}
                        className="w-full text-left px-3 py-2 hover:bg-surface transition-colors"
                      >
                        <p className="text-xs font-semibold text-foreground">{d.first_name} {d.last_name}</p>
                        <p className="text-[10px] text-muted-foreground">+960 {d.phone_number}</p>
                      </button>
                    ))}
                    {filteredDrivers.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">No drivers found</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Invoice info */}
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Invoice Details</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground font-medium">Invoice #</label>
                <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium">Date</label>
                <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium">Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Line Items</label>
              <button onClick={() => setLineItems(prev => [...prev, newLine()])}
                className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-[1fr_60px_90px_28px] gap-2 items-center">
                  <input
                    value={item.description}
                    onChange={e => updateLine(item.id, "description", e.target.value)}
                    placeholder={`Item ${idx + 1}`}
                    className="bg-surface rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    type="number" min={1} value={item.qty}
                    onChange={e => updateLine(item.id, "qty", Number(e.target.value) || 1)}
                    className="bg-surface rounded-lg px-2 py-2 text-xs text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    type="number" min={0} step={0.01} value={item.unitPrice || ""}
                    onChange={e => updateLine(item.id, "unitPrice", Number(e.target.value) || 0)}
                    placeholder="MVR"
                    className="bg-surface rounded-lg px-2 py-2 text-xs text-foreground text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button onClick={() => removeLine(item.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2 border-t border-border">
              <span className="text-sm font-bold text-foreground">Total: {subtotal.toFixed(2)} MVR</span>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-card rounded-xl border border-border p-4 space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Additional notes..."
              className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={() => setShowPreview(true)} disabled={!selectedDriver || lineItems.every(l => !l.description)}
              className="flex-1 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98] transition-all">
              <FileText className="w-4 h-4" /> Preview Invoice
            </button>
          </div>
        </div>

        {/* RIGHT — Live preview */}
        <div className="hidden lg:block">
          <div className="sticky top-4">
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-border">
              <InvoiceTemplate
                ref={null}
                companyName={companyName}
                logoUrl={logoUrl}
                driver={selectedDriver}
                invoiceNumber={invoiceNumber}
                invoiceDate={invoiceDate}
                dueDate={dueDate}
                lineItems={lineItems}
                subtotal={subtotal}
                notes={notes}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Preview modal for mobile / export */}
      {showPreview && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Invoice Preview</h3>
              <div className="flex items-center gap-2">
                <button onClick={handleExportPng} disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg disabled:opacity-50">
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  PNG
                </button>
                <button onClick={handleExportPdf} disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-foreground text-xs font-bold rounded-lg disabled:opacity-50">
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  PDF
                </button>
                <button onClick={() => setShowPreview(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
            <InvoiceTemplate
              ref={invoiceRef}
              companyName={companyName}
              logoUrl={logoUrl}
              driver={selectedDriver}
              invoiceNumber={invoiceNumber}
              invoiceDate={invoiceDate}
              dueDate={dueDate}
              lineItems={lineItems}
              subtotal={subtotal}
              notes={notes}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/* ——— Invoice Template (inline style for PNG export) ——— */
import { forwardRef } from "react";

interface InvoiceTemplateProps {
  companyName: string;
  logoUrl: string | null;
  driver: any;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  notes: string;
}

const InvoiceTemplate = forwardRef<HTMLDivElement, InvoiceTemplateProps>(
  ({ companyName, logoUrl, driver, invoiceNumber, invoiceDate, dueDate, lineItems, subtotal, notes }, ref) => {
    return (
      <div ref={ref} style={{ backgroundColor: "#fff", padding: 32, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", minWidth: 340 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} crossOrigin="anonymous" style={{ height: 40, objectFit: "contain" }} />
            ) : (
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a1a" }}>{companyName}</div>
            )}
            <div style={{ fontSize: 9, color: "#999", marginTop: 6, letterSpacing: 0.5 }}>
              {companyName} · Maldives
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#1a1a1a", letterSpacing: -0.5 }}>INVOICE</div>
            <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>{invoiceNumber}</div>
          </div>
        </div>

        {/* Dates + Bill To */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Bill To</div>
            {driver ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
                  {driver.first_name} {driver.last_name}
                </div>
                <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>+960 {driver.phone_number}</div>
                {driver.email && <div style={{ fontSize: 10, color: "#666" }}>{driver.email}</div>}
                {driver.company_name && <div style={{ fontSize: 10, color: "#666" }}>{driver.company_name}</div>}
              </>
            ) : (
              <div style={{ fontSize: 11, color: "#ccc", fontStyle: "italic" }}>Select a driver</div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>Date</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a" }}>
                {invoiceDate ? format(new Date(invoiceDate + "T00:00"), "dd MMMM yyyy") : "—"}
              </div>
            </div>
            {dueDate && (
              <div>
                <div style={{ fontSize: 8, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>Due Date</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a" }}>
                  {format(new Date(dueDate + "T00:00"), "dd MMMM yyyy")}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Line items table */}
        <div style={{ marginBottom: 20 }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 80px 80px", gap: 8, borderBottom: "2px solid #1a1a1a", paddingBottom: 6, marginBottom: 8 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>Description</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, textAlign: "center" }}>Qty</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, textAlign: "right" }}>Price</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, textAlign: "right" }}>Amount</div>
          </div>
          {/* Rows */}
          {lineItems.filter(l => l.description).map((item, idx) => (
            <div key={item.id} style={{
              display: "grid", gridTemplateColumns: "1fr 50px 80px 80px", gap: 8,
              padding: "6px 0",
              borderBottom: "1px solid #f0f0f0",
              backgroundColor: idx % 2 === 0 ? "transparent" : "#fafafa"
            }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "#1a1a1a" }}>{item.description}</div>
              <div style={{ fontSize: 11, color: "#666", textAlign: "center" }}>{item.qty}</div>
              <div style={{ fontSize: 11, color: "#666", textAlign: "right" }}>{item.unitPrice.toFixed(2)}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a", textAlign: "right" }}>
                {(item.qty * item.unitPrice).toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
          <div style={{ backgroundColor: "#f8f8f8", borderRadius: 10, padding: "12px 20px", minWidth: 180, textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Total Amount</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#40A3DB" }}>{subtotal.toFixed(2)} MVR</div>
          </div>
        </div>

        {/* Notes */}
        {notes && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 10, color: "#666", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{notes}</div>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #e5e5e5", paddingTop: 12, textAlign: "center" }}>
          <div style={{ fontSize: 8, color: "#bbb", letterSpacing: 0.5 }}>
            {companyName} · On Time · Every Time
          </div>
          <div style={{ fontSize: 7, color: "#ddd", marginTop: 4 }}>
            Generated {format(new Date(), "dd MMM yyyy, hh:mm a")}
          </div>
        </div>
      </div>
    );
  }
);

InvoiceTemplate.displayName = "InvoiceTemplate";

export default AdminDriverInvoice;
