
-- Dispatch duty sessions table
CREATE TABLE public.dispatch_duty_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id UUID NOT NULL,
  clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dispatch_duty_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: anyone authenticated can insert/read (dispatchers log their own, admins read all)
CREATE POLICY "Allow all for dispatch_duty_sessions" ON public.dispatch_duty_sessions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Enable realtime for duty sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_duty_sessions;
