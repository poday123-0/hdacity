import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Send, Users, User, Car, Loader2, MessageSquare, CheckCircle2, XCircle, Info, Search, X, UserPlus } from "lucide-react";

interface ProfileResult {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  country_code: string;
  user_type: string;
}

const TARGET_OPTIONS = [
  { value: "all", label: "All Users", icon: Users, desc: "Passengers + Drivers" },
  { value: "passengers", label: "All Passengers", icon: User, desc: "All active passengers" },
  { value: "drivers", label: "All Drivers", icon: Car, desc: "All active drivers" },
  { value: "custom", label: "Select People", icon: UserPlus, desc: "Pick specific users" },
];

const AdminSMS = () => {
  const [message, setMessage] = useState("");
  const [targetType, setTargetType] = useState("all");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number } | null>(null);

  // Custom recipients
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<ProfileResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const charCount = message.length;
  const smsCount = charCount === 0 ? 0 : Math.ceil(charCount / 160);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const trimmed = q.trim();
    const isNumeric = /^\d+$/.test(trimmed);

    let query = supabase
      .from("profiles")
      .select("id, first_name, last_name, phone_number, country_code, user_type")
      .eq("status", "Active")
      .limit(20);

    if (isNumeric) {
      query = query.ilike("phone_number", `%${trimmed}%`);
    } else {
      query = query.or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`);
    }

    const { data } = await query;
    const selectedIds = new Set(selectedUsers.map(u => u.id));
    setSearchResults((data || []).filter(p => !selectedIds.has(p.id)));
    setSearching(false);
    setShowDropdown(true);
  }, [selectedUsers]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const addUser = (user: ProfileResult) => {
    setSelectedUsers(prev => {
      if (prev.some(u => u.id === user.id)) return prev;
      return [...prev, user];
    });
    setSearchResults(prev => prev.filter(r => r.id !== user.id));
    setSearchQuery("");
    setShowDropdown(false);
  };

  const removeUser = (id: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== id));
  };

  const getUserTypeLabel = (t: string) => {
    if (t === "Rider") return "Passenger";
    if (t?.toLowerCase().includes("driver")) return "Driver";
    return t;
  };

  const handleSend = async () => {
    if (!message.trim()) {
      toast({ title: "Message is required", variant: "destructive" });
      return;
    }
    if (targetType === "custom" && selectedUsers.length === 0) {
      toast({ title: "Select at least one recipient", variant: "destructive" });
      return;
    }

    const recipientLabel = targetType === "custom"
      ? `${selectedUsers.length} selected user${selectedUsers.length !== 1 ? "s" : ""}`
      : TARGET_OPTIONS.find(o => o.value === targetType)?.label;

    const confirmed = window.confirm(
      `Send this SMS to ${recipientLabel}?\n\nThis will send real SMS messages and may incur costs.`
    );
    if (!confirmed) return;

    setSending(true);
    setResult(null);

    try {
      const body: any = { message: message.trim(), target_type: targetType };
      if (targetType === "custom") {
        body.phone_numbers = selectedUsers.map(u => {
          const phone = u.phone_number.replace(/\D/g, "");
          const cc = (u.country_code || "960").replace(/\D/g, "");
          return phone.startsWith(cc) ? phone : `${cc}${phone}`;
        });
      }

      const { data, error } = await supabase.functions.invoke("send-bulk-sms", { body });

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
        <p className="text-sm text-muted-foreground mt-1">Send SMS messages to individuals, groups, or everyone</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-5">
        {/* Target */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Audience</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            {TARGET_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = targetType === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => { setTargetType(opt.value); setResult(null); }}
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

        {/* Custom user search */}
        {targetType === "custom" && (
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Search & Add Recipients</label>
            <div ref={searchRef} className="relative mt-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                  placeholder="Search by name or phone number..."
                  className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
              </div>

              {/* Dropdown results */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => addUser(user)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {user.first_name?.[0]}{user.last_name?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{user.first_name} {user.last_name}</p>
                        <p className="text-xs text-muted-foreground">+{user.country_code} {user.phone_number}</p>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        user.user_type === "Rider" ? "bg-accent text-foreground" : "bg-primary/10 text-primary"
                      }`}>
                        {getUserTypeLabel(user.user_type)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {showDropdown && searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
                <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-xl shadow-lg p-4 text-center text-sm text-muted-foreground">
                  No users found
                </div>
              )}
            </div>

            {/* Selected users chips */}
            {selectedUsers.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[11px] text-muted-foreground font-medium">{selectedUsers.length} recipient{selectedUsers.length !== 1 ? "s" : ""} selected</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center gap-1.5 bg-primary/10 text-primary px-2.5 py-1.5 rounded-lg text-xs font-medium"
                    >
                      <span>{user.first_name} {user.last_name}</span>
                      <span className="text-primary/60">+{user.country_code} {user.phone_number}</span>
                      <button
                        onClick={() => removeUser(user.id)}
                        className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-colors"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
          disabled={sending || !message.trim() || (targetType === "custom" && selectedUsers.length === 0)}
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
              {targetType === "custom"
                ? `Send SMS to ${selectedUsers.length} recipient${selectedUsers.length !== 1 ? "s" : ""}`
                : `Send SMS to ${TARGET_OPTIONS.find(o => o.value === targetType)?.label}`
              }
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
