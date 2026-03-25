
CREATE TABLE public.road_closures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  closure_type TEXT NOT NULL DEFAULT 'point',
  coordinates JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'closed',
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE public.road_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Road closures readable by all" ON public.road_closures FOR SELECT TO public USING (true);
CREATE POLICY "Road closures insertable by all" ON public.road_closures FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Road closures updatable by all" ON public.road_closures FOR UPDATE TO public USING (true);
CREATE POLICY "Road closures deletable by all" ON public.road_closures FOR DELETE TO public USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.road_closures;
