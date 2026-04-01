ALTER TABLE public.fare_surcharges 
ADD COLUMN vehicle_type_id uuid REFERENCES public.vehicle_types(id) ON DELETE SET NULL DEFAULT NULL,
ADD COLUMN destination_area_id uuid REFERENCES public.service_locations(id) ON DELETE SET NULL DEFAULT NULL;