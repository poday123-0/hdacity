import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Send, Users, User, Car, Loader2, MessageSquare, CheckCircle2, XCircle, Info } from "lucide-react";

const TARGET_OPTIONS = [
  { value: "all", label: "All Users", icon: Users, desc: "Passengers + Drivers" },
  { value: "passengers", label: "Passengers", icon: User, desc: "All active passengers" },
  { value: "drivers", label: "Drivers", icon: Car, desc: "All active drivers" },
];

const AdminSMS = () => {
  const [message, setMessage] = useState("");
  const [targetType, setTargetType] = useState("all");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  const charCount = message.length;
  const smsCount = charCount === 0 ? 0 : Math.ceil(charCount / 160);

  const handleSend = async () => {
    if (!message.trim()) {
      toast({ title: "Message is required", variant: "destructive" });
      return;
    }

    const confirmed = window.confirm(
      `Send this SMS to ${TARGET_OPTIONS.find(o => o.value === targetType)?.label}?\n\nThis will send real SMS messages and may incur costs.`
    );
    if (!confirmed) return;

    setSending(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("send-bulk-sms", {
        body: { message: message.trim(), target_type: targetType },
      });

      if (error) throw error;

      if (data?.error && !data?.sent) {
        toast({ title: "SMS Error", description: data.error, variant: "destructive" });
      } else {
        setResult({ sent: data.sent || 0, failed: data.failed || 0, total: data.total || 0 });
        toast({
          title: `SMS sent to ${data.sent} of ${data.total} recipients`,
          description: data.failed > 0 ? `${data.failed} failed` : undefined,
        });
        if (data.sent > 0) setMessage("");
      }
    } catch (err: any) {
      toast({ title: "Failed to send SMS", description: err.message, variant: "destructive" });
    }
    setSending(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Send SMS</h2>
        <p className="text-sm text-muted-foreground mt-1">Send bulk SMS messages to passengers, drivers, or everyone via MsgOwl</p>
      </div>

      {/* Send Form */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-5">
        {/* Target */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Audience</label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {TARGET_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = targetType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTargetType(opt.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-all border ${
                    active
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-surface border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${active ? "text-primary" : ""}`} />
                  <span className="text-xs font-semibold">{opt.label}</span>
                  <span className="text-[10px] opacity-70">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your SMS message here..."
            rows={4}
            maxLength={640}
            className="w-full mt-2 px-4 py-3 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
          />
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{charCount} / 640 characters</span>
              <span className="px-1.5 py-0.5 bg-surface rounded text-[10px] font-medium">
                {smsCount} SMS{smsCount !== 1 ? "s" : ""} per recipient
              </span>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/10 rounded-xl">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Messages are sent in batches of 10 with delays to avoid rate limiting. Large audiences may take a few minutes to complete.
          </p>
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl text-sm transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40"
        >
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending SMS...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send SMS to {TARGET_OPTIONS.find(o => o.value === targetType)?.label}
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            Send Result
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{result.total}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Total Recipients</p>
            </div>
            <div className="bg-primary/5 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-primary flex items-center justify-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> {result.sent}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Sent</p>
            </div>
            <div className={`rounded-xl p-3 text-center ${result.failed > 0 ? "bg-destructive/5" : "bg-surface"}`}>
              <p className={`text-2xl font-bold flex items-center justify-center gap-1 ${result.failed > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                <XCircle className="w-4 h-4" /> {result.failed}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Failed</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSMS;
