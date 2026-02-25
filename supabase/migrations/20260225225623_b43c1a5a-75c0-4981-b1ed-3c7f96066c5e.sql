
-- Add dispatcher to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dispatcher';

-- Add customer contact fields to trips
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS customer_name text DEFAULT '';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS customer_phone text DEFAULT '';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT NULL;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS dispatch_type text DEFAULT 'passenger';

-- Create trip_stops table for multi-stop support
CREATE TABLE IF NOT EXISTS public.trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  stop_order integer NOT NULL DEFAULT 1,
  address text NOT NULL DEFAULT '',
  lat numeric,
  lng numeric,
  arrived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip stops readable by all" ON public.trip_stops FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on trip_stops" ON public.trip_stops FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on trip_stops" ON public.trip_stops FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on trip_stops" ON public.trip_stops FOR DELETE USING (true);

-- Enable realtime for trip_stops
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_stops;
