
-- Banks table (admin-managed, with logo)
CREATE TABLE public.banks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Banks readable by all" ON public.banks FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on banks" ON public.banks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on banks" ON public.banks FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on banks" ON public.banks FOR DELETE USING (true);

-- Companies table (admin-managed, with logo)
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Companies readable by all" ON public.companies FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on companies" ON public.companies FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on companies" ON public.companies FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on companies" ON public.companies FOR DELETE USING (true);

-- Add driver document columns and FK references to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS license_front_url text,
  ADD COLUMN IF NOT EXISTS license_back_url text,
  ADD COLUMN IF NOT EXISTS id_card_front_url text,
  ADD COLUMN IF NOT EXISTS id_card_back_url text,
  ADD COLUMN IF NOT EXISTS bank_id uuid REFERENCES public.banks(id),
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Storage bucket for driver documents and logos
INSERT INTO storage.buckets (id, name, public) VALUES ('driver-documents', 'driver-documents', true);

CREATE POLICY "Driver docs publicly readable" ON storage.objects FOR SELECT USING (bucket_id = 'driver-documents');
CREATE POLICY "Anyone can upload driver docs" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'driver-documents');
CREATE POLICY "Anyone can update driver docs" ON storage.objects FOR UPDATE USING (bucket_id = 'driver-documents');
CREATE POLICY "Anyone can delete driver docs" ON storage.objects FOR DELETE USING (bucket_id = 'driver-documents');
