
ALTER TABLE public.trips 
ADD COLUMN IF NOT EXISTS target_driver_id uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS dispatch_attempt integer DEFAULT 0;
