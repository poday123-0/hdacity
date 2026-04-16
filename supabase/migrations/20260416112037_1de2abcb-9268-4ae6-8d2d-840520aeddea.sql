
DROP POLICY IF EXISTS "Profiles deletable by admin" ON public.profiles;

CREATE POLICY "Profiles deletable by all"
ON public.profiles
FOR DELETE
TO public
USING (true);
