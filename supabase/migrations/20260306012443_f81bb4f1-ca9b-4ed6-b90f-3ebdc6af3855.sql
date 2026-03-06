
-- Add vehicle_id to driver_vehicle_types for per-vehicle ride types
ALTER TABLE public.driver_vehicle_types 
  ADD COLUMN vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE;

-- Drop the old unique constraint (driver_id, vehicle_type_id) and add new one
ALTER TABLE public.driver_vehicle_types 
  DROP CONSTRAINT IF EXISTS driver_vehicle_types_driver_id_vehicle_type_id_key;

ALTER TABLE public.driver_vehicle_types 
  ADD CONSTRAINT driver_vehicle_types_driver_vehicle_type_key 
  UNIQUE (driver_id, vehicle_type_id, vehicle_id);

-- Backfill: link existing entries to their vehicles based on matching vehicle_type_id
UPDATE public.driver_vehicle_types dvt
SET vehicle_id = (
  SELECT v.id FROM public.vehicles v 
  WHERE v.driver_id = dvt.driver_id 
  AND v.vehicle_type_id = dvt.vehicle_type_id 
  AND v.is_active = true
  LIMIT 1
)
WHERE dvt.vehicle_id IS NULL;
