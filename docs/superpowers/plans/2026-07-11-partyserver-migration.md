# PartyKit → partyserver/wrangler Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `party/` off the `partykit` CLI/platform onto Cloudflare's `partyserver` package deployed with `wrangler` to the user's own Cloudflare account, unblocking cloud deploy on the Workers **Free** plan (SQLite-backed Durable Objects) without the $5/mo Workers Paid upgrade that `partykit deploy` currently requires.

**Architecture:** `MatchRoom` and `Lobby` become `partyserver` `Server` subclasses (which extend Cloudflare's native `DurableObject`) instead of PartyKit `Party.Server` implementations. All internal business logic (hand engine calls, betting, ELO, matchmaking) is unchanged — only the outer shell (imports, base class, constructor, and the handful of `party.X` → `this.X` API renames) changes. Client `PartySocket` connections are unaffected: `routePartykitRequest`'s default URL convention (`/parties/:server/:name`, matching binding names kebab-cased) is identical to what the client already sends (`party: "main"` / `party: "lobby"`), so `useMatchSocket.ts`/`useLobbySocket.ts` need no code changes — only `VITE_PARTYKIT_HOST` gets repointed after deploy. Automated unit testing of the ported code is not possible in this environment (see Revision Note 2 below) — verification instead happens via TypeScript compilation, code review against the original file, and scripted integration checks against a real `wrangler dev` instance (a real local Workers runtime, proven working in Task 1).

**Tech Stack:** `partyserver` (npm), `wrangler` (Cloudflare CLI), existing `@poker/shared` engine untouched. No test-runtime changes — Vitest stays exactly as it was before this migration.

**Revision note 1 (2026-07-12):** the original plan called for `@cloudflare/vitest-pool-workers` (Cloudflare's official Workers-runtime test pool) plus a Vitest 2→4 upgrade, to test `MatchRoom`/`Lobby` against real simulated Durable Objects. Abandoned after a verified, unfixable internal crash (`TypeError: this.getMockerRegistry(...).getById is not a function`, thrown before any test file loads) across four version pinnings of `vitest`/`@cloudflare/vitest-pool-workers`, including a release-date-matched pairing (`vitest@4.1.0` + `pool-workers@0.13.0`, released one day apart) — ruling out a simple version mismatch. Also ruled out Vitest 4's `test.projects` multi-project structure as the cause (identical crash running `party/`'s config fully standalone). This is a real, current tooling incompatibility in this environment, plausibly Windows/Miniflare-specific.

**Revision note 2 (2026-07-12) — supersedes Revision Note 1's fallback:** the planned fallback ("keep testing with plain mocks, just retyped") turned out to be impossible, not just lower-fidelity: `partyserver`'s `Server` class extends Cloudflare's `DurableObject`, imported from the `cloudflare:workers` built-in — a module that only resolves inside an actual Workers runtime. **Any value-import of `partyserver` crashes immediately under plain Node** (confirmed directly: `import { Server } from "partyserver"` under plain `node --input-type=module` throws `ERR_UNSUPPORTED_ESM_URL_SCHEME` on `cloudflare:workers`). This means the instant `matchRoom.ts`/`lobby.ts` import `partyserver`, the existing `matchRoom.test.ts` (92 tests)/`lobby.test.ts` (6 tests) become impossible to run at all under plain Vitest — not adaptable, not portable, structurally blocked. **User-confirmed decision:** delete these two test files as part of the port (Tasks 3/4 below), accepting the loss of their fine-grained coverage. Replace with scripted integration verification against `wrangler dev` (real local Workers runtime, proven working since Task 1's smoke deploy succeeded) — covering the same key behaviors at a coarser, end-to-end grain (a real hand plays out correctly, matchmaking connects a room) rather than 98 unit-level assertions. `auth.test.ts` (7 tests) and `matchmaker.test.ts` (7 tests) are pure functions with no `partykit`/`partyserver` dependency and are entirely unaffected — they keep running and passing exactly as today.

## Global Constraints

- All poker-numeric values still come only from `shared/src/constants.ts` — this migration touches no game logic.
- Server-authoritative invariant is unchanged: only the deployed Durable Object mutates real state; clients still get `redactFor(...)` views.
- Relative imports in touched files still end in `.js`.
- `party/` currently has 92 tests in `matchRoom.test.ts`, 6 in `lobby.test.ts`, 7 in `auth.test.ts`, 7 in `matchmaker.test.ts` (112 total). Per Revision Note 2: `matchRoom.test.ts` and `lobby.test.ts` (98 tests) are deleted as part of this migration — a known, accepted, user-confirmed regression in automated coverage, not an oversight. `auth.test.ts` and `matchmaker.test.ts` (14 tests) are pure functions with zero `partykit`/`partyserver` dependency and MUST keep passing unchanged throughout. Root `npm test` therefore goes from 234 → 136 tests (234 − 92 − 6) by the end of Task 4, and must show exactly that count with zero unexpected failures — a different final number is itself a signal something broke that shouldn't have.
- Every deleted unit-test scenario's *intent* must be covered at a coarser grain by a scripted `wrangler dev` integration check before the corresponding task is considered done (see Tasks 3/4's verification steps) — deleting the tests must not mean deleting the verification, only changing its shape.
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
| `party/src/matchRoom.test.ts` | **Deleted** (Task 4) — cannot run once `matchRoom.ts` imports `partyserver` (see Revision Note 2). Coverage intent moves to Task 5's `wrangler dev` integration script. |
| `party/src/lobby.test.ts` | **Deleted** (Task 3) — same reason. |
| `party/.dev.vars` *(new, git-ignored)* | Local-only `wrangler dev` secrets (`DEV_TOKENS=true`) for Task 5's integration verification. |
| `party/package.json` | `partykit` dependency removed; `partyserver`, `wrangler` added; `dev`/`deploy` scripts now call `wrangler`. Vitest stays at whatever version the root workspace already pins (no bump). |
| `vitest.config.ts` (root) | No change — stays the existing single flat config; no workspace/project split needed since there's no separate Workers test pool. |
| `package.json` (root) | No change — `vitest` devDependency stays as-is. |
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

### Task 2: Revert the `@cloudflare/vitest-pool-workers` experiment; add `partyserver` as a dependency

**Superseded 2026-07-12** — see the Revision Note near the top of this plan. `@cloudflare/vitest-pool-workers` crashes internally and unfixably in this environment across multiple version pins; the user has confirmed dropping it in favor of the existing plain-mock test approach. This task is now a small cleanup + one forward-looking dependency add, not new test infrastructure.

**Files:**
- Modify: `party/package.json` — remove any `@cloudflare/vitest-pool-workers`/bumped-`vitest`/`wrangler` devDependency changes from the abandoned attempt; add `partyserver` as a real dependency (needed by Tasks 3/4's mock retyping and production code); keep `typescript`/`vitest` devDependencies exactly as they were before this migration started.
- Modify: `package.json` (root) — revert `vitest` devDependency to its original value if it was changed.
- Delete (if present from the abandoned attempt): `vitest.workspace.ts`, `party/vitest.config.ts`, `party/wrangler.jsonc` (the real `wrangler.jsonc` gets created properly in Task 5 — no value in keeping an early throwaway scaffold).
- Modify (if changed from the abandoned attempt): `vitest.config.ts` (root) — restore to its original single flat config.

**Interfaces:**
- Produces: `party/package.json` with `partyserver` installed and resolvable (`import { Server, getServerByName } from "partyserver"` and `import type { Connection } from "partyserver"` must both work) — this is what Task 3 consumes.
- The existing `npm test` (root) must still run all 234 tests, unchanged in count and pool, exactly as before this migration started.

- [ ] **Step 1: Check current state and revert any abandoned-attempt changes**

Run `git status` and `git diff` (repo root) to see what's currently modified/untracked from the earlier `@cloudflare/vitest-pool-workers` attempt. Revert/delete anything not part of this task's Files list above — specifically:
- `git checkout -- package.json vitest.config.ts` if either was modified for the abandoned attempt (restores the original single flat Vitest config and original root `vitest` devDependency version).
- Delete `vitest.workspace.ts`, `party/vitest.config.ts`, `party/wrangler.jsonc` if they exist from the abandoned attempt.
- In `party/package.json`, remove `@cloudflare/vitest-pool-workers` and any `wrangler`/bumped-`vitest` devDependency entries added for the abandoned attempt, restoring `devDependencies` to exactly: `{"typescript": "^5.4.0", "vitest": "^1.6.0"}` (its original content, per the file as it existed before this migration).

- [ ] **Step 2: Add `partyserver` as a real dependency**

Modify `party/package.json`'s `dependencies` block to add `partyserver`:
```json
"dependencies": {
  "@poker/shared": "*",
  "jose": "^5.0.0",
  "partyserver": "^0.0.66"
}
```
Leave `partykit` in place for now — Task 3/4 remove it once `matchRoom.ts`/`lobby.ts` no longer import from it. Removing it here would break the still-untouched `party/src/*.ts` files.

- [ ] **Step 3: Install and verify**

Run (repo root): `npm install`
Then: `npm test`
Expected: all 234 tests pass, identical to the baseline recorded before this migration started (same test file list, same counts, no Workers-pool-related output). This confirms the abandoned attempt left no residue.

- [ ] **Step 4: Commit**

```bash
git add party/package.json package-lock.json
git commit -m "chore(party): revert vitest-pool-workers experiment, add partyserver dependency"
```
(If `package.json`/`vitest.config.ts` at the repo root were never actually modified — e.g. the abandoned attempt was caught and reverted before those files landed — omit them from this commit; only stage what actually changed.)

---

### Task 3: Migrate `Lobby` (smaller, self-contained — do this before `MatchRoom`)

**Files:**
- Create: `party/src/env.ts`
- Modify: `party/src/lobby.ts` (full file — shell conversion, business logic identical)
- Delete: `party/src/lobby.test.ts` — per Revision Note 2, this file cannot run once `lobby.ts` imports `partyserver` (any value-import of `partyserver` crashes under plain Node). Its 6 tests' intent is covered later, in Task 5, by a single end-to-end `wrangler dev` integration check once both `Lobby` and `MatchRoom` are ported and a real Worker entrypoint exists to run them (there is no working local dev server yet at this point in the migration — `worker.ts`/`wrangler.jsonc` are created in Task 5 — so live verification isn't possible until then). This task's acceptance gate is TypeScript compiling cleanly plus careful line-by-line diff review against the original file.

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
Add `@cloudflare/workers-types` as a `party/package.json` devDependency (`"@cloudflare/workers-types": "^4.0.0"`) — this is a stable, standalone ambient-types package (unrelated to the abandoned `@cloudflare/vitest-pool-workers` test runtime), needed here purely for the `DurableObjectNamespace` type.

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

- [ ] **Step 3: Delete the now-unrunnable test file**

```bash
git rm party/src/lobby.test.ts
```

- [ ] **Step 4: Typecheck**

```
npm run typecheck
```
Expected: passes. There is no live/runtime verification for `Lobby` in isolation at this point in the migration — real verification happens once in Task 5 (Step 6), after `MatchRoom` (Task 4) is also ported and a real Worker entrypoint exists to run both against `wrangler dev`. Compensate for the lack of live feedback here by reviewing your own diff line-by-line against the original `party/src/lobby.ts` before moving on: every line that isn't in the substitution table in Step 2 should be byte-identical to the original.

- [ ] **Step 5: Commit**

```bash
git add party/src/env.ts party/src/lobby.ts party/package.json
git rm party/src/lobby.test.ts
git commit -m "refactor(party): migrate Lobby from partykit to partyserver"
```

---

### Task 4: Migrate `MatchRoom`

**Files:**
- Modify: `party/src/matchRoom.ts` (full file — shell conversion only; business-logic method bodies at lines ~401–800 are copied verbatim)
- Delete: `party/src/matchRoom.test.ts` — per Revision Note 2, cannot run once `matchRoom.ts` imports `partyserver`. Its 92 tests' intent is covered by Task 5's end-to-end `wrangler dev` integration check.

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

- [ ] **Step 3: Delete the now-unrunnable test file**

```bash
git rm party/src/matchRoom.test.ts
```

This is the largest mechanical step in the whole migration (Step 2's substitution table applied across every method). Since there's no automated test to catch a missed spot, self-review by diffing against the original file is the acceptance gate here, not a test run — go through the substitution table in Step 2 method-by-method and confirm every non-substituted line is byte-identical to the original `party/src/matchRoom.ts`.

- [ ] **Step 4: Typecheck**

```
npm run typecheck
```
Expected: passes, with zero remaining references to `partykit/server`, `Party.Request`, `Party.Connection`, or `this.party`. Grep to confirm:
```
grep -rn "partykit/server\|Party\.\|this\.party" party/src/matchRoom.ts party/src/lobby.ts
```
Expected: no output.

- [ ] **Step 5: Full regression run**

```
npm test
```
Expected: exactly 136 tests pass (234 total minus 92 for the deleted `matchRoom.test.ts` minus 6 for the deleted `lobby.test.ts`). `auth.test.ts`'s 7 and `matchmaker.test.ts`'s 7 tests are included in that 136 and must still be present and passing — confirm the test file list in the output still shows `party/src/auth.test.ts` and `party/src/matchmaker.test.ts`, and shows neither `lobby.test.ts` nor `matchRoom.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add party/src/matchRoom.ts party/package.json
git rm party/src/matchRoom.test.ts
git commit -m "refactor(party): migrate MatchRoom from partykit to partyserver"
```

---

### Task 5: Worker entrypoint, wrangler config, secrets, and cleanup

**Files:**
- Create: `party/src/worker.ts`
- Create: `party/wrangler.jsonc` (Task 2's abandoned scaffold was deleted; this creates the real one from scratch)
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

- [ ] **Step 2: Create `party/wrangler.jsonc` with the real domain route**

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
    "vitest": "^1.6.0",
    "@cloudflare/workers-types": "^4.0.0",
    "wrangler": "^4.0.0"
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
Expected: both green, `npm test` showing exactly 136 tests (per Task 4's Global Constraint) — this is the checkpoint proving nothing outside `party/` referenced `partykit.json` or the old `Party.*` types. Grep to confirm:
```
grep -rln "partykit/server\|partykit.json" party/src client
```
Expected: no output.

- [ ] **Step 6: End-to-end local integration verification against `wrangler dev`**

This is the real replacement for the 98 deleted unit tests — the first point in this migration where both `Lobby` and `MatchRoom` are assembled behind a real Worker entrypoint and can actually run. Do not skip this step or treat it as optional: it is the only verification this migration gets for `MatchRoom`'s reconnect/timebank/bust/ELO logic before production deploy.

First confirm `.dev.vars` is git-ignored (it is not covered by the existing `.gitignore` yet):
```bash
grep -q '^\.dev\.vars$' .gitignore || echo '.dev.vars' >> .gitignore
```
Then create `party/.dev.vars` (local-only secrets file, read automatically by `wrangler dev`):
```
DEV_TOKENS=true
```

Start the dev server in the background:
```bash
cd party && npx wrangler dev
```
Expected startup log shows both bindings: `Durable Objects: MAIN -> MatchRoom, LOBBY -> Lobby` and a local URL (typically `http://localhost:8787`).

Create a temporary verification script (scratch location, not committed — e.g. the session's scratchpad directory) using Node's built-in `WebSocket` (Node 22+, no `ws` package needed — confirmed working against the old `partykit dev` server earlier in this project's history):

```js
// verify-dev.mjs
const LOBBY_URL = "ws://localhost:8787/parties/lobby/global";

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
  });
}

const lobby = await connect(LOBBY_URL);
const messages = [];
lobby.onmessage = (e) => messages.push(JSON.parse(e.data));

lobby.send(JSON.stringify({ t: "hello", jwt: "dev:verify-player-1" }));
lobby.send(JSON.stringify({ t: "enqueue", rating: 400, format: "turbo" }));

// Poll for matchFound (bot-fill fires after BOT_FILL_WAIT_MS or immediately if
// RANKED_MIN_ONLINE isn't met — see shared/src/constants.ts for the actual value).
const deadline = Date.now() + 30_000;
let matchFound;
while (Date.now() < deadline && !matchFound) {
  await new Promise((r) => setTimeout(r, 500));
  matchFound = messages.find((m) => m.t === "matchFound");
}
if (!matchFound) {
  console.error("FAIL: no matchFound within 30s. Messages so far:", messages);
  process.exit(1);
}
console.log("PASS: matchmaking produced a room:", matchFound.roomId);

const room = await connect(`ws://localhost:8787/parties/main/${matchFound.roomId}`);
const roomMessages = [];
room.onmessage = (e) => roomMessages.push(JSON.parse(e.data));
room.send(JSON.stringify({ t: "hello", jwt: "dev:verify-player-1" }));

// Wait for the table to fill (bots) and the first hand to start.
const handDeadline = Date.now() + 15_000;
let dealt;
while (Date.now() < handDeadline && !dealt) {
  await new Promise((r) => setTimeout(r, 500));
  dealt = roomMessages.find((m) => m.t === "dealPrivate");
}
if (!dealt) {
  console.error("FAIL: no dealPrivate within 15s. Messages so far:", roomMessages);
  process.exit(1);
}
console.log("PASS: seated and dealt into a real hand, hole cards:", dealt.holeCards);

const matchOverOrEvent = roomMessages.some((m) => m.t === "event" || m.t === "yourTurn");
if (!matchOverOrEvent) {
  console.error("FAIL: no event/yourTurn message observed after deal.");
  process.exit(1);
}
console.log("PASS: table is live and broadcasting game state.");

lobby.close();
room.close();
process.exit(0);
```

Run it: `node verify-dev.mjs`

Expected output: three `PASS:` lines, exit code 0. This confirms, end to end: Lobby authentication + enqueue + matchmaking + room provisioning (the `getServerByName` cross-DO call from Task 3) works; MatchRoom authentication + seating + bot-fill + real hand dealing (the CSPRNG shuffle, `createHand`, hole-card dealing) works. It does not cover every one of the 98 deleted unit tests' edge cases (disconnect grace, timebank expiry, multi-hand bust sequencing, ELO settlement) — note this gap explicitly in your report; it is the accepted tradeoff from Revision Note 2, not something to silently expand this step to fully cover.

Stop the `wrangler dev` process afterward.

- [ ] **Step 7: Commit**

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
- **Type consistency:** `Env` (Task 3 Step 1) is referenced identically across `lobby.ts`, `matchRoom.ts`, and `worker.ts` — same field names (`MAIN`, `LOBBY`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `DEV_TOKENS`) throughout.
- **Revised twice on 2026-07-12, in order:** (1) the original Task 2 (Vitest 2→4 bump + `@cloudflare/vitest-pool-workers`, "real simulated DO runtime" testing) was abandoned after a verified, unfixable internal crash across four version pinnings, including a release-date-matched pairing. (2) The first fallback considered — keep the existing plain-mock approach, just retyped — was *also* found impossible on direct testing: `partyserver`'s `Server` class imports Cloudflare's `cloudflare:workers` built-in at module load time, which crashes under plain Node regardless of mocking strategy. Final, user-confirmed architecture: delete `lobby.test.ts`/`matchRoom.test.ts` (98 tests) entirely; replace with one end-to-end `wrangler dev` integration script in Task 5 covering the golden path (matchmaking → room provisioning → seating → real hand dealt). This is a real, acknowledged reduction in regression coverage — the fine-grained edge cases those 98 tests covered (disconnect grace, timebank expiry, multi-hand bust sequencing, ELO settlement details) have no automated check after this migration. `auth.test.ts`/`matchmaker.test.ts` (14 tests, no `partykit`/`partyserver` dependency) are entirely unaffected.
- **Verification shape changed accordingly:** Tasks 3 and 4 no longer have a live test run as their acceptance gate (there's nothing that can run yet) — they rely on `npm run typecheck` plus deliberate line-by-line diff review against the original files. The `wrangler dev` script in Task 5 Step 6 is the first and only point where the ported code actually executes before production deploy — treat it as load-bearing, not optional.
