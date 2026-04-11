import { useEffect, useRef, useState, useCallback } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { supabase } from "@/integrations/supabase/client";

interface RideMapData {
  pickup?: { lat: number; lng: number; name: string };
  dropoff?: { lat: number; lng: number; name: string };
  driverLat?: number;
  driverLng?: number;
  driverIconUrl?: string | null;
  showRoute?: boolean;
}

interface VehicleMarkerData {
  id: string;
  lat: number;
  lng: number;
  name: string;
  imageUrl?: string;
  icon?: string;
  isOnTrip?: boolean;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  plate?: string;
  centerCode?: string;
  vehicleInfo?: string;
  heading?: number | null;
}

interface TripRouteData {
  id: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  pickupAddress: string;
  dropoffAddress: string;
  driverName?: string;
  status: string;
}

interface GoogleMaldivesMapProps {
  rideData?: RideMapData;
  vehicleMarkers?: VehicleMarkerData[];
  tripRoutes?: TripRouteData[];
  onMapClick?: (lat: number, lng: number) => void;
  onMapReady?: (map: google.maps.Map) => void;
}

const GoogleMaldivesMap = ({ rideData, vehicleMarkers, tripRoutes, onMapClick, onMapReady }: GoogleMaldivesMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const { isLoaded, error, mapId } = useGoogleMaps();
  const markersRef = useRef<google.maps.Marker[]>([]);
  const vehicleMarkersMapRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const tripRenderersRef = useRef<google.maps.DirectionsRenderer[]>([]);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const didInitialFitRef = useRef(false);

  // Init map
  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstance.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 4.1755, lng: 73.5093 },
      zoom: 15,
      mapId: mapId || undefined,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    mapInstance.current = map;
    onMapReady?.(map);

    // User location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!didInitialFitRef.current && !rideData?.pickup && !tripRoutes?.length && !vehicleMarkers?.length) {
          map.panTo(p);
          didInitialFitRef.current = true;
        }
        userMarkerRef.current = new google.maps.Marker({
          position: p,
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#4285F4",
            fillOpacity: 1,
            strokeColor: "white",
            strokeWeight: 3,
          },
          zIndex: 900,
        });
      }, () => {});
    }

    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        window.dispatchEvent(new CustomEvent("map-tap", { detail: { lat: e.latLng.lat(), lng: e.latLng.lng() } }));
      }
    });

    return () => {
      mapInstance.current = null;
    };
  }, [isLoaded]);

  // Ride markers & route
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Clear old
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (driverMarkerRef.current) { driverMarkerRef.current.setMap(null); driverMarkerRef.current = null; }
    if (directionsRendererRef.current) { directionsRendererRef.current.setMap(null); directionsRendererRef.current = null; }

    if (!rideData) return;
    const { pickup, dropoff, driverLat, driverLng, showRoute } = rideData;

    if (pickup) {
      const m = new google.maps.Marker({
        position: { lat: pickup.lat, lng: pickup.lng },
        map,
        label: { text: "P", color: "white", fontWeight: "bold" },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: "#22c55e", fillOpacity: 1, strokeColor: "white", strokeWeight: 3 },
        zIndex: 1000,
      });
      markersRef.current.push(m);
    }

    if (dropoff) {
      const m = new google.maps.Marker({
        position: { lat: dropoff.lat, lng: dropoff.lng },
        map,
        label: { text: "D", color: "white", fontWeight: "bold" },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 14, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "white", strokeWeight: 3 },
        zIndex: 999,
      });
      markersRef.current.push(m);
    }

    if (driverLat != null && driverLng != null) {
      driverMarkerRef.current = new google.maps.Marker({
        position: { lat: driverLat, lng: driverLng },
        map,
        icon: rideData.driverIconUrl
          ? { url: rideData.driverIconUrl, scaledSize: new google.maps.Size(36, 36), anchor: new google.maps.Point(18, 18) }
          : { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6, fillColor: "#4285F4", fillOpacity: 1, strokeColor: "white", strokeWeight: 2, rotation: 0 },
        zIndex: 1100,
      });
    }

    if (showRoute && pickup && dropoff) {
      const directionsService = new google.maps.DirectionsService();
      const origin = driverLat != null && driverLng != null ? { lat: driverLat, lng: driverLng } : { lat: pickup.lat, lng: pickup.lng };
      const waypoints = driverLat != null && driverLng != null ? [{ location: { lat: pickup.lat, lng: pickup.lng }, stopover: true }] : [];

      directionsService.route({
        origin,
        destination: { lat: dropoff.lat, lng: dropoff.lng },
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === "OK" && result && mapInstance.current) {
          const renderer = new google.maps.DirectionsRenderer({
            map: mapInstance.current,
            directions: result,
            suppressMarkers: true,
            polylineOptions: { strokeColor: "#4285F4", strokeWeight: 5, strokeOpacity: 0.85 },
          });
          directionsRendererRef.current = renderer;

          if (!didInitialFitRef.current) {
            didInitialFitRef.current = true;
          }
        }
      });
    } else if (pickup && dropoff && !didInitialFitRef.current) {
      didInitialFitRef.current = true;
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: pickup.lat, lng: pickup.lng });
      bounds.extend({ lat: dropoff.lat, lng: dropoff.lng });
      if (driverLat != null && driverLng != null) bounds.extend({ lat: driverLat, lng: driverLng });
      map.fitBounds(bounds, 60);
    }
  }, [rideData?.pickup?.lat, rideData?.dropoff?.lat, rideData?.driverLat, rideData?.driverLng, rideData?.showRoute]);

  // Update driver position smoothly
  useEffect(() => {
    if (driverMarkerRef.current && rideData?.driverLat != null && rideData?.driverLng != null) {
      driverMarkerRef.current.setPosition({ lat: rideData.driverLat, lng: rideData.driverLng });
    }
  }, [rideData?.driverLat, rideData?.driverLng]);

  // Vehicle markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (rideData?.showRoute) {
      vehicleMarkersMapRef.current.forEach(m => m.setMap(null));
      vehicleMarkersMapRef.current.clear();
      return;
    }

    const markers = vehicleMarkers || [];
    const newIds = new Set(markers.map(v => v.id || `${v.lat},${v.lng}`));

    // Remove old
    vehicleMarkersMapRef.current.forEach((marker, id) => {
      if (!newIds.has(id)) { marker.setMap(null); vehicleMarkersMapRef.current.delete(id); }
    });

    // Add/update
    markers.forEach(v => {
      const vid = v.id || `${v.lat},${v.lng}`;
      const existing = vehicleMarkersMapRef.current.get(vid);
      if (existing) {
        existing.setPosition({ lat: v.lat, lng: v.lng });
      } else {
        const marker = new google.maps.Marker({
          position: { lat: v.lat, lng: v.lng },
          map,
          icon: v.imageUrl
            ? { url: v.imageUrl, scaledSize: new google.maps.Size(28, 28), anchor: new google.maps.Point(14, 14) }
            : { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: v.isOnTrip ? "#f59e0b" : "#22c55e", fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
          zIndex: 500,
        });

        const lines: string[] = [];
        if (v.driverName) lines.push(`<strong>${v.driverName}</strong>`);
        if (v.driverPhone) lines.push(`📞 ${v.driverPhone}`);
        if (v.centerCode) lines.push(`🏷️ ${v.centerCode}`);
        if (v.plate) lines.push(`🚗 ${v.plate}`);
        if (v.vehicleInfo) lines.push(`<span style="color:#999">${v.vehicleInfo}</span>`);
        lines.push(`<span style="color:${v.isOnTrip ? '#f59e0b' : '#22c55e'};font-weight:600">${v.isOnTrip ? '● On Trip' : '● Available'}</span>`);

        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="font-size:12px;min-width:120px">${lines.join("<br/>")}</div>`,
        });
        marker.addListener("click", () => infoWindow.open(map, marker));
        vehicleMarkersMapRef.current.set(vid, marker);
      }
    });
  }, [vehicleMarkers, rideData?.showRoute]);

  // Trip routes
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    tripRenderersRef.current.forEach(r => r.setMap(null));
    tripRenderersRef.current = [];

    if (!tripRoutes || tripRoutes.length === 0) return;

    const directionsService = new google.maps.DirectionsService();

    tripRoutes.forEach(trip => {
      directionsService.route({
        origin: { lat: trip.pickupLat, lng: trip.pickupLng },
        destination: { lat: trip.dropoffLat, lng: trip.dropoffLng },
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === "OK" && result && mapInstance.current) {
          const color = trip.status === "in_progress" ? "#4285F4" : "#f59e0b";
          const renderer = new google.maps.DirectionsRenderer({
            map: mapInstance.current,
            directions: result,
            suppressMarkers: true,
            polylineOptions: { strokeColor: color, strokeWeight: 4, strokeOpacity: 0.7 },
          });
          tripRenderersRef.current.push(renderer);
        }
      });

      // Pickup marker
      new google.maps.Marker({
        position: { lat: trip.pickupLat, lng: trip.pickupLng },
        map,
        label: { text: "P", color: "white", fontWeight: "bold", fontSize: "10px" },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#22c55e", fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
        zIndex: 800,
      });
      // Dropoff marker
      new google.maps.Marker({
        position: { lat: trip.dropoffLat, lng: trip.dropoffLng },
        map,
        label: { text: "D", color: "white", fontWeight: "bold", fontSize: "10px" },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "white", strokeWeight: 2 },
        zIndex: 800,
      });
    });
  }, [tripRoutes]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted">
        <p className="text-sm text-destructive">Failed to load Google Maps: {error}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted animate-pulse">
        <p className="text-xs text-muted-foreground">Loading Google Maps…</p>
      </div>
    );
  }

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
};

export default GoogleMaldivesMap;
