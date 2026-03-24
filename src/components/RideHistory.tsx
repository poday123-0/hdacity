import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Clock, MapPin, ChevronRight, Receipt, ArrowLeft, X, Star, Download, MessageSquare, FileText } from "lucide-react";
import { format } from "date-fns";
import TripChat from "@/components/TripChat";
import TripInvoice from "@/components/TripInvoice";

interface RideHistoryProps {
  userId?: string;
  userType?: "passenger" | "driver";
  onClose: () => void;
}

interface TripRecord {
  id: string;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  estimated_fare: number | null;
  actual_fare: number | null;
  created_at: string;
  completed_at: string | null;
  passenger_count: number;
  luggage_count: number;
  rating: number | null;
  distance_km: number | null;
  duration_minutes: number | null;
  vehicle_type: { name: string } | null;
}

const RideHistory = ({ userId, userType = "passenger", onClose }: RideHistoryProps) => {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null);
  const [chatTripId, setChatTripId] = useState<string | null>(null);
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({});
  const [invoiceTrip, setInvoiceTrip] = useState<TripRecord | null>(null);

  useEffect(() => {
    const fetchTrips = async () => {
      const query = supabase
        .from("trips")
        .select("id, pickup_address, dropoff_address, status, estimated_fare, actual_fare, created_at, completed_at, passenger_count, luggage_count, rating, distance_km, duration_minutes, vehicle_types(name)")
        .order("created_at", { ascending: false })
        .limit(50);

      if (userId) {
        if (userType === "driver") {
          query.eq("driver_id", userId);
        } else {
          query.eq("passenger_id", userId);
        }
      }

      const { data } = await query;
      const tripData = (data || []).map((t: any) => ({ ...t, vehicle_type: t.vehicle_types }));
      setTrips(tripData);

      // Fetch message counts
      if (tripData.length > 0) {
        const tripIds = tripData.map((t: any) => t.id);
        const { data: msgs } = await supabase
          .from("trip_messages")
          .select("trip_id")
          .in("trip_id", tripIds);
        const counts: Record<string, number> = {};
        (msgs || []).forEach((m: any) => { counts[m.trip_id] = (counts[m.trip_id] || 0) + 1; });
        setMessageCounts(counts);
      }

      setLoading(false);
    };
    fetchTrips();
  }, [userId, userType]);

  const statusColor = (s: string) => {
    if (s === "completed") return "text-primary bg-primary/10";
    if (s === "cancelled") return "text-destructive bg-destructive/10";
    return "text-muted-foreground bg-surface";
  };

  if (selectedTrip) {
    return (
      <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[700] flex items-end justify-center bg-foreground/50 backdrop-blur-sm" onClick={onClose}>
        <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 pb-6 space-y-4">
            <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>

            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedTrip(null)} className="w-9 h-9 rounded-full bg-surface flex items-center justify-center active:scale-90 transition-transform">
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-foreground">Trip Receipt</h2>
                <p className="text-xs text-muted-foreground">{format(new Date(selectedTrip.created_at), "dd MMM yyyy, hh:mm a")}</p>
              </div>
            </div>

            {/* Receipt card */}
            <div className="bg-surface rounded-2xl p-4 space-y-4">
              {/* Route */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-0.5 mt-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  <div className="w-0.5 h-8 bg-border" />
                  <div className="w-2.5 h-2.5 rounded-sm bg-foreground" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Pickup</p>
                    <p className="text-sm font-medium text-foreground">{selectedTrip.pickup_address}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Dropoff</p>
                    <p className="text-sm font-medium text-foreground">{selectedTrip.dropoff_address}</p>
                  </div>
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* Fare */}
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Fare</p>
                <p className="text-3xl font-bold text-primary">{selectedTrip.actual_fare || selectedTrip.estimated_fare || 0} MVR</p>
                {(selectedTrip as any).passenger_bonus > 0 && (
                  <p className="text-xs text-primary/80 font-medium mt-0.5">Includes +{(selectedTrip as any).passenger_bonus} MVR boost</p>
                )}
              </div>

              <div className="h-px bg-border" />

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Status", value: selectedTrip.status.charAt(0).toUpperCase() + selectedTrip.status.slice(1) },
                  { label: "Vehicle", value: selectedTrip.vehicle_type?.name || "—" },
                  { label: "Distance", value: selectedTrip.distance_km ? `${selectedTrip.distance_km} km` : "—" },
                  { label: "Duration", value: selectedTrip.duration_minutes ? `${selectedTrip.duration_minutes} min` : "—" },
                  { label: "Passengers", value: String(selectedTrip.passenger_count) },
                  { label: "Luggage", value: String(selectedTrip.luggage_count) },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">{item.label}</p>
                    <p className="text-sm font-medium text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>

              {selectedTrip.rating && (
                <>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`w-5 h-5 ${s <= selectedTrip.rating! ? "text-primary fill-primary" : "text-border"}`} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* View Chat button */}
            {(messageCounts[selectedTrip.id] || 0) > 0 && (
              <button
                onClick={() => setChatTripId(selectedTrip.id)}
                className="w-full py-2.5 rounded-xl bg-surface flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">View Chat ({messageCounts[selectedTrip.id]} messages)</span>
              </button>
            )}

            {selectedTrip.status === "completed" && (
              <button
                onClick={() => setInvoiceTrip(selectedTrip)}
                className="w-full py-2.5 rounded-xl bg-primary/10 flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-primary">Generate Invoice</span>
              </button>
            )}

            <p className="text-center text-[10px] text-muted-foreground">Trip ID: {selectedTrip.id.slice(0, 8)}</p>
          </div>
        </motion.div>
      </motion.div>
      {chatTripId && (
        <TripChat tripId={chatTripId} senderId={userId} senderType={userType} isOpen={true} onClose={() => setChatTripId(null)} readOnly />
      )}
      {invoiceTrip && (
        <TripInvoice trip={invoiceTrip} onClose={() => setInvoiceTrip(null)} />
      )}
      </>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[700] flex items-end justify-center bg-foreground/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="bg-card rounded-t-3xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 space-y-3">
          <div className="flex justify-center"><div className="w-10 h-1 rounded-full bg-border" /></div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Ride History</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center"><X className="w-4 h-4 text-foreground" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : trips.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No rides yet</p>
            </div>
          ) : (
            trips.map((trip) => (
              <button key={trip.id} onClick={() => setSelectedTrip(trip)} className="w-full bg-surface rounded-xl p-3 flex items-center gap-3 active:scale-[0.98] transition-transform text-left">
                <div className="w-10 h-10 rounded-xl bg-card flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground truncate">{trip.pickup_address} → {trip.dropoff_address}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(trip.status)}`}>{trip.status}</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(trip.created_at), "dd MMM, hh:mm a")}</span>
                    {(messageCounts[trip.id] || 0) > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-primary font-medium">
                        <MessageSquare className="w-3 h-3" />{messageCounts[trip.id]}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-foreground">{trip.actual_fare || trip.estimated_fare || 0}{(trip as any).passenger_bonus > 0 ? <span className="text-[9px] text-primary font-bold ml-0.5">+{(trip as any).passenger_bonus}</span> : null}</p>
                  <p className="text-[10px] text-muted-foreground">MVR</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default RideHistory;
