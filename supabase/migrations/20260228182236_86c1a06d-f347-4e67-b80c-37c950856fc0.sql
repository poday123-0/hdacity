
-- Vehicle Makes table
CREATE TABLE public.vehicle_makes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_makes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vehicle makes readable by all" ON public.vehicle_makes FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on vehicle_makes" ON public.vehicle_makes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on vehicle_makes" ON public.vehicle_makes FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on vehicle_makes" ON public.vehicle_makes FOR DELETE USING (true);

-- Vehicle Models table
CREATE TABLE public.vehicle_models (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  make_id uuid NOT NULL REFERENCES public.vehicle_makes(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(make_id, name)
);

ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vehicle models readable by all" ON public.vehicle_models FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on vehicle_models" ON public.vehicle_models FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on vehicle_models" ON public.vehicle_models FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on vehicle_models" ON public.vehicle_models FOR DELETE USING (true);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_makes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_models;
