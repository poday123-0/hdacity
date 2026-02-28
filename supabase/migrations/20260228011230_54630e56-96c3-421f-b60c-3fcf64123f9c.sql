
-- Wallets table
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wallets readable by all" ON public.wallets FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on wallets" ON public.wallets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on wallets" ON public.wallets FOR UPDATE USING (true);

-- Wallet transactions table
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL DEFAULT 'credit',
  reason text NOT NULL DEFAULT '',
  trip_id uuid REFERENCES public.trips(id),
  created_by uuid,
  proof_url text,
  status text NOT NULL DEFAULT 'completed',
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wallet transactions readable by all" ON public.wallet_transactions FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on wallet_transactions" ON public.wallet_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on wallet_transactions" ON public.wallet_transactions FOR UPDATE USING (true);

-- Add payment method columns to trips
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS payment_confirmed_method text;
