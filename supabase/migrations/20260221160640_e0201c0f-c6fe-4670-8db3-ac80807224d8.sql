
-- Add company, monthly fee, and bank account fields for drivers
ALTER TABLE public.profiles 
  ADD COLUMN company_name text NULL DEFAULT '',
  ADD COLUMN monthly_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN bank_name text NULL DEFAULT '',
  ADD COLUMN bank_account_number text NULL DEFAULT '',
  ADD COLUMN bank_account_name text NULL DEFAULT '';
