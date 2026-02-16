
-- Add a policy for user_roles insert/update/delete (admin only)
CREATE POLICY "Admins can manage user roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- The trips table needs open access since we use custom OTP auth (no auth.uid())
-- Add a note comment for clarity but keep policies permissive for this use case
COMMENT ON TABLE public.trips IS 'Trips use custom OTP auth, not Supabase auth. RLS is intentionally permissive.';
