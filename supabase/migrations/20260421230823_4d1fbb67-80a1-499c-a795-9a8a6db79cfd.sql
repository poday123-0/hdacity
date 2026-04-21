-- Make trip_id nullable so lost items can be logged without a trip link
ALTER TABLE public.lost_item_reports ALTER COLUMN trip_id DROP NOT NULL;

-- Add created_by to track which dispatcher/staff logged the report (for performance metrics)
ALTER TABLE public.lost_item_reports ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);

-- Index for performance lookups by dispatcher
CREATE INDEX IF NOT EXISTS idx_lost_item_reports_created_by ON public.lost_item_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_lost_item_reports_created_at ON public.lost_item_reports(created_at);