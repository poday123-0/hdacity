
-- Competitions table
CREATE TABLE public.competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  metric text NOT NULL DEFAULT 'most_trips', -- most_trips for now
  period_type text NOT NULL DEFAULT 'weekly', -- daily, weekly, monthly, custom
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  service_location_id uuid REFERENCES public.service_locations(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active', -- active, completed, cancelled
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Competition prizes (multiple tiers per competition)
CREATE TABLE public.competition_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid REFERENCES public.competitions(id) ON DELETE CASCADE NOT NULL,
  tier_rank integer NOT NULL DEFAULT 1, -- 1=Gold, 2=Silver, 3=Bronze, etc.
  tier_name text NOT NULL DEFAULT 'Gold',
  prize_type text NOT NULL DEFAULT 'wallet_credit', -- wallet_credit, fee_free, badge, custom
  wallet_amount numeric NOT NULL DEFAULT 0,
  fee_free_months integer NOT NULL DEFAULT 0,
  badge_label text DEFAULT '',
  custom_description text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Competition results (populated when competition ends or live)
CREATE TABLE public.competition_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid REFERENCES public.competitions(id) ON DELETE CASCADE NOT NULL,
  driver_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  trip_count integer NOT NULL DEFAULT 0,
  rank integer,
  prize_awarded boolean NOT NULL DEFAULT false,
  prize_id uuid REFERENCES public.competition_prizes(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(competition_id, driver_id)
);

-- Enable RLS
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies - readable by all, writable by all (admin checks in app)
CREATE POLICY "Competitions readable by all" ON public.competitions FOR SELECT USING (true);
CREATE POLICY "Competitions insertable by all" ON public.competitions FOR INSERT WITH CHECK (true);
CREATE POLICY "Competitions updatable by all" ON public.competitions FOR UPDATE USING (true);
CREATE POLICY "Competitions deletable by all" ON public.competitions FOR DELETE USING (true);

CREATE POLICY "Competition prizes readable by all" ON public.competition_prizes FOR SELECT USING (true);
CREATE POLICY "Competition prizes insertable by all" ON public.competition_prizes FOR INSERT WITH CHECK (true);
CREATE POLICY "Competition prizes updatable by all" ON public.competition_prizes FOR UPDATE USING (true);
CREATE POLICY "Competition prizes deletable by all" ON public.competition_prizes FOR DELETE USING (true);

CREATE POLICY "Competition entries readable by all" ON public.competition_entries FOR SELECT USING (true);
CREATE POLICY "Competition entries insertable by all" ON public.competition_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Competition entries updatable by all" ON public.competition_entries FOR UPDATE USING (true);
CREATE POLICY "Competition entries deletable by all" ON public.competition_entries FOR DELETE USING (true);

-- Enable realtime for live leaderboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_entries;
