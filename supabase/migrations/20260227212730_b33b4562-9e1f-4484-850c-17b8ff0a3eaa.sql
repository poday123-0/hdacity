INSERT INTO storage.buckets (id, name, public) VALUES ('notification-images', 'notification-images', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload notification images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'notification-images');
CREATE POLICY "Anyone can read notification images" ON storage.objects FOR SELECT USING (bucket_id = 'notification-images');
CREATE POLICY "Anyone can delete notification images" ON storage.objects FOR DELETE USING (bucket_id = 'notification-images');