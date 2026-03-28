
CREATE TABLE public.driver_swipe_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  swipe_username TEXT NOT NULL,
  swipe_name TEXT NOT NULL DEFAULT '',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_swipe_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all selects on driver_swipe_accounts" ON public.driver_swipe_accounts FOR SELECT TO public USING (true);
CREATE POLICY "Allow all inserts on driver_swipe_accounts" ON public.driver_swipe_accounts FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all updates on driver_swipe_accounts" ON public.driver_swipe_accounts FOR UPDATE TO public USING (true);
CREATE POLICY "Allow all deletes on driver_swipe_accounts" ON public.driver_swipe_accounts FOR DELETE TO public USING (true);
