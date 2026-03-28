/**
 * Haversine distance between two points in meters.
 */
function distMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface ClosurePoint {
  lat: number;
  lng: number;
}

interface RoadClosureInput {
  coordinates: ClosurePoint[];
  severity: string;
}

const CLOSURE_PROXIMITY_M = 80;

/**
 * Check if a route passes near any road/lane closure.
 * Uses sampled path points for performance.
 */
function routePassesNearClosure(
  route: any,
  closures: RoadClosureInput[]
): boolean {
  if (!closures.length) return false;

  // Only block for actual road/lane closures, not hazards or cones
  const blockingClosures = closures.filter(
    (c) => c.severity === "closed" || c.severity === "lane_closed"
  );
  if (!blockingClosures.length) return false;

  const legs = route.legs || [];
  for (const leg of legs) {
    for (const step of leg.steps || []) {
      const path = step.path || [];
      // Sample every 3rd point for performance on long routes
      for (let i = 0; i < path.length; i += 3) {
        const rp = { lat: path[i].lat(), lng: path[i].lng() };
        for (const c of blockingClosures) {
          for (const cp of c.coordinates) {
            if (distMeters(rp.lat, rp.lng, cp.lat, cp.lng) < CLOSURE_PROXIMITY_M) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

/**
 * Pick the shortest-distance route from a DirectionsResult,
 * avoiding routes that pass near road/lane closures.
 */
export function pickShortestRoute(
  result: any,
  closures: RoadClosureInput[] = []
): number {
  const routes = result?.routes;
  if (!routes || routes.length === 0) return 0;

  let bestIdx = 0;
  let bestDist = Infinity;

  for (let i = 0; i < routes.length; i++) {
    // Skip routes that pass through closures (if alternatives exist)
    if (closures.length > 0 && routes.length > 1) {
      if (routePassesNearClosure(routes[i], closures)) continue;
    }

    const totalMeters = routes[i].legs.reduce(
      (sum: number, leg: any) => sum + (leg.distance?.value || 0),
      0
    );
    if (totalMeters < bestDist) {
      bestDist = totalMeters;
      bestIdx = i;
    }
  }

  // If ALL routes pass near closures, fall back to shortest anyway
  if (bestDist === Infinity) {
    bestDist = Infinity;
    for (let i = 0; i < routes.length; i++) {
      const totalMeters = routes[i].legs.reduce(
        (sum: number, leg: any) => sum + (leg.distance?.value || 0),
        0
      );
      if (totalMeters < bestDist) {
        bestDist = totalMeters;
        bestIdx = i;
      }
    }
  }

  return bestIdx;
}

/**
 * Re-order a DirectionsResult so the shortest closure-free route is at index 0.
 */
export function selectShortestRoute(
  result: any,
  closures: RoadClosureInput[] = []
): any {
  const idx = pickShortestRoute(result, closures);
  if (idx === 0) return result;

  const routes = [...result.routes];
  [routes[0], routes[idx]] = [routes[idx], routes[0]];
  return { ...result, routes };
}
