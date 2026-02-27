-- Table to track declined trips per driver (persists across reloads)
CREATE TABLE public.trip_declines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  trip_id uuid NOT NULL,
  declined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(driver_id, trip_id)
);

ALTER TABLE public.trip_declines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert trip_declines" ON public.trip_declines FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can select trip_declines" ON public.trip_declines FOR SELECT USING (true);
CREATE POLICY "Anyone can delete trip_declines" ON public.trip_declines FOR DELETE USING (true);

CREATE INDEX idx_trip_declines_driver ON public.trip_declines(driver_id);