-- Wave dispatch tracking table
CREATE TABLE public.trip_dispatch_waves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL,
  wave_number integer NOT NULL,
  driver_ids uuid[] NOT NULL DEFAULT '{}',
  is_final_broadcast boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  promoted_at timestamptz,
  UNIQUE(trip_id, wave_number)
);

CREATE INDEX idx_dispatch_waves_trip ON public.trip_dispatch_waves(trip_id);
CREATE INDEX idx_dispatch_waves_active ON public.trip_dispatch_waves(expires_at) WHERE promoted_at IS NULL;
CREATE INDEX idx_dispatch_waves_driver_ids ON public.trip_dispatch_waves USING GIN(driver_ids);

ALTER TABLE public.trip_dispatch_waves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read waves"
  ON public.trip_dispatch_waves FOR SELECT USING (true);
CREATE POLICY "Anyone can insert waves"
  ON public.trip_dispatch_waves FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update waves"
  ON public.trip_dispatch_waves FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete waves"
  ON public.trip_dispatch_waves FOR DELETE USING (true);

-- Add to realtime so drivers learn when they enter a wave
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_dispatch_waves;

-- Seed default settings (do not overwrite if already present)
INSERT INTO public.system_settings (key, value, description)
VALUES
  ('dispatch_mode', '"broadcast"'::jsonb, 'How trips are dispatched: broadcast | wave_broadcast'),
  ('wave_size', '5'::jsonb, 'Number of drivers per wave in wave_broadcast mode'),
  ('wave_timeout_seconds', '15'::jsonb, 'Seconds before a wave expires and the next wave is sent'),
  ('max_waves', '2'::jsonb, 'Number of targeted waves before falling back to broadcasting to all nearby drivers')
ON CONFLICT (key) DO NOTHING;