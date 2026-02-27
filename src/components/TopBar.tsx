import { useState, useEffect, useCallback, useRef } from "react";
import { Menu, Bell, Car, X, Clock, LogOut, BellOff, Phone, Plus, Trash2, Pencil, Users, Check, Share2, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import hdaLogo from "@/assets/hda-logo.png";
import { UserProfile } from "@/components/AuthScreen";
import RideHistory from "@/components/RideHistory";
import ThemeToggle from "@/components/ThemeToggle";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface EmergencyContact {
  id: string;
  name: string;
  phone_number: string;
  relationship: string | null;
}

interface TopBarProps {
  onDriverMode?: () => void;
  onLogout?: () => void;
  userName?: string;
  userProfile?: UserProfile | null;
}

const TopBar = ({ onLogout, userName, userProfile }: TopBarProps) => {
  useTheme();
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [contactForm, setContactForm] = useState({ name: "", phone_number: "", relationship: "" });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(userProfile?.avatar_url || null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userProfile?.id) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userProfile.id}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userProfile.id);
      setAvatarUrl(publicUrl);
      // Update local session
      const sessionRaw = localStorage.getItem("hda_user_session");
      if (sessionRaw) {
        try {
          const session = JSON.parse(sessionRaw);
          session.profile.avatar_url = publicUrl;
          localStorage.setItem("hda_user_session", JSON.stringify(session));
        } catch {}
      }
      toast({ title: "Photo updated", description: "Your profile photo has been saved." });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const fetchContacts = async () => {
    if (!userProfile?.id) return;
    const { data } = await supabase.from("emergency_contacts").select("id, name, phone_number, relationship").eq("user_id", userProfile.id).eq("is_active", true).order("created_at");
    setContacts((data || []) as EmergencyContact[]);
  };

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    setLoadingNotifs(true);
    const userType = (userProfile as any)?.user_type?.toLowerCase() || "rider";
    const { data } = await supabase
      .from("notifications")
      .select("id, title, message, target_type, created_at, read_by")
      .or(`target_type.eq.all,target_type.eq.${userType === "rider" ? "passengers" : "drivers"}`)
      .order("created_at", { ascending: false })
      .limit(20);
    const notifs = (data || []) as any[];
    setNotifications(notifs);

    // Check unread
    if (userProfile?.id) {
      const unread = notifs.some(n => {
        const readBy = Array.isArray(n.read_by) ? n.read_by : [];
        return !readBy.includes(userProfile.id);
      });
      setHasUnread(unread);
    }
    setLoadingNotifs(false);
  }, [userProfile?.id, (userProfile as any)?.user_type]);

  useEffect(() => {
    fetchNotifications();
    // Subscribe to new notifications
    const channel = supabase
      .channel("user-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        fetchNotifications();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchNotifications]);

  const handleOpenNotifications = async () => {
    setShowNotifications(true);
    // Mark all as read
    if (userProfile?.id && notifications.length > 0) {
      setHasUnread(false);
      for (const n of notifications) {
        const readBy = Array.isArray(n.read_by) ? n.read_by : [];
        if (!readBy.includes(userProfile.id)) {
          await supabase.from("notifications").update({
            read_by: [...readBy, userProfile.id],
          } as any).eq("id", n.id);
        }
      }
    }
  };

  useEffect(() => {
    if (showContacts) fetchContacts();
  }, [showContacts, userProfile?.id]);

  const handleSaveContact = async () => {
    if (!userProfile?.id || !contactForm.name.trim() || !contactForm.phone_number.trim()) {
      toast({ title: "Name and phone are required", variant: "destructive" });
      return;
    }
    setSavingContact(true);
    if (editingContactId) {
      await supabase.from("emergency_contacts").update({
        name: contactForm.name.trim(),
        phone_number: contactForm.phone_number.trim(),
        relationship: contactForm.relationship.trim() || null,
      }).eq("id", editingContactId);
    } else {
      await supabase.from("emergency_contacts").insert({
        user_id: userProfile.id,
        name: contactForm.name.trim(),
        phone_number: contactForm.phone_number.trim(),
        relationship: contactForm.relationship.trim() || null,
      });
    }
    setSavingContact(false);
    setContactForm({ name: "", phone_number: "", relationship: "" });
    setEditingContactId(null);
    setShowContactForm(false);
    fetchContacts();
  };

  const handleDeleteContact = async (id: string) => {
    await supabase.from("emergency_contacts").update({ is_active: false }).eq("id", id);
    setContacts(prev => prev.filter(c => c.id !== id));
  };

  const handleEditContact = (c: EmergencyContact) => {
    setEditingContactId(c.id);
    setContactForm({ name: c.name, phone_number: c.phone_number, relationship: c.relationship || "" });
    setShowContactForm(true);
  };

  return (
    <>
      <div className="absolute top-0 left-0 right-0 z-[700] pt-[env(safe-area-inset-top,0px)] bg-gradient-to-b from-background/80 via-background/40 to-transparent">
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setShowProfile(true)}
            className="w-10 h-10 rounded-full bg-card shadow-md flex items-center justify-center active:scale-95 transition-transform"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          <div className="flex items-center gap-1.5">
            <img src={hdaLogo} alt="HDA Taxi" className="w-8 h-8 object-contain" />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenNotifications}
              className="w-10 h-10 rounded-full bg-card shadow-md flex items-center justify-center relative active:scale-95 transition-transform"
            >
              <Bell className="w-5 h-5 text-foreground" />
              {hasUnread && <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />}
            </button>
          </div>
        </div>
      </div>

      {/* Profile Panel */}
      <AnimatePresence>
        {showProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] flex items-end justify-center bg-foreground/50 backdrop-blur-sm"
            onClick={() => setShowProfile(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="bg-card rounded-t-3xl shadow-2xl w-full max-w-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 pb-6 space-y-4">
                <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>

                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">My Profile</h3>
                  <button onClick={() => setShowProfile(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="relative">
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Profile" className="w-16 h-16 rounded-2xl object-cover" />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                        {userProfile?.first_name?.[0]}{userProfile?.last_name?.[0]}
                      </div>
                    )}
                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md active:scale-90 transition-transform"
                    >
                      {uploadingAvatar ? (
                        <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Camera className="w-3.5 h-3.5 text-primary-foreground" />
                      )}
                    </button>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      {userProfile?.first_name} {userProfile?.last_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">Passenger</p>
                  </div>
                </div>

                <div className="bg-surface rounded-xl divide-y divide-border">
                  {[
                    { label: "Phone", value: `+960 ${userProfile?.phone_number || "—"}` },
                    { label: "Email", value: userProfile?.email || "Not set" },
                    { label: "Gender", value: userProfile?.gender === "1" ? "Male" : userProfile?.gender === "2" ? "Female" : userProfile?.gender || "—" },
                    { label: "Status", value: userProfile?.status || "—" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <span className="text-sm font-medium text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>

                {/* Theme toggle */}
                <ThemeToggle variant="row" />

                {/* Ride History button */}
                <button
                  onClick={() => { setShowProfile(false); setShowHistory(true); }}
                  className="w-full flex items-center gap-3 bg-surface rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">Ride History</p>
                    <p className="text-xs text-muted-foreground">View past trips & receipts</p>
                  </div>
                </button>

                {/* Emergency Contacts button */}
                <button
                  onClick={() => { setShowProfile(false); setShowContacts(true); }}
                  className="w-full flex items-center gap-3 bg-surface rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-destructive" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">Emergency Contacts</p>
                    <p className="text-xs text-muted-foreground">Manage safety contacts</p>
                  </div>
                </button>

                {/* Share App button */}
                <button
                  onClick={() => { setShowProfile(false); window.location.href = "/install"; }}
                  className="w-full flex items-center gap-3 bg-surface rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
                >
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                    <Share2 className="w-5 h-5 text-accent-foreground" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-foreground">Share App</p>
                    <p className="text-xs text-muted-foreground">Install & share with others</p>
                  </div>
                </button>

                {onLogout && (
                  <button
                    onClick={() => { setShowProfile(false); onLogout(); }}
                    className="w-full flex items-center justify-center gap-2 bg-destructive/10 text-destructive font-semibold py-3 rounded-xl text-sm active:scale-95 transition-transform"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                )}

                <button
                  onClick={() => setShowProfile(false)}
                  className="w-full bg-surface text-foreground font-semibold py-3 rounded-xl text-sm active:scale-95 transition-transform"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ride History */}
      <AnimatePresence>
        {showHistory && (
          <RideHistory userId={userProfile?.id} onClose={() => setShowHistory(false)} />
        )}
      </AnimatePresence>

      {/* Notifications Panel */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] flex items-end justify-center bg-foreground/50 backdrop-blur-sm"
            onClick={() => setShowNotifications(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="bg-card rounded-t-3xl shadow-2xl w-full max-w-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 pb-6 space-y-4 max-h-[70vh] flex flex-col">
                <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">Notifications</h3>
                  <button onClick={() => setShowNotifications(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                  {loadingNotifs ? (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                        <BellOff className="w-7 h-7 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">No notifications yet</p>
                      <p className="text-xs text-muted-foreground/70">You'll see ride updates and alerts here</p>
                    </div>
                  ) : (
                    notifications.map((n) => {
                      const readBy = Array.isArray(n.read_by) ? n.read_by : [];
                      const isUnread = userProfile?.id ? !readBy.includes(userProfile.id) : false;
                      return (
                        <div key={n.id} className={`flex items-start gap-3 rounded-xl p-3 ${isUnread ? "bg-primary/5" : "bg-surface"}`}>
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${isUnread ? "bg-primary/10" : "bg-muted"}`}>
                            <Bell className={`w-4 h-4 ${isUnread ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                            <p className="text-[10px] text-muted-foreground/60 mt-1">{new Date(n.created_at).toLocaleDateString()} · {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                          {isUnread && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />}
                        </div>
                      );
                    })
                  )}
                </div>

                <button
                  onClick={() => setShowNotifications(false)}
                  className="w-full bg-surface text-foreground font-semibold py-3 rounded-xl text-sm active:scale-95 transition-transform shrink-0"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emergency Contacts Panel */}
      <AnimatePresence>
        {showContacts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] flex items-end justify-center bg-foreground/50 backdrop-blur-sm"
            onClick={() => setShowContacts(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="bg-card rounded-t-3xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 pb-6 space-y-4">
                <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">Emergency Contacts</h3>
                  <button onClick={() => setShowContacts(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground">These contacts can be notified during SOS emergencies and shared with your driver for safety.</p>

                {/* Contact list */}
                {contacts.length > 0 ? (
                  <div className="space-y-2">
                    {contacts.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 bg-surface rounded-xl px-4 py-3">
                        <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                          <Phone className="w-4 h-4 text-destructive" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.phone_number}{c.relationship ? ` · ${c.relationship}` : ""}</p>
                        </div>
                        <button onClick={() => handleEditContact(c)} className="w-8 h-8 rounded-lg bg-card flex items-center justify-center active:scale-90 transition-transform">
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => handleDeleteContact(c.id)} className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center active:scale-90 transition-transform">
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-6 text-center gap-2">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                      <Users className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No emergency contacts yet</p>
                    <p className="text-xs text-muted-foreground/70">Add contacts who should be notified in emergencies</p>
                  </div>
                )}

                {/* Add/Edit form */}
                <AnimatePresence>
                  {showContactForm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <div className="bg-surface rounded-xl p-3 space-y-2">
                        <p className="text-xs font-bold text-foreground">{editingContactId ? "Edit Contact" : "New Contact"}</p>
                        <input
                          type="text"
                          placeholder="Contact name"
                          value={contactForm.name}
                          onChange={(e) => setContactForm(p => ({ ...p, name: e.target.value }))}
                          className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <input
                          type="tel"
                          placeholder="Phone number"
                          value={contactForm.phone_number}
                          onChange={(e) => setContactForm(p => ({ ...p, phone_number: e.target.value }))}
                          className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <input
                          type="text"
                          placeholder="Relationship (optional)"
                          value={contactForm.relationship}
                          onChange={(e) => setContactForm(p => ({ ...p, relationship: e.target.value }))}
                          className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setShowContactForm(false); setEditingContactId(null); setContactForm({ name: "", phone_number: "", relationship: "" }); }}
                            className="flex-1 bg-card border border-border text-foreground font-semibold py-2 rounded-xl text-sm active:scale-95 transition-transform"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveContact}
                            disabled={savingContact || !contactForm.name.trim() || !contactForm.phone_number.trim()}
                            className="flex-1 bg-primary text-primary-foreground font-semibold py-2 rounded-xl text-sm active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {editingContactId ? "Update" : "Save"}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!showContactForm && (
                  <button
                    onClick={() => { setShowContactForm(true); setEditingContactId(null); setContactForm({ name: "", phone_number: "", relationship: "" }); }}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-3 rounded-xl text-sm active:scale-95 transition-transform"
                  >
                    <Plus className="w-4 h-4" />
                    Add Emergency Contact
                  </button>
                )}

                <button
                  onClick={() => setShowContacts(false)}
                  className="w-full bg-surface text-foreground font-semibold py-3 rounded-xl text-sm active:scale-95 transition-transform"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default TopBar;
