
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fee_free_until timestamptz DEFAULT NULL;
