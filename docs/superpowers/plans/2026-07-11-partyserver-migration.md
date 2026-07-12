# PartyKit → partyserver/wrangler Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `party/` off the `partykit` CLI/platform onto Cloudflare's `partyserver` package deployed with `wrangler` to the user's own Cloudflare account, unblocking cloud deploy on the Workers **Free** plan (SQLite-backed Durable Objects) without the $5/mo Workers Paid upgrade that `partykit deploy` currently requires.

**Architecture:** `MatchRoom` and `Lobby` become `partyserver` `Server` subclasses (which extend Cloudflare's native `DurableObject`) instead of PartyKit `Party.Server` implementations. All internal business logic (hand engine calls, betting, ELO, matchmaking) is unchanged — only the outer shell (imports, base class, constructor, and the handful of `party.X` → `this.X` API renames) changes. Client `PartySocket` connections are unaffected: `routePartykitRequest`'s default URL convention (`/parties/:server/:name`, matching binding names kebab-cased) is identical to what the client already sends (`party: "main"` / `party: "lobby"`), so `useMatchSocket.ts`/`useLobbySocket.ts` need no code changes — only `VITE_PARTYKIT_HOST` gets repointed after deploy. Local dev and CI testing move from ad-hoc `Party.Party` mocks to Cloudflare's official `@cloudflare/vitest-pool-workers`, which runs tests against a real simulated Workers runtime (Miniflare) with real Durable Object bindings.

**Tech Stack:** `partyserver` (npm), `wrangler` (Cloudflare CLI), `@cloudflare/vitest-pool-workers`, Vitest 4.x (upgrade from 2.1), existing `@poker/shared` engine untouched.

## Global Constraints

- All poker-numeric values still come only from `shared/src/constants.ts` — this migration touches no game logic.
- Server-authoritative invariant is unchanged: only the deployed Durable Object mutates real state; clients still get `redactFor(...)` views.
- Relative imports in touched files still end in `.js`.
- `party/` currently has 92 tests in `matchRoom.test.ts`, 6 in `lobby.test.ts`, 7 in `auth.test.ts`, 7 in `matchmaker.test.ts` (112 total) — every one must still pass (rewritten against the new harness, not skipped) before this migration is considered done. Root `npm test` (234 tests total across the monorepo) must stay green throughout — `shared/` and `client/` tests are not expected to change and are the regression gate for the Vitest major-version bump.
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are already available in `.env.cloudflare` (git-ignored) — deploy/wrangler commands read them as env vars, never pasted into files tracked by git.
- Never run `wrangler` or `partykit` commands with a flag that sweeps the project root `.env` (e.g. `--with-vars`) — that file contains `DEV_TOKENS=true`, which must never reach production. Secrets go to Cloudflare exclusively via explicit `wrangler secret put <NAME>` (one at a time) or `--var NAME=value` (never `--with-vars`/`--with-env`).
- Every deploy to production must be followed by the smoke test: a `dev:<id>` token sent to the deployed room MUST receive `auth_failed`. If it doesn't, treat this as a P0 stop-the-line issue — do not continue.

---

## File Structure

| File | Responsibility |
|---|---|
| `party/src/env.ts` *(new)* | Typed `Env` interface for Durable Object bindings + secrets (`MAIN`, `LOBBY`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `DEV_TOKENS`) — replaces the untyped `party.env` record. |
| `party/src/matchRoom.ts` | Modified: `class MatchRoom extends Server<Env>` instead of `implements Party.Server`; constructor removed (inherited from `Server`); `this.party.X` → `this.X` renames only. Business-logic method bodies unchanged. |
| `party/src/lobby.ts` | Modified: same shell conversion; `party.context.parties["main"].get(roomId).fetch(...)` → `getServerByName(this.env.MAIN, roomId).then(stub => stub.fetch(...))`. |
| `party/src/worker.ts` *(new)* | The Worker `fetch` entrypoint: calls `routePartykitRequest(request, env)`, exports `MatchRoom`/`Lobby` as named Durable Object classes. Replaces `partykit.json`'s `main`/`parties` config. |
| `party/wrangler.jsonc` *(new)* | Durable Object bindings (`MAIN` → `MatchRoom`, `LOBBY` → `Lobby`), `new_sqlite_classes` migration, custom domain route, compatibility date. Replaces `partykit.json`. |
| `party/vitest.config.ts` *(new)* | Points `@cloudflare/vitest-pool-workers` at `party/wrangler.jsonc` — scopes the Workers test pool to the `party/` workspace only. |
| `party/src/matchRoom.test.ts` | Modified: mock-`Party.Party` harness replaced with real DO instances obtained via `env.MAIN`/helpers from `cloudflare:test`. Test *assertions* (the 92 `it(...)` bodies) are unchanged — only the setup helpers at the top of the file change. |
| `party/src/lobby.test.ts` | Modified: same harness swap; assertions unchanged. |
| `party/package.json` | `partykit` dependency removed; `partyserver`, `wrangler`, `@cloudflare/vitest-pool-workers` added; `dev`/`deploy` scripts now call `wrangler`. |
| `vitest.config.ts` (root) | Modified: becomes a `defineWorkspace`-style multi-project config — `shared/`+`client/` keep the plain Node pool, `party/` uses its own `vitest.config.ts` with the Workers pool. |
| `package.json` (root) | `vitest` devDependency bumped `^2.1.0` → `^4.1.0`. |
| `partykit.json` | Deleted. |
| `client/src/lib/env.ts` | No code change — `VITE_PARTYKIT_HOST` value changes at deploy time only (Vercel env var), not in source. |
| `docs/deploy-partykit-cloudflare.md` | Superseded — replaced by a new `docs/deploy-partyserver-cloudflare.md` runbook capturing the actual working steps once Task 6 succeeds. |

---

### Task 1: De-risk — deploy a throwaway partyserver Worker to prove Free-plan SQLite deploy actually works

Before investing in the full rewrite, prove the exact failure that blocked `partykit deploy` (`"In order to use Durable Objects with a free plan, you must create a namespace using a new_sqlite_classes migration"`) does not recur with `wrangler` + `partyserver`'s explicit migration control. This is thrown away after Task 6's real deploy supersedes it — its only job is to fail fast if there's some other account-level blocker (e.g. zone routing permissions) before we sink hours into the rewrite.

**Files:**
- Create (temporary, scratch dir): `C:\Users\ztwis\AppData\Local\Temp\claude\c--Users-ztwis-Desktop-poker-elo\29a8bbea-a97b-4229-a189-12153300c4a9\scratchpad\smoke\src\index.ts`
- Create (temporary): `...\scratchpad\smoke\wrangler.jsonc`
- Create (temporary): `...\scratchpad\smoke\package.json`

**Interfaces:** None — standalone throwaway project, not part of the monorepo.

- [ ] **Step 1: Scaffold the smoke-test project**

```json
// .../scratchpad/smoke/package.json
{
  "name": "smoke",
  "private": true,
  "type": "module",
  "dependencies": {
    "partyserver": "^0.0.66"
  },
  "devDependencies": {
    "wrangler": "^3.90.0"
  }
}
```

```jsonc
// .../scratchpad/smoke/wrangler.jsonc
{
  "name": "pokerelo-smoke",
  "main": "src/index.ts",
  "compatibility_date": "2024-11-01",
  "durable_objects": {
    "bindings": [
      { "name": "SMOKE", "class_name": "Smoke" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["Smoke"] }
  ]
}
```

```ts
// .../scratchpad/smoke/src/index.ts
import { Server, routePartykitRequest } from "partyserver";

export class Smoke extends Server {
  onConnect() {
    this.broadcast("hello from smoke");
  }
}

export default {
  async fetch(request: Request, env: Record<string, unknown>) {
    return (await routePartykitRequest(request, env)) ?? new Response("not found", { status: 404 });
  },
};
```

- [ ] **Step 2: Install and deploy**

Run (from `.../scratchpad/smoke`, with `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` loaded from `.env.cloudflare` per the loading pattern already established):
```
npm install
npx wrangler deploy
```
Expected: deploy succeeds with no `new_sqlite_classes` error, prints a `*.workers.dev` URL.

- [ ] **Step 3: Verify and tear down**

Confirm the deploy log shows no error. Then run `npx wrangler delete pokerelo-smoke` to remove the throwaway Worker from the account (avoid clutter / any Free-plan Worker-count limits).

- [ ] **Checkpoint:** If Step 2 fails with anything other than the already-solved SQLite error (e.g. a permissions/zone error), STOP — do not proceed to Task 2. Report the new failure; it may require a token permission fix (see the missing "Zone DNS Edit" permission noted earlier) before the real migration is worth starting.

---

### Task 2: Test infrastructure — add `@cloudflare/vitest-pool-workers`, scoped to `party/` only

**Files:**
- Modify: `package.json:16` (root) — bump `vitest` devDependency.
- Create: `vitest.workspace.ts` (root)
- Create: `party/vitest.config.ts`
- Create: `party/wrangler.jsonc` (scaffold only — no real bindings yet, just enough for the test pool to boot)
- Modify: `party/package.json`

**Interfaces:**
- Produces: a working `npm test` at the root that still runs all 234 existing tests (`shared/`, `client/`, `party/`) green, with `party/` now running under the Workers pool instead of the plain Node pool.

- [ ] **Step 1: Bump root Vitest and add the workspace pool split**

Modify `package.json` (root):
```json
"vitest": "^4.1.0"
```

Create `vitest.workspace.ts` (root, new file — Vitest's multi-project mechanism supersedes a single flat `vitest.config.ts` when workspaces need different pools):
```ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "node",
      include: ["shared/src/**/*.test.ts", "client/src/**/*.test.ts"],
      environment: "node",
    },
  },
  "party/vitest.config.ts",
]);
```

Modify `vitest.config.ts` (root) — narrow it so it no longer double-matches `party/`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["shared/src/**/*.test.ts", "client/src/**/*.test.ts"],
    environment: "node",
  },
});
```
(Kept for editor/IDE tooling that reads a flat config; `vitest.workspace.ts` is authoritative for `vitest run`.)

- [ ] **Step 2: Scaffold `party/wrangler.jsonc` (test-only shape for now)**

```jsonc
// party/wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "pokerelo-party",
  "main": "src/worker.ts",
  "compatibility_date": "2024-11-01",
  "durable_objects": {
    "bindings": [
      { "name": "MAIN", "class_name": "MatchRoom" },
      { "name": "LOBBY", "class_name": "Lobby" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["MatchRoom", "Lobby"] }
  ]
}
```
This references `src/worker.ts`, which doesn't exist yet (created in Task 4) — that's fine, `wrangler.jsonc` is only read for its config shape by the test pool at this step, not executed.

- [ ] **Step 3: Add `party/vitest.config.ts`**

```ts
// party/vitest.config.ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    name: "party",
    include: ["src/**/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
```

- [ ] **Step 4: Install and verify the harness boots (before touching any party/ source)**

Modify `party/package.json`:
```json
"devDependencies": {
  "typescript": "^5.4.0",
  "vitest": "^4.1.0",
  "@cloudflare/vitest-pool-workers": "latest",
  "wrangler": "^3.90.0"
}
```
Run (repo root): `npm install`

Expected: install succeeds. The existing `party/src/*.test.ts` files still import `partykit/server` types and construct mock `Party.Party` objects — they are NOT yet compatible with the Workers pool's stricter runtime (no arbitrary object literals standing in for `DurableObjectState`). **Do not fix that here** — this step only proves the pool loads. Run:
```
npm test -- --project party
```
Expected: FAILS (existing tests error out because `partykit/server` types/mocks don't resolve inside the Workers runtime sandbox, or `wrangler.jsonc`'s `main: "src/worker.ts"` doesn't exist yet). Confirm the failure is about missing `worker.ts` / incompatible mocks, NOT an installation/config error — that distinction is the checkpoint for this task.

- [ ] **Step 5: Verify the rest of the monorepo is unaffected**

Run: `npm test -- --project node`
Expected: all pre-existing `shared/` and `client/` tests (the ones not in `party/`) still pass — 234 minus the `party/` count. This is the regression gate proving the Vitest 2→4 bump didn't break anything outside `party/`.

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.config.ts vitest.workspace.ts party/package.json party/vitest.config.ts party/wrangler.jsonc
git commit -m "chore(party): scaffold vitest-pool-workers test harness for partyserver migration"
```

---

### Task 3: Migrate `Lobby` (smaller, self-contained — do this before `MatchRoom`)

**Files:**
- Create: `party/src/env.ts`
- Modify: `party/src/lobby.ts` (full file — shell conversion, business logic identical)
- Modify: `party/src/lobby.test.ts` (harness only — all 6 `it(...)` bodies unchanged)

**Interfaces:**
- Consumes: `getServerByName` from `"partyserver"`; `Env` from `./env.js`.
- Produces: `export default class Lobby extends Server<Env>` — same public method names (`onConnect`, `onClose`, `onMessage`, `runMatchTick`, `waiterCount` getter) as before, so `matchRoom`/other callers (none currently) are unaffected.

- [ ] **Step 1: Create the shared `Env` type**

```ts
// party/src/env.ts
import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import type MatchRoom from "./matchRoom.js";
import type Lobby from "./lobby.js";

export interface Env {
  MAIN: DurableObjectNamespace<MatchRoom>;
  LOBBY: DurableObjectNamespace<Lobby>;
  SUPABASE_URL?: string;
  SUPABASE_JWT_SECRET?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  DEV_TOKENS?: string;
}
```
(Add `@cloudflare/workers-types` as a `party/package.json` devDependency alongside the others from Task 2, Step 4 if not already pulled in transitively by `wrangler`.)

- [ ] **Step 2: Convert `lobby.ts`'s shell**

Modify `party/src/lobby.ts` — replace lines 1–23 (imports through class declaration + constructor) with:
```ts
import { Server, getServerByName } from "partyserver";
import type { Connection } from "partyserver";
import {
  encode,
  decode,
  makeRoomCode,
  QUEUE_MATCH_INTERVAL_MS,
  MATCH_CODE_LENGTH,
  MATCH_FORMATS,
} from "@poker/shared";
import { verifyJwt, parseDevToken } from "./auth.js";
import { formMatches, botFillEtaSec } from "./matchmaker.js";
import type { Waiter } from "./matchmaker.js";
import type { Env } from "./env.js";

type ConnState = { playerId: string; authed: boolean };

export default class Lobby extends Server<Env> {
  static options = { hibernate: false };

  private conns = new Map<string, ConnState>();
  private waiters = new Map<string, Waiter & { connId: string }>();
  private ticker: ReturnType<typeof setInterval> | null = null;
```
(No `constructor` — `Server<Env>`'s inherited constructor already sets `this.ctx`/`this.env`/`this.name`; remove the old `constructor(readonly party: Party.Party) {}` entirely.)

Then, throughout the rest of the file (existing lines ~25–196), apply these mechanical renames — no other logic changes:
- `conn: Party.Connection` → `conn: Connection` (in `onConnect`, `onClose` signatures)
- `sender: Party.Connection` → `sender: Connection` (in `onMessage`)
- `this.party.env["SUPABASE_JWT_SECRET"]` → `this.env.SUPABASE_JWT_SECRET`
- `this.party.env["DEV_TOKENS"]` → `this.env.DEV_TOKENS`
- `this.party.context.parties["main"]!.get(roomId).fetch({...})` → replace the whole `try { res = await ... } catch { continue; }` block in `runMatchTick()` with:
  ```ts
  try {
    const stub = await getServerByName(this.env.MAIN, roomId);
    res = await stub.fetch("https://internal/provision", {
      method: "POST",
      body: JSON.stringify({ format: match.format, humanIds: match.humanIds }),
    });
  } catch {
    continue;
  }
  ```
  (`getServerByName` needs a full `Request`/URL, not a bare init object — the path/host are irrelevant since `MatchRoom.onRequest` doesn't branch on URL, only method, but a syntactically valid URL is required.)
- `this.party.getConnections()` → `this.getConnections()` (in `sendTo`)
- Delete the old `readonly party: Party.Party` constructor parameter reference wherever it appears (already handled in Step 2's replacement above).

- [ ] **Step 3: Rewrite the test harness in `lobby.test.ts`**

Replace lines 1–41 (imports through `makeLobby`) with:
```ts
import { describe, it, expect } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import { encode } from "@poker/shared";
import type { Env } from "./env.js";

interface FakeConn {
  id: string;
  sent: string[];
  send(m: string): void;
  close(): void;
}
function makeConn(id: string): FakeConn {
  return { id, sent: [], send(m) { this.sent.push(m); }, close() {} };
}

/** Runs `fn` with a live Lobby DO instance bound to a fresh id, env overridden per-test. */
async function withLobby<T>(
  envOverrides: Partial<Env>,
  fn: (lobby: import("./lobby.js").default, conns: Map<string, FakeConn>) => Promise<T>,
): Promise<T> {
  const id = env.LOBBY.idFromName("test-lobby-" + Math.random());
  const stub = env.LOBBY.get(id);
  const conns = new Map<string, FakeConn>();
  return runInDurableObject(stub, async (instance) => {
    Object.assign(instance.env, envOverrides);
    return fn(instance, conns);
  });
}

async function connect(
  lobby: import("./lobby.js").default,
  conns: Map<string, FakeConn>,
  id: string,
): Promise<FakeConn> {
  const conn = makeConn(id);
  conns.set(id, conn);
  lobby.onConnect(conn as unknown as import("partyserver").Connection);
  await lobby.onMessage(
    encode({ t: "hello", jwt: `dev:${id}` }),
    conn as unknown as import("partyserver").Connection,
  );
  return conn;
}
```

Then update each of the 6 `it(...)` bodies to call `withLobby({ DEV_TOKENS: "true" }, async (lobby, conns) => { ...existing body... })` instead of `makeLobby([])`. The assertions inside each test (`expect(lobby.waiterCount).toBe(1)`, etc.) are copied verbatim from the current file — only the outer setup call changes.

For the one test that currently overrides `context.parties.main.get` to simulate provisioning (fetch success/throw), instead pre-register a `MatchRoom`-shaped stub is unnecessary — `getServerByName(this.env.MAIN, roomId)` against the real `env.MAIN` binding in the test runtime will route to a real (empty, unprovisioned) `MatchRoom` DO. Its `onRequest` (ported in Task 4) already returns `new Response("OK")` for a well-formed POST body, and a `Response` with a 400 for a malformed one — so the "provisioning failed" test case (simulating a thrown fetch) should instead assert against a **malformed roomId that can't route** or be adjusted to check the `!res.ok` branch by POSTing an intentionally bad body (`{}`) to produce `bad_roster` (400), which already exercises the "leave players queued on non-ok response" branch identically to the old throw-based test. Flag this test as needing a rewritten scenario, not a mechanical port — note it explicitly in the task's self-review.

- [ ] **Step 4: Run and verify**

```
npm test -- --project party -t "Lobby party"
```
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add party/src/env.ts party/src/lobby.ts party/src/lobby.test.ts party/package.json
git commit -m "refactor(party): migrate Lobby from partykit to partyserver"
```

---

### Task 4: Migrate `MatchRoom`

**Files:**
- Modify: `party/src/matchRoom.ts` (full file — shell conversion only; business-logic method bodies at lines ~401–800 are copied verbatim)
- Modify: `party/src/matchRoom.test.ts` (harness only — all 92 `it(...)` bodies unchanged)

**Interfaces:**
- Consumes: `Env` from `./env.js` (Task 3, Step 1).
- Produces: `export default class MatchRoom extends Server<Env>` with the same public surface used by tests (`playerCount`, `hasDisconnectTimer`, `getPlayer`, `currentTableState`, `currentBustOrder`, `currentHandNumber`, `currentSeatRngs`, `isProvisioned`, `expectedHumans`) and by `Lobby` (`onRequest` accepting `{ format, humanIds }` JSON, returning `200`/`400`).

- [ ] **Step 1: Convert the shell (lines 1–104 of the current file)**

Replace with:
```ts
import { Server } from "partyserver";
import type { Connection } from "partyserver";
import {
  encode,
  decode,
  TABLE_SIZE,
  shuffledDeck,
  createHand,
  createSeat,
  cloneState,
  redactFor,
  STARTING_STACK,
  DEFAULT_FORMAT,
  MATCH_FORMATS,
  blindLevelAt,
  legalActions,
  applyAction,
  TIMEBANK_INITIAL_MS,
  TIMEBANK_REPLENISH_MS,
  DISCONNECT_GRACE_MS,
  pairwiseElo,
  ELO_DEFAULT_RATING,
  ELO_K_FACTOR,
  BOT_DECISION_DELAY_MIN_MS,
  BOT_DECISION_DELAY_MAX_MS,
  mulberry32,
  deriveSeed,
} from "@poker/shared";
import type { TableState, PublicView, Action, ActionMask, Seat, EloPlayer } from "@poker/shared";
import { verifyJwt, parseDevToken } from "./auth.js";
import { TurnTimer } from "./timers.js";
import { decideBotAction, botThinkDelayMs } from "./botRunner.js";
import type { Env } from "./env.js";

const INTER_HAND_PAUSE_MS = 3_000;

function nextNonBustedSeat(seats: (Seat | null)[], currentButton: number): number {
  // ... unchanged, copy lines 37-45 verbatim from the current file ...
}

type ConnState = {
  playerId: string;
  seatIndex: number | null;
  authed: boolean;
  timebankMs: number;
};

function isLegal(action: Action, mask: ActionMask): boolean {
  // ... unchanged, copy lines 55-72 verbatim ...
}

function csprngSeed(): number {
  // ... unchanged, copy lines 75-79 verbatim ...
}

export default class MatchRoom extends Server<Env> {
  static options = { hibernate: false };

  private players = new Map<string, ConnState>();
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private savedTimebankMs = new Map<string, number>();

  private tableState: TableState | null = null;
  private matchStartMs: number = 0;
  private bustOrder: string[] = [];
  private handNumber: number = 0;

  private turnTimer = new TurnTimer();
  private timebankUsedThisTurn = false;
  private seatRngs: Array<(() => number) | null> = [];
  private botRngSeed = 0;

  private provisioned = false;
  private provisionedFormat: string | null = null;
  private expectedHumanIds: Set<string> = new Set();
  private connectGraceTimer: ReturnType<typeof setTimeout> | null = null;

  // No constructor — Server<Env> supplies this.ctx / this.env / this.name.
```
(`readonly party: Party.Party` is gone; every remaining `Party.Request` → `Request`, `Party.Connection` → `Connection`.)

- [ ] **Step 2: Apply mechanical renames through the rest of the file (current lines 106–800)**

Copy the body of every method (`onRequest`, `onConnect`, `onClose`, `onError`, `onMessage`, `startMatch`, `broadcastSnapshots`, `sendDealPrivate`, `sendYourTurn`, `executeBotAction`, `onTurnExpired`, `onDisconnectExpired`, `onHandComplete`, `isMatchOver`, `startNextHand`, `endMatch`, and all the test-exposed getters) verbatim, applying only these substitutions wherever they occur:

| Old | New |
|---|---|
| `req: Party.Request` | `req: Request` |
| `conn: Party.Connection` | `conn: Connection` |
| `sender: Party.Connection` | `sender: Connection` |
| `this.party.env["SUPABASE_JWT_SECRET"]` | `this.env.SUPABASE_JWT_SECRET` |
| `this.party.env["DEV_TOKENS"]` | `this.env.DEV_TOKENS` |
| `this.party.env["SUPABASE_URL"]` | `this.env.SUPABASE_URL` |
| `this.party.env["SUPABASE_SERVICE_ROLE_KEY"]` | `this.env.SUPABASE_SERVICE_ROLE_KEY` |
| `this.party.broadcast(...)` | `this.broadcast(...)` |
| `this.party.getConnections()` | `this.getConnections()` |
| `this.party.id` | `this.name` |

Every other line — the poker engine calls, the ELO math, the timer/bot logic, the reconnect handling — is copied unchanged. Do not restructure control flow while doing this pass; it is a pure mechanical rename to keep the diff reviewable and the risk of introducing a logic bug near zero.

- [ ] **Step 3: Rewrite the test harness in `matchRoom.test.ts`**

Replace lines 1–76 (imports through `makeJwt`) with:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import { SignJWT } from "jose";
import { encode, TABLE_SIZE, STARTING_STACK, legalActions, MATCH_FORMATS, DEFAULT_FORMAT, blindLevelAt, BOT_DECISION_DELAY_MIN_MS, BOT_DECISION_DELAY_MAX_MS } from "@poker/shared";
import { csprngSeed, nextNonBustedSeat } from "./matchRoom.js";
import type MatchRoom from "./matchRoom.js";
import { botThinkDelayMs } from "./botRunner.js";
import { TurnTimer } from "./timers.js";
import type { Env } from "./env.js";
import type { Connection } from "partyserver";

function mockConn(id: string): Connection & { _msgs: string[]; _closed: boolean } {
  const msgs: string[] = [];
  return {
    id,
    _msgs: msgs,
    _closed: false,
    send(msg: string) { msgs.push(msg); },
    close() { (this as { _closed: boolean })._closed = true; },
  } as unknown as Connection & { _msgs: string[]; _closed: boolean };
}

/** Runs `fn` against a live MatchRoom DO, with env overridden per-test. */
async function withRoom<T>(
  envOverrides: Partial<Env>,
  fn: (room: MatchRoom) => T | Promise<T>,
): Promise<T> {
  const id = env.MAIN.idFromName("test-room-" + Math.random());
  const stub = env.MAIN.get(id);
  return runInDurableObject(stub, async (instance) => {
    Object.assign(instance.env, envOverrides);
    return fn(instance);
  });
}

async function makeJwt(sub: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .sign(key);
}
```

Then update every `describe`/`it` block: replace `const room = new MatchRoom(mockParty(...))` (and its variants with custom env/conns) with `await withRoom({...envOverrides}, async (room) => { ...existing assertions... })`. The `mockParty`/`MockConnectionList`/`makeConns` helpers are deleted entirely — `room.getConnections()` now comes from the real DO runtime's hibernatable connection registry, so tests that previously manually tracked a `MockConnectionList` instead call `room.onConnect(mockConn(...))` and let the DO track it internally (already how the majority of the 92 tests work per the excerpt read in Step 3 of investigation — they call `room.onConnect(conn)` directly, not through the mock party's connection list).

This is the largest mechanical step in the whole migration (92 call sites). Do it in one pass with a careful find-and-replace, then rely on Step 4's full run to catch any missed spot — TypeScript will fail to compile on any remaining `mockParty`/`Party.` reference, which is the fast feedback loop here (not each test individually).

- [ ] **Step 4: Run and verify**

```
npm test -- --project party
```
Expected: all 92 `matchRoom.test.ts` tests + 6 `lobby.test.ts` tests + 7 `auth.test.ts` + 7 `matchmaker.test.ts` pass (112 total in `party/`).

- [ ] **Step 5: Full regression run**

```
npm test
```
Expected: 234 tests pass (same count as before this migration started — `auth.test.ts`/`matchmaker.test.ts` are pure functions with no PartyKit dependency and should need zero changes, confirming they weren't accidentally broken by the workspace-pool split).

- [ ] **Step 6: Commit**

```bash
git add party/src/matchRoom.ts party/src/matchRoom.test.ts
git commit -m "refactor(party): migrate MatchRoom from partykit to partyserver"
```

---

### Task 5: Worker entrypoint, wrangler config, secrets, and cleanup

**Files:**
- Create: `party/src/worker.ts`
- Modify: `party/wrangler.jsonc` (fill in the custom domain route; the bindings/migrations from Task 2 Step 2 stay as-is)
- Modify: `party/package.json` (remove `partykit`, finalize scripts)
- Delete: `partykit.json`

**Interfaces:**
- Produces: the actual deployable Worker (`fetch` handler + exported DO classes) that Task 6 deploys.

- [ ] **Step 1: Write the Worker entrypoint**

```ts
// party/src/worker.ts
import { routePartykitRequest } from "partyserver";
import MatchRoom from "./matchRoom.js";
import Lobby from "./lobby.js";
import type { Env } from "./env.js";

export { MatchRoom, Lobby };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await routePartykitRequest(request, env);
    return response ?? new Response("Not found", { status: 404 });
  },
};
```

- [ ] **Step 2: Finalize `party/wrangler.jsonc` with the real domain route**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "pokerelo-party",
  "main": "src/worker.ts",
  "compatibility_date": "2024-11-01",
  "routes": [
    { "pattern": "party.pokerelo.us", "custom_domain": true }
  ],
  "durable_objects": {
    "bindings": [
      { "name": "MAIN", "class_name": "MatchRoom" },
      { "name": "LOBBY", "class_name": "Lobby" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["MatchRoom", "Lobby"] }
  ]
}
```

- [ ] **Step 3: Update `party/package.json` — drop `partykit`, add dev/deploy scripts**

```json
{
  "name": "@poker/party",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "@poker/shared": "*",
    "jose": "^5.0.0",
    "partyserver": "^0.0.66"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^4.1.0",
    "@cloudflare/vitest-pool-workers": "latest",
    "@cloudflare/workers-types": "^4.0.0",
    "wrangler": "^3.90.0"
  }
}
```
Run: `npm install` (removes the now-unused `partykit` package from `node_modules`/lockfile).

- [ ] **Step 4: Delete the old config**

```bash
git rm partykit.json
```

- [ ] **Step 5: Typecheck and full test run**

```
npm run typecheck
npm test
```
Expected: both green — this is the checkpoint proving nothing outside `party/` referenced `partykit.json` or the old `Party.*` types (grep the repo for `partykit/server` and `partykit.json` to confirm zero remaining references before moving on).

- [ ] **Step 6: Commit**

```bash
git add party/src/worker.ts party/wrangler.jsonc party/package.json package-lock.json
git commit -m "chore(party): replace partykit.json with wrangler.jsonc, drop partykit dependency"
```

---

### Task 6: Set secrets, deploy for real, repoint the client, run the production smoke test

**Files:**
- No file changes in this task — operational/deploy steps plus one Vercel env var update (done via Vercel dashboard/CLI, not a repo file).
- Create: `docs/deploy-partyserver-cloudflare.md` (new runbook, supersedes `docs/deploy-partykit-cloudflare.md`)

- [ ] **Step 1: Set the three Supabase secrets on the deployed Worker**

From `party/`, with `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` loaded from `.env.cloudflare` (same loading pattern as before — never printed):
```
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_JWT_SECRET
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```
Each prompts interactively for the value — paste when prompted, don't pass via `--var` (that goes in cleartext into `wrangler.jsonc`/CLI history for anything not marked secret). Do **not** set `DEV_TOKENS` in production — its absence is what makes `dev:` tokens rejected (`Env.DEV_TOKENS` is `undefined`, and both `lobby.ts`/`matchRoom.ts`'s auth checks require the literal string `"true"`).

- [ ] **Step 2: Deploy**

```
npx wrangler deploy
```
Expected: succeeds, prints the `party.pokerelo.us` route as active (confirms Task 1's de-risking was representative and the DNS-edit permission gap flagged earlier didn't block this — if it does block here, add the Zone DNS Edit permission to the Cloudflare API token first and retry).

- [ ] **Step 3: Production smoke test — the non-negotiable one**

Using the same throwaway WebSocket test pattern used earlier in this session (`ws://` connect, send `hello` with a `dev:<id>` token) but pointed at `wss://party.pokerelo.us/parties/lobby/global`:
```js
const ws = new WebSocket("wss://party.pokerelo.us/parties/lobby/global");
ws.onopen = () => ws.send(JSON.stringify({ t: "hello", jwt: "dev:should-be-rejected" }));
ws.onmessage = (e) => { console.log(e.data); process.exit(0); };
```
Expected: the response is `{"t":"error","message":"auth_failed"}` and the socket closes. **If a `dev:` token is ever accepted here, stop immediately** — `DEV_TOKENS` leaked to production and anyone can impersonate any user.

- [ ] **Step 4: Repoint the client**

Update `VITE_PARTYKIT_HOST` in the Vercel project (`peytonr7272-gmailcoms-projects/client`) to `party.pokerelo.us`, then redeploy the client (`vercel deploy --prod` or via the Vercel dashboard, per the user's existing deploy process).

- [ ] **Step 5: End-to-end verification with a real (signed, JWT) account**

Sign in on the production client with a real account, click Find Match, confirm a bot-filled match starts and a hand plays out — mirrors the local verification already done in this session, now against the cloud deployment.

- [ ] **Step 6: Write the new runbook and retire the old one**

Create `docs/deploy-partyserver-cloudflare.md` documenting the actual working sequence (Steps 1–5 above, plus the account id / domain / token-permission gotchas hit during this migration). Then:
```bash
git rm docs/deploy-partykit-cloudflare.md
git add docs/deploy-partyserver-cloudflare.md
```

- [ ] **Step 7: Update CLAUDE.md's Deployment section**

Modify `CLAUDE.md`'s `## Deployment` section: replace the "PartyKit: NOT deployed to cloud..." line with the new `party.pokerelo.us` cloud-prem status, and update `## Status` to record this as a completed Build Unit.

- [ ] **Step 8: Commit**

```bash
git add docs/deploy-partyserver-cloudflare.md CLAUDE.md
git commit -m "docs: PartyKit is live on party.pokerelo.us via partyserver/wrangler cloud-prem"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 de-risks the Free-plan SQLite blocker before rewriting anything (the whole reason for this migration). Tasks 2–4 port the codebase and its tests. Task 5 replaces the platform config. Task 6 deploys, secures (`DEV_TOKENS` smoke test), and repoints the client. All six original requirements from the brief are covered.
- **Known soft spot flagged inline:** Task 3 Step 3 calls out that one `lobby.test.ts` case (the "provisioning failed" throw-based test) cannot be mechanically ported as-is and needs a rewritten scenario (bad-body 400 instead of a thrown fetch) — this is real judgment a plan can't fully script in advance; the assigned engineer should treat it as a mini design decision, not a blind copy.
- **Type consistency:** `Env` (Task 3 Step 1) is referenced identically across `lobby.ts`, `matchRoom.ts`, `worker.ts`, and both test files — same field names (`MAIN`, `LOBBY`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `DEV_TOKENS`) throughout.
- **Risk called out, not hidden:** the Vitest 2→4 major-version bump (Task 2) is monorepo-wide even though only `party/` needs the new pool — Task 2 Step 5's `--project node` run is the explicit regression gate for that risk, and Task 4 Step 5's full 234-test run repeats it after the big rewrite lands.
