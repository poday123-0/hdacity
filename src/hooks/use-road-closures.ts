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
  status: string;
  reported_by: string | null;
  reported_by_type: string;
  reporter_name?: string;
  reporter_phone?: string;
}

export const useRoadClosures = () => {
  const [closures, setClosures] = useState<RoadClosure[]>([]);
  const [pendingClosures, setPendingClosures] = useState<RoadClosure[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClosures = useCallback(async () => {
    const { data } = await supabase
      .from("road_closures")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (data) {
      const now = new Date().toISOString();
      const active = (data as any[]).filter(
        (c) => !c.expires_at || c.expires_at > now
      );

      // Fetch reporter profiles for driver-reported closures
      const driverReportedIds = active
        .filter((c) => c.reported_by_type === "driver" && c.reported_by)
        .map((c) => c.reported_by);

      let profileMap: Record<string, { first_name: string; last_name: string; phone_number: string }> = {};
      if (driverReportedIds.length > 0) {
        const uniqueIds = [...new Set(driverReportedIds)];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, phone_number")
          .in("id", uniqueIds);
        if (profiles) {
          profiles.forEach((p: any) => {
            profileMap[p.id] = p;
          });
        }
      }

      const enriched = active.map((c) => {
        const profile = c.reported_by ? profileMap[c.reported_by] : null;
        return {
          ...c,
          reporter_name: profile ? `${profile.first_name} ${profile.last_name}` : undefined,
          reporter_phone: profile?.phone_number || undefined,
        };
      });

      // Approved closures visible to everyone
      setClosures(enriched.filter((c) => (c.status || "approved") === "approved") as RoadClosure[]);
      // Pending closures for dispatch review
      setPendingClosures(enriched.filter((c) => c.status === "pending") as RoadClosure[]);
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
    status?: string;
    reported_by?: string;
    reported_by_type?: string;
    schedule_type?: string;
    schedule_days?: string[];
    schedule_start_time?: string | null;
    schedule_end_time?: string | null;
    scheduled_date?: string | null;
  }) => {
    const { error } = await supabase.from("road_closures").insert({
      closure_type: closure.closure_type,
      coordinates: closure.coordinates as any,
      notes: closure.notes,
      severity: closure.severity,
      expires_at: closure.expires_at,
      status: closure.status || "approved",
      reported_by: closure.reported_by || null,
      reported_by_type: closure.reported_by_type || "dispatch",
      schedule_type: closure.schedule_type || "immediate",
      schedule_days: closure.schedule_days || [],
      schedule_start_time: closure.schedule_start_time || null,
      schedule_end_time: closure.schedule_end_time || null,
      scheduled_date: closure.scheduled_date || null,
    } as any);
    if (error) throw error;
  };

  const removeClosure = async (id: string) => {
    await supabase.from("road_closures").update({ is_active: false } as any).eq("id", id);
  };

  const updateClosure = async (id: string, updates: {
    notes?: string;
    severity?: string;
    expires_at?: string | null;
    closure_type?: "point" | "line";
    coordinates?: Array<{ lat: number; lng: number }>;
    schedule_type?: string;
    schedule_days?: string[];
    schedule_start_time?: string | null;
    schedule_end_time?: string | null;
    scheduled_date?: string | null;
  }) => {
    const payload: any = { ...updates };
    if (updates.coordinates) payload.coordinates = updates.coordinates as any;
    const { error } = await supabase.from("road_closures").update(payload).eq("id", id);
    if (error) throw error;
  };

  const approveClosure = async (id: string) => {
    await supabase.from("road_closures").update({ status: "approved" } as any).eq("id", id);
  };

  const rejectClosure = async (id: string) => {
    await supabase.from("road_closures").update({ is_active: false, status: "rejected" } as any).eq("id", id);
  };

  return { closures, pendingClosures, loading, addClosure, removeClosure, updateClosure, approveClosure, rejectClosure, refetch: fetchClosures };
};
