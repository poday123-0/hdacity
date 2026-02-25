import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { PackageX, Send, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface LostItemReportProps {
  tripId: string;
  reporterId?: string;
  onClose: () => void;
}

const LostItemReport = ({ tripId, reporterId, onClose }: LostItemReportProps) => {
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);

    // Insert lost item report
    const { error } = await supabase.from("lost_item_reports").insert({
      trip_id: tripId,
      reporter_id: reporterId || null,
      description: description.trim(),
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Also send a system message in the trip chat
    await supabase.from("trip_messages").insert({
      trip_id: tripId,
      sender_type: "system",
      message: `⚠️ Lost item reported: ${description.trim()}`,
    } as any);

    // Notify via SMS edge function (best-effort)
    try {
      await supabase.functions.invoke("send-otp", {
        body: { type: "lost_item", trip_id: tripId, description: description.trim() },
      });
    } catch {}

    toast({ title: "Report submitted", description: "We've notified the driver and admin about your lost item." });
    setSubmitting(false);
    onClose();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[700] flex items-center justify-center bg-foreground/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-card rounded-2xl shadow-2xl mx-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PackageX className="w-5 h-5 text-destructive" />
              <h3 className="font-bold text-foreground">Report Lost Item</h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <p className="text-sm text-muted-foreground">
            Describe the item you left in the vehicle. We'll notify the driver and admin immediately.
          </p>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Black wallet left on back seat"
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-surface text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />

          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-surface text-foreground font-semibold text-sm">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!description.trim() || submitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
              {submitting ? "Sending..." : "Submit Report"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default LostItemReport;
