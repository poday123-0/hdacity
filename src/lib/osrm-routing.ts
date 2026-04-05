/**
 * OSRM routing utility — free, no API key needed.
 * Uses the public OSRM demo server for directions.
 */

export interface OsrmRoute {
  coordinates: [number, number][]; // [lat, lng] pairs
  distanceMeters: number;
  durationSeconds: number;
  distanceText: string;
  durationText: string;
  steps: OsrmStep[];
}

export interface OsrmStep {
  instruction: string;
  distance: string;
  distanceMeters: number;
  maneuver?: string;
  endLat: number;
  endLng: number;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs} hr ${remainMins} min` : `${hrs} hr`;
}

function mapManeuver(osrmType: string, osrmModifier?: string): string {
  if (osrmType === "turn") {
    if (osrmModifier === "left" || osrmModifier === "sharp left" || osrmModifier === "slight left") return "turn-left";
    if (osrmModifier === "right" || osrmModifier === "sharp right" || osrmModifier === "slight right") return "turn-right";
    return "turn-left";
  }
  if (osrmType === "roundabout" || osrmType === "rotary") return "roundabout-right";
  if (osrmType === "merge") return "merge";
  if (osrmType === "fork") return osrmModifier?.includes("left") ? "fork-left" : "fork-right";
  if (osrmType === "end of road") return osrmModifier?.includes("left") ? "turn-left" : "turn-right";
  if (osrmType === "depart") return "straight";
  if (osrmType === "arrive") return "straight";
  return "";
}

function buildInstruction(step: any): string {
  const name = step.name || "";
  const type = step.maneuver?.type || "";
  const modifier = step.maneuver?.modifier || "";

  if (type === "depart") return name ? `Head on ${name}` : "Start driving";
  if (type === "arrive") return "You have arrived";
  if (type === "turn") {
    const dir = modifier.replace("sharp ", "").replace("slight ", "");
    return name ? `Turn ${dir} onto ${name}` : `Turn ${dir}`;
  }
  if (type === "roundabout" || type === "rotary") {
    const exit = step.maneuver?.exit || "";
    return exit ? `Take exit ${exit} from roundabout${name ? ` onto ${name}` : ""}` : `Enter roundabout${name ? `, exit onto ${name}` : ""}`;
  }
  if (type === "fork") {
    const dir = modifier?.includes("left") ? "left" : "right";
    return name ? `Keep ${dir} onto ${name}` : `Keep ${dir}`;
  }
  if (type === "merge") return name ? `Merge onto ${name}` : "Merge";
  if (type === "end of road") {
    const dir = modifier?.includes("left") ? "left" : "right";
    return name ? `Turn ${dir} onto ${name}` : `Turn ${dir}`;
  }
  if (type === "continue" || type === "new name") return name ? `Continue on ${name}` : "Continue straight";
  return name ? `Continue on ${name}` : "Continue";
}

/**
 * Fetch route from OSRM public server.
 * Supports waypoints (intermediate stops).
 */
export async function fetchOsrmRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[] = [],
  alternatives = false
): Promise<OsrmRoute[]> {
  // OSRM expects coordinates as lng,lat
  const coords = [
    `${origin.lng},${origin.lat}`,
    ...waypoints.map(w => `${w.lng},${w.lat}`),
    `${destination.lng},${destination.lat}`,
  ].join(";");

  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM error: ${res.status}`);
  const data = await res.json();

  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error(data.message || "No route found");
  }

  return data.routes.map((route: any): OsrmRoute => {
    // GeoJSON coordinates are [lng, lat] — convert to [lat, lng]
    const coordinates: [number, number][] = route.geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]] as [number, number]
    );

    const distanceMeters = route.distance;
    const durationSeconds = route.duration;

    // Extract steps from all legs
    const steps: OsrmStep[] = [];
    for (const leg of route.legs) {
      for (const step of leg.steps) {
        if (step.distance < 1 && step.maneuver?.type === "arrive") {
          // Skip arrival step with 0 distance
          steps.push({
            instruction: "You have arrived",
            distance: "",
            distanceMeters: 0,
            maneuver: "straight",
            endLat: step.maneuver.location[1],
            endLng: step.maneuver.location[0],
          });
          continue;
        }
        steps.push({
          instruction: buildInstruction(step),
          distance: formatDistance(step.distance),
          distanceMeters: step.distance,
          maneuver: mapManeuver(step.maneuver?.type, step.maneuver?.modifier),
          endLat: step.maneuver.location[1],
          endLng: step.maneuver.location[0],
        });
      }
    }

    return {
      coordinates,
      distanceMeters,
      durationSeconds,
      distanceText: formatDistance(distanceMeters),
      durationText: formatDuration(durationSeconds),
      steps,
    };
  });
}

/**
 * Pick the shortest route from OSRM results, optionally avoiding road closures.
 */
export function pickShortestOsrmRoute(
  routes: OsrmRoute[],
  closures: Array<{ coordinates: { lat: number; lng: number }[]; severity: string }> = []
): OsrmRoute {
  if (routes.length === 0) throw new Error("No routes");
  if (routes.length === 1) return routes[0];

  const blockingClosures = closures.filter(c => c.severity === "closed" || c.severity === "lane_closed");

  let best = routes[0];
  let bestDist = Infinity;

  for (const route of routes) {
    // Check if route passes near closures
    if (blockingClosures.length > 0) {
      let passesNearClosure = false;
      for (let i = 0; i < route.coordinates.length; i += 3) {
        const [rlat, rlng] = route.coordinates[i];
        for (const c of blockingClosures) {
          for (const cp of c.coordinates) {
            const dLat = (rlat - cp.lat) * 111000;
            const dLng = (rlng - cp.lng) * 111000 * Math.cos(rlat * Math.PI / 180);
            if (Math.sqrt(dLat * dLat + dLng * dLng) < 80) {
              passesNearClosure = true;
              break;
            }
          }
          if (passesNearClosure) break;
        }
        if (passesNearClosure) break;
      }
      if (passesNearClosure && routes.length > 1) continue;
    }

    if (route.distanceMeters < bestDist) {
      bestDist = route.distanceMeters;
      best = route;
    }
  }

  return best;
}
