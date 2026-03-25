ALTER TABLE public.road_closures 
  ADD COLUMN IF NOT EXISTS schedule_type text NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS schedule_days text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS schedule_start_time time DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS schedule_end_time time DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scheduled_date date DEFAULT NULL;