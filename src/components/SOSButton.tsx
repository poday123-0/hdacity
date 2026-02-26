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
        className="w-12 h-12 rounded-full bg-destructive text-destructive-foreground shadow-lg flex items-center justify-center active:scale-90 transition-transform animate-pulse"
        title="Emergency SOS"
      >
        <AlertTriangle className="w-5 h-5" />
      </button>

      {/* Confirm modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-foreground/60 backdrop-blur-sm"
            onClick={() => !sending && setShowConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card rounded-2xl shadow-2xl mx-4 w-full max-w-sm p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="text-xl font-bold text-foreground">Emergency SOS</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  This will immediately alert admin and dispatch with your live location.
                  {userType === "passenger" && " SMS will also be sent to your emergency contacts."}
                </p>
              </div>

              {/* Passenger emergency contacts */}
              {userType === "passenger" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Emergency Contacts ({contacts.length})</p>
                    <button onClick={() => setShowContacts(!showContacts)} className="text-xs text-primary font-medium">
                      {showContacts ? "Hide" : "Manage"}
                    </button>
                  </div>
                  {contacts.length > 0 && (
                    <div className="space-y-1">
                      {contacts.map(c => (
                        <div key={c.id} className="flex items-center gap-2 bg-surface rounded-lg px-3 py-2 text-xs">
                          <Phone className="w-3 h-3 text-muted-foreground" />
                          <span className="flex-1 text-foreground font-medium">{c.name}</span>
                          <span className="text-muted-foreground">{c.phone_number}</span>
                          {showContacts && (
                            <button onClick={() => removeContact(c.id)} className="text-destructive"><Trash2 className="w-3 h-3" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {showContacts && (
                    <div className="bg-surface rounded-lg p-3 space-y-2">
                      <input
                        value={newContact.name}
                        onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                        placeholder="Contact name"
                        className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground"
                      />
                      <input
                        value={newContact.phone_number}
                        onChange={(e) => setNewContact({ ...newContact, phone_number: e.target.value.replace(/\D/g, "").slice(0, 7) })}
                        placeholder="Phone (7XXXXXX)"
                        className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground"
                      />
                      <input
                        value={newContact.relationship}
                        onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })}
                        placeholder="Relationship (optional)"
                        className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground"
                      />
                      <button
                        onClick={addContact}
                        disabled={addingContact || !newContact.name || !newContact.phone_number}
                        className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold disabled:opacity-50"
                      >
                        <Plus className="w-3 h-3" /> Add Contact
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Quick call buttons */}
              {(callCenterNumber || policeNumber) && (
                <div className="grid grid-cols-2 gap-2">
                  {callCenterNumber && (
                    <a
                      href={`tel:${callCenterNumber.startsWith("+") ? callCenterNumber : `+960${callCenterNumber}`}`}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary/10 text-primary font-semibold text-xs hover:bg-primary/20 transition-colors"
                    >
                      <PhoneCall className="w-4 h-4" /> Call Center
                    </a>
                  )}
                  {policeNumber && (
                    <a
                      href={`tel:${policeNumber}`}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-destructive/10 text-destructive font-semibold text-xs hover:bg-destructive/20 transition-colors"
                    >
                      <Shield className="w-4 h-4" /> Call Police
                    </a>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={sending}
                  className="flex-1 py-3 rounded-xl bg-surface text-foreground font-semibold text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={triggerSOS}
                  disabled={sending}
                  className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm disabled:opacity-50"
                >
                  {sending ? "Sending..." : "🚨 SEND SOS"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SOSButton;
