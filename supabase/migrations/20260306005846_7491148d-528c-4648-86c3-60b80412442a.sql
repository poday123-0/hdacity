
-- Named locations (POIs) - admin-added and user-suggested
CREATE TABLE public.named_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  description text DEFAULT '',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  status text NOT NULL DEFAULT 'approved',
  suggested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  suggested_by_type text DEFAULT 'admin',
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.named_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "named_locations readable by all" ON public.named_locations FOR SELECT USING (true);
CREATE POLICY "named_locations insertable by all" ON public.named_locations FOR INSERT WITH CHECK (true);
CREATE POLICY "named_locations updatable by all" ON public.named_locations FOR UPDATE USING (true);
CREATE POLICY "named_locations deletable by all" ON public.named_locations FOR DELETE USING (true);
