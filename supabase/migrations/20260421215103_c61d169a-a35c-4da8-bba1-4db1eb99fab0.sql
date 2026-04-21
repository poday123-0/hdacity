ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS processed_by uuid,
  ADD COLUMN IF NOT EXISTS processed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status_processed
  ON public.wallet_transactions(status, processed_at DESC);