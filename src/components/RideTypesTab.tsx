import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Car, Clock } from "lucide-react";

interface RideTypesTabProps {
  userId?: string;
  vehicleTypes: Array<{ id: string; name: string }>;
  vehicles?: Array<{ id: string; plate_number: string; make?: string; model?: string; vehicle_type_id?: string; vehicle_status?: string }>;
}

interface RideTypeEntry {
  vehicle_type_id: string;
  status: string;
}

const RideTypesTab = ({ userId, vehicleTypes, vehicles = [] }: RideTypesTabProps) => {
  const [vehicleRideTypes, setVehicleRideTypes] = useState<Record<string, RideTypeEntry[]>>({});

  const fetchRideTypes = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("driver_vehicle_types")
      .select("vehicle_type_id, vehicle_id, status")
      .eq("driver_id", userId);
    const map: Record<string, RideTypeEntry[]> = {};
    (data || []).forEach((row: any) => {
      const vid = row.vehicle_id || "_legacy";
      if (!map[vid]) map[vid] = [];
      map[vid].push({ vehicle_type_id: row.vehicle_type_id, status: row.status || "approved" });
    });
    setVehicleRideTypes(map);
  }, [userId]);

  useEffect(() => { fetchRideTypes(); }, [fetchRideTypes]);

  const toggle = async (vehicleId: string, vtId: string) => {
    if (!userId) return;
    const current = vehicleRideTypes[vehicleId] || [];
    const existing = current.find(e => e.vehicle_type_id === vtId);
    if (existing) {
      // Only allow removing if it's pending (not yet approved)
      if (existing.status === "pending") {
        await supabase
          .from("driver_vehicle_types")
          .delete()
          .eq("driver_id", userId)
          .eq("vehicle_type_id", vtId)
          .eq("vehicle_id", vehicleId);
        setVehicleRideTypes(prev => ({
          ...prev,
          [vehicleId]: (prev[vehicleId] || []).filter(e => e.vehicle_type_id !== vtId),
        }));
      }
      // If approved, don't allow driver to remove — admin must do it
    } else {
      await supabase
        .from("driver_vehicle_types")
        .insert({ driver_id: userId, vehicle_type_id: vtId, vehicle_id: vehicleId, status: "pending" } as any);
      setVehicleRideTypes(prev => ({
        ...prev,
        [vehicleId]: [...(prev[vehicleId] || []), { vehicle_type_id: vtId, status: "pending" }],
      }));
    }
  };

  const activeVehicles = vehicles.filter(v => v.vehicle_status !== "rejected");

  if (activeVehicles.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ride Types per Vehicle</p>
        <div className="text-center py-6">
          <Car className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Add a vehicle first to set ride types</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ride Types per Vehicle</p>
        <p className="text-xs text-muted-foreground mt-1">Select ride types for each vehicle. New selections require admin approval.</p>
      </div>

      {activeVehicles.map((vehicle) => {
        const entries = vehicleRideTypes[vehicle.id] || [];
        const vTypeName = vehicleTypes.find(vt => vt.id === vehicle.vehicle_type_id)?.name;

        return (
          <div key={vehicle.id} className="bg-surface rounded-xl p-3 space-y-2 border border-border">
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {vehicle.make} {vehicle.model} — {vehicle.plate_number}
                </p>
                {vTypeName && (
                  <p className="text-[10px] text-muted-foreground">Primary type: {vTypeName}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {vehicleTypes.map((vt) => {
                const entry = entries.find(e => e.vehicle_type_id === vt.id);
                const isApproved = entry?.status === "approved";
                const isPending = entry?.status === "pending";
                return (
                  <button
                    key={vt.id}
                    onClick={() => toggle(vehicle.id, vt.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                      isApproved
                        ? "bg-primary text-primary-foreground cursor-default"
                        : isPending
                        ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30"
                        : "bg-card text-muted-foreground border border-border"
                    }`}
                  >
                    {isPending && <Clock className="w-3 h-3" />}
                    {vt.name}
                    {isPending && <span className="text-[9px]">(pending)</span>}
                  </button>
                );
              })}
            </div>
            {entries.filter(e => e.status === "approved").length === 0 && (
              <p className="text-[10px] text-yellow-600">⚠ No approved ride types — this vehicle won't receive trip requests</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RideTypesTab;
