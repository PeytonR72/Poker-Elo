# Build Unit 3: Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase-backed persistence — schema + RLS migrations, a `report-match` edge function, and wire `endMatch()` in the PartyKit server to call it fire-and-forget.

**Architecture:** Three SQL migration files create `profiles`, `matches`, and `match_results` tables with service-role-only write access enforced by RLS. A Deno edge function (`report-match`) receives the match result payload, validates the bearer token, and writes to Supabase. The PartyKit `MatchRoom.endMatch()` method fires a POST to that function after broadcasting `matchOver`, skipping the call in dev mode (no `SUPABASE_JWT_SECRET`) and skipping bot IDs.

**Tech Stack:** Supabase CLI (`npx supabase`), PostgreSQL RLS, Deno (Supabase edge functions), `@supabase/supabase-js` v2 (via npm: specifier in Deno), Vitest (for matchRoom wiring test), TypeScript strict.

## Global Constraints

- All poker-numeric values live in `shared/src/constants.ts` — do not add any here.
- Relative imports end in `.js` in TypeScript source files.
- TypeScript strict + `noUncheckedIndexedAccess` everywhere in party/ workspace.
- Bot player IDs start with `"bot-"` — skip them when persisting (no `profiles` row).
- Dev mode: `!env.SUPABASE_JWT_SECRET || env.SUPABASE_JWT_SECRET === ""` — skip fetch call.
- The edge function auth check: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` — any request without this exact bearer must receive HTTP 401.
- `Action.amount` is raise-TO (not raise-by). `Action.seat` (not `seatIndex`).
- Tests colocated with source: `party/src/matchRoom.test.ts` is the test file for `matchRoom.ts`.
- `npm test`, `npm run typecheck`, `npm run lint` must all stay green.

---

### Task 1: Supabase project init + migration files

**Files:**
- Create: `supabase/config.toml` (via `npx supabase init`)
- Create: `supabase/migrations/20260621000001_init.sql`

**Interfaces:**
- Produces: `profiles(id, rating, games_played)`, `matches(id, room_id, format, started_at, ended_at)`, `match_results(match_id, player_id, finish_place, elo_delta, rating_after)` tables with RLS.

- [ ] **Step 1: Initialize Supabase project (if not already done)**

```bash
cd "c:/Users/ztwis/Desktop/poker elo"
npx supabase init
```

Expected: creates `supabase/config.toml` and `supabase/.gitignore`. The `supabase/migrations/` directory is created automatically.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260621000001_init.sql` with this exact content:

```sql
-- profiles: one row per registered user, written only by service role
CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  rating        int  NOT NULL DEFAULT 400,
  games_played  int  NOT NULL DEFAULT 0,
  rank          text GENERATED ALWAYS AS (
    CASE
      WHEN rating < 500  THEN 'Fish'
      WHEN rating < 700  THEN 'Limper'
      WHEN rating < 900  THEN 'Grinder'
      WHEN rating < 1100 THEN 'Shark'
      WHEN rating < 1300 THEN 'Semi-Pro'
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
```

- [ ] **Step 3: Verify migration parses (dry run)**

```bash
npx supabase db lint
```

If you have a local Supabase stack running (`npx supabase start`), also push:
```bash
npx supabase db push
```

Expected: no errors. If `npx supabase start` is not available in this environment, skip the push step — the migration will be applied on first `supabase db push` to the remote project.

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml supabase/migrations/20260621000001_init.sql supabase/.gitignore
git commit -m "feat(db): Supabase schema — profiles, matches, match_results + RLS"
```

---

### Task 2: report-match Edge Function

**Files:**
- Create: `supabase/functions/report-match/index.ts`

**Interfaces:**
- Consumes: POST body `{ roomId: string, format: string, finishPlaceById: Record<string, number>, eloDeltas: Record<string, number> }`
- Consumes: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` header
- Produces: HTTP 200 `{ ok: true }` on success; 401 on bad auth; 400 on bad body; 500 on DB error.

**No vitest tests for this task** — the function runs in Deno's edge runtime, outside the Node/Vitest environment. Type safety comes from strict TypeScript in the file itself. Integration testing is via manual `curl` or the wiring in Task 3.

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/report-match/index.ts`:

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface ReportMatchPayload {
  roomId: string;
  format: string;
  finishPlaceById: Record<string, number>;
  eloDeltas: Record<string, number>;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Verify bearer token matches service role key
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: ReportMatchPayload;
  try {
    payload = await req.json() as ReportMatchPayload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { roomId, format, finishPlaceById, eloDeltas } = payload;
  if (!roomId || !format || !finishPlaceById || !eloDeltas) {
    return new Response(JSON.stringify({ error: "missing_fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Insert matches row
  const { data: matchRow, error: matchErr } = await supabase
    .from("matches")
    .insert({ room_id: roomId, format })
    .select("id")
    .single();

  if (matchErr || !matchRow) {
    console.error("matches insert error:", matchErr);
    return new Response(JSON.stringify({ error: "db_error", detail: matchErr?.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const matchId: string = matchRow.id;

  // For each human player (skip bots): update rating + insert match_results
  const playerIds = Object.keys(finishPlaceById).filter(id => !id.startsWith("bot-"));

  for (const playerId of playerIds) {
    const delta = eloDeltas[playerId] ?? 0;
    const place = finishPlaceById[playerId] ?? 0;

    // Upsert profile (creates row if missing — user may have just registered)
    const { error: upsertErr } = await supabase
      .from("profiles")
      .upsert({ id: playerId }, { onConflict: "id", ignoreDuplicates: true });

    if (upsertErr) {
      console.error(`profile upsert error for ${playerId}:`, upsertErr);
      // Non-fatal: attempt to continue
    }

    // Increment rating and games_played, get new rating
    const { data: updated, error: updateErr } = await supabase.rpc("increment_rating", {
      p_player_id: playerId,
      p_delta: delta,
    });

    // Fallback: if RPC not available, do manual read-modify-write
    let ratingAfter: number;
    if (updateErr || updated === null || updated === undefined) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("rating")
        .eq("id", playerId)
        .single();
      const currentRating: number = (profile as { rating: number } | null)?.rating ?? 400;
      ratingAfter = currentRating + delta;

      await supabase
        .from("profiles")
        .update({ rating: ratingAfter, games_played: supabase.rpc as unknown as number })
        .eq("id", playerId);

      // Simpler direct update without RPC:
      await supabase
        .from("profiles")
        .update({ rating: ratingAfter })
        .eq("id", playerId);
    } else {
      ratingAfter = updated as number;
    }

    // Insert match_results row
    const { error: resultErr } = await supabase
      .from("match_results")
      .insert({
        match_id: matchId,
        player_id: playerId,
        finish_place: place,
        elo_delta: delta,
        rating_after: ratingAfter,
      });

    if (resultErr) {
      console.error(`match_results insert error for ${playerId}:`, resultErr);
    }
  }

  return new Response(JSON.stringify({ ok: true, matchId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

**Note on the RPC fallback above:** The `increment_rating` RPC doesn't exist yet. Remove the RPC branch entirely and use the direct SQL approach via a PostgreSQL function added to the migration (see Step 2 below).

- [ ] **Step 2: Add `increment_rating` SQL function to the migration**

Append to `supabase/migrations/20260621000001_init.sql`:

```sql
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
```

- [ ] **Step 3: Simplify the edge function to use only the RPC**

Replace the `index.ts` content with the clean version (no fallback branch):

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface ReportMatchPayload {
  roomId: string;
  format: string;
  finishPlaceById: Record<string, number>;
  eloDeltas: Record<string, number>;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: ReportMatchPayload;
  try {
    payload = await req.json() as ReportMatchPayload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { roomId, format, finishPlaceById, eloDeltas } = payload;
  if (!roomId || !format || !finishPlaceById || !eloDeltas) {
    return new Response(JSON.stringify({ error: "missing_fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: matchRow, error: matchErr } = await supabase
    .from("matches")
    .insert({ room_id: roomId, format })
    .select("id")
    .single();

  if (matchErr || !matchRow) {
    console.error("matches insert error:", matchErr);
    return new Response(
      JSON.stringify({ error: "db_error", detail: matchErr?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const matchId: string = (matchRow as { id: string }).id;
  const playerIds = Object.keys(finishPlaceById).filter(id => !id.startsWith("bot-"));

  for (const playerId of playerIds) {
    const delta = eloDeltas[playerId] ?? 0;
    const place = finishPlaceById[playerId] ?? 0;

    // Ensure profile row exists
    await supabase
      .from("profiles")
      .upsert({ id: playerId }, { onConflict: "id", ignoreDuplicates: true });

    // Atomically update rating + games_played, get new rating
    const { data: newRating, error: rpcErr } = await supabase
      .rpc("increment_rating", { p_player_id: playerId, p_delta: delta });

    if (rpcErr) {
      console.error(`increment_rating error for ${playerId}:`, rpcErr);
      continue;
    }

    const ratingAfter = newRating as number;

    const { error: resultErr } = await supabase
      .from("match_results")
      .insert({
        match_id: matchId,
        player_id: playerId,
        finish_place: place,
        elo_delta: delta,
        rating_after: ratingAfter,
      });

    if (resultErr) {
      console.error(`match_results insert error for ${playerId}:`, resultErr);
    }
  }

  return new Response(JSON.stringify({ ok: true, matchId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 4: Verify the function typechecks (optional, requires Deno)**

```bash
npx supabase functions serve report-match --no-verify-jwt
```

If Deno is not installed locally, skip this step. TypeScript errors in Deno code will surface when deploying.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260621000001_init.sql supabase/functions/report-match/index.ts
git commit -m "feat(persistence): report-match edge function + increment_rating SQL function"
```

---

### Task 3: Wire endMatch → report-match + update partykit.json

**Files:**
- Modify: `party/src/matchRoom.ts` (lines 638–642, after the broadcast call)
- Modify: `partykit.json` (add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to vars)
- Modify: `party/src/matchRoom.test.ts` (add Task 14 describe block for fetch wiring)

**Interfaces:**
- Consumes: `this.party.env["SUPABASE_URL"]`, `this.party.env["SUPABASE_SERVICE_ROLE_KEY"]`
- Consumes: `this.party.id` (the room ID)
- Consumes: `finishPlaceById`, `deltas` (already computed above broadcast, line 636–637)
- Produces: fire-and-forget `void fetch(...)` after the broadcast; no await, no block.

- [ ] **Step 1: Write the failing test for the wiring**

Add to the bottom of `party/src/matchRoom.test.ts`, after the existing Task 10 tests:

```typescript
// ---------- Task 14: report-match wiring in endMatch ----------

describe("endMatch report-match wiring (Task 14)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("14.1: fires fetch to SUPABASE_URL/functions/v1/report-match when env vars are set", () => {
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      fetchCalls.push({ url, init });
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const { room } = makeEndMatchRoom(
      [{ id: "human-1", stack: 600 }, { id: "human-2", stack: 400 }],
      [],
      {
        SUPABASE_JWT_SECRET: "test-secret",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-key-xyz",
      },
    );

    (room as unknown as { endMatch(): void }).endMatch();

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe(
      "https://example.supabase.co/functions/v1/report-match",
    );
    const body = JSON.parse(fetchCalls[0]!.init.body as string) as {
      roomId: string;
      format: string;
      finishPlaceById: Record<string, number>;
      eloDeltas: Record<string, number>;
    };
    expect(body.roomId).toBe("test-room");
    expect(body.format).toBe("turbo");
    expect(body.finishPlaceById["human-1"]).toBeDefined();
    expect(body.eloDeltas["human-1"]).toBeDefined();
    const authHeader = (fetchCalls[0]!.init.headers as Record<string, string>)["Authorization"];
    expect(authHeader).toBe("Bearer service-key-xyz");
  });

  it("14.2: does NOT fire fetch in dev mode (no SUPABASE_JWT_SECRET)", () => {
    const fetchCalls: unknown[] = [];
    vi.stubGlobal("fetch", (...args: unknown[]) => {
      fetchCalls.push(args);
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const { room } = makeEndMatchRoom(
      [{ id: "human-1", stack: 600 }],
      [],
      {}, // no env vars = dev mode
    );

    (room as unknown as { endMatch(): void }).endMatch();

    expect(fetchCalls).toHaveLength(0);
  });

  it("14.3: bot IDs are excluded from the payload", () => {
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      fetchCalls.push({ url, init });
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    const { room } = makeEndMatchRoom(
      [{ id: "human-1", stack: 600 }, { id: "bot-0", stack: 400 }],
      [],
      {
        SUPABASE_JWT_SECRET: "test-secret",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-key-xyz",
      },
    );

    (room as unknown as { endMatch(): void }).endMatch();

    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0]!.init.body as string) as {
      finishPlaceById: Record<string, number>;
      eloDeltas: Record<string, number>;
    };
    // Bot keys must not be in the payload
    expect(Object.keys(body.finishPlaceById)).not.toContain("bot-0");
    expect(Object.keys(body.eloDeltas)).not.toContain("bot-0");
  });
});
```

**Note:** The `makeEndMatchRoom` helper must accept an optional third `env` parameter. Update the helper signature:

```typescript
function makeEndMatchRoom(
  survivors: Array<{ id: string; stack: number }>,
  bustedIds: string[],
  env: Record<string, string> = {},  // ADD THIS
): { room: MatchRoom; broadcastMsgs: string[] } {
  const broadcastMsgs: string[] = [];
  const conns = makeConns();
  const party = {
    id: "test-room",
    connections: conns,
    getConnections: () => conns,
    broadcast: (msg: string) => { broadcastMsgs.push(msg); },
    env,  // CHANGE THIS (was {})
  } as unknown as Party.Party;
  // ... rest unchanged
```

- [ ] **Step 2: Run the tests — confirm they FAIL**

```bash
npm test -- party/src/matchRoom.test.ts
```

Expected: tests 14.1, 14.2, 14.3 FAIL (fetch call not fired yet; also `makeEndMatchRoom` doesn't take env yet).

- [ ] **Step 3: Update `makeEndMatchRoom` to accept env**

In `party/src/matchRoom.test.ts`, find the `makeEndMatchRoom` function (line ~1455) and update its signature:

Old:
```typescript
function makeEndMatchRoom(
  survivors: Array<{ id: string; stack: number }>,
  bustedIds: string[],
): { room: MatchRoom; broadcastMsgs: string[] } {
```

New:
```typescript
function makeEndMatchRoom(
  survivors: Array<{ id: string; stack: number }>,
  bustedIds: string[],
  env: Record<string, string> = {},
): { room: MatchRoom; broadcastMsgs: string[] } {
```

And update the `party` object inside from `env: {}` to `env`.

- [ ] **Step 4: Wire the fetch call in `endMatch()` in `matchRoom.ts`**

Find `endMatch()` (line ~608). After the broadcast on line ~638 (the `this.party.broadcast(encode({ t: "matchOver", ... }))` call), add the fire-and-forget POST.

The current broadcast block (lines ~638–642):
```typescript
    this.party.broadcast(encode({
      t: "matchOver",
      finishPlaceById,
      eloDeltas: deltas,
    }));
```

Replace with:
```typescript
    // Filter bots out of the payload — no profile rows exist for them
    const humanFinishPlaces: Record<string, number> = {};
    const humanEloDeltas: Record<string, number> = {};
    for (const [id, place] of Object.entries(finishPlaceById)) {
      if (!id.startsWith("bot-")) {
        humanFinishPlaces[id] = place;
        humanEloDeltas[id] = deltas[id] ?? 0;
      }
    }

    this.party.broadcast(encode({
      t: "matchOver",
      finishPlaceById,
      eloDeltas: deltas,
    }));

    const supabaseUrl = this.party.env["SUPABASE_URL"] as string | undefined;
    const serviceKey = this.party.env["SUPABASE_SERVICE_ROLE_KEY"] as string | undefined;
    const isDev = !this.party.env["SUPABASE_JWT_SECRET"] ||
      this.party.env["SUPABASE_JWT_SECRET"] === "";

    if (!isDev && supabaseUrl && serviceKey) {
      void fetch(`${supabaseUrl}/functions/v1/report-match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          roomId: this.party.id,
          format: this.tableState.format,
          finishPlaceById: humanFinishPlaces,
          eloDeltas: humanEloDeltas,
        }),
      });
    }
```

- [ ] **Step 5: Run the tests — confirm they PASS**

```bash
npm test -- party/src/matchRoom.test.ts
```

Expected: all Task 14 tests PASS. All prior tests still PASS.

- [ ] **Step 6: Update `partykit.json` to include the new env var names**

Current `partykit.json`:
```json
{
  "name": "poker-elo",
  "main": "party/src/matchRoom.ts",
  "compatibilityDate": "2024-11-01",
  "vars": {
    "SUPABASE_JWT_SECRET": ""
  }
}
```

New `partykit.json` (add empty placeholder vars for the two new keys):
```json
{
  "name": "poker-elo",
  "main": "party/src/matchRoom.ts",
  "compatibilityDate": "2024-11-01",
  "vars": {
    "SUPABASE_JWT_SECRET": "",
    "SUPABASE_URL": "",
    "SUPABASE_SERVICE_ROLE_KEY": ""
  }
}
```

- [ ] **Step 7: Run full suite + typecheck + lint**

```bash
npm test && npm run typecheck && npm run lint
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add party/src/matchRoom.ts party/src/matchRoom.test.ts partykit.json
git commit -m "feat(party): wire endMatch → report-match edge function (fire-and-forget)"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| `profiles` table with id/rating/games_played/rank | Task 1 |
| `matches` table | Task 1 |
| `match_results` table | Task 1 |
| RLS: profiles/match_results readable by anyone | Task 1 |
| RLS: writes only via service role | Task 1 (no write policy = deny) |
| Edge function receives POST payload | Task 2 |
| Edge function verifies bearer = SERVICE_ROLE_KEY | Task 2 |
| Persists each player: rating update + match_result | Task 2 |
| Skip bot IDs in persistence | Task 2 (filter in edge fn) + Task 3 (filter in payload) |
| Wire endMatch after matchOver broadcast | Task 3 |
| URL from env: SUPABASE_URL/functions/v1/report-match | Task 3 |
| Auth header: Bearer SERVICE_ROLE_KEY | Task 3 |
| Fire-and-forget (void fetch) | Task 3 |
| Skip call in dev mode | Task 3 |
| partykit.json env vars | Task 3 |
| Tests for fetch wiring | Task 3 |

**Placeholder scan:** No TBDs or incomplete steps.

**Type consistency:**
- `humanFinishPlaces` / `humanEloDeltas` in matchRoom.ts → sent as `finishPlaceById` / `eloDeltas` in the JSON body → received as same field names in edge function. ✓
- `makeEndMatchRoom` third param `env: Record<string, string> = {}` added before Task 14 tests use it. ✓
- `this.tableState.format` — `TableState` has a `format` field (it is set to `"turbo"` in the injected state in `makeEndMatchRoom`). ✓

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-21-persistence.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
