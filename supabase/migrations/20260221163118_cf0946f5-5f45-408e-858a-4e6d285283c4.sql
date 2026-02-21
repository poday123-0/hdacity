
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trip_radius_km numeric NOT NULL DEFAULT 10;
