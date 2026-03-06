import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Car } from "lucide-react";

interface RideTypesTabProps {
  userId?: string;
  vehicleTypes: Array<{ id: string; name: string }>;
}

const RideTypesTab = ({ userId, vehicleTypes }: RideTypesTabProps) => {
  const [activeTypes, setActiveTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    supabase.from("driver_vehicle_types").select("vehicle_type_id").eq("driver_id", userId).then(({ data }) => {
      setActiveTypes((data || []).map((r: any) => r.vehicle_type_id));
    });
  }, [userId]);

  const toggle = async (vtId: string) => {
    if (!userId) return;
    if (activeTypes.includes(vtId)) {
      await supabase.from("driver_vehicle_types").delete().eq("driver_id", userId).eq("vehicle_type_id", vtId);
      setActiveTypes(prev => prev.filter(id => id !== vtId));
    } else {
      await supabase.from("driver_vehicle_types").insert({ driver_id: userId, vehicle_type_id: vtId });
      setActiveTypes(prev => [...prev, vtId]);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Eligible Ride Types</p>
      <p className="text-xs text-muted-foreground">Select all ride types you can serve. E.g. a van driver can also take car rides.</p>
      {vehicleTypes.length === 0 ? (
        <div className="text-center py-6">
          <Car className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No vehicle types available</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {vehicleTypes.map((vt) => (
            <button
              key={vt.id}
              onClick={() => toggle(vt.id)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                activeTypes.includes(vt.id)
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-muted-foreground border border-border"
              }`}
            >
              {vt.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default RideTypesTab;
