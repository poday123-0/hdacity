import { useState, useEffect } from "react";
import { Menu, Bell, Car, X, Clock, LogOut, BellOff, Phone, Plus, Trash2, Pencil, Users, Check } from "lucide-react";
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
  const [hasUnread, setHasUnread] = useState(true);
  const [showContacts, setShowContacts] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [contactForm, setContactForm] = useState({ name: "", phone_number: "", relationship: "" });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  const fetchContacts = async () => {
    if (!userProfile?.id) return;
    const { data } = await supabase.from("emergency_contacts").select("id, name, phone_number, relationship").eq("user_id", userProfile.id).eq("is_active", true).order("created_at");
    setContacts((data || []) as EmergencyContact[]);
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
      <div className="absolute top-0 left-0 right-0 z-[700] p-4 safe-area-top">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowProfile(true)}
            className="w-10 h-10 rounded-full bg-card shadow-md flex items-center justify-center active:scale-95 transition-transform"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          <div className="flex items-center gap-1.5">
            <img src={hdaLogo} alt="HDA Taxi" className="w-8 h-8 object-contain" />
            <span className="text-lg font-extrabold tracking-tight text-foreground">HDA</span>
            <span className="text-lg font-extrabold tracking-tight text-primary">TAXI</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowNotifications(true); setHasUnread(false); }}
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
              className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md overflow-hidden"
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
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                    {userProfile?.first_name?.[0]}{userProfile?.last_name?.[0]}
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
              className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 pb-6 space-y-4">
                <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">Notifications</h3>
                  <button onClick={() => setShowNotifications(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                    <BellOff className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                  <p className="text-xs text-muted-foreground/70">You'll see ride updates and alerts here</p>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="w-full bg-surface text-foreground font-semibold py-3 rounded-xl text-sm active:scale-95 transition-transform"
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
              className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md overflow-hidden max-h-[85vh] overflow-y-auto"
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
