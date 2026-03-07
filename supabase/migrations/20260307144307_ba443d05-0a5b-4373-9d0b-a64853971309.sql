ALTER TABLE public.driver_favara_accounts
DROP CONSTRAINT IF EXISTS driver_favara_accounts_driver_id_fkey;

ALTER TABLE public.driver_favara_accounts
ADD CONSTRAINT driver_favara_accounts_driver_id_fkey
FOREIGN KEY (driver_id) REFERENCES public.profiles(id)
ON DELETE CASCADE;