

## Fix: Filter Trip Requests by Driver's Radius Setting

### Problem
Currently, when a new trip request comes in, **all online drivers** receive the alert regardless of how far they are from the pickup location. The driver's `trip_radius_km` setting (adjustable in the driver profile) is only used for the visual radius circle on the map -- it does not actually filter incoming trip requests.

### Solution
Add a distance check in the `handleNewTrip` function inside `DriverApp.tsx` so that trips outside the driver's configured radius are silently ignored.

The driver's last known GPS position is already tracked in `lastPosRef` (line 206), and the driver's radius is stored in `tripRadius` state (line 152). We just need to compare the distance between the driver's position and the trip's pickup coordinates against the radius before showing the trip alert.

### Changes

**File: `src/components/DriverApp.tsx`**

1. **Create a `tripRadiusRef`** to make the current radius accessible inside the `handleNewTrip` callback without stale closures (similar to how `lastPosRef` works for position).

2. **Add distance filtering to `handleNewTrip`** (around line 461):
   - After verifying the trip is still valid (fresh, status = requested, not taken)
   - Calculate the straight-line distance (Haversine) between `lastPosRef.current` and the trip's `pickup_lat`/`pickup_lng`
   - If the distance exceeds `tripRadiusRef.current`, silently skip the trip (return without showing it)
   - If the driver's position is unknown (`lastPosRef.current` is null), allow the trip through (fail-open to avoid blocking rides)

3. **Add the same radius check to the polling fallback** (around line 596-617):
   - After fetching the latest requested trip, check distance before calling `handleNewTrip`

### Technical Details

Distance calculation (Haversine, inline helper):
```typescript
const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};
```

The check inside `handleNewTrip`:
```typescript
// Skip trips outside driver's radius (fail-open if no GPS)
if (lastPosRef.current && trip.pickup_lat && trip.pickup_lng) {
  const dist = haversineKm(lastPosRef.current.lat, lastPosRef.current.lng, 
    Number(trip.pickup_lat), Number(trip.pickup_lng));
  if (dist > tripRadiusRef.current) return;
}
```

### What This Means for You
- Drivers will **only receive trip alerts** for rides within their chosen radius
- If a driver sets their radius to 5km, they won't be bothered by trips 10km away
- The radius control (the +/- buttons you selected) will now actively control which trips appear
- If GPS is temporarily unavailable, trips will still come through to avoid missed rides

