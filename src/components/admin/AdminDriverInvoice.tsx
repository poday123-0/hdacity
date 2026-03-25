import { useState, useEffect, useRef, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/hooks/use-branding";
import { format } from "date-fns";
import { Search, FileText, Download, Loader2, Plus, Trash2, X, MapPin, Clock } from "lucide-react";
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

  // People
  const [profiles, setProfiles] = useState<any[]>([]);
  const [driverSearch, setDriverSearch] = useState("");
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null);
  const [showDriverList, setShowDriverList] = useState(false);
  const [passengerSearch, setPassengerSearch] = useState("");
  const [selectedPassenger, setSelectedPassenger] = useState<any | null>(null);
  const [showPassengerList, setShowPassengerList] = useState(false);
  // Manual passenger (for walk-in / non-registered)
  const [manualPassengerName, setManualPassengerName] = useState("");
  const [manualPassengerPhone, setManualPassengerPhone] = useState("");

  // Invoice fields
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${Date.now().toString(36).toUpperCase()}`);
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState<"MVR" | "USD">("MVR");
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([newLine()]);

  // Trip details
  const [tripType, setTripType] = useState<"distance" | "hourly">("distance");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [hourlyStart, setHourlyStart] = useState("");
  const [hourlyEnd, setHourlyEnd] = useState("");
  const [vehicleTypeName, setVehicleTypeName] = useState("");
  const [platePlate, setPlatePlate] = useState("");
  const [passengerCount, setPassengerCount] = useState("1");
  const [luggageCount, setLuggageCount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  // Preview / export
  const [showPreview, setShowPreview] = useState(false);
  const [exporting, setExporting] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, first_name, last_name, phone_number, company_name, email, user_type")
      .order("first_name")
      .then(({ data }) => setProfiles(data || []));
  }, []);

  const driverProfiles = profiles.filter(p => (p.user_type || "").toLowerCase().includes("driver"));
  const passengerProfiles = profiles.filter(p => (p.user_type || "").toLowerCase().includes("rider") || (p.user_type || "").toLowerCase().includes("passenger"));

  const filterList = (list: any[], q: string) =>
    list.filter(d => `${d.first_name} ${d.last_name}`.toLowerCase().includes(q.toLowerCase()) || d.phone_number?.includes(q));

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
    } catch { toast({ title: "Export failed", variant: "destructive" }); }
    setExporting(false);
  };

  const handleExportPdf = async () => {
    if (!invoiceRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(invoiceRef.current, { pixelRatio: 3, backgroundColor: "#ffffff" });
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(`<html><head><title>${invoiceNumber}</title><style>@media print{@page{margin:0}body{margin:0}}body{margin:0;display:flex;justify-content:center}img{max-width:100%;height:auto}</style></head><body><img src="${dataUrl}" onload="window.print();window.close();" /></body></html>`);
        win.document.close();
      }
      toast({ title: "Print dialog opened — save as PDF ✅" });
    } catch { toast({ title: "Export failed", variant: "destructive" }); }
    setExporting(false);
  };

  const billTo = manualPassengerName
    ? { name: manualPassengerName, phone: manualPassengerPhone, email: selectedPassenger?.email || "" }
    : selectedPassenger
    ? { name: `${selectedPassenger.first_name} ${selectedPassenger.last_name}`, phone: selectedPassenger.phone_number, email: selectedPassenger.email }
    : null;

  const tripDetails = {
    type: tripType,
    pickupAddress, dropoffAddress,
    distance, duration,
    hourlyStart, hourlyEnd,
    vehicleTypeName, platePlate,
    passengerCount, luggageCount, paymentMethod,
  };

  const PersonPicker = ({ label, search, setSearch, selected, setSelected, showList, setShowList, list }: any) => (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3">
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</label>
      {selected ? (
        <div className="flex items-center justify-between bg-surface rounded-lg px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{selected.first_name} {selected.last_name}</p>
            <p className="text-[10px] text-muted-foreground">+960 {selected.phone_number}</p>
          </div>
          <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setShowList(true); }} onFocus={() => setShowList(true)}
            placeholder="Search by name or phone..."
            className="w-full pl-9 pr-3 py-2.5 bg-surface rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {showList && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {filterList(list, search).slice(0, 20).map((d: any) => (
                <button key={d.id} onClick={() => { setSelected(d); setShowList(false); setSearch(""); }}
                  className="w-full text-left px-3 py-2 hover:bg-surface transition-colors">
                  <p className="text-xs font-semibold text-foreground">{d.first_name} {d.last_name}</p>
                  <p className="text-[10px] text-muted-foreground">+960 {d.phone_number}</p>
                </button>
              ))}
              {filterList(list, search).length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No results</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        <FileText className="w-5 h-5 text-primary" /> Driver Invoice Generator
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Form */}
        <div className="space-y-4">
          {/* Bill From (Driver) */}
          <PersonPicker label="Bill From (Driver)" search={driverSearch} setSearch={setDriverSearch}
            selected={selectedDriver} setSelected={setSelectedDriver}
            showList={showDriverList} setShowList={setShowDriverList} list={driverProfiles} />

          {/* Bill To (Passenger) */}
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Bill To (Passenger / Customer)</label>
            {/* Search existing */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={passengerSearch}
                onChange={e => { setPassengerSearch(e.target.value); setShowPassengerList(true); }}
                onFocus={() => setShowPassengerList(true)}
                placeholder="Search existing passenger..."
                className="w-full pl-9 pr-3 py-2.5 bg-surface rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
              {showPassengerList && passengerSearch && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {filterList(passengerProfiles, passengerSearch).slice(0, 20).map((d: any) => (
                    <button key={d.id} onClick={() => {
                      setSelectedPassenger(d);
                      setManualPassengerName(`${d.first_name} ${d.last_name}`);
                      setManualPassengerPhone(d.phone_number || "");
                      setShowPassengerList(false);
                      setPassengerSearch("");
                    }} className="w-full text-left px-3 py-2 hover:bg-surface transition-colors">
                      <p className="text-xs font-semibold text-foreground">{d.first_name} {d.last_name}</p>
                      <p className="text-[10px] text-muted-foreground">+960 {d.phone_number}</p>
                    </button>
                  ))}
                  {filterList(passengerProfiles, passengerSearch).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">No results</p>
                  )}
                </div>
              )}
            </div>
            {/* Editable name + phone (always visible) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-muted-foreground font-medium">Name</label>
                <input value={manualPassengerName} onChange={e => { setManualPassengerName(e.target.value); setSelectedPassenger(null); }}
                  placeholder="Customer name"
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium">Phone</label>
                <input value={manualPassengerPhone} onChange={e => { setManualPassengerPhone(e.target.value); setSelectedPassenger(null); }}
                  placeholder="Phone number"
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          </div>

          {/* Trip details */}
          <div className="bg-card rounded-xl border border-border p-4 space-y-3">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Trip Details</label>
            <div className="flex gap-2">
              <button onClick={() => setTripType("distance")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${tripType === "distance" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"}`}>
                <MapPin className="w-3 h-3" /> Distance
              </button>
              <button onClick={() => setTripType("hourly")}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${tripType === "hourly" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"}`}>
                <Clock className="w-3 h-3" /> Hourly
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <input value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} placeholder="Pickup location"
                className="bg-surface rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <input value={dropoffAddress} onChange={e => setDropoffAddress(e.target.value)} placeholder="Drop-off location"
                className="bg-surface rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            {tripType === "distance" ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium">Distance (km)</label>
                  <input value={distance} onChange={e => setDistance(e.target.value)} placeholder="0.0"
                    className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium">Duration (min)</label>
                  <input value={duration} onChange={e => setDuration(e.target.value)} placeholder="0"
                    className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium">Start Time</label>
                  <input type="time" value={hourlyStart} onChange={e => setHourlyStart(e.target.value)}
                    className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium">End Time</label>
                  <input type="time" value={hourlyEnd} onChange={e => setHourlyEnd(e.target.value)}
                    className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground font-medium">Vehicle Type</label>
                <input value={vehicleTypeName} onChange={e => setVehicleTypeName(e.target.value)} placeholder="Car"
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium">Plate No.</label>
                <input value={platePlate} onChange={e => setPlatePlate(e.target.value)} placeholder="P1-1234"
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium">Passengers</label>
                <input type="number" min={1} value={passengerCount} onChange={e => setPassengerCount(e.target.value)}
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium">Luggage</label>
                <input type="number" min={0} value={luggageCount} onChange={e => setLuggageCount(e.target.value)}
                  className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground font-medium">Payment Method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="cash">Cash</option>
                <option value="transfer">Transfer</option>
                <option value="wallet">Wallet</option>
              </select>
            </div>
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
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Fare / Line Items</label>
              <button onClick={() => setLineItems(prev => [...prev, newLine()])}
                className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-[1fr_60px_90px_28px] gap-2 items-center">
                  <input value={item.description} onChange={e => updateLine(item.id, "description", e.target.value)}
                    placeholder={idx === 0 ? "e.g. Base Fare / Ride Fare" : `Item ${idx + 1}`}
                    className="bg-surface rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <input type="number" min={1} value={item.qty} onChange={e => updateLine(item.id, "qty", Number(e.target.value) || 1)}
                    className="bg-surface rounded-lg px-2 py-2 text-xs text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <input type="number" min={0} step={0.01} value={item.unitPrice || ""} onChange={e => updateLine(item.id, "unitPrice", Number(e.target.value) || 0)}
                    placeholder="MVR"
                    className="bg-surface rounded-lg px-2 py-2 text-xs text-foreground text-right focus:outline-none focus:ring-2 focus:ring-primary/30" />
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
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Additional notes..."
              className="w-full bg-surface rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={() => setShowPreview(true)}
              disabled={(!selectedDriver) || lineItems.every(l => !l.description)}
              className="flex-1 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-[0.98] transition-all">
              <FileText className="w-4 h-4" /> Preview Invoice
            </button>
          </div>
        </div>

        {/* RIGHT — Live preview (desktop) */}
        <div className="hidden lg:block">
          <div className="sticky top-4">
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-border">
              <InvoiceTemplate ref={null} companyName={companyName} logoUrl={logoUrl}
                driver={selectedDriver} billTo={billTo} tripDetails={tripDetails}
                invoiceNumber={invoiceNumber} invoiceDate={invoiceDate} dueDate={dueDate}
                lineItems={lineItems} subtotal={subtotal} notes={notes} />
            </div>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowPreview(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-border">
              <h3 className="text-sm font-bold text-foreground">Invoice Preview</h3>
              <div className="flex items-center gap-2">
                <button onClick={handleExportPng} disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg disabled:opacity-50">
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} PNG
                </button>
                <button onClick={handleExportPdf} disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-foreground text-xs font-bold rounded-lg disabled:opacity-50">
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} PDF
                </button>
                <button onClick={() => setShowPreview(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
            <InvoiceTemplate ref={invoiceRef} companyName={companyName} logoUrl={logoUrl}
              driver={selectedDriver} billTo={billTo} tripDetails={tripDetails}
              invoiceNumber={invoiceNumber} invoiceDate={invoiceDate} dueDate={dueDate}
              lineItems={lineItems} subtotal={subtotal} notes={notes} />
          </div>
        </div>
      )}
    </div>
  );
};

/* ——— Invoice Template ——— */
interface InvoiceTemplateProps {
  companyName: string;
  logoUrl: string | null;
  driver: any;
  billTo: { name: string; phone: string; email?: string } | null;
  tripDetails: {
    type: "distance" | "hourly";
    pickupAddress: string; dropoffAddress: string;
    distance: string; duration: string;
    hourlyStart: string; hourlyEnd: string;
    vehicleTypeName: string; platePlate: string;
    passengerCount: string; luggageCount: string; paymentMethod: string;
  };
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  notes: string;
}

const S = {
  label: { fontSize: 8, fontWeight: 700 as const, color: "#999", textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 3 },
  val: { fontSize: 11, fontWeight: 600 as const, color: "#1a1a1a", marginTop: 1 },
  valSm: { fontSize: 10, color: "#666" },
};

const InvoiceTemplate = forwardRef<HTMLDivElement, InvoiceTemplateProps>(
  ({ companyName, logoUrl, driver, billTo, tripDetails, invoiceNumber, invoiceDate, dueDate, lineItems, subtotal, notes }, ref) => {
    const td = tripDetails;
    let hourlyDuration = "";
    if (td.type === "hourly" && td.hourlyStart && td.hourlyEnd) {
      const [sh, sm] = td.hourlyStart.split(":").map(Number);
      const [eh, em] = td.hourlyEnd.split(":").map(Number);
      const diffMin = (eh * 60 + em) - (sh * 60 + sm);
      const h = Math.floor(diffMin / 60);
      const m = diffMin % 60;
      hourlyDuration = h > 0 ? `${h}h ${m}m` : `${m} min`;
    }

    return (
      <div ref={ref} style={{ backgroundColor: "#fff", padding: 28, fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", minWidth: 340 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            {logoUrl ? <img src={logoUrl} alt={companyName} crossOrigin="anonymous" style={{ height: 36, objectFit: "contain" }} />
              : <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a1a" }}>{companyName}</div>}
            <div style={{ fontSize: 9, color: "#999", marginTop: 4 }}>{companyName} · Maldives</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a1a", letterSpacing: -0.5 }}>INVOICE</div>
            <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{invoiceNumber}</div>
            <div style={{ fontSize: 9, color: "#999", marginTop: 4 }}>
              {invoiceDate ? format(new Date(invoiceDate + "T00:00"), "dd MMM yyyy") : "—"}
              {dueDate && <> · Due {format(new Date(dueDate + "T00:00"), "dd MMM yyyy")}</>}
            </div>
          </div>
        </div>

        {/* Bill From / Bill To */}
        <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={S.label}>Bill From (Driver)</div>
            {driver ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{driver.first_name} {driver.last_name}</div>
                <div style={S.valSm}>+960 {driver.phone_number}</div>
                {driver.company_name && <div style={S.valSm}>{driver.company_name}</div>}
              </>
            ) : <div style={{ fontSize: 10, color: "#ccc", fontStyle: "italic" }}>Select a driver</div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={S.label}>Bill To (Passenger)</div>
            {billTo ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{billTo.name}</div>
                {billTo.phone && <div style={S.valSm}>+960 {billTo.phone}</div>}
                {billTo.email && <div style={S.valSm}>{billTo.email}</div>}
              </>
            ) : <div style={{ fontSize: 10, color: "#ccc", fontStyle: "italic" }}>No passenger selected</div>}
          </div>
        </div>

        <div style={{ height: 1, backgroundColor: "#e5e5e5", marginBottom: 16 }} />

        {/* Trip info */}
        {(td.pickupAddress || td.dropoffAddress) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <div style={{ ...S.label, marginBottom: 0 }}>Trip Details</div>
              <div style={{
                fontSize: 8, fontWeight: 700, color: "#fff",
                backgroundColor: td.type === "hourly" ? "#f59e0b" : "#40A3DB",
                padding: "2px 8px", borderRadius: 10, textTransform: "uppercase", letterSpacing: 0.5
              }}>{td.type === "hourly" ? "Hourly" : "Distance"}</div>
            </div>

            {/* Route */}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#22c55e" }} />
                <div style={{ width: 1, height: 20, backgroundColor: "#d4d4d4", margin: "2px 0" }} />
                <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "#ef4444" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "#1a1a1a", fontWeight: 500, marginBottom: 6 }}>{td.pickupAddress || "—"}</div>
                <div style={{ fontSize: 10, color: "#1a1a1a", fontWeight: 500 }}>{td.dropoffAddress || "—"}</div>
              </div>
            </div>

            {/* Detail grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: "6px 12px", marginTop: 10 }}>
              {td.vehicleTypeName && <div><div style={S.label}>Vehicle</div><div style={S.val}>{td.vehicleTypeName}</div></div>}
              {td.platePlate && <div><div style={S.label}>Plate</div><div style={S.val}>{td.platePlate}</div></div>}
              {td.type === "distance" && td.distance && <div><div style={S.label}>Distance</div><div style={S.val}>{td.distance} km</div></div>}
              {td.type === "distance" && td.duration && <div><div style={S.label}>Duration</div><div style={S.val}>{td.duration} min</div></div>}
              {td.type === "hourly" && td.hourlyStart && <div><div style={S.label}>Start</div><div style={S.val}>{td.hourlyStart}</div></div>}
              {td.type === "hourly" && td.hourlyEnd && <div><div style={S.label}>End</div><div style={S.val}>{td.hourlyEnd}</div></div>}
              {td.type === "hourly" && hourlyDuration && <div><div style={S.label}>Duration</div><div style={S.val}>{hourlyDuration}</div></div>}
              <div><div style={S.label}>Passengers</div><div style={S.val}>{td.passengerCount}</div></div>
              <div><div style={S.label}>Luggage</div><div style={S.val}>{td.luggageCount}</div></div>
              <div><div style={S.label}>Payment</div><div style={S.val}>{td.paymentMethod.charAt(0).toUpperCase() + td.paymentMethod.slice(1)}</div></div>
            </div>
          </div>
        )}

        <div style={{ height: 1, backgroundColor: "#e5e5e5", marginBottom: 16 }} />

        {/* Line items */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 45px 70px 70px", gap: 6, borderBottom: "2px solid #1a1a1a", paddingBottom: 5, marginBottom: 6 }}>
            <div style={S.label}>Description</div>
            <div style={{ ...S.label, textAlign: "center" }}>Qty</div>
            <div style={{ ...S.label, textAlign: "right" }}>Price</div>
            <div style={{ ...S.label, textAlign: "right" }}>Amount</div>
          </div>
          {lineItems.filter(l => l.description).map((item, idx) => (
            <div key={item.id} style={{
              display: "grid", gridTemplateColumns: "1fr 45px 70px 70px", gap: 6,
              padding: "5px 0", borderBottom: "1px solid #f0f0f0",
              backgroundColor: idx % 2 === 0 ? "transparent" : "#fafafa"
            }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: "#1a1a1a" }}>{item.description}</div>
              <div style={{ fontSize: 10, color: "#666", textAlign: "center" }}>{item.qty}</div>
              <div style={{ fontSize: 10, color: "#666", textAlign: "right" }}>{item.unitPrice.toFixed(2)}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#1a1a1a", textAlign: "right" }}>{(item.qty * item.unitPrice).toFixed(2)}</div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <div style={{ backgroundColor: "#f8f8f8", borderRadius: 10, padding: "10px 18px", minWidth: 160, textAlign: "right" }}>
            <div style={{ fontSize: 9, color: "#888", marginBottom: 3 }}>Total Amount</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#40A3DB" }}>{subtotal.toFixed(2)} MVR</div>
          </div>
        </div>

        {/* Notes */}
        {notes && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ ...S.label, marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 9, color: "#666", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{notes}</div>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #e5e5e5", paddingTop: 10, textAlign: "center" }}>
          <div style={{ fontSize: 8, color: "#bbb" }}>{companyName} · On Time · Every Time</div>
          <div style={{ fontSize: 7, color: "#ddd", marginTop: 3 }}>Generated {format(new Date(), "dd MMM yyyy, hh:mm a")}</div>
        </div>
      </div>
    );
  }
);

InvoiceTemplate.displayName = "InvoiceTemplate";

export default AdminDriverInvoice;
