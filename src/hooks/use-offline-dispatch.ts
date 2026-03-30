import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const QUEUE_KEY = "hda_offline_trip_queue";
const DRIVER_CACHE_KEY = "hda_offline_driver_cache";

export interface QueuedTrip {
  id: string;
  payload: Record<string, any>;
  queuedAt: string;
}

export function useOfflineDispatch() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queuedTrips, setQueuedTrips] = useState<QueuedTrip[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  // Load queue from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      if (stored) setQueuedTrips(JSON.parse(stored));
    } catch {}
  }, []);

  // Save queue to localStorage
  const persistQueue = useCallback((queue: QueuedTrip[]) => {
    setQueuedTrips(queue);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }, []);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({ title: "✅ Back online", description: "Connection restored. Syncing queued trips..." });
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast({ title: "⚠️ You are offline", description: "Trips will be queued and sent when connection returns.", variant: "destructive" });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Auto-sync when back online
  useEffect(() => {
    if (isOnline && queuedTrips.length > 0 && !syncingRef.current) {
      syncQueue();
    }
  }, [isOnline]);

  // Queue a trip when offline
  const queueTrip = useCallback((payload: Record<string, any>) => {
    const entry: QueuedTrip = {
      id: crypto.randomUUID(),
      payload,
      queuedAt: new Date().toISOString(),
    };
    const updated = [...queuedTrips, entry];
    persistQueue(updated);
    toast({ title: "📋 Trip queued offline", description: `Will be sent when connection returns. ${updated.length} trip(s) in queue.` });
    return entry;
  }, [queuedTrips, persistQueue]);

  // Remove a trip from queue
  const removeFromQueue = useCallback((id: string) => {
    const updated = queuedTrips.filter(t => t.id !== id);
    persistQueue(updated);
  }, [queuedTrips, persistQueue]);

  // Sync all queued trips
  const syncQueue = useCallback(async () => {
    if (syncingRef.current || queuedTrips.length === 0) return;
    syncingRef.current = true;
    setIsSyncing(true);

    const remaining: QueuedTrip[] = [];
    let synced = 0;

    for (const item of queuedTrips) {
      try {
        const { error } = await supabase.from("trips").insert(item.payload);
        if (error) {
          console.error("Failed to sync queued trip:", error);
          remaining.push(item);
        } else {
          synced++;
        }
      } catch (e) {
        console.error("Sync error:", e);
        remaining.push(item);
      }
    }

    persistQueue(remaining);
    syncingRef.current = false;
    setIsSyncing(false);

    if (synced > 0) {
      toast({ title: "✅ Synced!", description: `${synced} queued trip(s) submitted successfully.${remaining.length > 0 ? ` ${remaining.length} failed.` : ""}` });
    }
    if (remaining.length > 0) {
      toast({ title: "⚠️ Some trips failed", description: `${remaining.length} trip(s) could not be synced. Will retry.`, variant: "destructive" });
    }
  }, [queuedTrips, persistQueue]);

  // Cache driver contact info for offline phone calls
  const cacheDrivers = useCallback((drivers: Array<{ driver_id: string; first_name: string; last_name: string; phone_number: string; plate_number?: string; vehicle_name?: string }>) => {
    try {
      localStorage.setItem(DRIVER_CACHE_KEY, JSON.stringify({
        drivers,
        cachedAt: new Date().toISOString(),
      }));
    } catch {}
  }, []);

  const getCachedDrivers = useCallback(() => {
    try {
      const stored = localStorage.getItem(DRIVER_CACHE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  }, []);

  return {
    isOnline,
    queuedTrips,
    isSyncing,
    queueTrip,
    removeFromQueue,
    syncQueue,
    cacheDrivers,
    getCachedDrivers,
  };
}
