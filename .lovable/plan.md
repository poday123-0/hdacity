

## What happens when Dispatch Mode = "Broadcast to All Nearby"

This is the **legacy/default** behavior — no waves, no batching. Here is exactly what runs:

### 1. Passenger taps "Confirm Ride"
`src/pages/Index.tsx` creates the trip in `trips` (status = `requested`). It then reads `dispatch_mode`:
- If mode is `wave_broadcast` → calls `dispatch-wave-init` to create wave 1.
- If mode is `broadcast` → **skips wave init entirely**. No row is written to `trip_dispatch_waves`.

### 2. Push notifications fan out to every eligible driver at once
Still in `Index.tsx`, the same code path runs for both modes:
- Query `driver_locations` where `is_online = true`, `is_on_trip = false`, `vehicle_type_id = trip.vehicle_type_id`.
- Filter that list through `filterDriversByPersonalRadius()` (each driver's personal `trip_radius_km` vs pickup distance).
- Send a single FCM push to **all** survivors via `notifyTripRequested()`.

There is no batching — if 40 nearby drivers match, all 40 phones ring at the same moment.

### 3. Each driver app receives the trip
`src/components/DriverApp.tsx` `handleNewTrip()` runs the following gates **in order**:
1. Duplicate-call guard (same trip already being processed).
2. **Wave gate** — `dispatchModeRef.current === "wave_broadcast"` check. In broadcast mode this is **`false`**, so the wave allow-list lookup is skipped. The trip passes straight through.
3. Vehicle type match (selected vehicle vs trip vehicle).
4. Personal radius check (driver GPS vs pickup, vs each driver's `trip_radius_km`).
5. Ineligibility checks (declined-before, on another trip, etc.).
6. If all pass → ride request screen appears, sound plays, slide-to-accept shown.

### 4. First driver to accept wins
Standard race: the first driver whose `UPDATE trips SET driver_id = me, status = 'accepted'` succeeds takes the trip. All other drivers receive a realtime update, see the trip is no longer `requested`, and their request screen auto-dismisses with a "Trip Taken" sound.

### Net effect comparison

```text
Broadcast to All Nearby   |   Wave Broadcast (5 → 5 → All)
--------------------------|--------------------------------
All eligible ring at once |   Nearest 5 first, then next 5, then all
~40 phones ring at t=0    |   5 ring t=0, 5 more t=15s, all t=30s
Fastest tapper wins       |   Closest driver gets first chance
No fairness ordering      |   Distance-prioritized
No pg_cron involvement    |   Promoted every 5s by cron
trip_dispatch_waves empty |   One row per wave inserted
```

### Things that are unchanged across both modes
- Personal driver radius filter (drivers who set 3km still won't get pings 8km away).
- Vehicle-type matching.
- Direct-assign (`target_driver_id`) bypasses both dispatch modes — assigned driver always gets the trip.
- Passenger search timeout, accept timeout, and cancellation flow.
- Debug logs continue to record `handleNewTrip:enter`, rejections, and `show_screen` for every driver in both modes.

### Recommendation
Keep `broadcast` as the fallback for low-driver-density times of day (faster pickup) and switch to `wave_broadcast` during peak hours (fairer rotation, less notification spam). Both modes are interchangeable at any moment via Admin → Settings → Dispatch Configuration — no restart needed.

**No code changes required to answer this question — broadcast mode is already fully functional and is the system's default.**

