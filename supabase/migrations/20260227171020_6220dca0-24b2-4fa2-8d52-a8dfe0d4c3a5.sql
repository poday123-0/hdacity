
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  target_type text NOT NULL DEFAULT 'all',
  target_user_id uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_by jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notifications readable by all" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "Anyone can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update notifications" ON public.notifications FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete notifications" ON public.notifications FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
