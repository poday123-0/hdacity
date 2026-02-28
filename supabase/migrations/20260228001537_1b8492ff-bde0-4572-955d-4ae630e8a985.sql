ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS passenger_lat double precision DEFAULT NULL;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS passenger_lng double precision DEFAULT NULL;