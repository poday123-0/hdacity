
-- Add per-minute rate to vehicle_types
ALTER TABLE public.vehicle_types ADD COLUMN per_minute_rate numeric NOT NULL DEFAULT 0;

-- Add tax fields to system_settings if not present (we'll insert default rows)
-- Tax can be configured per-trip for passengers and drivers separately

-- Add passenger and driver tax percentage columns to vehicle_types for per-type tax
ALTER TABLE public.vehicle_types ADD COLUMN passenger_tax_pct numeric NOT NULL DEFAULT 0;
ALTER TABLE public.vehicle_types ADD COLUMN driver_tax_pct numeric NOT NULL DEFAULT 0;
