
CREATE TABLE public.driver_favara_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.profiles(id),
  favara_id text NOT NULL,
  favara_name text NOT NULL DEFAULT '',
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_favara_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all selects on driver_favara_accounts" ON public.driver_favara_accounts FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on driver_favara_accounts" ON public.driver_favara_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on driver_favara_accounts" ON public.driver_favara_accounts FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on driver_favara_accounts" ON public.driver_favara_accounts FOR DELETE USING (true);
