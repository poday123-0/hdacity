
CREATE TABLE public.ad_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  link_url TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ad banners readable by all" ON public.ad_banners FOR SELECT TO public USING (true);
CREATE POLICY "Ad banners insertable by all" ON public.ad_banners FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Ad banners updatable by all" ON public.ad_banners FOR UPDATE TO public USING (true);
CREATE POLICY "Ad banners deletable by all" ON public.ad_banners FOR DELETE TO public USING (true);
