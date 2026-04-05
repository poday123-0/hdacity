import { useEffect, useRef, memo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchOsrmRoute, pickShortestOsrmRoute } from "@/lib/osrm-routing";

interface RideRequestMapProps {
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  stops?: Array<{ lat?: number | null; lng?: number | null; stop_order: number }>;
  passengerMapIconUrl?: string | null;
}

const circleIcon = (color: string, label: string, size = 28) =>
  L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${label}</div>`,
  });

const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png";

const RideRequestMap = memo(({ pickupLat, pickupLng, dropoffLat, dropoffLng, stops = [], passengerMapIconUrl }: RideRequestMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!mapRef.current || initialized.current) return;

    const hasPickup = pickupLat != null && pickupLng != null;
    const hasDropoff = dropoffLat != null && dropoffLng != null;
    if (!hasPickup && !hasDropoff) return;

    initialized.current = true;
    const isDark = document.documentElement.classList.contains("dark");

    const bounds = L.latLngBounds([]);
    if (hasPickup) bounds.extend([pickupLat!, pickupLng!]);
    if (hasDropoff) bounds.extend([dropoffLat!, dropoffLng!]);
    stops.forEach(s => {
      if (s.lat != null && s.lng != null) bounds.extend([Number(s.lat), Number(s.lng)]);
    });

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer(isDark ? DARK_TILES : LIGHT_TILES, { maxZoom: 19 }).addTo(map);
    map.fitBounds(bounds, { padding: [40, 40] });
    mapInstance.current = map;

    // Pickup marker
    if (hasPickup) {
      const icon = passengerMapIconUrl
        ? L.divIcon({
            className: "",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            html: `<img src="${passengerMapIconUrl}" style="width:24px;height:24px;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)" />`,
          })
        : circleIcon("#22c55e", "P");
      L.marker([pickupLat!, pickupLng!], { icon, zIndexOffset: 1000 }).addTo(map);
    }

    // Drop-off marker
    if (hasDropoff) {
      L.marker([dropoffLat!, dropoffLng!], { icon: circleIcon("#ef4444", "D"), zIndexOffset: 999 }).addTo(map);
    }

    // Stop markers
    stops.forEach(s => {
      if (s.lat != null && s.lng != null) {
        L.marker([Number(s.lat), Number(s.lng)], {
          icon: circleIcon("#f59e0b", `${s.stop_order}`, 20),
          zIndexOffset: 998,
        }).addTo(map);
      }
    });

    // Draw route
    if (hasPickup && hasDropoff) {
      const waypoints = stops
        .filter(s => s.lat != null && s.lng != null)
        .map(s => ({ lat: Number(s.lat), lng: Number(s.lng) }));

      fetchOsrmRoute(
        { lat: pickupLat!, lng: pickupLng! },
        { lat: dropoffLat!, lng: dropoffLng! },
        waypoints,
        true
      ).then(routes => {
        if (!mapInstance.current) return;
        const best = pickShortestOsrmRoute(routes);
        const latlngs = best.coordinates.map(c => [c[0], c[1]] as [number, number]);
        L.polyline(latlngs, { color: "#4285F4", weight: 4, opacity: 0.8 }).addTo(mapInstance.current);
      }).catch(() => {});
    }

    // Theme observer
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      // Swap tile layer
      map.eachLayer(layer => {
        if (layer instanceof L.TileLayer) map.removeLayer(layer);
      });
      L.tileLayer(isDark ? DARK_TILES : LIGHT_TILES, { maxZoom: 19 }).addTo(map);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
      map.remove();
      mapInstance.current = null;
      initialized.current = false;
    };
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, passengerMapIconUrl]);

  return <div ref={mapRef} className="w-full h-full rounded-xl" />;
});

RideRequestMap.displayName = "RideRequestMap";
export default RideRequestMap;
