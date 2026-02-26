import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, X, MapPin, Phone, Clock, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "@/hooks/use-toast";

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

const SOS_SOUND_URL = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

const SOSAlertPanel = () => {
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [expanded, setExpanded] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevAlertCountRef = useRef(0);

  const fetchAlerts = async () => {
    const { data } = await supabase
      .from("sos_alerts")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    setAlerts((data as SOSAlert[]) || []);
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

  const playAlarm = () => {
    try {
      // Create a repeating alarm using AudioContext
      const ctx = new AudioContext();
      const playBeep = (freq: number, startTime: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "square";
        gain.gain.value = 0.3;
        osc.start(startTime);
        osc.stop(startTime + 0.3);
      };
      // Urgent alarm pattern
      for (let i = 0; i < 6; i++) {
        playBeep(880, ctx.currentTime + i * 0.5);
        playBeep(660, ctx.currentTime + i * 0.5 + 0.25);
      }
    } catch {}
  };

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
                    <a
                      href={`https://www.google.com/maps?q=${alert.lat},${alert.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <MapPin className="w-4 h-4" />
                      View Live Location on Map
                    </a>
                  )}

                  {/* Quick SMS option */}
                  <div className="flex gap-2">
                    <a
                      href={`tel:+960${alert.user_phone}`}
                      className="flex-1 flex items-center justify-center gap-1 bg-primary/10 text-primary rounded-lg py-2 text-xs font-semibold hover:bg-primary/20"
                    >
                      <Phone className="w-3 h-3" /> Call
                    </a>
                    <a
                      href={`sms:+960${alert.user_phone}?body=HDA Emergency: We received your SOS. Help is on the way.`}
                      className="flex-1 flex items-center justify-center gap-1 bg-accent text-accent-foreground rounded-lg py-2 text-xs font-semibold hover:bg-accent/80"
                    >
                      Send SMS
                    </a>
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
