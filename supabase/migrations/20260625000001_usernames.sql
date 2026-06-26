-- supabase/migrations/20260625000001_usernames.sql
-- Adds case-insensitive usernames to profiles and auto-creates a profile row on
-- signup, seeded from the signup metadata (supabase.auth.signUp options.data.username).

CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username citext UNIQUE;

-- Server-side policy: usernames are 3–20 chars of [A-Za-z0-9_]. The signup
-- metadata is client-supplied and the client-side regex is not a trust
-- boundary, so this CHECK is the authoritative guarantee. The 'player_<8hex>'
-- fallback below (15 chars) satisfies it.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_username_format
  CHECK (username IS NULL OR username ~ '^[A-Za-z0-9_]{3,20}$');

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_supplied text := NULLIF(NEW.raw_user_meta_data->>'username', '');
BEGIN
  -- Only honor a supplied username if it conforms to the policy; otherwise use
  -- the safe default so a malformed/abusive metadata value can never block
  -- signup or violate the CHECK constraint (defense in depth).
  INSERT INTO profiles (id, username)
  VALUES (
    NEW.id,
    CASE
      WHEN v_supplied ~ '^[A-Za-z0-9_]{3,20}$' THEN v_supplied
      ELSE 'player_' || left(NEW.id::text, 8)
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
