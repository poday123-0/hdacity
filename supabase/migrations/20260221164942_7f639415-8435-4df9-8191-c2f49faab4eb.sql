
-- Add avatar_url to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Create driver_bank_accounts table for multiple bank accounts
CREATE TABLE public.driver_bank_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL DEFAULT '',
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Everyone can read bank accounts (passengers need to see them)
CREATE POLICY "Bank accounts readable by all"
  ON public.driver_bank_accounts FOR SELECT USING (true);

-- Allow all inserts (service role handles mutations)
CREATE POLICY "Allow all inserts on driver_bank_accounts"
  ON public.driver_bank_accounts FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all updates on driver_bank_accounts"
  ON public.driver_bank_accounts FOR UPDATE USING (true);

CREATE POLICY "Allow all deletes on driver_bank_accounts"
  ON public.driver_bank_accounts FOR DELETE USING (true);
