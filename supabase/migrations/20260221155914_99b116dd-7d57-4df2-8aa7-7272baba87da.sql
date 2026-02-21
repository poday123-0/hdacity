
-- Add hourly rental rate to vehicle_types
ALTER TABLE public.vehicle_types ADD COLUMN per_hour_rate numeric NOT NULL DEFAULT 0;

-- Create fare_surcharges table for time-based and luggage surcharges
CREATE TABLE public.fare_surcharges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  surcharge_type text NOT NULL DEFAULT 'time_based', -- 'time_based', 'luggage'
  amount numeric NOT NULL DEFAULT 0,
  start_time time NULL, -- for time-based surcharges
  end_time time NULL,   -- for time-based surcharges
  luggage_threshold integer NULL DEFAULT 3, -- for luggage surcharges, pieces above this get charged
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.fare_surcharges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Surcharges readable by all" ON public.fare_surcharges FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on fare_surcharges" ON public.fare_surcharges FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on fare_surcharges" ON public.fare_surcharges FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on fare_surcharges" ON public.fare_surcharges FOR DELETE USING (true);
