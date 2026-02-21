
ALTER TABLE public.trips ADD COLUMN passenger_count integer NOT NULL DEFAULT 1;
ALTER TABLE public.trips ADD COLUMN luggage_count integer NOT NULL DEFAULT 0;
