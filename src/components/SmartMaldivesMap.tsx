import { lazy, Suspense } from "react";
import { useMapProvider } from "@/hooks/use-map-provider";

// Lazy load both map implementations
const LeafletMaldivesMap = lazy(() => import("@/components/MaldivesMap"));
const GoogleMaldivesMap = lazy(() => import("@/components/GoogleMaldivesMap"));

const MapFallback = () => (
  <div className="w-full h-full flex items-center justify-center bg-muted animate-pulse">
    <p className="text-xs text-muted-foreground">Loading map…</p>
  </div>
);

// Re-export the prop types so consumers don't need to change imports
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

interface SmartMapProps {
  rideData?: RideMapData;
  vehicleMarkers?: VehicleMarkerData[];
  tripRoutes?: TripRouteData[];
  onMapClick?: (lat: number, lng: number) => void;
  onMapReady?: (map: any) => void;
}

const SmartMaldivesMap = (props: SmartMapProps) => {
  const { provider, loading } = useMapProvider();

  if (loading) return <MapFallback />;

  return (
    <Suspense fallback={<MapFallback />}>
      {provider === "google" ? (
        <GoogleMaldivesMap {...props} />
      ) : (
        <LeafletMaldivesMap {...props} />
      )}
    </Suspense>
  );
};

export default SmartMaldivesMap;
