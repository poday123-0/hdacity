
-- Create notification_sounds table
CREATE TABLE public.notification_sounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'trip_request',
  file_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_sounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sounds readable by all" ON public.notification_sounds FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on notification_sounds" ON public.notification_sounds FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on notification_sounds" ON public.notification_sounds FOR UPDATE USING (true);
CREATE POLICY "Allow all deletes on notification_sounds" ON public.notification_sounds FOR DELETE USING (true);

-- Add selected sound preference to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trip_sound_id uuid DEFAULT NULL;

-- Create storage bucket for sounds
INSERT INTO storage.buckets (id, name, public) VALUES ('notification-sounds', 'notification-sounds', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "Anyone can read sounds" ON storage.objects FOR SELECT USING (bucket_id = 'notification-sounds');
CREATE POLICY "Anyone can upload sounds" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'notification-sounds');
CREATE POLICY "Anyone can delete sounds" ON storage.objects FOR DELETE USING (bucket_id = 'notification-sounds');
