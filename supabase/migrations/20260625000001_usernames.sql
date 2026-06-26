-- supabase/migrations/20260625000001_usernames.sql
-- Adds case-insensitive usernames to profiles and auto-creates a profile row on
-- signup, seeded from the signup metadata (supabase.auth.signUp options.data.username).

CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username citext UNIQUE;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'username', ''),
             'player_' || left(NEW.id::text, 8))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
