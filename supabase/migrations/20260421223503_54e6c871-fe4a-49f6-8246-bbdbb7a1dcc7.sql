
-- Add scheduling support to notifications table
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent';

-- Backfill existing rows: anything without scheduled_at is considered already sent
UPDATE public.notifications
   SET status = 'sent',
       sent_at = COALESCE(sent_at, created_at)
 WHERE status IS NULL OR status = 'sent';

CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_pending
  ON public.notifications (scheduled_at)
  WHERE status = 'scheduled';
