ALTER TABLE public.driver_vehicle_types ADD COLUMN status text NOT NULL DEFAULT 'approved';

-- Update existing records to approved
UPDATE public.driver_vehicle_types SET status = 'approved' WHERE status = 'approved';