-- Force-expire trips already inactive for 2h+ and free their drivers
WITH stuck AS (
  SELECT id, driver_id FROM public.trips
  WHERE status IN ('accepted','started','in_progress','arrived')
    AND updated_at < now() - INTERVAL '2 hours'
)
UPDATE public.trips t
   SET status = 'expired',
       cancel_reason = 'Auto-expired: trip inactive for 2h+',
       cancelled_at = now()
  FROM stuck WHERE t.id = stuck.id;

UPDATE public.driver_locations dl
   SET is_on_trip = false
 WHERE driver_id IN (
   SELECT driver_id FROM public.trips
   WHERE cancel_reason = 'Auto-expired: trip inactive for 2h+'
     AND cancelled_at > now() - INTERVAL '5 minutes'
     AND driver_id IS NOT NULL
 );