
-- Trip messages table
CREATE TABLE public.trip_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id),
  sender_type TEXT NOT NULL DEFAULT 'passenger', -- 'passenger', 'driver', 'system'
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip messages readable by all" ON public.trip_messages FOR SELECT USING (true);
CREATE POLICY "Anyone can insert trip messages" ON public.trip_messages FOR INSERT WITH CHECK (true);

-- Lost item reports table
CREATE TABLE public.lost_item_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES public.profiles(id),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reported', -- 'reported', 'found', 'resolved', 'closed'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lost_item_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lost items readable by all" ON public.lost_item_reports FOR SELECT USING (true);
CREATE POLICY "Anyone can insert lost items" ON public.lost_item_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update lost items" ON public.lost_item_reports FOR UPDATE USING (true);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_messages;
