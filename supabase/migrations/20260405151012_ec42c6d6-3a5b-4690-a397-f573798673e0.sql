
-- Fix profiles - restore access since app uses custom OTP auth, not Supabase Auth
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile or admin updates any" ON public.profiles;
DROP POLICY IF EXISTS "Only admin can delete profiles" ON public.profiles;

CREATE POLICY "Profiles readable by all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Profiles insertable by all" ON public.profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Profiles updatable by all" ON public.profiles FOR UPDATE USING (true);
CREATE POLICY "Profiles deletable by admin" ON public.profiles FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Fix wallets - restore read/insert, keep update restricted
DROP POLICY IF EXISTS "Users read own wallet or admin reads all" ON public.wallets;
DROP POLICY IF EXISTS "Only admin can insert wallets" ON public.wallets;
DROP POLICY IF EXISTS "Only admin can update wallets" ON public.wallets;
DROP POLICY IF EXISTS "Only admin can delete wallets" ON public.wallets;

CREATE POLICY "Wallets readable by all" ON public.wallets FOR SELECT USING (true);
CREATE POLICY "Wallets insertable by all" ON public.wallets FOR INSERT WITH CHECK (true);
CREATE POLICY "Wallets updatable by all" ON public.wallets FOR UPDATE USING (true);

-- Fix wallet_transactions
DROP POLICY IF EXISTS "Users read own transactions or admin reads all" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Owner or admin can insert transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Only admin can update transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Only admin can delete transactions" ON public.wallet_transactions;

CREATE POLICY "Wallet transactions readable by all" ON public.wallet_transactions FOR SELECT USING (true);
CREATE POLICY "Wallet transactions insertable by all" ON public.wallet_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Wallet transactions updatable by all" ON public.wallet_transactions FOR UPDATE USING (true);

-- Fix wallet_withdrawals
DROP POLICY IF EXISTS "Users read own withdrawals or admin reads all" ON public.wallet_withdrawals;
DROP POLICY IF EXISTS "Owner or admin can insert withdrawals" ON public.wallet_withdrawals;
DROP POLICY IF EXISTS "Only admin can update withdrawals" ON public.wallet_withdrawals;
DROP POLICY IF EXISTS "Only admin can delete withdrawals" ON public.wallet_withdrawals;

CREATE POLICY "Wallet withdrawals readable by all" ON public.wallet_withdrawals FOR SELECT USING (true);
CREATE POLICY "Wallet withdrawals insertable by all" ON public.wallet_withdrawals FOR INSERT WITH CHECK (true);
CREATE POLICY "Wallet withdrawals updatable by all" ON public.wallet_withdrawals FOR UPDATE USING (true);
