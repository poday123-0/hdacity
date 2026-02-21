
-- Create storage bucket for vehicle type images
INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-images', 'vehicle-images', true);

-- Allow public read access
CREATE POLICY "Vehicle images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'vehicle-images');

-- Allow anyone to upload (admin panel uses no auth session)
CREATE POLICY "Anyone can upload vehicle images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vehicle-images');

-- Allow anyone to update vehicle images
CREATE POLICY "Anyone can update vehicle images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'vehicle-images');

-- Allow anyone to delete vehicle images
CREATE POLICY "Anyone can delete vehicle images"
ON storage.objects FOR DELETE
USING (bucket_id = 'vehicle-images');

-- Add image URL columns to vehicle_types
ALTER TABLE public.vehicle_types ADD COLUMN image_url text DEFAULT NULL;
ALTER TABLE public.vehicle_types ADD COLUMN map_icon_url text DEFAULT NULL;
