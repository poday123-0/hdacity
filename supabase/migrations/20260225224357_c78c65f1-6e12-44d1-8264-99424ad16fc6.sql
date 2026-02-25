ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS taxi_permit_front_url text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS taxi_permit_back_url text DEFAULT NULL;