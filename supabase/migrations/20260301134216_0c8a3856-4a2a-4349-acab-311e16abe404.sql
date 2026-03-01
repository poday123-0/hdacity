
-- Topup card batches
CREATE TABLE public.topup_card_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  card_count integer NOT NULL DEFAULT 1,
  amount numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.topup_card_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Topup batches readable by all" ON public.topup_card_batches FOR SELECT USING (true);
CREATE POLICY "Topup batches insertable by all" ON public.topup_card_batches FOR INSERT WITH CHECK (true);
CREATE POLICY "Topup batches updatable by all" ON public.topup_card_batches FOR UPDATE USING (true);
CREATE POLICY "Topup batches deletable by all" ON public.topup_card_batches FOR DELETE USING (true);

-- Individual topup cards
CREATE TABLE public.topup_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.topup_card_batches(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  claimed_by uuid,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.topup_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Topup cards readable by all" ON public.topup_cards FOR SELECT USING (true);
CREATE POLICY "Topup cards insertable by all" ON public.topup_cards FOR INSERT WITH CHECK (true);
CREATE POLICY "Topup cards updatable by all" ON public.topup_cards FOR UPDATE USING (true);

-- Promo watermelons (Ramadan promos)
CREATE TABLE public.promo_watermelons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  promo_type text NOT NULL DEFAULT 'wallet_amount',
  amount numeric NOT NULL DEFAULT 0,
  fee_free_months integer NOT NULL DEFAULT 0,
  free_trips integer NOT NULL DEFAULT 0,
  target_user_type text NOT NULL DEFAULT 'driver',
  status text NOT NULL DEFAULT 'active',
  claimed_by uuid,
  claimed_at timestamptz,
  claim_radius_m numeric NOT NULL DEFAULT 100,
  expires_at timestamptz,
  service_location_id uuid REFERENCES public.service_locations(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_watermelons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Watermelons readable by all" ON public.promo_watermelons FOR SELECT USING (true);
CREATE POLICY "Watermelons insertable by all" ON public.promo_watermelons FOR INSERT WITH CHECK (true);
CREATE POLICY "Watermelons updatable by all" ON public.promo_watermelons FOR UPDATE USING (true);
CREATE POLICY "Watermelons deletable by all" ON public.promo_watermelons FOR DELETE USING (true);

-- Enable realtime for watermelons so map updates live
ALTER PUBLICATION supabase_realtime ADD TABLE public.promo_watermelons;
ALTER PUBLICATION supabase_realtime ADD TABLE public.topup_cards;
