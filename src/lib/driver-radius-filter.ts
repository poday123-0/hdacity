import { supabase } from "@/integrations/supabase/client";

/** Haversine distance between two coords in km */
const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export type DriverLoc = {
  driver_id: string;
  lat?: number | null;
  lng?: number | null;
  vehicle_type_id?: string | null;
};

/**
 * Filter a list of online driver locations down to drivers whose personal
 * `trip_radius_km` covers the pickup point. Used to suppress push
 * notifications to drivers who have set a smaller radius.
 *
 * Direct dispatcher assignments (target_driver_id) MUST NOT use this — they
 * should always reach the chosen driver regardless of their radius.
 */
export async function filterDriversByPersonalRadius(
  drivers: DriverLoc[],
  pickupLat: number,
  pickupLng: number
): Promise<string[]> {
  const withCoords = drivers.filter(
    (d) => typeof d.lat === "number" && typeof d.lng === "number"
  );
  if (withCoords.length === 0) return [];

  const ids = withCoords.map((d) => d.driver_id);

  // Fetch personal radius + the system default in parallel
  const [profilesRes, defaultRes] = await Promise.all([
    supabase.from("profiles").select("id, trip_radius_km").in("id", ids),
    supabase.from("system_settings").select("value").eq("key", "default_trip_radius_km").maybeSingle(),
  ]);

  const defaultRadius = defaultRes?.data?.value
    ? Number(defaultRes.data.value)
    : 10;

  const radiusByDriver = new Map<string, number>();
  (profilesRes.data || []).forEach((p: any) => {
    // Always honor the driver's saved personal radius; only use the admin
    // default when the driver has not set any value (null).
    const r = p.trip_radius_km;
    radiusByDriver.set(p.id, r == null ? defaultRadius : Number(r));
  });

  return withCoords
    .filter((d) => {
      const radius = radiusByDriver.get(d.driver_id) ?? defaultRadius;
      const dist = haversineKm(pickupLat, pickupLng, Number(d.lat), Number(d.lng));
      return dist <= radius;
    })
    .map((d) => d.driver_id);
}
