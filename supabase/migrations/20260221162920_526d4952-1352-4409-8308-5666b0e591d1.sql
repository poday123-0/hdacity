
ALTER TABLE public.companies
  ADD COLUMN monthly_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN discount_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN fee_free boolean NOT NULL DEFAULT false;
