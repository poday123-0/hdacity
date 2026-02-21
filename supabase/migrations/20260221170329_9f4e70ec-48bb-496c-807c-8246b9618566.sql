
-- Add feedback text to trips
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS feedback_text text;

-- Create emergency contacts table
CREATE TABLE public.emergency_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone_number text NOT NULL,
  relationship text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Emergency contacts readable by all"
  ON public.emergency_contacts FOR SELECT USING (true);

CREATE POLICY "Allow all inserts on emergency_contacts"
  ON public.emergency_contacts FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all updates on emergency_contacts"
  ON public.emergency_contacts FOR UPDATE USING (true);

CREATE POLICY "Allow all deletes on emergency_contacts"
  ON public.emergency_contacts FOR DELETE USING (true);
