import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RoadClosure {
  id: string;
  closure_type: "point" | "line";
  coordinates: Array<{ lat: number; lng: number }>;
  notes: string;
  severity: string;
  expires_at: string | null;
  created_at: string;
  is_active: boolean;
}

export const useRoadClosures = () => {
  const [closures, setClosures] = useState<RoadClosure[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClosures = useCallback(async () => {
    const { data } = await supabase
      .from("road_closures")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (data) {
      // Filter out expired
      const now = new Date().toISOString();
      const active = (data as any[]).filter(
        (c) => !c.expires_at || c.expires_at > now
      );
      setClosures(active as RoadClosure[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClosures();

    const channel = supabase
      .channel("road_closures_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "road_closures" }, () => {
        fetchClosures();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchClosures]);

  const addClosure = async (closure: {
    closure_type: "point" | "line";
    coordinates: Array<{ lat: number; lng: number }>;
    notes: string;
    severity: string;
    expires_at: string | null;
  }) => {
    const { error } = await supabase.from("road_closures").insert({
      closure_type: closure.closure_type,
      coordinates: closure.coordinates as any,
      notes: closure.notes,
      severity: closure.severity,
      expires_at: closure.expires_at,
    });
    if (error) throw error;
  };

  const removeClosure = async (id: string) => {
    await supabase.from("road_closures").update({ is_active: false } as any).eq("id", id);
  };

  return { closures, loading, addClosure, removeClosure, refetch: fetchClosures };
};
