
-- Fix overly permissive policy: restrict management to service role only
DROP POLICY "Service role can manage profiles" ON public.profiles;

-- Only allow insert/update/delete via service_role (edge functions)
-- No client-side mutations allowed
CREATE POLICY "No client mutations on profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "No client updates on profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "No client deletes on profiles"
ON public.profiles FOR DELETE
TO authenticated
USING (false);
