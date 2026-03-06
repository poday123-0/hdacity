import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Car } from "lucide-react";

interface RideTypesTabProps {
  userId?: string;
  vehicleTypes: Array<{ id: string; name: string }>;
  vehicles?: Array<{ id: string; plate_number: string; make?: string; model?: string; vehicle_type_id?: string; vehicle_status?: string }>;
}

const RideTypesTab = ({ userId, vehicleTypes, vehicles = [] }: RideTypesTabProps) => {
  // Map: vehicleId -> vehicle_type_id[]
  const [vehicleRideTypes, setVehicleRideTypes] = useState<Record<string, string[]>>({});

  const fetchRideTypes = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("driver_vehicle_types")
      .select("vehicle_type_id, vehicle_id")
      .eq("driver_id", userId);
    const map: Record<string, string[]> = {};
    (data || []).forEach((row: any) => {
      const vid = row.vehicle_id || "_legacy";
      if (!map[vid]) map[vid] = [];
      map[vid].push(row.vehicle_type_id);
    });
    setVehicleRideTypes(map);
  }, [userId]);

  useEffect(() => { fetchRideTypes(); }, [fetchRideTypes]);

  const toggle = async (vehicleId: string, vtId: string) => {
    if (!userId) return;
    const current = vehicleRideTypes[vehicleId] || [];
    if (current.includes(vtId)) {
      await supabase
        .from("driver_vehicle_types")
        .delete()
        .eq("driver_id", userId)
        .eq("vehicle_type_id", vtId)
        .eq("vehicle_id", vehicleId);
      setVehicleRideTypes(prev => ({
        ...prev,
        [vehicleId]: (prev[vehicleId] || []).filter(id => id !== vtId),
      }));
    } else {
      await supabase
        .from("driver_vehicle_types")
        .insert({ driver_id: userId, vehicle_type_id: vtId, vehicle_id: vehicleId } as any);
      setVehicleRideTypes(prev => ({
        ...prev,
        [vehicleId]: [...(prev[vehicleId] || []), vtId],
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
        <p className="text-xs text-muted-foreground mt-1">Select which ride types each vehicle can serve. Changes take effect immediately.</p>
      </div>

      {activeVehicles.map((vehicle) => {
        const activeTypes = vehicleRideTypes[vehicle.id] || [];
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
              {vehicleTypes.map((vt) => (
                <button
                  key={vt.id}
                  onClick={() => toggle(vehicle.id, vt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activeTypes.includes(vt.id)
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground border border-border"
                  }`}
                >
                  {vt.name}
                </button>
              ))}
            </div>
            {activeTypes.length === 0 && (
              <p className="text-[10px] text-yellow-600">⚠ No ride types selected — this vehicle won't receive trip requests</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RideTypesTab;
