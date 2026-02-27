import { motion } from "framer-motion";
import { MapPin, Users, Luggage, Shield, Clock, Phone, Navigation, CheckCircle, Calendar, FileText } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface EmergencyContact {
  id: string;
  name: string;
  phone_number: string;
  relationship: string;
}

interface RideConfirmationProps {
  pickup: { name: string; lat: number; lng: number };
  dropoff: { name: string; lat: number; lng: number };
  vehicleType: any;
  estimatedFare: number;
  passengerCount: number;
  luggageCount: number;
  userId?: string;
  onConfirm: () => void;
  onBack: () => void;
  stops?: Array<{ name: string; lat: number; lng: number }>;
  bookingType?: "now" | "scheduled" | "hourly";
  scheduledAt?: string;
  bookingNotes?: string;
}

const RideConfirmation = ({
  pickup,
  dropoff,
  vehicleType,
  estimatedFare,
  passengerCount,
  luggageCount,
  userId,
  onConfirm,
  onBack,
  stops = [],
  bookingType = "now",
  scheduledAt,
  bookingNotes,
}: RideConfirmationProps) => {
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", phone_number: "", relationship: "" });
  const [shareWithContact, setShareWithContact] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const fetch = async () => {
      const { data } = await supabase.from("emergency_contacts").select("*").eq("user_id", userId).eq("is_active", true);
      setEmergencyContacts(data || []);
      if (data && data.length > 0) setShareWithContact(data[0].id);
    };
    fetch();
  }, [userId]);

  const addContact = async () => {
    if (!userId || !newContact.name || !newContact.phone_number) return;
    const { data } = await supabase.from("emergency_contacts").insert({
      user_id: userId,
      name: newContact.name,
      phone_number: newContact.phone_number,
      relationship: newContact.relationship,
    }).select().single();
    if (data) {
      setEmergencyContacts([...emergencyContacts, data]);
      setShareWithContact(data.id);
    }
    setNewContact({ name: "", phone_number: "", relationship: "" });
    setShowAddContact(false);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    onConfirm();
  };

  // Simple ETA estimate based on distance
  const distKm = Math.sqrt(Math.pow(pickup.lat - dropoff.lat, 2) + Math.pow(pickup.lng - dropoff.lng, 2)) * 111;
  const etaMin = Math.max(5, Math.round(distKm * 3));

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl shadow-[0_-4px_30px_rgba(0,0,0,0.12)] z-10 max-h-[85vh] overflow-y-auto"
    >
      <div className="p-4 pb-6 space-y-3">
        <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>

        <h2 className="text-lg font-bold text-foreground text-center">Confirm Your Ride</h2>

        {/* Route & ETA */}
          <div className="bg-surface rounded-xl p-3 space-y-2">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-0.5 mt-1">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              <div className="w-0.5 h-6 bg-border" />
              {stops.map((_, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-2.5 h-2.5 rounded-sm bg-accent" />
                  <div className="w-0.5 h-6 bg-border" />
                </div>
              ))}
              <div className="w-2.5 h-2.5 rounded-sm bg-foreground" />
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Pickup</p>
                <p className="text-sm font-medium text-foreground truncate">{pickup.name}</p>
              </div>
              {stops.map((s, i) => (
                <div key={i}>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Stop {i + 1}</p>
                  <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                </div>
              ))}
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Destination</p>
                <p className="text-sm font-medium text-foreground truncate">{dropoff.name}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1 border-t border-border">
            <div className="flex-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-foreground font-semibold">~{etaMin} min</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-foreground font-semibold">{passengerCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Luggage className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-foreground font-semibold">{luggageCount}</span>
            </div>
          </div>
        </div>

        {/* Booking Type Badge */}
        {bookingType !== "now" && (
          <div className={`rounded-xl p-3 flex items-center gap-3 ${bookingType === "scheduled" ? "bg-accent/10 border border-accent/20" : "bg-primary/5 border border-primary/20"}`}>
            {bookingType === "scheduled" ? <Calendar className="w-5 h-5 text-accent-foreground" /> : <Clock className="w-5 h-5 text-primary" />}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">{bookingType === "scheduled" ? "Scheduled Ride" : "Hourly Booking"}</p>
              {scheduledAt && <p className="text-[11px] text-muted-foreground">{new Date(scheduledAt).toLocaleString()}</p>}
              {bookingNotes && <p className="text-[11px] text-muted-foreground mt-0.5">📝 {bookingNotes}</p>}
            </div>
          </div>
        )}

        {/* Vehicle & Fare */}
        <div className="bg-primary/10 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-primary font-semibold">{vehicleType.name}</p>
            <p className="text-2xl font-bold text-primary">{estimatedFare.toFixed(0)} MVR{bookingType === "hourly" ? "/hr" : ""}</p>
            {bookingType === "scheduled" && Number(vehicleType.pre_booking_fee) > 0 && (
              <p className="text-[10px] text-muted-foreground">Includes {vehicleType.pre_booking_fee} MVR pre-booking fee</p>
            )}
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Navigation className="w-6 h-6 text-primary-foreground" />
          </div>
        </div>

        {/* Emergency contact */}
        <div className="bg-surface rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Safety</p>
          </div>

          {emergencyContacts.length > 0 ? (
            <div className="space-y-1.5">
              {emergencyContacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setShareWithContact(shareWithContact === c.id ? null : c.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                    shareWithContact === c.id ? "bg-primary/10 ring-1 ring-primary" : "bg-card"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${shareWithContact === c.id ? "border-primary bg-primary" : "border-border"}`}>
                    {shareWithContact === c.id && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.relationship ? `${c.relationship} • ` : ""}{c.phone_number}</p>
                  </div>
                </button>
              ))}
              <p className="text-[10px] text-muted-foreground text-center">Trip details will be shared with selected contact</p>
            </div>
          ) : null}

          {showAddContact ? (
            <div className="space-y-2 pt-1">
              <input placeholder="Contact name" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              <input placeholder="Phone number" value={newContact.phone_number} onChange={(e) => setNewContact({ ...newContact, phone_number: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              <input placeholder="Relationship (optional)" value={newContact.relationship} onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })} className="w-full px-3 py-2.5 rounded-xl bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              <div className="flex gap-2">
                <button onClick={() => setShowAddContact(false)} className="flex-1 py-2.5 rounded-xl bg-card text-sm font-semibold text-foreground active:scale-95 transition-transform">Cancel</button>
                <button onClick={addContact} disabled={!newContact.name || !newContact.phone_number} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 active:scale-95 transition-transform">Save</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddContact(true)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border text-xs font-semibold text-muted-foreground active:scale-95 transition-transform">
              <Phone className="w-3.5 h-3.5" />
              {emergencyContacts.length > 0 ? "Add another contact" : "Add emergency contact"}
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button onClick={onBack} className="flex-1 py-3.5 rounded-xl bg-surface text-foreground font-semibold text-sm active:scale-95 transition-transform">
            Back
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex-[2] py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-base active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            {confirming ? "Requesting..." : bookingType === "scheduled" ? `Schedule Ride — ${estimatedFare.toFixed(0)} MVR` : bookingType === "hourly" ? `Request Hourly — ${estimatedFare.toFixed(0)} MVR/hr` : `Request Ride — ${estimatedFare.toFixed(0)} MVR`}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default RideConfirmation;
