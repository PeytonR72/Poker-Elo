-- profiles: one row per registered user, written only by service role
CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  rating        int  NOT NULL DEFAULT 400,
  games_played  int  NOT NULL DEFAULT 0,
  rank          text GENERATED ALWAYS AS (
    CASE
      WHEN rating < 500  THEN 'Fish'
      WHEN rating < 750  THEN 'Limper'
      WHEN rating < 1000 THEN 'Grinder'
      WHEN rating < 1300 THEN 'Shark'
      WHEN rating < 1750 THEN 'Semi-Pro'
      ELSE 'Final Tablist'
    END
  ) STORED
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles (public leaderboard)
CREATE POLICY "profiles_read_all"
  ON profiles FOR SELECT
  USING (true);

-- Only service role can insert/update (bypasses RLS with service key)
-- No explicit write policy needed: RLS with no policy = deny for non-service callers.

-- matches: one row per completed match
CREATE TABLE IF NOT EXISTS matches (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     text        NOT NULL,
  format      text        NOT NULL,
  started_at  timestamptz,
  ended_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matches_read_all"
  ON matches FOR SELECT
  USING (true);

-- match_results: one row per (match, player)
CREATE TABLE IF NOT EXISTS match_results (
  match_id     uuid REFERENCES matches  ON DELETE CASCADE,
  player_id    uuid REFERENCES profiles ON DELETE CASCADE,
  finish_place int  NOT NULL,
  elo_delta    int  NOT NULL,
  rating_after int  NOT NULL,
  PRIMARY KEY (match_id, player_id)
);

ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match_results_read_all"
  ON match_results FOR SELECT
  USING (true);

-- Atomically increment a player's rating and games_played, return new rating
CREATE OR REPLACE FUNCTION increment_rating(p_player_id uuid, p_delta int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_rating int;
BEGIN
  UPDATE profiles
  SET rating = rating + p_delta,
      games_played = games_played + 1
  WHERE id = p_player_id
  RETURNING rating INTO v_new_rating;
  RETURN v_new_rating;
END;
$$;
