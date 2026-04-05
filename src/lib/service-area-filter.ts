/**
 * Shared utility to check if a point falls within any service area polygon.
 * Used to filter external search results (Nominatim, Photon) to only show
 * places inside the system's configured service areas.
 */

import { supabase } from "@/integrations/supabase/client";

interface ServiceAreaPolygon {
  id: string;
  name: string;
  lat: number;
  lng: number;
  polygon: { lat: number; lng: number }[] | null;
}

// Cache service areas with polygons
let cachedAreas: ServiceAreaPolygon[] | null = null;
let cacheTs = 0;
const CACHE_TTL = 60_000; // 1 min

export async function getServiceAreasWithPolygons(): Promise<ServiceAreaPolygon[]> {
  const now = Date.now();
  if (cachedAreas && now - cacheTs < CACHE_TTL) return cachedAreas;

  const { data } = await supabase
    .from("service_locations")
    .select("id, name, lat, lng, polygon")
    .eq("is_active", true);

  cachedAreas = (data || []).map((d: any) => ({
    id: d.id,
    name: d.name,
    lat: Number(d.lat),
    lng: Number(d.lng),
    polygon: d.polygon as { lat: number; lng: number }[] | null,
  }));
  cacheTs = now;
  return cachedAreas;
}

export function pointInPolygon(lat: number, lng: number, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a point is inside ANY service area polygon.
 * If no polygons are defined, falls back to a 50km radius check from area center.
 */
export function isInsideAnyServiceArea(lat: number, lng: number, areas: ServiceAreaPolygon[]): boolean {
  if (!areas.length) return true; // No areas configured = allow all

  for (const area of areas) {
    if (area.polygon && Array.isArray(area.polygon) && area.polygon.length >= 3) {
      if (pointInPolygon(lat, lng, area.polygon)) return true;
    } else {
      // Fallback: simple distance check (50km)
      const R = 6371;
      const dLat = ((lat - area.lat) * Math.PI) / 180;
      const dLng = ((lng - area.lng) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((area.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
      const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (d <= 50) return true;
    }
  }
  return false;
}
