/**
 * Shared reverse-geocoding helper that extracts meaningful place names
 * (shops, buildings, flats) instead of just road names.
 */

interface ReverseGeocodeResult {
  name: string;
  address: string;
}

export const reverseGeocodeLocation = async (lat: number, lng: number): Promise<ReverseGeocodeResult> => {
  const fallback: ReverseGeocodeResult = {
    name: "Selected Location",
    address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
  };

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=21&addressdetails=1&extratags=1&namedetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (data.error) return fallback;

    const addr = data.address || {};

    // Build a meaningful place name — prefer the most specific identifier
    const placeName =
      data.name ||
      addr.amenity ||
      addr.shop ||
      addr.building ||
      addr.office ||
      addr.tourism ||
      addr.leisure ||
      addr.house_number
        ? [addr.house_number, addr.road].filter(Boolean).join(" ")
        : null;

    const roadOrArea =
      addr.road ||
      addr.pedestrian ||
      addr.residential ||
      addr.neighbourhood ||
      addr.suburb ||
      addr.city_district ||
      "";

    // Primary name: actual place or building name
    const name = placeName || roadOrArea || data.display_name?.split(",")[0] || fallback.name;

    // Build a descriptive address line: road, area, city
    const addressParts = [
      // If the name is already the road, skip it in address
      roadOrArea && roadOrArea !== name ? roadOrArea : null,
      addr.neighbourhood && addr.neighbourhood !== name && addr.neighbourhood !== roadOrArea ? addr.neighbourhood : null,
      addr.city_district || addr.suburb || null,
      addr.city || addr.town || null,
    ].filter(Boolean);

    const address = addressParts.length > 0
      ? addressParts.slice(0, 3).join(", ")
      : data.display_name?.split(",").slice(1, 4).join(",").trim() || fallback.address;

    return { name, address };
  } catch {
    return fallback;
  }
};
