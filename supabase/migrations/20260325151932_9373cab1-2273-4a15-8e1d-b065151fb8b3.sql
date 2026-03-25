ALTER TABLE public.road_closures 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS reported_by uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reported_by_type text DEFAULT 'dispatch';