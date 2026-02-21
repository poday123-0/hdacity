
-- Fix service_locations: drop restrictive admin-only ALL policy, add permissive write policies
DROP POLICY IF EXISTS "Admins can manage service locations" ON public.service_locations;
CREATE POLICY "Allow all inserts on service_locations" ON public.service_locations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on service_locations" ON public.service_locations FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on service_locations" ON public.service_locations FOR DELETE USING (true);

-- Fix vehicle_types: drop restrictive admin-only policies, add permissive ones
DROP POLICY IF EXISTS "Admins can insert vehicle types" ON public.vehicle_types;
DROP POLICY IF EXISTS "Admins can update vehicle types" ON public.vehicle_types;
DROP POLICY IF EXISTS "Admins can delete vehicle types" ON public.vehicle_types;
CREATE POLICY "Allow all inserts on vehicle_types" ON public.vehicle_types FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on vehicle_types" ON public.vehicle_types FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on vehicle_types" ON public.vehicle_types FOR DELETE USING (true);

-- Fix vehicles
DROP POLICY IF EXISTS "Admins can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can delete vehicles" ON public.vehicles;
CREATE POLICY "Allow all inserts on vehicles" ON public.vehicles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on vehicles" ON public.vehicles FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on vehicles" ON public.vehicles FOR DELETE USING (true);

-- Fix fare_zones
DROP POLICY IF EXISTS "Admins can manage fare zones" ON public.fare_zones;
CREATE POLICY "Allow all inserts on fare_zones" ON public.fare_zones FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on fare_zones" ON public.fare_zones FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on fare_zones" ON public.fare_zones FOR DELETE USING (true);

-- Fix system_settings
DROP POLICY IF EXISTS "Admins can manage settings" ON public.system_settings;
CREATE POLICY "Allow all inserts on system_settings" ON public.system_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on system_settings" ON public.system_settings FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on system_settings" ON public.system_settings FOR DELETE USING (true);
