import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
        className="w-10 h-10 rounded-xl bg-sos text-sos-foreground flex items-center justify-center active:scale-90 transition-transform"
        title="Emergency SOS"
      >
        <Shield className="w-[18px] h-[18px]" />
      </button>

      {/* Confirm modal — portaled to document.body so it's always viewport-centered */}
      {createPortal(
        <AnimatePresence>
          {showConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={() => !sending && setShowConfirm(false)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 24 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 12 }}
                transition={{ type: "spring", damping: 28, stiffness: 350 }}
                className="bg-card rounded-3xl w-[calc(100%-2rem)] max-w-[360px] max-h-[85vh] overflow-y-auto shadow-2xl border border-border/40"
                onClick={(e) => e.stopPropagation()}
              >
                
              {/* Header */}
              <div className="px-6 pt-6 pb-4 text-center border-b border-border/40">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.08, type: "spring", stiffness: 280, damping: 18 }}
                  className="w-12 h-12 rounded-2xl bg-sos/10 flex items-center justify-center mx-auto mb-3"
                >
                  <AlertTriangle className="w-6 h-6 text-sos" />
                </motion.div>
                <h3 className="text-base font-bold text-foreground">Emergency SOS</h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  Alert admin & dispatch with your live location
                  {userType === "passenger" && " + SMS to contacts"}
                </p>
              </div>

              <div className="p-4 space-y-3">
                {/* Quick call buttons */}
                {(callCenterNumber || policeNumber) && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {callCenterNumber && (
                      <a
                        href={`tel:${callCenterNumber.startsWith("+") ? callCenterNumber : `+960${callCenterNumber}`}`}
                        className="flex items-center gap-2.5 p-3 rounded-2xl bg-primary/8 hover:bg-primary/15 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                          <PhoneCall className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold text-primary block leading-tight">Call Center</span>
                          <span className="text-[9px] text-primary/60">Tap to call</span>
                        </div>
                      </a>
                    )}
                    {policeNumber && (
                      <a
                        href={`tel:${policeNumber}`}
                        className="flex items-center gap-2.5 p-3 rounded-2xl bg-sos/8 hover:bg-sos/15 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-xl bg-sos/15 flex items-center justify-center shrink-0">
                          <Shield className="w-4 h-4 text-sos" />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold text-sos block leading-tight">Police</span>
                          <span className="text-[9px] text-sos/60">Tap to call</span>
                        </div>
                      </a>
                    )}
                  </div>
                )}

                {/* Passenger emergency contacts */}
                {userType === "passenger" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-0.5">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Contacts ({contacts.length})
                      </p>
                      <button onClick={() => setShowContacts(!showContacts)} className="text-[10px] text-primary font-semibold">
                        {showContacts ? "Done" : "Manage"}
                      </button>
                    </div>
                    {contacts.length > 0 && (
                      <div className="space-y-1.5">
                        {contacts.map(c => (
                          <div key={c.id} className="flex items-center gap-2.5 bg-muted/30 rounded-xl px-3 py-2">
                            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Phone className="w-3 h-3 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-foreground font-medium truncate text-xs">{c.name}</p>
                              <p className="text-muted-foreground text-[10px]">{c.phone_number}</p>
                            </div>
                            {showContacts && (
                              <button onClick={() => removeContact(c.id)} className="text-sos/50 hover:text-sos transition-colors p-0.5">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {showContacts && (
                      <div className="bg-muted/20 rounded-xl p-3 space-y-2 border border-border/30">
                        <input
                          value={newContact.name}
                          onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                          placeholder="Contact name"
                          className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <input
                          value={newContact.phone_number}
                          onChange={(e) => setNewContact({ ...newContact, phone_number: e.target.value.replace(/\D/g, "").slice(0, 7) })}
                          placeholder="Phone (7XXXXXX)"
                          className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <input
                          value={newContact.relationship}
                          onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })}
                          placeholder="Relationship (optional)"
                          className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <button
                          onClick={addContact}
                          disabled={addingContact || !newContact.name || !newContact.phone_number}
                          className="w-full flex items-center justify-center gap-1.5 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-semibold disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="pt-1 space-y-2">
                  <motion.button
                    onClick={triggerSOS}
                    disabled={sending}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-3 rounded-2xl bg-sos text-sos-foreground font-bold text-sm disabled:opacity-50 shadow-lg shadow-sos/25"
                  >
                    {sending ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="inline-block w-4 h-4 border-2 border-sos-foreground/30 border-t-sos-foreground rounded-full" />
                        Sending...
                      </span>
                    ) : "🚨 Send Emergency Alert"}
                  </motion.button>
                  <button
                    onClick={() => setShowConfirm(false)}
                    disabled={sending}
                    className="w-full py-2 text-muted-foreground font-medium text-xs hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default SOSButton;
