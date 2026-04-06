
-- Add center_fee column to vehicle_types
ALTER TABLE public.vehicle_types ADD COLUMN IF NOT EXISTS center_fee numeric NOT NULL DEFAULT 0;

-- Create center_payments table for tracking center vehicle monthly payments
CREATE TABLE public.center_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_type_id uuid REFERENCES public.vehicle_types(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_month text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  slip_url text,
  notes text,
  admin_notes text,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.center_payments ENABLE ROW LEVEL SECURITY;

-- Allow anon access (matches existing app auth pattern)
CREATE POLICY "Allow anon select center_payments" ON public.center_payments FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert center_payments" ON public.center_payments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update center_payments" ON public.center_payments FOR UPDATE TO anon USING (true) WITH CHECK (true);
