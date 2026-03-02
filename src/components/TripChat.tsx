import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playSound, playFallbackBeep } from "@/lib/sound-utils";
import { notifyMessageReceived } from "@/lib/push-notifications";
import { motion, AnimatePresence } from "framer-motion";
import { Send, X, MessageSquare } from "lucide-react";

interface TripMessage {
  id: string;
  trip_id: string;
  sender_id: string | null;
  sender_type: string;
  message: string;
  created_at: string;
}

interface TripChatProps {
  tripId: string;
  senderId?: string;
  senderName?: string;
  recipientId?: string;
  senderType: "passenger" | "driver";
  onClose: () => void;
  isOpen: boolean;
  readOnly?: boolean;
}

const TripChat = ({ tripId, senderId, senderName, recipientId, senderType, onClose, isOpen, readOnly = false }: TripChatProps) => {
  const [messages, setMessages] = useState<TripMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [quickReplies, setQuickReplies] = useState<{ text: string; target: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch messages & subscribe to realtime
  useEffect(() => {
    if (!tripId || !isOpen) return;
    let isActive = true;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("trip_messages")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true });
      if (isActive) setMessages((data as TripMessage[]) || []);
    };
    fetchMessages();

    // Fetch quick replies
    supabase.from("system_settings").select("value").eq("key", "chat_quick_replies").single().then(({ data }) => {
      if (data?.value && Array.isArray(data.value)) {
        const filtered = (data.value as { text: string; target: string }[]).filter(
          qr => qr.target === "both" || qr.target === senderType
        );
        if (isActive) setQuickReplies(filtered);
      }
    });

    if (readOnly) return () => { isActive = false; };

    // Fetch chat message sound
    let messageSoundUrl: string | null = null;
    supabase
      .from("notification_sounds")
      .select("file_url")
      .eq("category", "chat_message")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) messageSoundUrl = data[0].file_url;
      });

    // Realtime subscription
    const channel = supabase
      .channel(`trip-chat-${tripId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "trip_messages",
        filter: `trip_id=eq.${tripId}`,
      }, (payload) => {
        const msg = payload.new as TripMessage;
        setMessages((prev) => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        if (msg.sender_type !== senderType) {
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          if (messageSoundUrl) playSound(messageSoundUrl);
          else playFallbackBeep();
        }
      })
      .subscribe();

    // Fallback polling every 5s to catch missed realtime events
    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from("trip_messages")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true });
      if (isActive && data) {
        setMessages(prev => {
          const prevIds = new Set(prev.map(m => m.id));
          const newMsgs = (data as TripMessage[]).filter(m => !prevIds.has(m.id));
          if (newMsgs.length === 0) return prev;
          return [...prev, ...newMsgs];
        });
      }
    }, 5000);

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [tripId, isOpen, readOnly, senderType]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (msg?: string) => {
    const messageText = msg || text.trim();
    if (!messageText || sending || !tripId) return;
    setSending(true);
    await supabase.from("trip_messages").insert({
      trip_id: tripId,
      sender_id: senderId || null,
      sender_type: senderType,
      message: messageText,
    } as any);
    if (!msg) setText("");
    // Notify the other party
    if (recipientId) {
      notifyMessageReceived(recipientId, senderName || (senderType === "driver" ? "Driver" : "Passenger"), messageText, tripId);
    }
    setSending(false);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[800] flex items-end justify-center bg-foreground/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-foreground">Trip Chat</h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[50vh]">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {readOnly ? "No messages in this trip" : "No messages yet. Say hello!"}
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender_type === senderType || (readOnly && false);
                const isSystem = msg.sender_type === "system";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isSystem ? "justify-center" : isMine ? "justify-end" : "justify-start"}`}
                  >
                    {isSystem ? (
                      <span className="text-[10px] text-muted-foreground bg-surface px-3 py-1 rounded-full">
                        {msg.message}
                      </span>
                    ) : (
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                        isMine
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-surface text-foreground rounded-bl-md"
                      }`}>
                        <p className="text-[10px] font-semibold opacity-70 mb-0.5">
                          {msg.sender_type === "driver" ? "Driver" : "Passenger"}
                        </p>
                        <p className="text-sm">{msg.message}</p>
                        <p className={`text-[9px] mt-1 ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Input */}
          {!readOnly && (
            <div className="p-4 border-t border-border space-y-2">
              {/* Quick replies */}
              {quickReplies.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                  {quickReplies.map((qr, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(qr.text)}
                      disabled={sending}
                      className="shrink-0 px-3 py-1.5 rounded-full bg-surface text-xs font-medium text-foreground border border-border active:scale-95 transition-transform disabled:opacity-40"
                    >
                      {qr.text}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-surface text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!text.trim() || sending}
                  className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center disabled:opacity-40 active:scale-90 transition-transform"
                >
                  <Send className="w-4 h-4 text-primary-foreground" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TripChat;
