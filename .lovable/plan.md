

## Plan: Upgrade Passenger Location Search to Match Driver/Dispatch Speed

### Problem
The passenger search in `LocationInput.tsx` uses a slow 350ms debounce with sequential fetching (local DB then Nominatim only). The driver and dispatch searches are much faster with 80ms debounce, parallel fetching, AbortController for cancellation, and progressive result merging.

### Changes

**File: `src/components/LocationInput.tsx`**

Replace the search logic (lines 204-260) with the optimized pattern already used in DriverApp/Dispatch:

1. **Reduce debounce from 350ms to 80ms** for instant-feel results
2. **Add AbortController** to cancel stale requests as user types — prevents flickering and wasted network calls
3. **Parallel fetch from 3 sources simultaneously:**
   - Local DB (service_locations + named_locations) — instant, already loaded
   - Nominatim (free OSM) — restricted to Maldives
   - Photon (Komoot, free OSM) — biased to Maldives coordinates for additional coverage
4. **Progressive merge** — show local results immediately, then merge Nominatim/Photon results as they arrive with deduplication
5. **Relevance scoring** — exact match > starts with > contains, local DB results ranked higher
6. **Search named_locations more broadly** — match against name, address, description, and group_name fields (currently only matching name and address)

### Technical Details
- Port the same `AbortController` + parallel fetch + progressive merge pattern from `DriverApp.tsx` (lines ~3050-3120) into `LocationInput.tsx`
- Keep existing saved locations, map picker, and service area polygon logic untouched
- The `locations` state already contains both service and named locations — just expand the filter to also check description fields by fetching named_locations with description/group_name included

