CREATE POLICY "Allow public uploads to public-assets" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'public-assets');

CREATE POLICY "Allow public reads from public-assets" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'public-assets');

CREATE POLICY "Allow public deletes from public-assets" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'public-assets');

CREATE POLICY "Allow public updates to public-assets" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'public-assets');