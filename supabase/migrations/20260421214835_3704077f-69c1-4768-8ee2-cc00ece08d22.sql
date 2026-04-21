-- 1. Mark drivers offline if they haven't sent a location update in 3 hours
UPDATE public.driver_locations
SET is_online = false
WHERE is_online = true
  AND updated_at < now() - interval '3 hours';

-- 2. Free drivers stuck on trips that have been frozen for 6+ hours
UPDATE public.driver_locations
SET is_on_trip = false
WHERE driver_id IN (
  SELECT driver_id FROM public.trips
  WHERE status IN ('accepted','started','in_progress','arrived')
    AND updated_at < now() - interval '6 hours'
    AND driver_id IS NOT NULL
);

-- 3. Expire the stuck trips themselves
UPDATE public.trips
SET status = 'expired',
    cancel_reason = COALESCE(cancel_reason, 'Auto-expired: trip inactive for 6h+'),
    cancelled_at = COALESCE(cancelled_at, now())
WHERE status IN ('accepted','started','in_progress','arrived')
  AND updated_at < now() - interval '6 hours';