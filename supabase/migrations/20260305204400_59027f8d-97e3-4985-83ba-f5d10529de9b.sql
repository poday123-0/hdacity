-- Clear duplicate center_code: keep the one with plate 'T1332' (original), remove from 'AB1B-T1332'
UPDATE public.vehicles SET center_code = NULL WHERE id = '1e32a6f8-9960-45d4-a380-150d27717a75';

-- Now create the unique partial index
CREATE UNIQUE INDEX vehicles_center_code_unique ON public.vehicles (center_code) WHERE center_code IS NOT NULL AND center_code != '';