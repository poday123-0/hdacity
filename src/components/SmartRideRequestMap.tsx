import { lazy, Suspense, memo } from "react";
import { useMapProvider } from "@/hooks/use-map-provider";

const LeafletRideRequestMap = lazy(() => import("@/components/RideRequestMap"));
const GoogleRideRequestMap = lazy(() => import("@/components/GoogleRideRequestMap"));

interface SmartRideRequestMapProps {
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  stops?: Array<{ lat?: number | null; lng?: number | null; stop_order: number }>;
  passengerMapIconUrl?: string | null;
}

const SmartRideRequestMap = memo((props: SmartRideRequestMapProps) => {
  const { provider, loading } = useMapProvider();

  if (loading) return <div className="w-full h-full bg-muted animate-pulse" />;

  return (
    <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse" />}>
      {provider === "google" ? (
        <GoogleRideRequestMap {...props} />
      ) : (
        <LeafletRideRequestMap {...props} />
      )}
    </Suspense>
  );
});

SmartRideRequestMap.displayName = "SmartRideRequestMap";
export default SmartRideRequestMap;
