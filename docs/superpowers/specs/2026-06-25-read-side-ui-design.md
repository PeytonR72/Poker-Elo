# Build Unit 5 — Read-side UI (Profile / History / Leaderboard) + Usernames

_Design spec. Date: 2026-06-25. Branch off `master`._

## Goal

Surface the persisted ELO data that the backend already writes (`profiles`, `matches`,
`match_results`) through client screens, and give players real identities (usernames) so those
screens read as a real leaderboard rather than a list of UUIDs.

Scope is the **read side** only: a global leaderboard, a per-player profile with match history, the
usernames needed to label them, and the navigation to reach them. No deployment, no replay, no
gameplay changes.

## Non-goals

- Production deployment / live wiring (separate unit).
- Replay viewer (needs per-hand `GameEvent` persistence that does not exist yet).
- Spectator mode, reconnect UX, animations.
- Editing usernames after signup, avatars, friends, search.

## Architecture (Approach A)

Direct Supabase queries from thin per-screen hooks, feeding raw rows into **pure, tested shaping
functions** under `client/src/data/`. Components stay presentational. This mirrors the Unit 4
pattern (`matchReducer` / `lobbyReducer` pure cores + thin views). Public-read RLS already permits
all the SELECTs; no new backend read surface is added. The only backend change is the username
migration.

## Conventions honored

- **No poker-numerics outside `shared/src/constants.ts`.** Tiers/defaults/format labels come from
  `@poker/shared` (`rankForRating`, `ELO_DEFAULT_RATING`, `MATCH_FORMATS`). The migration's tier
  thresholds mirror `RANK_TIERS`/`ELO_DEFAULT_RATING` (carry the existing "if these change, update
  here" comment).
- Relative imports end in `.js`; TS strict + `noUncheckedIndexedAccess`; `verbatimModuleSyntax`
  (type-only imports use `import type`).
- Tests colocated `*.test.ts`. Pure cores tested; components thin.
- `npm test` / `npm run typecheck` / `npm run lint` stay green. Release gates untouched.

---

## Section 1 — Usernames (schema + auth)

### Migration `supabase/migrations/<ts>_usernames.sql`

- Enable `citext` extension (`CREATE EXTENSION IF NOT EXISTS citext`).
- `ALTER TABLE profiles ADD COLUMN username citext UNIQUE;` (nullable; case-insensitive
  uniqueness).
- Trigger `handle_new_user` (SECURITY DEFINER, `search_path = public, pg_temp`) on
  `AFTER INSERT ON auth.users`:
  - Inserts a `profiles` row for `NEW.id` with
    `username = COALESCE(NULLIF(NEW.raw_user_meta_data->>'username',''), 'player_' || left(NEW.id::text, 8))`.
  - `ON CONFLICT (id) DO NOTHING` (idempotent if a row already exists).
- The existing service-role `upsert({ id }, { ignoreDuplicates: true })` in `report-match` is left
  unchanged — `ignoreDuplicates` means it never overwrites an existing username.
- Username collision on the trigger insert: the fallback `player_<8hex>` is effectively unique; a
  user-chosen duplicate raises a unique-violation that surfaces as a signup error (acceptable;
  client validates basic shape, DB enforces uniqueness).

### Client auth

- `useSession.signUp(email, password, username)` passes
  `options: { data: { username } }` to `supabase.auth.signUp`.
- `AuthScreen`: add a username `<input>` shown **only** in sign-up mode; required, trimmed,
  length 3–20, charset `[A-Za-z0-9_]` (client-side validation; DB is source of truth for
  uniqueness). Sign-in mode unchanged.
- **Deferred-item-1 fix (folded in):** `useSession` calls `setLoading(false)` even when
  `supabase.auth.getSession()` rejects (`.catch`), so a network failure no longer pins "Loading…".

### Display-name helper

`client/src/data/displayName.ts` — pure, tested:

```
displayName(p: { id: string; username?: string | null }): string
```

- Bot id (`id.startsWith("bot-")`) → `🤖 <id>`.
- Else `username` if present and non-empty, else `player_<id.slice(0,8)>`.

`MatchOver` is updated to use this helper so all surfaces agree. (`MatchOver` currently has no
username data; it keeps its UUID-based fallback via the helper — no regression.)

---

## Section 2 — Navigation (Home with tabs)

- `App.tsx` stays the top-level gate: `loading → AuthScreen → (match ? GameScreen : Home)`.
  `onMatchFound` still bubbles up from the Play tab to `App`.
- New `client/src/home/Home.tsx` shell:
  - Header: app title, `RatingBadge` (own rating + tier), sign-out.
  - Tab bar: **Play | Leaderboard | Profile**. Active tab in local `useState` (no router).
  - Optional `activeProfileId` state: clicking a leaderboard row sets it and switches to the
    Profile tab; the Profile tab with no selection shows the signed-in user's own profile.
- The current `LobbyScreen` becomes the **Play tab** body (format select, Find Match, queue
  state). Its inline rating line is replaced by the shared `RatingBadge` in the Home header; the
  existing own-rating fetch moves up to `Home` (single source for the header badge + Play tab).
- `client/src/home/RatingBadge.tsx` — presentational: takes `rating`, renders the number +
  `rankForRating(rating)` label, colored by tier. Reused in header, leaderboard rows, profile.

---

## Section 3 — Leaderboard

### Hook `client/src/leaderboard/useLeaderboard.ts`

- Query A: `profiles` select `id, username, rating, games_played` where `games_played > 0`
  order by `rating desc` limit 100.
- Query B (own rank): the signed-in user's own `profiles` row; plus, if they have `games_played>0`
  and are not in Query A's result, a `count` of profiles with `games_played>0 AND rating > ownRating`
  to compute their 1-based position.
- Returns `{ loading, error, rows, ownRow, ownPosition }` (raw shapes; no UI logic).

### Pure core `client/src/data/leaderboard.ts`

```
buildLeaderboard(rows, ownRow, ownPosition, ownId): {
  entries: LeaderboardEntry[];     // top-100, position 1..n, isOwn flag
  ownTail?: LeaderboardEntry;      // present only if own player exists and is outside top-100
}
```

- Positions are 1-based by descending rating; ties broken by `username` (stable, deterministic for
  tests).
- `LeaderboardEntry = { position, id, name, rating, gamesPlayed, isOwn }` where `name` comes from
  `displayName`.
- Colocated `leaderboard.test.ts`: ordering, tie-break, own-in-top vs own-tail, empty board.

### `client/src/leaderboard/LeaderboardScreen.tsx`

Thin table: position · `RatingBadge`/rating · name · games. Own row highlighted; a separator + the
`ownTail` row when present. Rows clickable → `onOpenProfile(id)`. Loading / error / empty states.

---

## Section 4 — Profile + history

### Hook `client/src/profile/useProfile.ts`

- `profiles` row for `playerId` (`id, username, rating, games_played, rank`).
- `match_results` for `playerId` joined to `matches` (`format, ended_at`), order by `matches.ended_at`
  desc. Returns `{ loading, error, profile, results }` (raw rows).

### Pure core `client/src/data/profile.ts`

```
buildProfile(profileRow, resultRows): {
  header: { id, name, rating, tier, gamesPlayed, firstPlaceCount, bestFinish };
  history: ProfileHistoryEntry[];
}
```

- `tier = rankForRating(rating)`; `name = displayName(profileRow)`.
- `firstPlaceCount` = count of `finish_place === 1`; `bestFinish` = min finish (undefined if none).
- `ProfileHistoryEntry = { matchId, date, formatLabel, finishPlace, eloDelta, ratingAfter }`;
  `formatLabel` from `MATCH_FORMATS[format]?.label ?? format`.
- Colocated `profile.test.ts`: stat aggregation, empty history, format-label fallback, delta sign.

### `client/src/profile/ProfileScreen.tsx`

Thin: stat header (name, `RatingBadge`, games, 1st-place count, best finish) + history table
(date · format · finish · ±elo · rating after). "Back" returns to the previous tab. Loading /
error / empty-history states.

---

## Data flow

```
AuthScreen --signUp(username)--> Supabase auth --trigger--> profiles row (username)
Home(tab) ──Play──> LobbyScreen ──matchFound──> App ──> GameScreen
        ├─Leaderboard──> useLeaderboard ──rows──> buildLeaderboard ──> LeaderboardScreen ──click──┐
        └─Profile ─────> useProfile ─────rows──> buildProfile ──────> ProfileScreen <─────────────┘
```

## Error handling

- Hooks expose `{ loading, error }`; screens render explicit loading / error / empty states.
- Supabase query `error` fields are surfaced (not silently dropped) — improves on the Unit-4
  graceful-degrade-only pattern for these new screens.
- Pure cores are total functions over their inputs (no throws); empty inputs yield empty views.

## Testing

- Pure cores: `displayName.test.ts`, `leaderboard.test.ts`, `profile.test.ts` (Vitest, colocated).
- Components remain thin enough not to require DOM tests (consistent with Unit 4).
- Gates: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build --workspace @poker/client`
  all green; hand-eval oracle + chip-conservation gates untouched.

## File manifest

New:
- `supabase/migrations/<ts>_usernames.sql`
- `client/src/data/displayName.ts` (+ `.test.ts`)
- `client/src/data/leaderboard.ts` (+ `.test.ts`)
- `client/src/data/profile.ts` (+ `.test.ts`)
- `client/src/home/Home.tsx`
- `client/src/home/RatingBadge.tsx`
- `client/src/leaderboard/useLeaderboard.ts`
- `client/src/leaderboard/LeaderboardScreen.tsx`
- `client/src/profile/useProfile.ts`
- `client/src/profile/ProfileScreen.tsx`

Modified:
- `client/src/App.tsx` (render `Home` instead of `LobbyScreen`)
- `client/src/auth/AuthScreen.tsx` (username field in sign-up)
- `client/src/auth/useSession.ts` (`signUp` username arg; `setLoading(false)` on reject)
- `client/src/lobby/LobbyScreen.tsx` (becomes Play tab body; rating moves to Home header)
- `client/src/game/MatchOver.tsx` (use `displayName` helper)
- `CLAUDE.md` (module map: new `client` modules + status)
