
-- Driver payments table for tracking monthly fee payments
CREATE TABLE IF NOT EXISTS public.driver_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.profiles(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_month TEXT NOT NULL, -- e.g. '2026-02'
  slip_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, submitted, approved, rejected
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id),
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_payments ENABLE ROW LEVEL SECURITY;

-- Permissive policies (custom OTP auth, no auth.uid())
CREATE POLICY "Allow all access to driver_payments" ON public.driver_payments FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for payment slips
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-slips', 'payment-slips', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for payment slips
CREATE POLICY "Allow public read payment slips" ON storage.objects FOR SELECT USING (bucket_id = 'payment-slips');
CREATE POLICY "Allow upload payment slips" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'payment-slips');

-- Enable realtime for driver_payments
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_payments;
