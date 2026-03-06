
-- Junction table: driver can serve multiple vehicle types
CREATE TABLE public.driver_vehicle_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_type_id uuid NOT NULL REFERENCES public.vehicle_types(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, vehicle_type_id)
);

ALTER TABLE public.driver_vehicle_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver_vehicle_types readable by all" ON public.driver_vehicle_types FOR SELECT USING (true);
CREATE POLICY "driver_vehicle_types insertable by all" ON public.driver_vehicle_types FOR INSERT WITH CHECK (true);
CREATE POLICY "driver_vehicle_types updatable by all" ON public.driver_vehicle_types FOR UPDATE USING (true);
CREATE POLICY "driver_vehicle_types deletable by all" ON public.driver_vehicle_types FOR DELETE USING (true);

-- Populate from existing vehicle assignments
INSERT INTO public.driver_vehicle_types (driver_id, vehicle_type_id)
SELECT DISTINCT v.driver_id, v.vehicle_type_id
FROM public.vehicles v
WHERE v.driver_id IS NOT NULL
  AND v.vehicle_type_id IS NOT NULL
  AND v.is_active = true
ON CONFLICT (driver_id, vehicle_type_id) DO NOTHING;
