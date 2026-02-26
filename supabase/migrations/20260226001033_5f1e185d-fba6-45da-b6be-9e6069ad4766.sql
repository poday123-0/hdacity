
CREATE TABLE public.sos_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_type text NOT NULL DEFAULT 'driver',
  user_name text NOT NULL DEFAULT '',
  user_phone text NOT NULL DEFAULT '',
  trip_id uuid,
  lat double precision,
  lng double precision,
  status text NOT NULL DEFAULT 'active',
  resolved_at timestamptz,
  resolved_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SOS alerts readable by all" ON public.sos_alerts FOR SELECT USING (true);
CREATE POLICY "Anyone can insert SOS alerts" ON public.sos_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update SOS alerts" ON public.sos_alerts FOR UPDATE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_alerts;
