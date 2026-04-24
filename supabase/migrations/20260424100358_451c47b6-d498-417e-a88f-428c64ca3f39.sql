ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_by_type text,
  ADD COLUMN IF NOT EXISTS cancelled_by_name text;

CREATE INDEX IF NOT EXISTS idx_trips_driver_created ON public.trips (driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle_created ON public.trips (vehicle_id, created_at DESC);