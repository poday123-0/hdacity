/**
 * Reverse-geocoding using admin service locations first, then Google Maps, then Nominatim.
 */

import { supabase } from "@/integrations/supabase/client";

export interface ReverseGeocodeResult {
  name: string;
  address: string;
}

const FALLBACK: ReverseGeocodeResult = {
  name: "Selected Location",
  address: "",
};

// Cache service locations to avoid repeated DB calls
let cachedServiceLocations: { name: string; address: string; lat: number; lng: number }[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

async function getServiceLocations() {
  const now = Date.now();
  if (cachedServiceLocations && now - cacheTimestamp < CACHE_TTL) {
    return cachedServiceLocations;
  }
  const { data } = await supabase
    .from("service_locations")
    .select("name, address, lat, lng")
    .eq("is_active", true);
  cachedServiceLocations = (data || []).map((d: any) => ({
    name: d.name,
    address: d.address || d.name,
    lat: Number(d.lat),
    lng: Number(d.lng),
  }));
  cacheTimestamp = now;
  return cachedServiceLocations;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check admin-added service locations first (within 500m radius).
 */
async function findAdminLocation(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const locations = await getServiceLocations();
  let closest: { name: string; address: string; dist: number } | null = null;
  for (const loc of locations) {
    const dist = haversineMeters(lat, lng, loc.lat, loc.lng);
    if (dist <= 500 && (!closest || dist < closest.dist)) {
      closest = { name: loc.name, address: loc.address, dist };
    }
  }
  return closest ? { name: closest.name, address: closest.address } : null;
}

/** Export for use by other components */
export { getServiceLocations, haversineMeters, findAdminLocation };

/**
 * Try admin locations first, then Google Maps, then Nominatim fallback.
 */
export const reverseGeocodeLocation = async (
  lat: number,
  lng: number,
  options?: { skipAdminLocations?: boolean }
): Promise<ReverseGeocodeResult> => {
  // 1. Check admin-added locations first (unless skipped)
  if (!options?.skipAdminLocations) {
    const adminResult = await findAdminLocation(lat, lng);
    if (adminResult) return adminResult;
  }

  const g = (window as any).google;

  // 2. If Google Maps is loaded, use it
  if (g?.maps?.Geocoder) {
    try {
      const result = await googleReverseGeocode(g, lat, lng);
      if (result && result.name !== "Selected Location") return result;
    } catch {}
  }

  // 3. Fallback to Nominatim
  return nominatimReverse(lat, lng);
};

// ─── Google Maps Geocoder + Places Nearby ──────────────────────

async function googleReverseGeocode(
  g: any,
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  // Run geocoder + nearby places in parallel for speed
  const [geocodeResult, nearbyResult] = await Promise.allSettled([
    googleGeocode(g, lat, lng),
    googleNearbyPlace(g, lat, lng),
  ]);

  const geo = geocodeResult.status === "fulfilled" ? geocodeResult.value : null;
  const nearby = nearbyResult.status === "fulfilled" ? nearbyResult.value : null;

  // Prefer nearby place name (shop, cafe, etc.) over geocoder
  if (nearby) {
    return {
      name: nearby.name,
      address: geo?.address || nearby.address,
    };
  }

  return geo;
}

async function googleGeocode(
  g: any,
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  const geocoder = new g.maps.Geocoder();
  const latlng = { lat, lng };

  return new Promise((resolve) => {
    geocoder.geocode({ location: latlng }, (results: any[], status: string) => {
      if (status !== "OK" || !results?.length) {
        resolve(null);
        return;
      }

      // Find the best result — prefer POI/establishment over street address
      let poiResult: any = null;
      let streetResult: any = null;
      let buildingResult: any = null;

      for (const r of results) {
        const types: string[] = r.types || [];
        if (
          types.some((t: string) =>
            [
              "point_of_interest",
              "establishment",
              "store",
              "restaurant",
              "cafe",
              "lodging",
              "food",
              "shopping_mall",
              "hospital",
              "pharmacy",
              "school",
              "bank",
              "gas_station",
              "mosque",
              "church",
            ].includes(t)
          )
        ) {
          if (!poiResult) poiResult = r;
        } else if (types.includes("premise") || types.includes("subpremise")) {
          if (!buildingResult) buildingResult = r;
        } else if (types.includes("street_address") || types.includes("route")) {
          if (!streetResult) streetResult = r;
        }
      }

      const best = poiResult || buildingResult || streetResult || results[0];
      const name = extractGoogleName(best);
      const address = extractGoogleAddress(best, name);
      resolve({ name, address });
    });
  });
}

async function googleNearbyPlace(
  g: any,
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult | null> {
  // Need a map div for PlacesService — use existing or create hidden one
  if (!g.maps.places?.PlacesService) return null;

  const mapDiv = document.createElement("div");
  const service = new g.maps.places.PlacesService(mapDiv);
  const location = new g.maps.LatLng(lat, lng);

  return new Promise((resolve) => {
    // Search within 30m radius for nearby places
    service.nearbySearch(
      {
        location,
        radius: 30,
        // No type filter to get everything nearby
      },
      (results: any[], status: string) => {
        if (status !== "OK" || !results?.length) {
          resolve(null);
          return;
        }

        // Find the closest place
        let best: any = null;
        let bestDist = Infinity;

        for (const place of results) {
          if (!place.geometry?.location) continue;
          const plat = place.geometry.location.lat();
          const plng = place.geometry.location.lng();
          const dist = Math.sqrt(
            Math.pow(plat - lat, 2) + Math.pow(plng - lng, 2)
          );
          if (dist < bestDist) {
            bestDist = dist;
            best = place;
          }
        }

        if (best && best.name) {
          resolve({
            name: best.name,
            address: best.vicinity || "",
          });
        } else {
          resolve(null);
        }
      }
    );
  });
}

function extractGoogleName(result: any): string {
  const components: any[] = result.address_components || [];
  const types: string[] = result.types || [];

  if (
    types.some((t: string) =>
      ["point_of_interest", "establishment", "premise", "subpremise"].includes(t)
    )
  ) {
    const first = components[0];
    if (first) {
      if (types.includes("premise") || types.includes("subpremise")) {
        const street = components.find((c: any) => c.types?.includes("route"));
        if (street) {
          return `${first.long_name}, ${street.long_name}`;
        }
      }
      return first.long_name;
    }
  }

  const streetNum = components.find((c: any) => c.types?.includes("street_number"));
  const route = components.find((c: any) => c.types?.includes("route"));
  if (streetNum && route) {
    return `${streetNum.long_name} ${route.long_name}`;
  }
  if (route) return route.long_name;

  return result.formatted_address?.split(",")[0] || "Selected Location";
}

function extractGoogleAddress(result: any, excludeName: string): string {
  const parts = (result.formatted_address || "").split(",").map((p: string) => p.trim());
  const filtered = parts.filter(
    (p: string) => p.toLowerCase() !== excludeName.toLowerCase()
  );
  return filtered.slice(0, 3).join(", ") || parts.slice(1, 4).join(", ");
}

// ─── Nominatim fallback ────────────────────────────────────────

async function nominatimReverse(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=21&addressdetails=1&extratags=1&namedetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (data.error) return { ...FALLBACK, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };

    const addr = data.address || {};

    const placeName =
      data.name ||
      addr.amenity ||
      addr.shop ||
      addr.building ||
      addr.office ||
      addr.tourism ||
      addr.leisure;

    const houseAndRoad =
      addr.house_number && addr.road
        ? `${addr.house_number} ${addr.road}`
        : null;

    const roadOrArea =
      addr.road ||
      addr.pedestrian ||
      addr.residential ||
      addr.neighbourhood ||
      addr.suburb ||
      addr.city_district ||
      "";

    const name =
      placeName || houseAndRoad || roadOrArea || data.display_name?.split(",")[0] || FALLBACK.name;

    const addressParts = [
      roadOrArea && roadOrArea !== name ? roadOrArea : null,
      addr.neighbourhood && addr.neighbourhood !== name && addr.neighbourhood !== roadOrArea
        ? addr.neighbourhood
        : null,
      addr.city_district || addr.suburb || null,
      addr.city || addr.town || null,
    ].filter(Boolean);

    const address =
      addressParts.length > 0
        ? addressParts.slice(0, 3).join(", ")
        : data.display_name?.split(",").slice(1, 4).join(",").trim() ||
          `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    return { name, address };
  } catch {
    return { ...FALLBACK, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
  }
}