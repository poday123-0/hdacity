import { useRef, useState, useEffect } from "react";
import { toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/hooks/use-branding";
import { format } from "date-fns";
import { Download, X, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TripInvoiceProps {
  trip: any;
  driverProfile?: { first_name?: string; last_name?: string; phone_number?: string; id?: string } | null;
  passengerProfile?: { first_name?: string; last_name?: string; phone_number?: string; avatar_url?: string | null } | null;
  onClose: () => void;
}

const TripInvoice = ({ trip, driverProfile, passengerProfile, onClose }: TripInvoiceProps) => {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [vehicleTypeName, setVehicleTypeName] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const branding = useBranding();

  useEffect(() => {
    const load = async () => {
      if (trip.vehicle_type_id) {
        const { data } = await supabase.from("vehicle_types").select("name").eq("id", trip.vehicle_type_id).maybeSingle();
        if (data?.name) setVehicleTypeName(data.name);
      } else if (trip.vehicle_type?.name) {
        setVehicleTypeName(trip.vehicle_type.name);
      }
      if (trip.vehicle_id) {
        const { data } = await supabase.from("vehicles").select("plate_number, make, model").eq("id", trip.vehicle_id).maybeSingle();
        if (data?.plate_number) setVehiclePlate(data.plate_number);
      }
    };
    load();
    };
    load();
  }, [trip]);

  const handleExport = async () => {
    if (!invoiceRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(invoiceRef.current, { pixelRatio: 3, backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = `invoice-${trip.id?.slice(0, 8) || "trip"}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Invoice downloaded ✅" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
    setExporting(false);
  };

  const fare = trip.actual_fare || trip.estimated_fare || 0;
  const isHourly = trip.fare_type === "hourly";
  const passengerName = passengerProfile
    ? `${passengerProfile.first_name || ""} ${passengerProfile.last_name || ""}`.trim()
    : trip.customer_name || "—";
  const driverName = driverProfile
    ? `${driverProfile.first_name || ""} ${driverProfile.last_name || ""}`.trim()
    : "—";
  const companyName = branding.appName || "HDA TAXI";
  const logoUrl = branding.logoUrl;
  const tripDate = trip.completed_at || trip.created_at;

  // Hourly calculations
  const hourlyStart = trip.hourly_started_at;
  const hourlyEnd = trip.hourly_ended_at;
  let hourlyDuration = "";
  if (isHourly && hourlyStart && hourlyEnd) {
    const diffMs = new Date(hourlyEnd).getTime() - new Date(hourlyStart).getTime();
    const h = Math.floor(diffMs / 3600000);
    const m = Math.round((diffMs % 3600000) / 60000);
    hourlyDuration = h > 0 ? `${h}h ${m}m` : `${m} min`;
  }

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Action bar */}
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">Trip Invoice</h3>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg disabled:opacity-50">
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Save PNG
            </button>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Invoice content — this is what gets exported */}
        <div ref={invoiceRef} style={{ backgroundColor: "#ffffff", padding: 24, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              {logoUrl ? (
                <img src={logoUrl} alt={companyName} crossOrigin="anonymous" style={{ height: 36, objectFit: "contain" }} />
              ) : (
                <div style={{ fontSize: 18, fontWeight: 800, color: "#1a1a1a", letterSpacing: -0.5 }}>{companyName}</div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a1a", letterSpacing: -0.5 }}>INVOICE</div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>#{trip.id?.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>

          {/* Date + type badge */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: "#666" }}>
              {tripDate ? format(new Date(tripDate), "dd MMMM yyyy · hh:mm a") : "—"}
            </div>
            <div style={{
              fontSize: 9, fontWeight: 700, color: "#fff",
              backgroundColor: isHourly ? "#f59e0b" : "#40A3DB",
              padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5
            }}>
              {isHourly ? "Hourly" : "Distance"}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: "#e5e5e5", marginBottom: 16 }} />

          {/* Route */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#22c55e" }} />
                <div style={{ width: 1.5, height: 28, backgroundColor: "#d4d4d4", margin: "3px 0" }} />
                <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: "#ef4444" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>PICKUP</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a", marginTop: 1 }}>{trip.pickup_address || "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1 }}>DROP-OFF</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a", marginTop: 1 }}>{trip.dropoff_address || "—"}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: "#e5e5e5", marginBottom: 16 }} />

          {/* Details grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px", marginBottom: 16 }}>
            <DetailItem label="Passenger" value={passengerName} />
            <DetailItem label="Driver" value={driverName} />
            <DetailItem label="Vehicle Type" value={vehicleTypeName || "—"} />
            <DetailItem label="Plate No." value={vehiclePlate || "—"} />
            <DetailItem label="Passengers" value={String(trip.passenger_count || 1)} />
            <DetailItem label="Luggage" value={String(trip.luggage_count || 0)} />
            {!isHourly && (
              <>
                <DetailItem label="Distance" value={trip.distance_km ? `${Number(trip.distance_km).toFixed(1)} km` : "—"} />
                <DetailItem label="Duration" value={trip.duration_minutes ? `${Math.round(Number(trip.duration_minutes))} min` : "—"} />
              </>
            )}
            {isHourly && (
              <>
                <DetailItem label="Start Time" value={hourlyStart ? format(new Date(hourlyStart), "hh:mm a") : "—"} />
                <DetailItem label="End Time" value={hourlyEnd ? format(new Date(hourlyEnd), "hh:mm a") : "—"} />
                <DetailItem label="Duration" value={hourlyDuration || "—"} />
              </>
            )}
            <DetailItem label="Payment" value={(trip.payment_method || "cash").charAt(0).toUpperCase() + (trip.payment_method || "cash").slice(1)} />
            {trip.booking_type === "scheduled" && trip.scheduled_at && (
              <DetailItem label="Scheduled" value={format(new Date(trip.scheduled_at), "dd MMM, hh:mm a")} />
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: "#e5e5e5", marginBottom: 16 }} />

          {/* Fare breakdown */}
          <div style={{ backgroundColor: "#f8f8f8", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            {trip.estimated_fare && trip.actual_fare && trip.estimated_fare !== trip.actual_fare && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#888" }}>Estimated Fare</span>
                <span style={{ fontSize: 10, color: "#888", textDecoration: "line-through" }}>{Number(trip.estimated_fare).toFixed(2)} MVR</span>
              </div>
            )}
            {(trip.passenger_bonus || 0) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>Passenger Boost</span>
                <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>+{Number(trip.passenger_bonus).toFixed(2)} MVR</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#1a1a1a" }}>Total</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: "#40A3DB" }}>{Number(fare).toFixed(2)} MVR</span>
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#bbb", letterSpacing: 0.5 }}>
              Thank you for riding with {companyName}
            </div>
            <div style={{ fontSize: 7, color: "#ddd", marginTop: 4 }}>
              Generated {format(new Date(), "dd MMM yyyy, hh:mm a")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DetailItem = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div style={{ fontSize: 8, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
    <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a1a", marginTop: 1 }}>{value}</div>
  </div>
);

export default TripInvoice;
