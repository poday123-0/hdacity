import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, X, Plus, Trash2, Phone, Shield, PhoneCall } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SOSButtonProps {
  userId: string;
  userType: "driver" | "passenger";
  userName: string;
  userPhone: string;
  tripId?: string | null;
  visible?: boolean;
}

interface EmergencyContact {
  id: string;
  name: string;
  phone_number: string;
  relationship: string | null;
}

const SOSButton = ({ userId, userType, userName, userPhone, tripId, visible = true }: SOSButtonProps) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [newContact, setNewContact] = useState({ name: "", phone_number: "", relationship: "" });
  const [addingContact, setAddingContact] = useState(false);
  const [callCenterNumber, setCallCenterNumber] = useState("");
  const [policeNumber, setPoliceNumber] = useState("");

  useEffect(() => {
    // Fetch call center and police numbers from settings
    supabase.from("system_settings").select("key, value").in("key", ["call_center_number", "local_police_number"]).then(({ data }) => {
      data?.forEach((s: any) => {
        if (s.key === "call_center_number" && s.value) setCallCenterNumber(String(s.value).replace(/"/g, ""));
        if (s.key === "local_police_number" && s.value) setPoliceNumber(String(s.value).replace(/"/g, ""));
      });
    });

    if (userType === "passenger" && userId) {
      supabase.from("emergency_contacts").select("*").eq("user_id", userId).eq("is_active", true).then(({ data }) => {
        setContacts(data || []);
      });
    }
  }, [userId, userType]);

  const triggerSOS = async () => {
    setSending(true);
    try {
      // Get current location with multiple fallback strategies
      let lat: number | null = null;
      let lng: number | null = null;

      // Strategy 1: High-accuracy GPS
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000,
          });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        // Strategy 2: Low-accuracy fallback (network/wifi)
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 5000,
              maximumAge: 60000,
            });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // Strategy 3: Last known location from database
          if (userType === "driver") {
            const { data: loc } = await supabase
              .from("driver_locations")
              .select("lat, lng")
              .eq("driver_id", userId)
              .single();
            if (loc) {
              lat = loc.lat;
              lng = loc.lng;
            }
          } else if (userType === "passenger" && tripId) {
            // For passengers, fall back to trip pickup location
            const { data: trip } = await supabase
              .from("trips")
              .select("pickup_lat, pickup_lng")
              .eq("id", tripId)
              .single();
            if (trip?.pickup_lat && trip?.pickup_lng) {
              lat = Number(trip.pickup_lat);
              lng = Number(trip.pickup_lng);
            }
          }
        }
      }

      const { data, error } = await supabase.functions.invoke("trigger-sos", {
        body: {
          user_id: userId,
          user_type: userType,
          user_name: userName,
          user_phone: userPhone,
          trip_id: tripId || null,
          lat,
          lng,
          emergency_contacts: userType === "passenger" ? contacts : [],
        },
      });

      if (error || data?.error) {
        toast({ title: "SOS Error", description: data?.error || error?.message, variant: "destructive" });
      } else {
        toast({ title: "🚨 SOS Sent!", description: "Emergency alert has been sent to dispatch and admin." });
        setShowConfirm(false);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSending(false);
  };

  const addContact = async () => {
    if (!newContact.name || !newContact.phone_number) return;
    setAddingContact(true);
    const { data, error } = await supabase.from("emergency_contacts").insert({
      user_id: userId,
      name: newContact.name,
      phone_number: newContact.phone_number.replace(/\D/g, ""),
      relationship: newContact.relationship || null,
    }).select().single();
    if (!error && data) {
      setContacts([...contacts, data]);
      setNewContact({ name: "", phone_number: "", relationship: "" });
      toast({ title: "Contact added" });
    }
    setAddingContact(false);
  };

  const removeContact = async (id: string) => {
    await supabase.from("emergency_contacts").update({ is_active: false }).eq("id", id);
    setContacts(contacts.filter(c => c.id !== id));
  };

  if (!visible) return null;

  return (
    <>
      {/* SOS Button */}
      <button
        onClick={() => setShowConfirm(true)}
        className="w-10 h-10 rounded-xl bg-destructive text-destructive-foreground flex items-center justify-center active:scale-90 transition-transform"
        title="Emergency SOS"
      >
        <Shield className="w-[18px] h-[18px]" />
      </button>

      {/* Confirm modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3"
            onClick={() => !sending && setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", damping: 28, stiffness: 350 }}
              className="bg-card rounded-3xl w-full max-w-[340px] max-h-[85vh] overflow-y-auto shadow-2xl border border-border/50"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with red accent bar */}
              <div className="relative overflow-hidden rounded-t-3xl">
                <div className="absolute inset-x-0 top-0 h-1 bg-destructive" />
                <div className="pt-6 pb-4 px-5 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 20 }}
                    className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-3"
                  >
                    <AlertTriangle className="w-7 h-7 text-destructive" />
                  </motion.div>
                  <h3 className="text-lg font-bold text-foreground">Emergency SOS</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-[240px] mx-auto">
                    This will alert admin & dispatch with your live location
                    {userType === "passenger" && " and send SMS to your emergency contacts"}
                  </p>
                </div>
              </div>

              <div className="px-5 pb-5 space-y-3">
                {/* Quick call buttons */}
                {(callCenterNumber || policeNumber) && (
                  <div className="grid grid-cols-2 gap-2">
                    {callCenterNumber && (
                      <a
                        href={`tel:${callCenterNumber.startsWith("+") ? callCenterNumber : `+960${callCenterNumber}`}`}
                        className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-primary/8 hover:bg-primary/15 transition-colors"
                      >
                        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                          <PhoneCall className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-[11px] font-semibold text-primary">Call Center</span>
                      </a>
                    )}
                    {policeNumber && (
                      <a
                        href={`tel:${policeNumber}`}
                        className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-destructive/8 hover:bg-destructive/15 transition-colors"
                      >
                        <div className="w-9 h-9 rounded-xl bg-destructive/15 flex items-center justify-center">
                          <Shield className="w-4 h-4 text-destructive" />
                        </div>
                        <span className="text-[11px] font-semibold text-destructive">Call Police</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Passenger emergency contacts */}
                {userType === "passenger" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Emergency Contacts ({contacts.length})
                      </p>
                      <button onClick={() => setShowContacts(!showContacts)} className="text-[11px] text-primary font-medium">
                        {showContacts ? "Done" : "Manage"}
                      </button>
                    </div>
                    {contacts.length > 0 && (
                      <div className="space-y-1.5">
                        {contacts.map(c => (
                          <div key={c.id} className="flex items-center gap-2.5 bg-muted/40 rounded-xl px-3 py-2.5 text-xs">
                            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Phone className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-foreground font-medium truncate text-[13px]">{c.name}</p>
                              <p className="text-muted-foreground text-[10px]">{c.phone_number}</p>
                            </div>
                            {showContacts && (
                              <button onClick={() => removeContact(c.id)} className="text-destructive/60 hover:text-destructive transition-colors p-1">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {showContacts && (
                      <div className="bg-muted/30 rounded-xl p-3 space-y-2 border border-border/40">
                        <input
                          value={newContact.name}
                          onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                          placeholder="Contact name"
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <input
                          value={newContact.phone_number}
                          onChange={(e) => setNewContact({ ...newContact, phone_number: e.target.value.replace(/\D/g, "").slice(0, 7) })}
                          placeholder="Phone (7XXXXXX)"
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <input
                          value={newContact.relationship}
                          onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })}
                          placeholder="Relationship (optional)"
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <button
                          onClick={addContact}
                          disabled={addingContact || !newContact.name || !newContact.phone_number}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Contact
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="space-y-2 pt-1">
                  <motion.button
                    onClick={triggerSOS}
                    disabled={sending}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-3.5 rounded-2xl bg-destructive text-destructive-foreground font-bold text-sm disabled:opacity-50 transition-all shadow-lg shadow-destructive/30"
                  >
                    {sending ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="inline-block w-4 h-4 border-2 border-destructive-foreground/30 border-t-destructive-foreground rounded-full" />
                        Sending Alert...
                      </span>
                    ) : "🚨 Send Emergency Alert"}
                  </motion.button>
                  <button
                    onClick={() => setShowConfirm(false)}
                    disabled={sending}
                    className="w-full py-2.5 rounded-2xl text-muted-foreground font-medium text-sm hover:bg-muted/50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SOSButton;
