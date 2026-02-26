
CREATE TABLE public.saved_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Custom',
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  icon text NOT NULL DEFAULT 'star',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Saved locations readable by all" ON public.saved_locations FOR SELECT USING (true);
CREATE POLICY "Anyone can insert saved locations" ON public.saved_locations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update saved locations" ON public.saved_locations FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete saved locations" ON public.saved_locations FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_locations;
