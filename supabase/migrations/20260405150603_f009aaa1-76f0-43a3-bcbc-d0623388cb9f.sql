
-- Fix wallet tables: restrict writes to owner or admin
-- wallets table
DROP POLICY IF EXISTS "Wallets readable by all" ON public.wallets;
DROP POLICY IF EXISTS "Allow all inserts on wallets" ON public.wallets;
DROP POLICY IF EXISTS "Allow all updates on wallets" ON public.wallets;
DROP POLICY IF EXISTS "Allow all deletes on wallets" ON public.wallets;

CREATE POLICY "Users read own wallet or admin reads all" ON public.wallets
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admin can insert wallets" ON public.wallets
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Only admin can update wallets" ON public.wallets
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admin can delete wallets" ON public.wallets
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- wallet_transactions table
DROP POLICY IF EXISTS "Wallet transactions readable by all" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Allow all inserts on wallet_transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Allow all updates on wallet_transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Allow all deletes on wallet_transactions" ON public.wallet_transactions;

CREATE POLICY "Users read own transactions or admin reads all" ON public.wallet_transactions
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner or admin can insert transactions" ON public.wallet_transactions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admin can update transactions" ON public.wallet_transactions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admin can delete transactions" ON public.wallet_transactions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- wallet_withdrawals table
DROP POLICY IF EXISTS "Wallet withdrawals readable by all" ON public.wallet_withdrawals;
DROP POLICY IF EXISTS "Allow all inserts on wallet_withdrawals" ON public.wallet_withdrawals;
DROP POLICY IF EXISTS "Allow all updates on wallet_withdrawals" ON public.wallet_withdrawals;
DROP POLICY IF EXISTS "Allow all deletes on wallet_withdrawals" ON public.wallet_withdrawals;

CREATE POLICY "Users read own withdrawals or admin reads all" ON public.wallet_withdrawals
  FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owner or admin can insert withdrawals" ON public.wallet_withdrawals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admin can update withdrawals" ON public.wallet_withdrawals
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admin can delete withdrawals" ON public.wallet_withdrawals
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Fix profiles table: keep SELECT open for authenticated, restrict writes
DROP POLICY IF EXISTS "Profiles are readable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Allow all inserts on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow all updates on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow all deletes on profiles" ON public.profiles;

CREATE POLICY "Profiles readable by authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "Users update own profile or admin updates any" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admin can delete profiles" ON public.profiles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Fix storage: make driver-documents and payment-slips private
UPDATE storage.buckets SET public = false WHERE id IN ('driver-documents', 'payment-slips');
