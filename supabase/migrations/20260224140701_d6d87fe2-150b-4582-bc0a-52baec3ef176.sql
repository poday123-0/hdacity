
-- Fix profiles table: allow client updates so drivers can upload documents, update avatar, trip radius etc.
DROP POLICY IF EXISTS "No client updates on profiles" ON public.profiles;
CREATE POLICY "Allow all updates on profiles"
  ON public.profiles
  FOR UPDATE
  USING (true);

-- Also allow inserts on profiles (for new user creation flows)
DROP POLICY IF EXISTS "No client mutations on profiles" ON public.profiles;
CREATE POLICY "Allow all inserts on profiles"
  ON public.profiles
  FOR INSERT
  WITH CHECK (true);

-- Also allow deletes for admin operations
DROP POLICY IF EXISTS "No client deletes on profiles" ON public.profiles;
CREATE POLICY "Allow all deletes on profiles"
  ON public.profiles
  FOR DELETE
  USING (true);
