
-- Create profiles table to store user data from existing MySQL database
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email text,
  country_code text NOT NULL DEFAULT '960',
  gender text DEFAULT '1',
  user_type text NOT NULL DEFAULT 'Rider',
  status text NOT NULL DEFAULT 'Active',
  legacy_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for phone lookups (primary use case)
CREATE INDEX idx_profiles_phone ON public.profiles(phone_number);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles (needed for login lookup before auth)
CREATE POLICY "Profiles are readable by everyone"
ON public.profiles FOR SELECT
USING (true);

-- No insert/update/delete from client - managed by admin/edge functions
CREATE POLICY "Service role can manage profiles"
ON public.profiles FOR ALL
USING (true)
WITH CHECK (true);
