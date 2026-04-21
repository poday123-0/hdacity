import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { X, Car, MapPin, Clock, Route, User, Phone, Calendar } from "lucide-react";
import { format } from "date-fns";

interface Props {
  competition: {
    id: string;
    title: string;
    start_date: string;
    end_date: string;
    service_location_id: string | null;
    vehicle_type_id: string | null;
    trip_source?: string;
  };
  driverId: string;
  driverName: string;
  onClose: () => void;
}

interface TripRow {
  id: string;
  completed_at: string | null;
  started_at: string | null;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  distance_km: number | null;
  duration_minutes: number | null;
  actual_fare: number | null;
  estimated_fare: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  passenger_id: string | null;
  dispatch_type: string | null;
  payment_method: string | null;
  vehicle_type_id: string | null;
  passenger_name?: string;
  passenger_phone?: string;
  vehicle_type_name?: string;
}

// Same point-in-polygon used for ranking
function pointInPolygon(lat: number, lng: number, polygon: any[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat ?? polygon[i][0];
    const yi = polygon[i].lng ?? polygon[i][1];
    const xj = polygon[j].lat ?? polygon[j][0];
    const yj = polygon[j].lng ?? polygon[j][1];
    const intersect = ((yi > lng) !== (yj > lng)) && (lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

const formatDuration = (mins: number | null) => {
  if (mins == null) return "—";
  const m = Math.round(mins);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
};

const CompetitionDriverTrips = ({ competition, driverId, driverName, onClose }: Props) => {
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // Match the same filters used by the leaderboard ranking logic
      let q = supabase
        .from("trips")
        .select("id, completed_at, started_at, pickup_address, dropoff_address, pickup_lat, pickup_lng, distance_km, duration_minutes, actual_fare, estimated_fare, customer_name, customer_phone, passenger_id, dispatch_type, payment_method, vehicle_type_id")
        .eq("driver_id", driverId)
        .eq("status", "completed")
        .gte("completed_at", competition.start_date)
        .lte("completed_at", competition.end_date)
        .order("completed_at", { ascending: false });

      const ts = competition.trip_source || "all";
      if (ts === "passenger_only") q = q.eq("dispatch_type", "passenger");
      else if (ts === "send_to_app") q = q.eq("dispatch_type", "dispatch_broadcast");
      else if (ts === "assign_only") q = q.eq("dispatch_type", "operator");
      else if (ts === "app_trips") q = q.in("dispatch_type", ["passenger", "dispatch_broadcast"]);
      else if (ts === "dispatch_all") q = q.in("dispatch_type", ["operator", "dispatch_broadcast"]);

      if (competition.vehicle_type_id) q = q.eq("vehicle_type_id", competition.vehicle_type_id);

      const { data } = await q;
      let rows = (data || []) as TripRow[];

      // Apply zone polygon filter if competition has one
      if (competition.service_location_id) {
        const { data: sl } = await supabase
          .from("service_locations")
          .select("polygon")
          .eq("id", competition.service_location_id)
          .single();
        if (sl?.polygon && Array.isArray(sl.polygon) && sl.polygon.length >= 3) {
          const poly = sl.polygon as any[];
          rows = rows.filter(t =>
            t.pickup_lat != null && t.pickup_lng != null &&
            pointInPolygon(Number(t.pickup_lat), Number(t.pickup_lng), poly)
          );
        }
      }

      // Enrich with passenger names and vehicle type
      const passengerIds = Array.from(new Set(rows.map(r => r.passenger_id).filter(Boolean))) as string[];
      const vtIds = Array.from(new Set(rows.map(r => r.vehicle_type_id).filter(Boolean))) as string[];

      const [profilesRes, vtRes] = await Promise.all([
        passengerIds.length
          ? supabase.from("profiles").select("id, first_name, last_name, phone_number").in("id", passengerIds)
          : Promise.resolve({ data: [] as any[] }),
        vtIds.length
          ? supabase.from("vehicle_types").select("id, name").in("id", vtIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const pMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));
      const vMap = new Map((vtRes.data || []).map((v: any) => [v.id, v.name]));

      rows.forEach(r => {
        const p = r.passenger_id ? pMap.get(r.passenger_id) : null;
        if (p) {
          r.passenger_name = `${(p as any).first_name || ""} ${(p as any).last_name || ""}`.trim();
          r.passenger_phone = (p as any).phone_number;
        }
        if (r.vehicle_type_id) r.vehicle_type_name = vMap.get(r.vehicle_type_id) as string;
      });

      setTrips(rows);
      setLoading(false);
    })();
  }, [competition.id, driverId]);

  const totalKm = trips.reduce((s, t) => s + (Number(t.distance_km) || 0), 0);
  const totalMins = trips.reduce((s, t) => s + (Number(t.duration_minutes) || 0), 0);
  const totalFare = trips.reduce((s, t) => s + (Number(t.actual_fare) || Number(t.estimated_fare) || 0), 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-2xl w-full max-w-4xl max-h-[88vh] overflow-hidden shadow-2xl flex flex-col border border-border"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-primary/80 px-5 py-4 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-primary-foreground/70 font-bold">
              {competition.title}
            </p>
            <h3 className="text-base font-bold text-primary-foreground truncate">
              {driverName} — {trips.length} trips
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-primary-foreground/20 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <X className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-2 px-5 py-3 border-b border-border/40 bg-surface/40 shrink-0">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Total Distance</p>
            <p className="text-sm font-bold text-foreground">{totalKm.toFixed(2)} km</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Total Duration</p>
            <p className="text-sm font-bold text-foreground">{formatDuration(totalMins)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Total Fare</p>
            <p className="text-sm font-bold text-foreground">{totalFare.toFixed(2)} MVR</p>
          </div>
        </div>

        {/* Trip list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading trips...</div>
          ) : trips.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No trips found in this date range.
            </div>
          ) : (
            <div className="space-y-2">
              {trips.map((t, idx) => {
                const date = t.completed_at ? new Date(t.completed_at) : null;
                const fare = Number(t.actual_fare) || Number(t.estimated_fare) || 0;
                const customerName = t.passenger_name || t.customer_name || "Walk-in";
                const customerPhone = t.passenger_phone || t.customer_phone || "—";
                return (
                  <div
                    key={t.id}
                    className="rounded-xl border border-border/40 bg-surface/40 p-3 space-y-2 hover:border-primary/40 transition-colors"
                  >
                    {/* Top row: # + date + fare */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          #{idx + 1}
                        </span>
                        {date && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {format(date, "MMM d, yyyy · HH:mm")}
                          </span>
                        )}
                        {t.dispatch_type && (
                          <span className="text-[9px] uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">
                            {t.dispatch_type}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-bold text-primary">{fare.toFixed(2)} MVR</span>
                    </div>

                    {/* Route */}
                    <div className="space-y-1">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-xs text-foreground truncate">{t.pickup_address || "—"}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                        <span className="text-xs text-foreground truncate">{t.dropoff_address || "—"}</span>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex flex-wrap items-center gap-3 pt-1.5 border-t border-border/30">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Route className="w-3 h-3" />
                        {t.distance_km != null ? `${Number(t.distance_km).toFixed(2)} km` : "—"}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {formatDuration(t.duration_minutes)}
                      </span>
                      {t.vehicle_type_name && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Car className="w-3 h-3" />
                          {t.vehicle_type_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <User className="w-3 h-3" />
                        {customerName}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        {customerPhone}
                      </span>
                      {t.payment_method && (
                        <span className="text-[10px] uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-bold">
                          {t.payment_method}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompetitionDriverTrips;
