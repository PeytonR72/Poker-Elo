-- supabase/migrations/20260711000001_backfill_profiles.sql
-- Backfill: accounts created BEFORE 20260625000001_usernames.sql (which added the
-- on_auth_user_created trigger) have no profiles row, so every client-side
-- `.single()` on profiles fails with "Cannot coerce the result to a single JSON
-- object". Insert the missing rows using the same username policy as the trigger.

-- The metadata username may already be taken (UNIQUE citext) — fall back to the
-- 'player_<8hex>' default in that case so the backfill can never fail.
INSERT INTO profiles (id, username)
SELECT
  u.id,
  CASE
    WHEN NULLIF(u.raw_user_meta_data->>'username', '') ~ '^[A-Za-z0-9_]{3,20}$'
     AND NOT EXISTS (
       SELECT 1 FROM profiles q
       WHERE q.username = (u.raw_user_meta_data->>'username')::citext
     )
      THEN (u.raw_user_meta_data->>'username')::citext
    ELSE ('player_' || left(u.id::text, 8))::citext
  END
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
