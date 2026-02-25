import { motion } from "framer-motion";
import { useState } from "react";
import { Star, X, MessageSquare, PackageX, MessagesSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import LostItemReport from "./LostItemReport";
import TripChat from "./TripChat";

interface RideFeedbackProps {
  tripId: string;
  driverName?: string;
  fare?: number;
  userId?: string;
  onComplete: () => void;
}

const RideFeedback = ({ tripId, driverName = "your driver", fare, userId, onComplete }: RideFeedbackProps) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showLostItem, setShowLostItem] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const quickTags = ["Great driver", "Clean vehicle", "On time", "Friendly", "Safe driving", "Good route"];
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const submit = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    const feedbackText = [selectedTags.join(", "), feedback].filter(Boolean).join(". ");
    await supabase.from("trips").update({ rating, feedback_text: feedbackText || null, status: "completed" }).eq("id", tripId);
    toast({ title: "Thanks for your feedback!" });
    setSubmitting(false);
    onComplete();
  };

  const displayRating = hoverRating || rating;

  return (
    <>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute inset-0 z-[600] flex items-center justify-center bg-foreground/50 backdrop-blur-sm">
        <motion.div initial={{ y: 30 }} animate={{ y: 0 }} className="bg-card rounded-2xl shadow-2xl mx-4 w-full max-w-sm overflow-hidden">
          <div className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">How was your ride?</h3>
              <button onClick={onComplete} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {fare && (
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{fare} MVR</p>
                <p className="text-xs text-muted-foreground">Trip fare</p>
              </div>
            )}

            {/* Star rating */}
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Rate {driverName}</p>
              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} onClick={() => setRating(s)} onMouseEnter={() => setHoverRating(s)} onMouseLeave={() => setHoverRating(0)} className="active:scale-110 transition-transform">
                    <Star className={`w-10 h-10 transition-colors ${s <= displayRating ? "text-primary fill-primary" : "text-border"}`} />
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground h-4">
                {displayRating === 1 && "Poor"}{displayRating === 2 && "Below average"}{displayRating === 3 && "Average"}{displayRating === 4 && "Good"}{displayRating === 5 && "Excellent!"}
              </p>
            </div>

            {rating > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {quickTags.map((tag) => (
                    <button key={tag} onClick={() => toggleTag(tag)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${selectedTags.includes(tag) ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground"}`}>
                      {tag}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <textarea placeholder="Additional comments (optional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                </div>
              </motion.div>
            )}

            {/* Action buttons */}
            <div className="space-y-2">
              <button onClick={submit} disabled={rating === 0 || submitting} className="w-full bg-primary text-primary-foreground font-semibold py-3.5 rounded-xl text-base disabled:opacity-40 active:scale-[0.98] transition-transform">
                {submitting ? "Submitting..." : rating === 0 ? "Select a rating" : "Submit feedback"}
              </button>

              {/* Lost item & message history */}
              <div className="flex gap-2">
                <button onClick={() => setShowLostItem(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-surface text-sm font-medium text-destructive active:scale-95 transition-transform">
                  <PackageX className="w-4 h-4" />
                  Lost item?
                </button>
                <button onClick={() => setShowChat(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-surface text-sm font-medium text-foreground active:scale-95 transition-transform">
                  <MessagesSquare className="w-4 h-4" />
                  Messages
                </button>
              </div>

              <button onClick={onComplete} className="w-full text-sm text-muted-foreground font-medium py-1">Skip</button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {showLostItem && (
        <LostItemReport tripId={tripId} reporterId={userId} onClose={() => setShowLostItem(false)} />
      )}

      <TripChat
        tripId={tripId}
        senderId={userId}
        senderType="passenger"
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        readOnly
      />
    </>
  );
};

export default RideFeedback;
