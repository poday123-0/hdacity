import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { QRCodeSVG } from "qrcode.react";
import {
  Plus, Download, Printer, Eye, Trash2, CreditCard, Gift,
  ChevronDown, ChevronRight, Copy, Check,
} from "lucide-react";

interface CardBatch {
  id: string;
  name: string;
  card_count: number;
  amount: number;
  created_at: string;
}

interface TopupCard {
  id: string;
  batch_id: string;
  code: string;
  amount: number;
  status: string;
  claimed_by: string | null;
  claimed_at: string | null;
}

const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "HDA-";
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const AdminTopupCards = () => {
  const [batches, setBatches] = useState<CardBatch[]>([]);
  const [cards, setCards] = useState<Record<string, TopupCard[]>>({});
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [batchAmount, setBatchAmount] = useState("50");
  const [batchCount, setBatchCount] = useState("10");
  const [creating, setCreating] = useState(false);
  const [previewCard, setPreviewCard] = useState<TopupCard | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    const { data } = await supabase
      .from("topup_card_batches")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setBatches(data as any);
  };

  const fetchCards = async (batchId: string) => {
    const { data } = await supabase
      .from("topup_cards")
      .select("*")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true });
    if (data) setCards(prev => ({ ...prev, [batchId]: data as any }));
  };

  const handleExpandBatch = (batchId: string) => {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
    } else {
      setExpandedBatch(batchId);
      if (!cards[batchId]) fetchCards(batchId);
    }
  };

  const handleCreate = async () => {
    const count = parseInt(batchCount);
    const amount = parseFloat(batchAmount);
    if (!batchName.trim() || isNaN(count) || count < 1 || count > 500 || isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid input", description: "Please fill in all fields correctly (max 500 cards per batch).", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      // Create batch
      const { data: batch, error: batchErr } = await supabase
        .from("topup_card_batches")
        .insert({ name: batchName.trim(), card_count: count, amount })
        .select()
        .single();
      if (batchErr) throw batchErr;

      // Generate cards
      const codesSet = new Set<string>();
      while (codesSet.size < count) codesSet.add(generateCode());

      const cardRows = Array.from(codesSet).map(code => ({
        batch_id: (batch as any).id,
        code,
        amount,
      }));

      // Insert in chunks of 50
      for (let i = 0; i < cardRows.length; i += 50) {
        const chunk = cardRows.slice(i, i + 50);
        const { error } = await supabase.from("topup_cards").insert(chunk);
        if (error) throw error;
      }

      toast({ title: "🎉 Cards Created!", description: `${count} cards of ${amount} MVR created successfully.` });
      setShowCreate(false);
      setBatchName("");
      setBatchAmount("50");
      setBatchCount("10");
      fetchBatches();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm("Delete this batch and all its cards?")) return;
    await supabase.from("topup_card_batches").delete().eq("id", batchId);
    setBatches(prev => prev.filter(b => b.id !== batchId));
    toast({ title: "Batch deleted" });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handlePrintBatch = (batchId: string) => {
    const batchCards = cards[batchId];
    if (!batchCards) return;
    const batch = batches.find(b => b.id === batchId);

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
      <head>
        <title>Topup Cards - ${batch?.name || "Batch"}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; background: white; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
          .card { border: 2px dashed #e5e7eb; border-radius: 16px; padding: 20px; text-align: center; page-break-inside: avoid; }
          .card h3 { font-size: 14px; color: #6b7280; margin-bottom: 8px; }
          .card .amount { font-size: 28px; font-weight: 800; color: #059669; margin-bottom: 12px; }
          .card .code { font-size: 11px; font-family: monospace; color: #374151; letter-spacing: 1px; margin-top: 12px; }
          .card svg { margin: 0 auto; }
          .brand { font-size: 10px; color: #9ca3af; margin-top: 8px; }
          @media print { .grid { gap: 10px; } .card { padding: 14px; } }
        </style>
      </head>
      <body>
        <div class="grid">
          ${batchCards.map(c => `
            <div class="card">
              <h3>🎁 HDA Topup Card</h3>
              <div class="amount">${c.amount} MVR</div>
              <div id="qr-${c.id}"></div>
              <div class="code">${c.code}</div>
              <div class="brand">Scan QR in the HDA app</div>
            </div>
          `).join("")}
        </div>
        <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"><\/script>
        <script>
          ${batchCards.map(c => `
            QRCode.toCanvas(document.createElement('canvas'), 'HDATOPUP:${c.code}', { width: 120 }, function(err, canvas) {
              if (!err) document.getElementById('qr-${c.id}').appendChild(canvas);
            });
          `).join("")}
          setTimeout(() => window.print(), 500);
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Topup Cards
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Create QR code cards passengers can scan to top up their wallet</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Batch
        </Button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Gift className="w-4 h-4 text-primary" />
            Create Card Batch
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Batch Name</Label>
              <Input placeholder="e.g. Ramadan Promo" value={batchName} onChange={e => setBatchName(e.target.value)} />
            </div>
            <div>
              <Label>Amount per Card (MVR)</Label>
              <Input type="number" min="1" value={batchAmount} onChange={e => setBatchAmount(e.target.value)} />
            </div>
            <div>
              <Label>Number of Cards</Label>
              <Input type="number" min="1" max="500" value={batchCount} onChange={e => setBatchCount(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : `Create ${batchCount} Cards`}
            </Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Batches List */}
      <div className="space-y-3">
        {batches.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No card batches yet. Create your first batch!</p>
          </div>
        )}
        {batches.map(batch => {
          const isExpanded = expandedBatch === batch.id;
          const batchCards = cards[batch.id] || [];
          const claimedCount = batchCards.filter(c => c.status === "claimed").length;

          return (
            <div key={batch.id} className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Batch Header */}
              <button
                onClick={() => handleExpandBatch(batch.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">{batch.name || "Unnamed Batch"}</span>
                    <Badge variant="secondary" className="text-xs">{batch.amount} MVR</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {batch.card_count} cards • Created {new Date(batch.created_at).toLocaleDateString()}
                    {batchCards.length > 0 && ` • ${claimedCount} claimed`}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="outline" size="icon" className="h-8 w-8"
                    onClick={e => { e.stopPropagation(); if (cards[batch.id]) handlePrintBatch(batch.id); else { fetchCards(batch.id).then(() => setTimeout(() => handlePrintBatch(batch.id), 500)); } }}
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={e => { e.stopPropagation(); handleDeleteBatch(batch.id); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </button>

              {/* Cards Grid */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-border">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-4">
                    {batchCards.map(card => (
                      <div
                        key={card.id}
                        className={`relative border rounded-xl p-3 text-center cursor-pointer transition-all hover:shadow-md ${
                          card.status === "claimed"
                            ? "border-muted bg-muted/30 opacity-60"
                            : "border-primary/20 bg-primary/5 hover:border-primary/40"
                        }`}
                        onClick={() => setPreviewCard(card)}
                      >
                        {card.status === "claimed" && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Badge variant="destructive" className="text-xs rotate-[-15deg] scale-110">CLAIMED</Badge>
                          </div>
                        )}
                        <QRCodeSVG value={`HDATOPUP:${card.code}`} size={80} className="mx-auto mb-2" />
                        <p className="text-lg font-extrabold text-primary">{card.amount} <span className="text-xs">MVR</span></p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <p className="text-[10px] font-mono text-muted-foreground truncate">{card.code}</p>
                          <button
                            onClick={e => { e.stopPropagation(); handleCopyCode(card.code); }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {copiedCode === card.code ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Card Preview Modal */}
      {previewCard && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreviewCard(null)}>
          <div className="bg-card rounded-3xl shadow-2xl w-full max-w-[320px] p-8 text-center" onClick={e => e.stopPropagation()}>
            <div className="text-4xl mb-3">🎁</div>
            <h3 className="text-sm font-bold text-muted-foreground mb-1">HDA Topup Card</h3>
            <p className="text-3xl font-extrabold text-primary mb-4">{previewCard.amount} MVR</p>
            <div className="bg-white p-4 rounded-2xl inline-block mb-4">
              <QRCodeSVG value={`HDATOPUP:${previewCard.code}`} size={180} />
            </div>
            <p className="text-xs font-mono text-muted-foreground tracking-wider mb-2">{previewCard.code}</p>
            {previewCard.status === "claimed" && (
              <Badge variant="destructive" className="mb-2">Claimed {previewCard.claimed_at ? new Date(previewCard.claimed_at).toLocaleDateString() : ""}</Badge>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">Scan this QR code in the HDA app to add {previewCard.amount} MVR to your wallet</p>
            <Button variant="outline" className="mt-4 w-full" onClick={() => setPreviewCard(null)}>Close</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTopupCards;
