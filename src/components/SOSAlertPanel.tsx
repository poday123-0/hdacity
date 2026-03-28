import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, X, MapPin, Phone, Clock, CheckCircle, Shield, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";

const MALDIVES_POLICE_NUMBER = "119";
const MALDIVES_AMBULANCE_NUMBER = "102";

interface SOSAlert {
  id: string;
  user_id: string;
  user_type: string;
  user_name: string;
  user_phone: string;
  trip_id: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  created_at: string;
  notes: string | null;
}

interface EmergencyContact {
  id: string;
  name: string;
  phone_number: string;
  relationship: string | null;
}

const SOS_SOUND_URL = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

const SOSAlertPanel = () => {
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [expanded, setExpanded] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevAlertCountRef = useRef(0);
  const [emergencyContacts, setEmergencyContacts] = useState<Record<string, EmergencyContact[]>>({});

  const fetchAlerts = async () => {
    const { data } = await supabase
      .from("sos_alerts")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    const alertsData = (data as SOSAlert[]) || [];
    setAlerts(alertsData);
    
    // Fetch emergency contacts for each user
    for (const alert of alertsData) {
      if (!emergencyContacts[alert.user_id]) {
        const { data: contacts } = await supabase
          .from("emergency_contacts")
          .select("*")
          .eq("user_id", alert.user_id)
          .eq("is_active", true);
        if (contacts && contacts.length > 0) {
          setEmergencyContacts(prev => ({ ...prev, [alert.user_id]: contacts as EmergencyContact[] }));
        }
      }
    }
  };

  useEffect(() => {
    fetchAlerts();

    // Realtime subscription
    const channel = supabase
      .channel("sos-alerts-realtime")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "sos_alerts",
      }, (payload) => {
        const newAlert = payload.new as SOSAlert;
        setAlerts(prev => [newAlert, ...prev]);
        // Play alarm sound
        playAlarm();
        toast({
          title: "🚨 SOS EMERGENCY!",
          description: `${newAlert.user_type === "driver" ? "Driver" : "Passenger"}: ${newAlert.user_name} needs help!`,
          variant: "destructive",
        });
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "sos_alerts",
      }, (payload) => {
        const updated = payload.new as SOSAlert;
        if (updated.status !== "active") {
          setAlerts(prev => prev.filter(a => a.id !== updated.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const alarmCtxRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAlarm = () => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (alarmCtxRef.current) {
      alarmCtxRef.current.close().catch(() => {});
      alarmCtxRef.current = null;
    }
  };

  const playAlarm = () => {
    stopAlarm(); // stop any existing alarm first
    try {
      const ctx = new AudioContext();
      alarmCtxRef.current = ctx;

      const playSirenCycle = () => {
        try {
          if (ctx.state === "closed") return;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sawtooth";
          gain.gain.value = 0.6;
          // Siren sweep up then down
          osc.frequency.setValueAtTime(600, ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.5);
          osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 1.0);
          osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 1.5);
          osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 2.0);
          gain.gain.setValueAtTime(0.6, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.2);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 2.2);
        } catch {}
      };

      // Play immediately + repeat every 3 seconds for 30 seconds
      playSirenCycle();
      let count = 0;
      alarmIntervalRef.current = setInterval(() => {
        count++;
        if (count >= 10) { stopAlarm(); return; }
        playSirenCycle();
      }, 3000);
    } catch {}
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAlarm();
  }, []);

  const resolveAlert = async (alertId: string) => {
    await supabase.from("sos_alerts").update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    }).eq("id", alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    toast({ title: "SOS Resolved" });
  };

  if (alerts.length === 0) return null;

  return (
    <div className="bg-destructive/10 border-2 border-destructive rounded-xl overflow-hidden animate-pulse">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-destructive font-bold text-sm"
      >
        <span className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          🚨 ACTIVE SOS ALERTS ({alerts.length})
        </span>
        <span className="text-xs">{expanded ? "Collapse" : "Expand"}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {alerts.map((alert) => (
                <div key={alert.id} className="bg-card border border-destructive/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          alert.user_type === "driver" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"
                        }`}>
                          {alert.user_type === "driver" ? "Driver" : "Passenger"}
                        </span>
                        <span className="text-sm font-bold text-foreground">{alert.user_name}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <a href={`tel:+960${alert.user_phone}`} className="text-primary font-medium hover:underline">
                            +960 {alert.user_phone}
                          </a>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(alert.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => resolveAlert(alert.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:opacity-90"
                    >
                      <CheckCircle className="w-3 h-3" /> Resolve
                    </button>
                  </div>

                  {alert.lat && alert.lng && (
                    <div className="space-y-2">
                      <div className="rounded-lg overflow-hidden border border-destructive/20 h-40">
                        <iframe
                          src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyCxO9qqVIyDU5C-ZKfS3Cwa3LaKaHSwNS0&q=${alert.lat},${alert.lng}&zoom=16&maptype=roadmap`}
                          width="100%"
                          height="100%"
                          style={{ border: 0 }}
                          allowFullScreen
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${alert.lat},${alert.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <MapPin className="w-4 h-4" />
                        Open in Google Maps
                      </a>
                    </div>
                  )}

                  {/* Emergency contacts */}
                  {emergencyContacts[alert.user_id]?.length > 0 && (
                    <div className="bg-surface rounded-lg p-3 space-y-1.5">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Users className="w-3 h-3" /> Emergency Contacts
                      </p>
                      {emergencyContacts[alert.user_id].map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <span className="text-foreground font-medium">
                            {c.name} {c.relationship ? <span className="text-muted-foreground">({c.relationship})</span> : ""}
                          </span>
                          <a href={`tel:+960${c.phone_number}`} className="text-primary font-medium hover:underline">
                            +960 {c.phone_number}
                          </a>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Contact numbers */}
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center justify-center gap-1.5 bg-primary/10 text-primary rounded-lg py-2.5 text-xs font-bold select-all">
                      <Phone className="w-3 h-3 shrink-0" /> +960 {alert.user_phone}
                    </div>
                    <div className="flex-1 flex items-center justify-center gap-1.5 bg-destructive/10 text-destructive rounded-lg py-2.5 text-xs font-bold select-all">
                      <Shield className="w-3 h-3 shrink-0" /> Police: {MALDIVES_POLICE_NUMBER}
                    </div>
                    <div className="flex-1 flex items-center justify-center gap-1.5 bg-destructive/10 text-destructive rounded-lg py-2.5 text-xs font-bold select-all">
                      <Phone className="w-3 h-3 shrink-0" /> Ambulance: {MALDIVES_AMBULANCE_NUMBER}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SOSAlertPanel;
