/**
 * Reverse-geocoding using Google Maps Geocoder + Nearby Places for rich POI names.
 * Falls back to Nominatim if Google isn't loaded yet.
 */

export interface ReverseGeocodeResult {
  name: string;
  address: string;
}

const FALLBACK: ReverseGeocodeResult = {
  name: "Selected Location",
  address: "",
};

/**
 * Try Google Maps first (instant, rich POI data), then Nominatim fallback.
 */
export const reverseGeocodeLocation = async (
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult> => {
  const g = (window as any).google;

  // If Google Maps is loaded, use it — much faster & richer
  if (g?.maps?.Geocoder) {
    try {
      const result = await googleReverseGeocode(g, lat, lng);
      if (result) return result;
    } catch {}
  }

  // Fallback to Nominatim
  return nominatimReverse(lat, lng);
};

// ─── Google Maps Geocoder + Places ─────────────────────────────

async function googleReverseGeocode(
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

      // Extract a clean name
      const name = extractGoogleName(best);

      // Build address from components, excluding the name part
      const address = extractGoogleAddress(best, name);

      resolve({ name, address });
    });
  });
}

function extractGoogleName(result: any): string {
  const components: any[] = result.address_components || [];
  const types: string[] = result.types || [];

  // If it's a POI, the formatted address often starts with the name
  if (
    types.some((t: string) =>
      ["point_of_interest", "establishment", "premise", "subpremise"].includes(t)
    )
  ) {
    // First component is usually the most specific (name/number)
    const first = components[0];
    if (first) {
      // For premises, combine with street
      if (types.includes("premise") || types.includes("subpremise")) {
        const street = components.find((c: any) => c.types?.includes("route"));
        if (street) {
          return `${first.long_name} ${street.long_name}`;
        }
      }
      return first.long_name;
    }
  }

  // For street addresses: "123 Road Name"
  const streetNum = components.find((c: any) => c.types?.includes("street_number"));
  const route = components.find((c: any) => c.types?.includes("route"));
  if (streetNum && route) {
    return `${streetNum.long_name} ${route.long_name}`;
  }
  if (route) return route.long_name;

  // Fallback to first part of formatted address
  return result.formatted_address?.split(",")[0] || "Selected Location";
}

function extractGoogleAddress(result: any, excludeName: string): string {
  const parts = (result.formatted_address || "").split(",").map((p: string) => p.trim());

  // Remove the first part if it matches the name
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
