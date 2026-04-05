-- Add explicit INSERT policy on user_roles requiring admin role
CREATE POLICY "Only admins can insert user roles"
ON public.user_roles
FOR INSERT
TO public
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));