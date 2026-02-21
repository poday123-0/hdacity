-- Add polygon column to store area boundary coordinates as JSONB array of {lat, lng} points
ALTER TABLE public.service_locations ADD COLUMN polygon jsonb DEFAULT NULL;

-- Add a description/notes column for service areas
ALTER TABLE public.service_locations ADD COLUMN description text DEFAULT '';
