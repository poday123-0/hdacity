CREATE TABLE public.debug_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'driver_app',
  event text NOT NULL,
  driver_id uuid,
  trip_id uuid,
  device text,
  platform text,
  app_version text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_debug_logs_driver_created ON public.debug_logs(driver_id, created_at DESC);
CREATE INDEX idx_debug_logs_trip ON public.debug_logs(trip_id);
CREATE INDEX idx_debug_logs_event_created ON public.debug_logs(event, created_at DESC);

ALTER TABLE public.debug_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert debug logs"
  ON public.debug_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read debug logs"
  ON public.debug_logs FOR SELECT
  USING (true);

CREATE POLICY "Anyone can delete debug logs"
  ON public.debug_logs FOR DELETE
  USING (true);