-- Fix driver_locations RLS - app uses custom OTP auth, not Supabase Auth
-- so auth.uid() is always null and drivers can never go online

DROP POLICY IF EXISTS "Drivers can update their own location" ON public.driver_locations;
DROP POLICY IF EXISTS "Drivers can modify their own location" ON public.driver_locations;
DROP POLICY IF EXISTS "Drivers can delete their own location" ON public.driver_locations;
DROP POLICY IF EXISTS "Anyone can view online driver locations" ON public.driver_locations;

CREATE POLICY "Allow all inserts on driver_locations" ON public.driver_locations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on driver_locations" ON public.driver_locations FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on driver_locations" ON public.driver_locations FOR DELETE USING (true);
CREATE POLICY "Allow all selects on driver_locations" ON public.driver_locations FOR SELECT USING (true);

-- Also set REPLICA IDENTITY FULL for proper realtime filtering on trips
ALTER TABLE public.trips REPLICA IDENTITY FULL;