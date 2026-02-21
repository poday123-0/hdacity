
-- Table to track real-time driver/vehicle locations
CREATE TABLE public.driver_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_type_id UUID REFERENCES public.vehicle_types(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION DEFAULT 0,
  is_online BOOLEAN NOT NULL DEFAULT true,
  is_on_trip BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(driver_id)
);

-- Enable RLS
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- Everyone can read online driver locations (needed for passenger map)
CREATE POLICY "Anyone can view online driver locations"
  ON public.driver_locations FOR SELECT
  USING (is_online = true);

-- Drivers can upsert their own location
CREATE POLICY "Drivers can update their own location"
  ON public.driver_locations FOR INSERT
  WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Drivers can modify their own location"
  ON public.driver_locations FOR UPDATE
  USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can delete their own location"
  ON public.driver_locations FOR DELETE
  USING (auth.uid() = driver_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;

-- Index for fast lookups
CREATE INDEX idx_driver_locations_online ON public.driver_locations(is_online) WHERE is_online = true;
