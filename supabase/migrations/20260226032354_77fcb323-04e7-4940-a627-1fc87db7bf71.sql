
-- Create device_tokens table to store FCM tokens for push notifications
CREATE TABLE public.device_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token TEXT NOT NULL,
  device_type TEXT NOT NULL DEFAULT 'web',
  user_type TEXT NOT NULL DEFAULT 'passenger',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

-- Enable RLS
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can insert device tokens" ON public.device_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update device tokens" ON public.device_tokens FOR UPDATE USING (true);
CREATE POLICY "Anyone can select device tokens" ON public.device_tokens FOR SELECT USING (true);
CREATE POLICY "Anyone can delete device tokens" ON public.device_tokens FOR DELETE USING (true);

-- Enable realtime for trips if not already
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_tokens;
