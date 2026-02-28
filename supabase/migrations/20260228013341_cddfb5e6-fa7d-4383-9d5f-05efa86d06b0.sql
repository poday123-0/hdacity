ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vehicle_status text NOT NULL DEFAULT 'approved';

COMMENT ON COLUMN public.vehicles.vehicle_status IS 'approved, pending, rejected - controls whether driver can use this vehicle';