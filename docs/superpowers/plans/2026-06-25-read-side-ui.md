# Read-side UI (Leaderboard / Profile / History) + Usernames — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the persisted ELO data (`profiles`/`matches`/`match_results`) through a global Leaderboard and a per-player Profile/History screen, with real usernames to label players, reached via tabs on a new Home shell.

**Architecture:** Thin per-screen Supabase hooks feed raw rows into pure, tested shaping functions under `client/src/data/`; presentational components render the shaped data. Public-read RLS already permits the SELECTs; the only backend change is a usernames migration + a `handle_new_user` trigger. Mirrors the Unit 4 pure-core + thin-view pattern.

**Tech Stack:** React 18 + Vite, TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), Supabase JS v2, Vitest, `@poker/shared` for all poker-numerics, Postgres/Supabase migration SQL.

## Global Constraints

- **No poker-numeric value may be hardcoded** outside `shared/src/constants.ts`. Use `rankForRating`, `ELO_DEFAULT_RATING`, `MATCH_FORMATS` from `@poker/shared`.
- **Server-authoritative / read-only here.** These screens only SELECT public data; never fabricate game state.
- Relative imports end in `.js` (sources are `.ts`/`.tsx`). Type-only imports use `import type` (`verbatimModuleSyntax`).
- TS strict + `noUncheckedIndexedAccess`: index access yields `T | undefined`; guard or assert only when provably in-bounds.
- Tests colocated `*.test.ts` (vitest picks up `**/src/**/*.test.ts`; **`.ts` only**, so pure cores are `.ts`). Components/hooks stay thin and are verified by typecheck/build, not unit tests (consistent with Unit 4).
- Gates must stay green: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build --workspace @poker/client`. Hand-eval oracle + chip-conservation gates untouched.
- Run a single test file with: `npm test -- <path>`.

---

### Task 1: `displayName` helper (pure)

**Files:**
- Create: `client/src/data/displayName.ts`
- Test: `client/src/data/displayName.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `displayName(p: { id: string; username?: string | null }): string` — bots (`id` starts with `bot-`) → `🤖 <id>`; else trimmed non-empty `username`; else `player_<id.slice(0,8)>`.

- [ ] **Step 1: Write the failing test**

```ts
// client/src/data/displayName.test.ts
import { describe, it, expect } from "vitest";
import { displayName } from "./displayName.js";

describe("displayName", () => {
  it("prefixes bots with the robot glyph", () => {
    expect(displayName({ id: "bot-3" })).toBe("🤖 bot-3");
  });
  it("uses a non-empty username", () => {
    expect(displayName({ id: "abcdef0123", username: "Phil" })).toBe("Phil");
  });
  it("falls back to player_<8> when username is null/empty/whitespace", () => {
    expect(displayName({ id: "abcdef0123456", username: null })).toBe("player_abcdef01");
    expect(displayName({ id: "abcdef0123456", username: "   " })).toBe("player_abcdef01");
    expect(displayName({ id: "abcdef0123456" })).toBe("player_abcdef01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- client/src/data/displayName.test.ts`
Expected: FAIL — cannot resolve `./displayName.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// client/src/data/displayName.ts
export function displayName(p: { id: string; username?: string | null }): string {
  if (p.id.startsWith("bot-")) return `🤖 ${p.id}`;
  const u = p.username?.trim();
  return u && u.length > 0 ? u : `player_${p.id.slice(0, 8)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- client/src/data/displayName.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/data/displayName.ts client/src/data/displayName.test.ts
git commit -m "feat(client): displayName helper for player labels"
```

---

### Task 2: `buildLeaderboard` core (pure)

**Files:**
- Create: `client/src/data/leaderboard.ts`
- Test: `client/src/data/leaderboard.test.ts`

**Interfaces:**
- Consumes: `displayName` from `./displayName.js`.
- Produces:
  - `interface ProfileRow { id: string; username: string | null; rating: number; games_played: number; }`
  - `interface LeaderboardEntry { position: number; id: string; name: string; rating: number; gamesPlayed: number; isOwn: boolean; }`
  - `interface Leaderboard { entries: LeaderboardEntry[]; ownTail?: LeaderboardEntry; }`
  - `buildLeaderboard(rows: ProfileRow[], ownRow: ProfileRow | null, ownPosition: number | null, ownId: string | null): Leaderboard`
  - Sorts rows by `rating` desc, tie-break by `displayName` (deterministic). Positions are 1-based. `ownTail` is set only when the own player exists, has `games_played > 0`, and is NOT already in `entries`.

- [ ] **Step 1: Write the failing test**

```ts
// client/src/data/leaderboard.test.ts
import { describe, it, expect } from "vitest";
import { buildLeaderboard, type ProfileRow } from "./leaderboard.js";

const row = (over: Partial<ProfileRow>): ProfileRow => ({
  id: "x", username: null, rating: 400, games_played: 1, ...over,
});

describe("buildLeaderboard", () => {
  it("assigns 1-based positions in rating-desc order with name tie-break", () => {
    const rows = [
      row({ id: "a", username: "Bob", rating: 500 }),
      row({ id: "b", username: "Amy", rating: 500 }),
      row({ id: "c", username: "Cy", rating: 600 }),
    ];
    const { entries } = buildLeaderboard(rows, null, null, null);
    expect(entries.map((e) => [e.position, e.id])).toEqual([[1, "c"], [2, "b"], [3, "a"]]);
  });

  it("flags the own row when it is inside the list and adds no tail", () => {
    const rows = [row({ id: "a", rating: 500 }), row({ id: "me", rating: 450 })];
    const lb = buildLeaderboard(rows, null, null, "me");
    expect(lb.entries.find((e) => e.id === "me")?.isOwn).toBe(true);
    expect(lb.ownTail).toBeUndefined();
  });

  it("appends an own tail when the player is outside the list", () => {
    const rows = [row({ id: "a", rating: 500 })];
    const ownRow = row({ id: "me", username: "Me", rating: 410, games_played: 4 });
    const lb = buildLeaderboard(rows, ownRow, 87, "me");
    expect(lb.ownTail).toEqual({
      position: 87, id: "me", name: "Me", rating: 410, gamesPlayed: 4, isOwn: true,
    });
  });

  it("omits the tail when the own player has played zero games", () => {
    const rows = [row({ id: "a", rating: 500 })];
    const ownRow = row({ id: "me", rating: 400, games_played: 0 });
    expect(buildLeaderboard(rows, ownRow, 99, "me").ownTail).toBeUndefined();
  });

  it("returns an empty board for no rows", () => {
    expect(buildLeaderboard([], null, null, null)).toEqual({ entries: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- client/src/data/leaderboard.test.ts`
Expected: FAIL — cannot resolve `./leaderboard.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// client/src/data/leaderboard.ts
import { displayName } from "./displayName.js";

export interface ProfileRow {
  id: string;
  username: string | null;
  rating: number;
  games_played: number;
}

export interface LeaderboardEntry {
  position: number;
  id: string;
  name: string;
  rating: number;
  gamesPlayed: number;
  isOwn: boolean;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  ownTail?: LeaderboardEntry;
}

export function buildLeaderboard(
  rows: ProfileRow[],
  ownRow: ProfileRow | null,
  ownPosition: number | null,
  ownId: string | null,
): Leaderboard {
  const sorted = [...rows].sort(
    (a, b) => b.rating - a.rating || displayName(a).localeCompare(displayName(b)),
  );
  const entries: LeaderboardEntry[] = sorted.map((r, i) => ({
    position: i + 1,
    id: r.id,
    name: displayName(r),
    rating: r.rating,
    gamesPlayed: r.games_played,
    isOwn: r.id === ownId,
  }));

  const inTop = ownId != null && entries.some((e) => e.isOwn);
  if (!inTop && ownRow && ownPosition != null && ownRow.games_played > 0) {
    const ownTail: LeaderboardEntry = {
      position: ownPosition,
      id: ownRow.id,
      name: displayName(ownRow),
      rating: ownRow.rating,
      gamesPlayed: ownRow.games_played,
      isOwn: true,
    };
    return { entries, ownTail };
  }
  return { entries };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- client/src/data/leaderboard.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/data/leaderboard.ts client/src/data/leaderboard.test.ts
git commit -m "feat(client): buildLeaderboard pure core"
```

---

### Task 3: `buildProfile` core (pure)

**Files:**
- Create: `client/src/data/profile.ts`
- Test: `client/src/data/profile.test.ts`

**Interfaces:**
- Consumes: `displayName` from `./displayName.js`; `ProfileRow` from `./leaderboard.js`; `rankForRating`, `MATCH_FORMATS` from `@poker/shared`.
- Produces:
  - `interface MatchResultRow { match_id: string; finish_place: number; elo_delta: number; rating_after: number; matches: { format: string; ended_at: string } | null; }`
  - `interface ProfileHeader { id: string; name: string; rating: number; tier: string; gamesPlayed: number; firstPlaceCount: number; bestFinish: number | null; }`
  - `interface ProfileHistoryEntry { matchId: string; date: string; formatLabel: string; finishPlace: number; eloDelta: number; ratingAfter: number; }`
  - `interface ProfileData { header: ProfileHeader; history: ProfileHistoryEntry[]; }`
  - `buildProfile(profile: ProfileRow, results: MatchResultRow[]): ProfileData`

- [ ] **Step 1: Write the failing test**

```ts
// client/src/data/profile.test.ts
import { describe, it, expect } from "vitest";
import { buildProfile, type MatchResultRow } from "./profile.js";
import type { ProfileRow } from "./leaderboard.js";

const profile: ProfileRow = { id: "me", username: "Me", rating: 520, games_played: 3 };

const result = (over: Partial<MatchResultRow>): MatchResultRow => ({
  match_id: "m", finish_place: 2, elo_delta: -8, rating_after: 512,
  matches: { format: "turbo", ended_at: "2026-06-20T10:00:00Z" }, ...over,
});

describe("buildProfile", () => {
  it("derives header stats including tier, first-place count and best finish", () => {
    const { header } = buildProfile(profile, [
      result({ finish_place: 1 }),
      result({ finish_place: 4 }),
      result({ finish_place: 1 }),
    ]);
    expect(header.name).toBe("Me");
    expect(header.tier).toBe("Limper"); // rating 520 -> Limper per RANK_TIERS (Limper = 500..749)
    expect(header.gamesPlayed).toBe(3);
    expect(header.firstPlaceCount).toBe(2);
    expect(header.bestFinish).toBe(1);
  });

  it("maps history rows to display fields using MATCH_FORMATS labels", () => {
    const { history } = buildProfile(profile, [result({ match_id: "m1" })]);
    expect(history[0]).toEqual({
      matchId: "m1", date: "2026-06-20T10:00:00Z", formatLabel: "Turbo",
      finishPlace: 2, eloDelta: -8, ratingAfter: 512,
    });
  });

  it("handles empty history and missing match join", () => {
    const empty = buildProfile(profile, []);
    expect(empty.history).toEqual([]);
    expect(empty.header.bestFinish).toBeNull();
    expect(empty.header.firstPlaceCount).toBe(0);

    const { history } = buildProfile(profile, [result({ matches: null })]);
    expect(history[0]?.formatLabel).toBe("—");
    expect(history[0]?.date).toBe("");
  });

  it("falls back to the raw format string when unknown", () => {
    const { history } = buildProfile(profile, [
      result({ matches: { format: "mystery", ended_at: "2026-06-01T00:00:00Z" } }),
    ]);
    expect(history[0]?.formatLabel).toBe("mystery");
  });
});
```

> Note: tier names/floors per `RANK_TIERS` in `shared/src/constants.ts`: Fish 0 / Limper 500 / Grinder 750 / Shark 1000 / Semi-Pro 1300 / Final Tablist 1750. Rating 520 → "Limper".

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- client/src/data/profile.test.ts`
Expected: FAIL — cannot resolve `./profile.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// client/src/data/profile.ts
import { rankForRating, MATCH_FORMATS } from "@poker/shared";
import { displayName } from "./displayName.js";
import type { ProfileRow } from "./leaderboard.js";

export interface MatchResultRow {
  match_id: string;
  finish_place: number;
  elo_delta: number;
  rating_after: number;
  matches: { format: string; ended_at: string } | null;
}

export interface ProfileHeader {
  id: string;
  name: string;
  rating: number;
  tier: string;
  gamesPlayed: number;
  firstPlaceCount: number;
  bestFinish: number | null;
}

export interface ProfileHistoryEntry {
  matchId: string;
  date: string;
  formatLabel: string;
  finishPlace: number;
  eloDelta: number;
  ratingAfter: number;
}

export interface ProfileData {
  header: ProfileHeader;
  history: ProfileHistoryEntry[];
}

export function buildProfile(profile: ProfileRow, results: MatchResultRow[]): ProfileData {
  const places = results.map((r) => r.finish_place);
  const header: ProfileHeader = {
    id: profile.id,
    name: displayName(profile),
    rating: profile.rating,
    tier: rankForRating(profile.rating),
    gamesPlayed: profile.games_played,
    firstPlaceCount: places.filter((p) => p === 1).length,
    bestFinish: places.length > 0 ? Math.min(...places) : null,
  };
  const history: ProfileHistoryEntry[] = results.map((r) => ({
    matchId: r.match_id,
    date: r.matches?.ended_at ?? "",
    formatLabel: r.matches ? (MATCH_FORMATS[r.matches.format]?.label ?? r.matches.format) : "—",
    finishPlace: r.finish_place,
    eloDelta: r.elo_delta,
    ratingAfter: r.rating_after,
  }));
  return { header, history };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- client/src/data/profile.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/data/profile.ts client/src/data/profile.test.ts
git commit -m "feat(client): buildProfile pure core"
```

---

### Task 4: Usernames migration + trigger

**Files:**
- Create: `supabase/migrations/20260625000001_usernames.sql`

**Interfaces:**
- Consumes: existing `profiles` table from `20260621000001_init.sql`.
- Produces: `profiles.username citext UNIQUE` (nullable); trigger `on_auth_user_created` calling `handle_new_user()` which inserts a `profiles` row seeded from `raw_user_meta_data->>'username'` with a `player_<8hex>` fallback.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Verify the SQL parses (if a local Supabase stack is available)**

Run (only if Supabase CLI + local stack are set up): `supabase db reset`
Expected: migrations apply with no error; `\d profiles` shows a `username` column.
If no local stack is available, verify by review: (a) `citext` extension enabled before the column uses it; (b) column is nullable + UNIQUE; (c) trigger function is `SECURITY DEFINER` with a pinned `search_path`; (d) `ON CONFLICT (id) DO NOTHING` keeps it idempotent and prevents clobbering rows created by the `report-match` service-role upsert.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260625000001_usernames.sql
git commit -m "feat(db): usernames column + handle_new_user trigger"
```

---

### Task 5: Capture username at signup

**Files:**
- Modify: `client/src/auth/useSession.ts`
- Modify: `client/src/auth/AuthScreen.tsx`

**Interfaces:**
- Consumes: `supabase` client.
- Produces: `SessionApi.signUp(email: string, password: string, username: string): Promise<string | null>` (now takes a username, passed as `options.data.username`). `useSession` also calls `setLoading(false)` if `getSession()` rejects.

- [ ] **Step 1: Update `useSession` — signUp signature + loading-on-reject fix**

In `client/src/auth/useSession.ts`:

Change the interface member:

```ts
  signUp: (email: string, password: string, username: string) => Promise<string | null>;
```

Change the `getSession` effect to not hang on rejection:

```ts
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => setLoading(false));
```

Change the `signUp` callback to forward the username:

```ts
  const signUp = useCallback(
    async (email: string, password: string, username: string): Promise<string | null> => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      return error ? error.message : null;
    },
    [],
  );
```

- [ ] **Step 2: Add a username field to `AuthScreen` (sign-up mode only)**

Rewrite `client/src/auth/AuthScreen.tsx`:

```tsx
import type React from "react";
import { useState } from "react";
import type { SessionApi } from "./useSession.js";

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

export default function AuthScreen({ auth }: { auth: SessionApi }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "up" && !USERNAME_RE.test(username.trim())) {
      setError("Username must be 3–20 letters, numbers or underscores.");
      return;
    }
    setBusy(true);
    const err =
      mode === "in"
        ? await auth.signIn(email, password)
        : await auth.signUp(email, password, username.trim());
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div style={{ maxWidth: 360, margin: "10vh auto", padding: 24 }}>
      <h1 style={{ textAlign: "center" }}>PokerElo</h1>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "up" && (
          <input
            type="text"
            placeholder="username"
            value={username}
            required
            minLength={3}
            maxLength={20}
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: 10 }}
          />
        )}
        <input type="email" placeholder="email" value={email} required
          onChange={(e) => setEmail(e.target.value)} style={{ padding: 10 }} />
        <input type="password" placeholder="password" value={password} required minLength={6}
          onChange={(e) => setPassword(e.target.value)} style={{ padding: 10 }} />
        <button type="submit" disabled={busy} style={{ padding: 10, background: "#2d7d46", color: "white", border: 0, borderRadius: 6 }}>
          {mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
      <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); }}
        style={{ marginTop: 12, background: "none", border: 0, color: "#7aa2f7" }}>
        {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (no TS errors). Note: any other caller of `signUp` would now fail to typecheck — there are none besides `AuthScreen`.

- [ ] **Step 4: Commit**

```bash
git add client/src/auth/useSession.ts client/src/auth/AuthScreen.tsx
git commit -m "feat(client): capture username at signup; fix loading on getSession reject"
```

---

### Task 6: `RatingBadge` component

**Files:**
- Create: `client/src/home/RatingBadge.tsx`

**Interfaces:**
- Consumes: `rankForRating` from `@poker/shared`.
- Produces: `default RatingBadge({ rating }: { rating: number })` — renders the rating number + tier label, colored by tier.

- [ ] **Step 1: Write the component**

```tsx
// client/src/home/RatingBadge.tsx
import { rankForRating } from "@poker/shared";

// Keyed by RANK_TIERS names (Fish/Limper/Grinder/Shark/Semi-Pro/Final Tablist).
const TIER_COLOR: Record<string, string> = {
  Fish: "#6b7280",
  Limper: "#7aa2f7",
  Grinder: "#5dd39e",
  Shark: "#e0af68",
  "Semi-Pro": "#bb9af7",
  "Final Tablist": "#f7768e",
};

export default function RatingBadge({ rating }: { rating: number }) {
  const tier = rankForRating(rating);
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "baseline" }}>
      <b>{rating}</b>
      <span style={{ color: TIER_COLOR[tier] ?? "#e6e6e6", fontSize: 13 }}>{tier}</span>
    </span>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/home/RatingBadge.tsx
git commit -m "feat(client): RatingBadge component"
```

---

### Task 7: Leaderboard hook + screen

**Files:**
- Create: `client/src/leaderboard/useLeaderboard.ts`
- Create: `client/src/leaderboard/LeaderboardScreen.tsx`

**Interfaces:**
- Consumes: `supabase`; `ProfileRow`, `buildLeaderboard` from `../data/leaderboard.js`; `RatingBadge` from `../home/RatingBadge.js`.
- Produces:
  - `useLeaderboard(ownId: string | null): { loading: boolean; error: string | null; rows: ProfileRow[]; ownRow: ProfileRow | null; ownPosition: number | null; }`
  - `default LeaderboardScreen({ ownId, onOpenProfile }: { ownId: string | null; onOpenProfile: (id: string) => void })`

- [ ] **Step 1: Write the hook**

```ts
// client/src/leaderboard/useLeaderboard.ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import type { ProfileRow } from "../data/leaderboard.js";

export interface LeaderboardData {
  loading: boolean;
  error: string | null;
  rows: ProfileRow[];
  ownRow: ProfileRow | null;
  ownPosition: number | null;
}

const PROFILE_COLS = "id, username, rating, games_played";

export function useLeaderboard(ownId: string | null): LeaderboardData {
  const [state, setState] = useState<LeaderboardData>({
    loading: true, error: null, rows: [], ownRow: null, ownPosition: null,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_COLS)
        .gt("games_played", 0)
        .order("rating", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        setState({ loading: false, error: error.message, rows: [], ownRow: null, ownPosition: null });
        return;
      }
      const rows = (data ?? []) as ProfileRow[];

      let ownRow: ProfileRow | null = null;
      let ownPosition: number | null = null;
      if (ownId && !rows.some((r) => r.id === ownId)) {
        const { data: own } = await supabase
          .from("profiles").select(PROFILE_COLS).eq("id", ownId).single();
        const o = own as ProfileRow | null;
        if (o && o.games_played > 0) {
          ownRow = o;
          const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gt("games_played", 0)
            .gt("rating", o.rating);
          ownPosition = (count ?? 0) + 1;
        }
      }
      if (cancelled) return;
      setState({ loading: false, error: null, rows, ownRow, ownPosition });
    }
    void load();
    return () => { cancelled = true; };
  }, [ownId]);

  return state;
}
```

- [ ] **Step 2: Write the screen**

```tsx
// client/src/leaderboard/LeaderboardScreen.tsx
import { buildLeaderboard, type LeaderboardEntry } from "../data/leaderboard.js";
import { useLeaderboard } from "./useLeaderboard.js";
import RatingBadge from "../home/RatingBadge.js";

function Row({ e, onOpenProfile }: { e: LeaderboardEntry; onOpenProfile: (id: string) => void }) {
  return (
    <tr
      onClick={() => onOpenProfile(e.id)}
      style={{ cursor: "pointer", fontWeight: e.isOwn ? 700 : 400, background: e.isOwn ? "#1b2540" : "transparent" }}
    >
      <td style={{ padding: "6px 8px" }}>{e.position}</td>
      <td style={{ padding: "6px 8px" }}>{e.name}{e.isOwn ? " (you)" : ""}</td>
      <td style={{ padding: "6px 8px" }}><RatingBadge rating={e.rating} /></td>
      <td align="right" style={{ padding: "6px 8px" }}>{e.gamesPlayed}</td>
    </tr>
  );
}

export default function LeaderboardScreen({
  ownId,
  onOpenProfile,
}: {
  ownId: string | null;
  onOpenProfile: (id: string) => void;
}) {
  const { loading, error, rows, ownRow, ownPosition } = useLeaderboard(ownId);

  if (loading) return <p>Loading leaderboard…</p>;
  if (error) return <p style={{ color: "#ff6b6b" }}>Couldn’t load leaderboard: {error}</p>;

  const { entries, ownTail } = buildLeaderboard(rows, ownRow, ownPosition, ownId);
  if (entries.length === 0) return <p>No ranked players yet. Play a match to get on the board!</p>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ color: "#8b92a5", textAlign: "left" }}>
          <th style={{ padding: "6px 8px" }}>#</th>
          <th style={{ padding: "6px 8px" }}>Player</th>
          <th style={{ padding: "6px 8px" }}>Rating</th>
          <th align="right" style={{ padding: "6px 8px" }}>Games</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => <Row key={e.id} e={e} onOpenProfile={onOpenProfile} />)}
        {ownTail && (
          <>
            <tr><td colSpan={4} style={{ textAlign: "center", color: "#8b92a5" }}>⋯</td></tr>
            <Row e={ownTail} onOpenProfile={onOpenProfile} />
          </>
        )}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/leaderboard/useLeaderboard.ts client/src/leaderboard/LeaderboardScreen.tsx
git commit -m "feat(client): leaderboard hook + screen"
```

---

### Task 8: Profile hook + screen

**Files:**
- Create: `client/src/profile/useProfile.ts`
- Create: `client/src/profile/ProfileScreen.tsx`

**Interfaces:**
- Consumes: `supabase`; `ProfileRow` from `../data/leaderboard.js`; `MatchResultRow`, `buildProfile` from `../data/profile.js`; `RatingBadge` from `../home/RatingBadge.js`.
- Produces:
  - `useProfile(playerId: string | null): { loading: boolean; error: string | null; profile: ProfileRow | null; results: MatchResultRow[] }`
  - `default ProfileScreen({ playerId, onBack }: { playerId: string | null; onBack: () => void })`

- [ ] **Step 1: Write the hook**

```ts
// client/src/profile/useProfile.ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import type { ProfileRow } from "../data/leaderboard.js";
import type { MatchResultRow } from "../data/profile.js";

export interface ProfileFetch {
  loading: boolean;
  error: string | null;
  profile: ProfileRow | null;
  results: MatchResultRow[];
}

export function useProfile(playerId: string | null): ProfileFetch {
  const [state, setState] = useState<ProfileFetch>({
    loading: true, error: null, profile: null, results: [],
  });

  useEffect(() => {
    if (!playerId) {
      setState({ loading: false, error: null, profile: null, results: [] });
      return;
    }
    let cancelled = false;
    async function load() {
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, username, rating, games_played")
        .eq("id", playerId)
        .single();
      if (cancelled) return;
      if (profErr) {
        setState({ loading: false, error: profErr.message, profile: null, results: [] });
        return;
      }

      const { data: res, error: resErr } = await supabase
        .from("match_results")
        .select("match_id, finish_place, elo_delta, rating_after, matches(format, ended_at)")
        .eq("player_id", playerId)
        .order("ended_at", { ascending: false, referencedTable: "matches" });
      if (cancelled) return;
      if (resErr) {
        setState({ loading: false, error: resErr.message, profile: prof as ProfileRow, results: [] });
        return;
      }
      setState({
        loading: false,
        error: null,
        profile: prof as ProfileRow,
        results: (res ?? []) as unknown as MatchResultRow[],
      });
    }
    void load();
    return () => { cancelled = true; };
  }, [playerId]);

  return state;
}
```

> Note: the embedded `matches(...)` resource is a to-one relation (FK `match_results.match_id → matches`), so Supabase returns it as an object (or `null`), matching `MatchResultRow.matches`. The `as unknown as` cast bridges supabase-js's inferred embedded-array type to our to-one shape.

- [ ] **Step 2: Write the screen**

```tsx
// client/src/profile/ProfileScreen.tsx
import { buildProfile } from "../data/profile.js";
import { useProfile } from "./useProfile.js";
import RatingBadge from "../home/RatingBadge.js";

export default function ProfileScreen({
  playerId,
  onBack,
}: {
  playerId: string | null;
  onBack: () => void;
}) {
  const { loading, error, profile, results } = useProfile(playerId);

  if (loading) return <p>Loading profile…</p>;
  if (error) return <p style={{ color: "#ff6b6b" }}>Couldn’t load profile: {error}</p>;
  if (!profile) return <p>Profile not found.</p>;

  const { header, history } = buildProfile(profile, results);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{header.name}</h2>
        <RatingBadge rating={header.rating} />
      </div>
      <p style={{ color: "#8b92a5" }}>
        {header.gamesPlayed} games · {header.firstPlaceCount} wins
        {header.bestFinish != null ? ` · best finish #${header.bestFinish}` : ""}
      </p>

      <h3>Match history</h3>
      {history.length === 0 ? (
        <p style={{ color: "#8b92a5" }}>No matches played yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#8b92a5", textAlign: "left" }}>
              <th style={{ padding: "6px 8px" }}>Date</th>
              <th style={{ padding: "6px 8px" }}>Format</th>
              <th style={{ padding: "6px 8px" }}>Finish</th>
              <th align="right" style={{ padding: "6px 8px" }}>ELO</th>
              <th align="right" style={{ padding: "6px 8px" }}>Rating</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.matchId}>
                <td style={{ padding: "6px 8px" }}>{h.date ? new Date(h.date).toLocaleDateString() : "—"}</td>
                <td style={{ padding: "6px 8px" }}>{h.formatLabel}</td>
                <td style={{ padding: "6px 8px" }}>#{h.finishPlace}</td>
                <td align="right" style={{ padding: "6px 8px", color: h.eloDelta >= 0 ? "#5dd39e" : "#ff6b6b" }}>
                  {h.eloDelta >= 0 ? `+${h.eloDelta}` : h.eloDelta}
                </td>
                <td align="right" style={{ padding: "6px 8px" }}>{h.ratingAfter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button onClick={onBack} style={{ marginTop: 16, padding: "8px 16px" }}>Back</button>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/profile/useProfile.ts client/src/profile/ProfileScreen.tsx
git commit -m "feat(client): profile hook + screen with match history"
```

---

### Task 9: Home shell + navigation wiring + Play-tab refactor

**Files:**
- Create: `client/src/home/Home.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/lobby/LobbyScreen.tsx`

**Interfaces:**
- Consumes: `SessionApi`; `LobbyScreen`, `LeaderboardScreen`, `ProfileScreen`, `RatingBadge`; `supabase`; `ELO_DEFAULT_RATING` from `@poker/shared`.
- Produces: `default Home({ auth, onMatchFound }: { auth: SessionApi; onMatchFound: (roomId: string, format: string) => void })`. `LobbyScreen` becomes `default LobbyScreen({ auth, rating, onMatchFound }: { auth: SessionApi; rating: number; onMatchFound: (roomId: string, format: string) => void })`.

- [ ] **Step 1: Refactor `LobbyScreen` into the Play-tab body (rating provided by Home)**

Rewrite `client/src/lobby/LobbyScreen.tsx`:

```tsx
import { useEffect } from "react";
import { MATCH_FORMATS, DEFAULT_FORMAT } from "@poker/shared";
import { useState } from "react";
import type { SessionApi } from "../auth/useSession.js";
import { useLobbySocket } from "./useLobbySocket.js";

export default function LobbyScreen({
  auth,
  rating,
  onMatchFound,
}: {
  auth: SessionApi;
  rating: number;
  onMatchFound: (roomId: string, format: string) => void;
}) {
  const { state, enqueue, leave } = useLobbySocket(auth.getJwt);
  const [format, setFormat] = useState<string>(DEFAULT_FORMAT);

  useEffect(() => {
    if (state.status === "matched" && state.match) {
      onMatchFound(state.match.roomId, state.match.format);
    }
  }, [state.status, state.match, onMatchFound]);

  return (
    <div>
      {state.status !== "queued" ? (
        <>
          <label style={{ display: "block", margin: "12px 0" }}>
            Format:{" "}
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {Object.values(MATCH_FORMATS).map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </label>
          <button onClick={() => enqueue(rating, format)}
            style={{ padding: "10px 20px", background: "#2d7d46", color: "white", border: 0, borderRadius: 6 }}>
            Find Match
          </button>
        </>
      ) : (
        <div>
          <p>In queue — position {state.position} of {state.waiting}.</p>
          <p>Filling with bots in ~{state.etaSec}s if no humans join.</p>
          <button onClick={leave} style={{ padding: "8px 16px" }}>Cancel</button>
        </div>
      )}
      {state.error && <p style={{ color: "#ff6b6b" }}>{state.error}</p>}
    </div>
  );
}
```

> The header (title/sign-out) and the rating line move to `Home`; `rating` is now a prop used for `enqueue`.

- [ ] **Step 2: Write the `Home` shell**

```tsx
// client/src/home/Home.tsx
import { useEffect, useState } from "react";
import { ELO_DEFAULT_RATING } from "@poker/shared";
import { supabase } from "../lib/supabase.js";
import type { SessionApi } from "../auth/useSession.js";
import RatingBadge from "./RatingBadge.js";
import LobbyScreen from "../lobby/LobbyScreen.js";
import LeaderboardScreen from "../leaderboard/LeaderboardScreen.js";
import ProfileScreen from "../profile/ProfileScreen.js";

type Tab = "play" | "leaderboard" | "profile";
const TAB_LABEL: Record<Tab, string> = { play: "Play", leaderboard: "Leaderboard", profile: "Profile" };

export default function Home({
  auth,
  onMatchFound,
}: {
  auth: SessionApi;
  onMatchFound: (roomId: string, format: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("play");
  const [rating, setRating] = useState<number>(ELO_DEFAULT_RATING);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.userId) return;
    supabase
      .from("profiles")
      .select("rating")
      .eq("id", auth.userId)
      .single()
      .then(({ data }) => {
        if (data && typeof data.rating === "number") setRating(data.rating);
      });
  }, [auth.userId]);

  function openProfile(id: string) {
    setProfileId(id);
    setTab("profile");
  }

  return (
    <div style={{ maxWidth: 560, margin: "6vh auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>PokerElo</h1>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <RatingBadge rating={rating} />
          <button onClick={() => void auth.signOut()} style={{ background: "none", border: 0, color: "#7aa2f7" }}>
            Sign out
          </button>
        </div>
      </header>

      <nav style={{ display: "flex", gap: 4, margin: "16px 0", borderBottom: "1px solid #2a2f3a" }}>
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === "profile") setProfileId(null); }}
            style={{
              background: "none", border: 0, padding: "8px 12px",
              color: tab === t ? "#e6e6e6" : "#8b92a5",
              borderBottom: tab === t ? "2px solid #2d7d46" : "2px solid transparent",
            }}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>

      {tab === "play" && <LobbyScreen auth={auth} rating={rating} onMatchFound={onMatchFound} />}
      {tab === "leaderboard" && <LeaderboardScreen ownId={auth.userId} onOpenProfile={openProfile} />}
      {tab === "profile" && <ProfileScreen playerId={profileId ?? auth.userId} onBack={() => setTab("leaderboard")} />}
    </div>
  );
}
```

- [ ] **Step 3: Wire `App` to render `Home`**

In `client/src/App.tsx`, replace the `LobbyScreen` import and usage:

```tsx
import { useState } from "react";
import { useSession } from "./auth/useSession.js";
import AuthScreen from "./auth/AuthScreen.js";
import Home from "./home/Home.js";
import GameScreen from "./game/GameScreen.js";

export default function App() {
  const auth = useSession();
  const [match, setMatch] = useState<{ roomId: string; format: string } | null>(null);

  if (auth.loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!auth.session) return <AuthScreen auth={auth} />;

  if (match) {
    return (
      <GameScreen
        roomId={match.roomId}
        getJwt={auth.getJwt}
        ownId={auth.userId}
        onLeave={() => setMatch(null)}
      />
    );
  }

  return <Home auth={auth} onMatchFound={(roomId, format) => setMatch({ roomId, format })} />;
}
```

- [ ] **Step 4: Verify typecheck + build pass**

Run: `npm run typecheck && npm run build --workspace @poker/client`
Expected: both PASS (no unused-import or type errors; bundle builds).

- [ ] **Step 5: Commit**

```bash
git add client/src/home/Home.tsx client/src/App.tsx client/src/lobby/LobbyScreen.tsx
git commit -m "feat(client): Home shell with Play/Leaderboard/Profile tabs"
```

---

### Task 10: Consistent names in `MatchOver` + docs + full gate run

**Files:**
- Modify: `client/src/game/MatchOver.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `displayName` from `../data/displayName.js`.
- Produces: no new exports; `MatchOver` uses the shared `displayName` helper.

- [ ] **Step 1: Use `displayName` in `MatchOver`**

In `client/src/game/MatchOver.tsx`, add the import at the top:

```tsx
import { displayName } from "../data/displayName.js";
```

Replace the player cell expression:

```tsx
                <td>{displayName({ id })}{id === ownId ? " (you)" : ""}</td>
```

(Replaces the previous `{id.startsWith("bot-") ? ... : id.slice(0, 8)}` inline logic. `MatchOver` has only ids, so `displayName` yields `🤖 bot-x` for bots and `player_<8>` for humans — same shape as before, now centralized.)

- [ ] **Step 2: Update `CLAUDE.md`**

Add a `client/src` module map section (or extend the existing client notes) listing the new modules and update Status. Insert after the `party/src` module map:

```markdown
## `client/src` module map (read-side UI — Build Unit 5)

| File | Exports / Role |
|---|---|
| `data/displayName.ts` | `displayName` — player label (bot glyph / username / `player_<8>`) |
| `data/leaderboard.ts` | `ProfileRow`, `LeaderboardEntry`, `Leaderboard`, `buildLeaderboard` |
| `data/profile.ts` | `MatchResultRow`, `ProfileHeader`, `ProfileHistoryEntry`, `ProfileData`, `buildProfile` |
| `home/Home.tsx` | `Home` — tabbed shell (Play/Leaderboard/Profile) + rating badge header |
| `home/RatingBadge.tsx` | `RatingBadge` — rating + tier chip |
| `leaderboard/useLeaderboard.ts` | `useLeaderboard` — top-100 + own-rank fetch |
| `leaderboard/LeaderboardScreen.tsx` | `LeaderboardScreen` |
| `profile/useProfile.ts` | `useProfile` — profile row + joined match history fetch |
| `profile/ProfileScreen.tsx` | `ProfileScreen` |

**Conventions:** pure shaping cores live in `client/src/data/` (tested); hooks do Supabase I/O; components are thin. Usernames come from `profiles.username` (added in `20260625000001_usernames.sql`, seeded by the `handle_new_user` trigger from signup metadata).
```

Update the Status section's "Next unit" line to note Build Unit 5 (read-side UI) is complete.

- [ ] **Step 3: Run the full gate suite**

Run: `npm test && npm run typecheck && npm run lint && npm run build --workspace @poker/client`
Expected: all PASS. `npm test` shows the prior 218 tests + the new pure-core tests (displayName 3, leaderboard 5, profile 4 = 12 new). Hand-eval oracle + chip-conservation gates green.

- [ ] **Step 4: Commit**

```bash
git add client/src/game/MatchOver.tsx CLAUDE.md
git commit -m "feat(client): centralize player labels via displayName; docs for Unit 5"
```

---

## Self-Review

**Spec coverage:**
- §1 Usernames → Tasks 4 (migration), 5 (auth capture), 1 (displayName helper). ✓
- §2 Navigation (Home tabs, RatingBadge, openProfile) → Tasks 6, 9. ✓
- §3 Leaderboard (hook + buildLeaderboard + screen, top-100/min-1-game/own-tail) → Tasks 2, 7. ✓
- §4 Profile + history (hook + buildProfile + screen) → Tasks 3, 8. ✓
- Cross-cutting: no poker-numerics (uses `@poker/shared` throughout) ✓; tests on pure cores ✓; deferred-item-1 loading fix → Task 5 ✓; MatchOver uses helper → Task 10 ✓; docs → Task 10 ✓.

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N" — all code blocks are complete. The one `<...>`-style note (tier verification in Task 3) points at a real constant to confirm, not a placeholder.

**Type consistency:** `ProfileRow` defined once in `leaderboard.ts`, imported by `profile.ts`, `useLeaderboard.ts`, `useProfile.ts`. `MatchResultRow` defined in `profile.ts`, imported by `useProfile.ts`. `buildLeaderboard(rows, ownRow, ownPosition, ownId)` arg order identical in Task 2 def, Task 7 call. `buildProfile(profile, results)` identical in Task 3 def, Task 8 call. `displayName({ id, username? })` signature consistent across Tasks 1/2/3/10. `LobbyScreen` new `rating` prop (Task 9 step 1) matches the call site (Task 9 step 2). `signUp(email, password, username)` def (Task 5) matches call (Task 5 AuthScreen). All consistent.
