
-- 1. User roles system (for admin access)
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT USING (true);

-- 2. Vehicle types (car, van, motorcycle, etc.)
CREATE TABLE public.vehicle_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  icon text DEFAULT 'car',
  base_fare numeric NOT NULL DEFAULT 25,
  per_km_rate numeric NOT NULL DEFAULT 10,
  minimum_fare numeric NOT NULL DEFAULT 25,
  capacity integer NOT NULL DEFAULT 4,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vehicle types readable by all" ON public.vehicle_types
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert vehicle types" ON public.vehicle_types
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update vehicle types" ON public.vehicle_types
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete vehicle types" ON public.vehicle_types
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- 3. Vehicles (assigned to drivers)
CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  vehicle_type_id uuid REFERENCES public.vehicle_types(id) ON DELETE SET NULL,
  plate_number text NOT NULL,
  make text DEFAULT '',
  model text DEFAULT '',
  color text DEFAULT '',
  year integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vehicles readable by all" ON public.vehicles
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert vehicles" ON public.vehicles
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update vehicles" ON public.vehicles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete vehicles" ON public.vehicles
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- 4. Fare zones (for zone-based pricing)
CREATE TABLE public.fare_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  from_area text NOT NULL,
  to_area text NOT NULL,
  vehicle_type_id uuid REFERENCES public.vehicle_types(id) ON DELETE CASCADE,
  fixed_fare numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fare_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fare zones readable by all" ON public.fare_zones
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage fare zones" ON public.fare_zones
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 5. Trips table
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_type_id uuid REFERENCES public.vehicle_types(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested',
  pickup_address text NOT NULL DEFAULT '',
  dropoff_address text NOT NULL DEFAULT '',
  pickup_lat numeric,
  pickup_lng numeric,
  dropoff_lat numeric,
  dropoff_lng numeric,
  estimated_fare numeric,
  actual_fare numeric,
  distance_km numeric,
  duration_minutes numeric,
  fare_type text NOT NULL DEFAULT 'distance',
  fare_zone_id uuid REFERENCES public.fare_zones(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  rating integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trips readable by all" ON public.trips
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert trips" ON public.trips
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update trips" ON public.trips
  FOR UPDATE USING (true);

-- 6. Dispatch settings
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}',
  description text DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Settings readable by all" ON public.system_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage settings" ON public.system_settings
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Insert default settings
INSERT INTO public.system_settings (key, value, description) VALUES
  ('dispatch_mode', '"auto_nearest"', 'Ride dispatch mode: auto_nearest, broadcast, manual'),
  ('surge_multiplier', '1.0', 'Current surge pricing multiplier'),
  ('max_search_radius_km', '10', 'Maximum radius to search for drivers'),
  ('driver_accept_timeout_seconds', '30', 'Seconds before ride request times out for a driver');

-- Insert default vehicle types
INSERT INTO public.vehicle_types (name, description, icon, base_fare, per_km_rate, minimum_fare, capacity, sort_order) VALUES
  ('Standard', 'Affordable everyday rides', 'car', 25, 10, 25, 4, 1),
  ('Premium', 'Comfortable premium vehicles', 'car', 40, 15, 50, 4, 2),
  ('Van', 'Spacious for groups', 'truck', 50, 18, 60, 8, 3);

-- Enable realtime for trips
ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;
