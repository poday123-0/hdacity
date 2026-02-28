
CREATE TABLE public.wallet_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text DEFAULT '',
  admin_notes text DEFAULT '',
  processed_by uuid,
  processed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wallet withdrawals readable by all" ON public.wallet_withdrawals FOR SELECT USING (true);
CREATE POLICY "Allow all inserts on wallet_withdrawals" ON public.wallet_withdrawals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all updates on wallet_withdrawals" ON public.wallet_withdrawals FOR UPDATE USING (true);
