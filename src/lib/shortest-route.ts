/**
 * Pick the shortest-distance route from a DirectionsResult.
 * Google Maps returns the fastest route by default; when we request alternatives
 * we can compare total distance and choose the shortest one.
 */
export function pickShortestRoute(result: any): number {
  const routes = result?.routes;
  if (!routes || routes.length <= 1) return 0;

  let bestIdx = 0;
  let bestDist = Infinity;

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

  return bestIdx;
}

/**
 * Re-order a DirectionsResult so the shortest route is at index 0.
 * This makes DirectionsRenderer show the shortest route by default.
 */
export function selectShortestRoute(result: any): any {
  const idx = pickShortestRoute(result);
  if (idx === 0) return result;

  // Swap the shortest route to position 0
  const routes = [...result.routes];
  [routes[0], routes[idx]] = [routes[idx], routes[0]];
  return { ...result, routes };
}
