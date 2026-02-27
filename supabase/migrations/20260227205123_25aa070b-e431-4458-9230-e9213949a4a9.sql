-- Add pre_booking_fee to vehicle_types
ALTER TABLE public.vehicle_types ADD COLUMN IF NOT EXISTS pre_booking_fee numeric NOT NULL DEFAULT 0;

-- Add booking fields to trips
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'now';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS booking_notes text;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS hourly_started_at timestamp with time zone;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS hourly_ended_at timestamp with time zone;