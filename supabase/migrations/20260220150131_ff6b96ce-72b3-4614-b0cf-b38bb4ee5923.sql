
CREATE TABLE public.service_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.service_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service locations readable by all"
  ON public.service_locations FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage service locations"
  ON public.service_locations FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.service_locations;
