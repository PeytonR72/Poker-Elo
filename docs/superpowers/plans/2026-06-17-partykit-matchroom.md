# PokerElo — Build Unit 2: PartyKit MatchRoom Server

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.
ALSO REQUIRED: claude-md-management, feature-dev, typescript-lsp (if working)
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-authoritative `MatchRoom` in `party/` using PartyKit. The server owns
the deck, deals private hole cards, drives the action loop, enforces timers, tracks the match
clock / blind escalation / bust placement, and runs bot seats. Clients receive only redacted
snapshots via `redactFor`. No game state is duplicated client-side; clients send intent only.

**Architecture:** PartyKit room (`Party.Server`) holds one `TableState` per live hand in memory
(ephemeral — matches are short, no durable storage needed for game state). Supabase is touched
once per unit 2: JWT validation on `hello`. Full ELO persistence is Unit 3. The pure engine in
`@poker/shared` does all poker logic; `party/` wires lifecycle, timers, and network.

**Tech stack:** PartyKit (`partykit` npm), TypeScript (strict, same `tsconfig.base.json`),
`@poker/shared` workspace dependency, `jose` for JWT verification, Vitest for unit tests.

**Every task must:**
- Follow all conventions in `CLAUDE.md` (`.js` imports, `Action.seat` not `seatIndex`, etc.)
- Scout `superpowers:test-driven-development` for every new module.
- Scout `superpowers:systematic-debugging` on any unexpected test failure.
- Scout `superpowers:verification-before-completion` before marking done.
- Run `npm test` and `npm run typecheck` from repo root — must stay green after every task.
- Commit after each green task.

---

## Prerequisites — Credentials & Local Setup

**Complete these before dispatching Task 1.** The implementer needs env vars in place.

### PartyKit

1. **Create account:** Go to [partykit.io](https://partykit.io) and sign in with GitHub.
2. **Install CLI:** `npm install -g partykit` (or use `npx partykit` inline).
3. **Log in:** `npx partykit login` — this opens a browser, authenticates, and writes a token to
   `~/.partykit/config.json`. You need this for deploy; local dev works without it.
4. **Note your username** (shown after login — used in the deployed room URL).
5. **Local dev server:** `npx partykit dev` from the repo root — runs on `http://localhost:1999`.
   No credentials needed for local dev.
6. **Env var for deploy/CI:**
   - `PARTYKIT_TOKEN` — your PartyKit deploy token (from `~/.partykit/config.json` after login).
   - Add via: `npx partykit env add PARTYKIT_TOKEN <value>` or set in CI secrets.

### Supabase

1. **Create project:** [supabase.com/dashboard](https://supabase.com/dashboard) → New project.
   Choose a region close to your target users. Note the project ref (e.g. `abcdefghijklmnop`).
2. **Gather credentials** from Settings → API:
   - `SUPABASE_URL` — e.g. `https://abcdefghijklmnop.supabase.co`
   - `SUPABASE_ANON_KEY` — safe to expose client-side (used in Unit 3 client).
   - `SUPABASE_SERVICE_ROLE_KEY` — server-only (used in Unit 3 edge function).
   - `SUPABASE_JWT_SECRET` — from Settings → API → JWT Settings. This is the HMAC secret
     PartyKit uses to verify player tokens. **Keep this server-side only.**
3. **No schema needed in Unit 2.** The DB schema (player profiles, match results, ELO) is Unit 3.
   Unit 2 only uses the JWT secret to verify that a connecting player has a valid Supabase session.
4. **Local dev:** If you want full local Supabase, install the CLI (`brew install supabase/tap/supabase`
   or `npm i -g supabase`) and run `supabase start`. For Unit 2 dev, you can skip this and use a
   test token (see Task 3 — the room accepts a magic dev-mode token when `NODE_ENV !== "production"`).

### Env file

Create `.env` at repo root (git-ignored):

```
SUPABASE_JWT_SECRET=<from Supabase Settings → API → JWT Settings>
PARTYKIT_TOKEN=<from npx partykit login>
```

Add to `partykit.json` vars for local dev (PartyKit reads this automatically):
```json
{
  "vars": {
    "SUPABASE_JWT_SECRET": ""
  }
}
```
In production, set secrets via `npx partykit env add SUPABASE_JWT_SECRET <value>` (never commit
the actual secret).

---

## File Structure

```
partykit.json                  PartyKit project config (root)
party/
  package.json                 @poker/party — add partykit + jose deps here
  tsconfig.json                extends ../../tsconfig.base.json
  src/
    matchRoom.ts               Party.Server: MatchRoom (main room class)
    auth.ts                    verifyJwt(token, secret) -> { sub: string }
    timers.ts                  TurnTimer + MatchClock helpers (pure logic, testable)
    botRunner.ts               decideBotAction(state, seat, rng) -> Action + delay
    matchRoom.test.ts          Vitest unit tests using mock connections
```

---

## Global Constraints

These apply to every task. Reviewers check these verbatim.

- **Server-authoritative:** Deck seed generated server-side via `crypto.getRandomValues`. Never
  send the deck, seed, or foreign hole cards to any client. `redactFor` is the only output path.
- **CSPRNG seed:** Use `crypto.getRandomValues(new Uint32Array(4))` → XOR-fold the 4 words into
  one 32-bit number → pass to `shuffledDeck(seed)`. Never use `Math.random`, `Date.now`, or any
  user-supplied value as a seed.
- **All poker numbers from `constants.ts`:** `turnTimeMs`, `matchDurationMs`, `blindLevelDurationMs`,
  `DISCONNECT_GRACE_MS`, `TIMEBANK_*`, `BOT_THINK_MIN_MS`, `BOT_THINK_MAX_MS` — imported from
  `@poker/shared`, never hardcoded.
- **Imports:** Relative imports end in `.js`. Workspace imports: `import { ... } from "@poker/shared"`.
- **Immutable engine calls:** `applyAction`, `settleShowdown`, `awardSingleWinner` are already
  immutable (return `{ state, events }`). Never mutate `TableState` in-place.
- **`Action.seat`** (not `seatIndex`) — that is the field name on the `Action` type.
- **`Action.amount` = raise-TO** (total chips committed this street), not raise-by.
- **Tests colocated, Vitest:** `matchRoom.test.ts` alongside `matchRoom.ts`.
- **No `Math.random` in logic.** The bot gets the room's seeded RNG instance; tests pass a
  deterministic RNG.
- **TypeScript strict + `noUncheckedIndexedAccess`.** Guard all index accesses.

---

## Task 1: `party/` package scaffold

**Files to create/modify:**
- `party/package.json` — add deps
- `party/tsconfig.json` — new
- `partykit.json` — new at repo root

**Steps:**

- [ ] **1.1 Update `party/package.json`**

```json
{
  "name": "@poker/party",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@poker/shared": "*",
    "jose": "^5.0.0",
    "partykit": "^0.0.108"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

Run `npm install` from repo root to link the workspace.

- [ ] **1.2 Create `party/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022"],
    "types": ["vitest/globals"]
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **1.3 Create `partykit.json` at repo root**

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

The `name` must be unique on PartyKit (use your GitHub username prefix if needed, e.g.
`"peytonr-poker-elo"`). The deployed URL becomes
`https://poker-elo.<your-partykit-username>.partykit.dev`.

- [ ] **1.4 Add `party` to root `vitest.config.ts` workspace**

The root vitest config likely already has `projects: ["shared"]`. Add `"party"`:

```ts
projects: ["shared", "party"]
```

- [ ] **1.5 Verify**

`npm run typecheck` and `npm test` pass (party has no src yet, so no new failures).
Commit: `chore(party): scaffold package + partykit config`

---

## Task 2: MatchRoom skeleton + connection registry

**Files:** `party/src/matchRoom.ts` (create), `party/src/matchRoom.test.ts` (create)

**Goal:** An empty `Party.Server` subclass that tracks connected players and can send/broadcast
messages. No game logic yet — just the wiring that every later task builds on.

**Steps:**

- [ ] **2.1 Define connection registry types** at the top of `matchRoom.ts`

```ts
import type * as Party from "partykit/server";

type ConnState = {
  playerId: string;       // Supabase user sub (from JWT)
  seatIndex: number | null; // null until seated
  authed: boolean;
};
```

- [ ] **2.2 Create `MatchRoom` class**

```ts
export default class MatchRoom implements Party.Server {
  static options = { hibernate: false } satisfies Party.ServerOptions;

  // In-memory state — ephemeral per room instance
  private players = new Map<string, ConnState>(); // conn.id → ConnState

  constructor(readonly party: Party.Party) {}

  onConnect(conn: Party.Connection): void {
    this.players.set(conn.id, { playerId: "", seatIndex: null, authed: false });
  }

  onClose(conn: Party.Connection): void {
    this.players.delete(conn.id);
  }

  onError(conn: Party.Connection, error: Error): void {
    conn.close();
    this.players.delete(conn.id);
  }

  onMessage(raw: string | ArrayBuffer, sender: Party.Connection): void {
    // implemented in Task 3+
  }
}
```

- [ ] **2.3 Write skeleton test** in `matchRoom.test.ts`

Use a minimal mock connection factory:

```ts
function mockConn(id: string): Party.Connection {
  const msgs: string[] = [];
  return {
    id,
    send: (msg: string) => { msgs.push(msg); },
    close: () => {},
    socket: {} as WebSocket,
    state: null,
    setState: () => {},
  } as unknown as Party.Connection;
}
```

Test: `onConnect` registers the connection; `onClose` removes it.

- [ ] **2.4 Verify** `npm test -- party/src/matchRoom.test.ts` green.
  Commit: `feat(party): MatchRoom skeleton + connection registry`

---

## Task 3: Hello handshake + JWT auth + `seated` message

**Files:** `party/src/auth.ts` (create), `party/src/matchRoom.ts` (modify),
`party/src/matchRoom.test.ts` (extend)

**Goal:** When the first message on a new connection is `{ t: "hello", jwt }`, verify the JWT,
register the player, assign them a seat index, and send back a `seated` ServerMsg.

The room has `TABLE_SIZE` (6) seats indexed 0–5. The first player connecting gets seat 0, the
next gets seat 1, etc. In Unit 2 all seats are filled at the start (bots fill remaining seats —
wired in Task 12). For now, track how many humans are connected and reject connections beyond
`TABLE_SIZE`.

**Steps:**

- [ ] **3.1 Create `party/src/auth.ts`**

```ts
import { jwtVerify } from "jose";

export type AuthPayload = { sub: string };

export async function verifyJwt(
  token: string,
  secret: string
): Promise<AuthPayload> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
  if (typeof payload.sub !== "string") throw new Error("JWT missing sub");
  return { sub: payload.sub };
}

// Dev-mode bypass: accept this literal token in non-production envs.
// Format: "dev:<userId>" — e.g. "dev:player-1"
export function parseDevToken(token: string): AuthPayload | null {
  if (!token.startsWith("dev:")) return null;
  const sub = token.slice(4);
  if (!sub) return null;
  return { sub };
}
```

- [ ] **3.2 Handle `"hello"` in `onMessage`**

```ts
import { decode } from "@poker/shared";
import { TABLE_SIZE } from "@poker/shared";
import { verifyJwt, parseDevToken } from "./auth.js";

// In onMessage:
const msg = decode(raw as string); // throws if invalid tag
if (msg.t !== "hello") { /* send error, close */ return; }

const state = this.players.get(sender.id)!;
if (state.authed) return; // already authed — ignore duplicate hellos

// Auth
const jwtSecret = this.party.env["SUPABASE_JWT_SECRET"] as string | undefined;
let playerId: string;
try {
  if (!jwtSecret || jwtSecret === "") {
    // Dev mode: accept "dev:<id>" tokens
    const dev = parseDevToken(msg.jwt);
    if (!dev) throw new Error("No JWT secret configured and token is not a dev token");
    playerId = dev.sub;
  } else {
    const auth = await verifyJwt(msg.jwt, jwtSecret);
    playerId = auth.sub;
  }
} catch {
  sender.send(encode({ t: "error", message: "auth_failed" }));
  sender.close();
  return;
}

// Seat assignment
const usedSeats = new Set([...this.players.values()].map(p => p.seatIndex).filter(s => s !== null));
let seatIndex = 0;
while (usedSeats.has(seatIndex)) seatIndex++;
if (seatIndex >= TABLE_SIZE) {
  sender.send(encode({ t: "error", message: "table_full" }));
  sender.close();
  return;
}

state.playerId = playerId;
state.seatIndex = seatIndex;
state.authed = true;

sender.send(encode({ t: "seated", seatIndex, playerId }));
```

Note: `onMessage` must become `async` to `await verifyJwt`.

- [ ] **3.3 Update `protocol.ts` if needed**

Check that `ServerMsg` includes `{ t: "seated"; seatIndex: number; playerId: string }` and
`{ t: "error"; message: string }`. If not, add them. Update `CLAUDE.md` module map entry
for `protocol.ts` with new message shapes.

- [ ] **3.4 Tests for auth**
  - `auth.ts`: unit test `verifyJwt` with a known HS256 test token signed with a test secret.
  - `auth.ts`: `parseDevToken("dev:alice")` → `{ sub: "alice" }`.
  - `matchRoom.test.ts`: mock `party.env = {}` → dev token accepted; mock `party.env = { SUPABASE_JWT_SECRET: "secret" }` → real JWT required.
  - Sending a non-`hello` first message → connection closed with `error`.
  - Sending `hello` twice → second ignored.

- [ ] **3.5 Verify** all tests green. Commit: `feat(party): hello handshake + JWT auth + seated`

---

## Task 4: Match initialization — CSPRNG seed, deal, snapshot broadcast

**Files:** `party/src/matchRoom.ts` (extend)

**Goal:** Once all seats have connected and authed, start the match: generate a CSPRNG seed,
call `shuffledDeck`, call `createHand`, store the resulting `TableState`, and broadcast redacted
snapshots to all players.

For Unit 2 testing purposes, trigger match start when `TABLE_SIZE` players are seated OR when a
special `{ t: "startMatch" }` dev message is received (only accepted if `SUPABASE_JWT_SECRET` is
unset / dev mode). This avoids needing 6 humans in tests.

**Steps:**

- [ ] **4.1 CSPRNG seed helper** (inside `matchRoom.ts` or a small private function)

```ts
function csprngSeed(): number {
  const buf = new Uint32Array(4);
  crypto.getRandomValues(buf);
  // XOR-fold 128 bits to 32 bits for mulberry32
  return (buf[0]! ^ buf[1]! ^ buf[2]! ^ buf[3]!) >>> 0;
}
```

- [ ] **4.2 Add `TableState` + match fields to room**

```ts
import type { TableState } from "@poker/shared";
import {
  shuffledDeck, createHand, createSeat,
  redactFor, encode, STARTING_STACK, TABLE_SIZE,
  DEFAULT_FORMAT, MATCH_FORMATS
} from "@poker/shared";

private tableState: TableState | null = null;
private matchStartMs: number = 0; // Date.now() when match started
private bustOrder: string[] = [];  // playerId in bust order (first busted = last place)
```

- [ ] **4.3 `startMatch()` private method**

```ts
private startMatch(): void {
  // Build seats in seat-index order from connected players + bots (Task 12 adds bots)
  const seats = Array.from({ length: TABLE_SIZE }, (_, i) => {
    const player = [...this.players.values()].find(p => p.seatIndex === i);
    const id = player?.playerId ?? `bot-${i}`;
    return createSeat(id, STARTING_STACK);
  });

  const seed = csprngSeed();
  const deck = shuffledDeck(seed);
  const button = 0; // first hand: seat 0 is button
  this.matchStartMs = Date.now();
  this.tableState = createHand(seats, button, 0, DEFAULT_FORMAT, deck);
  this.broadcastSnapshots();
}
```

- [ ] **4.4 `broadcastSnapshots()` private method**

```ts
private broadcastSnapshots(): void {
  if (!this.tableState) return;
  for (const [connId, connState] of this.players) {
    if (!connState.authed) continue;
    const view = redactFor(connState.playerId, this.tableState);
    const conn = [...this.party.connections].find(c => c.id === connId);
    conn?.send(encode({ t: "snapshot", view }));
  }
}
```

- [ ] **4.5 Trigger `startMatch`** when all human seats are filled (count `authed` players === `TABLE_SIZE`), or on dev `startMatch` message.

- [ ] **4.6 Verify `ServerMsg`** includes `{ t: "snapshot"; view: PublicView }`. Add to `protocol.ts` if missing.

- [ ] **4.7 Tests**
  - `csprngSeed()` returns a number in `[0, 2^32)`.
  - Two successive calls return different values (probabilistic — seed 1000 pairs).
  - `startMatch()` with mocked `party`: `tableState` is non-null, board is empty (preflop), each seat has 2 hole cards (non-null).
  - `broadcastSnapshots()`: each connection receives a `snapshot` whose `view` does not contain `deck` or opponent `holeCards`.

- [ ] **4.8 Verify** all tests green. Commit: `feat(party): match init — CSPRNG seed + createHand + snapshot broadcast`

---

## Task 5: Private deal — `dealPrivate` messages

**Files:** `party/src/matchRoom.ts` (extend), `party/src/matchRoom.test.ts` (extend)

**Goal:** After `createHand`, each human player must receive their own hole cards via a
`dealPrivate` ServerMsg. Bot seats never receive messages (they're internal). The `redactFor`
snapshot already hides foreign hole cards, so `dealPrivate` is the one-time private delivery.

**Steps:**

- [ ] **5.1 Add `dealPrivate` to `ServerMsg`** in `protocol.ts` if not present:

```ts
{ t: "dealPrivate"; holeCards: [number, number] }
```

- [ ] **5.2 Send `dealPrivate`** inside `startMatch()` after `broadcastSnapshots()`:

```ts
for (const [connId, connState] of this.players) {
  if (!connState.authed || connState.seatIndex === null) continue;
  const seat = this.tableState!.seats[connState.seatIndex];
  if (!seat?.holeCards) continue;
  const conn = [...this.party.connections].find(c => c.id === connId);
  conn?.send(encode({ t: "dealPrivate", holeCards: seat.holeCards }));
}
```

- [ ] **5.3 Tests**
  - Each human connection receives exactly one `dealPrivate` after `startMatch`.
  - The hole cards in `dealPrivate` match the `TableState.seats[seatIndex].holeCards` for that player.
  - No `dealPrivate` is sent for bot seats (no connection for them).
  - The `snapshot` sent to player A does NOT contain player B's hole cards.

- [ ] **5.4 Verify** all tests green. Commit: `feat(party): dealPrivate hole cards per player`

---

## Task 6: `yourTurn` + action receiver

**Files:** `party/src/matchRoom.ts` (extend), `party/src/matchRoom.test.ts` (extend)

**Goal:** After each state change, tell the seat-to-act what their legal moves are. Receive
`{ t: "action", ... }` messages, validate the sender is the active seat, validate legality, call
`applyAction`, broadcast updated snapshots, emit `event` messages, and send the next `yourTurn`.

**Steps:**

- [ ] **6.1 Add `yourTurn` and `event` to `ServerMsg`** if not present:

```ts
{ t: "yourTurn"; mask: ActionMask; deadlineTs: number }  // UTC ms deadline
{ t: "event"; event: GameEvent }
```

- [ ] **6.2 `sendYourTurn()` private method**

```ts
import { legalActions, nextToAct } from "@poker/shared";
import { MATCH_FORMATS } from "@poker/shared";

private sendYourTurn(): void {
  if (!this.tableState || this.tableState.street === "complete") return;
  const seatIdx = nextToAct(this.tableState);
  if (seatIdx === null) return;

  const format = MATCH_FORMATS[this.tableState.format];
  if (!format) return;
  const deadline = Date.now() + format.turnTimeMs;
  const mask = legalActions(this.tableState, seatIdx);

  // Find the connection for this seat
  const connState = [...this.players.values()].find(p => p.seatIndex === seatIdx);
  if (connState) {
    const conn = [...this.party.connections].find(c => {
      return this.players.get(c.id)?.seatIndex === seatIdx;
    });
    conn?.send(encode({ t: "yourTurn", mask, deadlineTs: deadline }));
  }
  // Bot seats handled by Task 12
}
```

- [ ] **6.3 Handle `{ t: "action" }` in `onMessage`**

```ts
import { applyAction, legalActions, nextToAct } from "@poker/shared";
import type { Action } from "@poker/shared";

// In onMessage, after auth check:
if (msg.t !== "action") return;
if (!this.tableState || this.tableState.street === "complete") return;

const connState = this.players.get(sender.id)!;
if (!connState.authed || connState.seatIndex === null) return;

// Must be active seat
const expectedSeat = nextToAct(this.tableState);
if (expectedSeat !== connState.seatIndex) {
  sender.send(encode({ t: "error", message: "not_your_turn" }));
  return;
}

// Validate legality
const action: Action = { seat: connState.seatIndex, type: msg.type, amount: msg.amount ?? 0 };
const mask = legalActions(this.tableState, connState.seatIndex);
if (!isLegal(action, mask)) {
  sender.send(encode({ t: "error", message: "illegal_action" }));
  return;
}

// Apply
const { state, events } = applyAction(this.tableState, action);
this.tableState = state;

// Broadcast events then snapshots
for (const event of events) {
  this.party.broadcast(encode({ t: "event", event }));
}
this.broadcastSnapshots();

// Continue hand or advance to next hand
if (this.tableState.street === "complete") {
  this.onHandComplete();
} else {
  this.sendYourTurn();
}
```

- [ ] **6.4 `isLegal(action, mask)` helper** — validates the action against the mask:
  - `fold`: `mask.canFold`
  - `check`: `mask.canCheck`
  - `call`: `mask.canCall` and `action.amount === mask.callAmount`
  - `raise`: `mask.canRaise` and `action.amount >= mask.minRaiseTo` and `action.amount <= mask.maxRaiseTo`

- [ ] **6.5 `onHandComplete()` stub** — for now, just log. Task 8 implements it properly.

- [ ] **6.6 Tests**
  - Sending an `action` from the wrong seat → `error: "not_your_turn"`.
  - Sending an illegal action (e.g. raise below min) → `error: "illegal_action"`.
  - Valid fold from active seat → `applyAction` called, snapshots broadcast, events broadcast.
  - After a valid action, `yourTurn` sent to the next seat to act.

- [ ] **6.7 Verify** all tests green. Commit: `feat(party): yourTurn dispatch + action receiver + legality gate`

---

## Task 7: Turn timer — hard deadline + timebank

**Files:** `party/src/timers.ts` (create), `party/src/matchRoom.ts` (extend),
`party/src/matchRoom.test.ts` (extend)

**Goal:** When `yourTurn` is sent, start a server-side timer for `turnTimeMs`. On expiry,
auto-check if legal, else auto-fold. Each player has a timebank balance (starts at
`TIMEBANK_INITIAL_MS`, from `constants.ts`). When a player's regular time expires, if they have
timebank remaining, extend the deadline by `TIMEBANK_INCREMENT_MS` (once per turn, deducted from
balance). On expiry of the extended time too, auto-act.

**Steps:**

- [ ] **7.1 Timebank state per player**

Add to `ConnState`:
```ts
timebankMs: number; // initialized to TIMEBANK_INITIAL_MS on hello
```

Import `TIMEBANK_INITIAL_MS`, `TIMEBANK_INCREMENT_MS` from `@poker/shared` (add to `constants.ts`
if not already present — `TIMEBANK_INITIAL_MS = 30_000`, `TIMEBANK_INCREMENT_MS = 30_000`).

- [ ] **7.2 `TurnTimer` class in `party/src/timers.ts`**

```ts
export class TurnTimer {
  private handle: ReturnType<typeof setTimeout> | null = null;

  start(ms: number, onExpire: () => void): void {
    this.cancel();
    this.handle = setTimeout(onExpire, ms);
  }

  cancel(): void {
    if (this.handle !== null) {
      clearTimeout(this.handle);
      this.handle = null;
    }
  }
}
```

This is a thin wrapper so tests can mock `setTimeout`.

- [ ] **7.3 Add `turnTimer` to `MatchRoom`**

```ts
private turnTimer = new TurnTimer();
private timebankUsedThisTurn = false;
```

- [ ] **7.4 Start timer in `sendYourTurn`**

```ts
// After sending yourTurn message:
const connState = ...; // the player who was sent yourTurn (may be null for bots)
const format = MATCH_FORMATS[this.tableState.format]!;
this.timebankUsedThisTurn = false;
this.turnTimer.start(format.turnTimeMs, () => this.onTurnExpired(seatIdx));
```

- [ ] **7.5 `onTurnExpired(seatIdx)` private method**

```ts
private onTurnExpired(seatIdx: number): void {
  if (!this.tableState) return;
  // Check if player has timebank
  const connState = [...this.players.values()].find(p => p.seatIndex === seatIdx);
  if (connState && !this.timebankUsedThisTurn && connState.timebankMs > 0) {
    const ext = Math.min(connState.timebankMs, TIMEBANK_INCREMENT_MS);
    connState.timebankMs -= ext;
    this.timebankUsedThisTurn = true;
    // Notify player of timebank extension
    const conn = ...; // find conn for seatIdx
    conn?.send(encode({ t: "event", event: { t: "timebankUsed", seatIdx, remainingMs: connState.timebankMs } }));
    this.turnTimer.start(ext, () => this.onTurnExpired(seatIdx));
    return;
  }
  // Auto-act: check if legal, else fold
  const mask = legalActions(this.tableState, seatIdx);
  const action: Action = mask.canCheck
    ? { seat: seatIdx, type: "check", amount: 0 }
    : { seat: seatIdx, type: "fold", amount: 0 };
  const { state, events } = applyAction(this.tableState, action);
  this.tableState = state;
  for (const event of events) this.party.broadcast(encode({ t: "event", event }));
  this.broadcastSnapshots();
  if (this.tableState.street === "complete") {
    this.onHandComplete();
  } else {
    this.sendYourTurn();
  }
}
```

Note: add `{ t: "timebankUsed"; seatIdx: number; remainingMs: number }` to `GameEvent` or send
it as a separate `ServerMsg` event (preferred — keeps `GameEvent` in `shared` clean). Use
`ServerMsg { t: "event"; event: ... }` with a superset `GameEvent` type that includes this, or
add a separate `ServerMsg` type. Document the choice in `CLAUDE.md`.

- [ ] **7.6 Cancel timer** on valid human action in the action receiver (before calling `applyAction`):
```ts
this.turnTimer.cancel();
```

- [ ] **7.7 Tests** (use fake timers: `vi.useFakeTimers()`)
  - Timer fires after `turnTimeMs` → auto-check emitted if legal.
  - Timer fires → auto-fold emitted when check is not legal.
  - Player with timebank: first expiry → timer extended, `timebankUsed` event sent.
  - Player with empty timebank: first expiry → auto-act immediately.
  - Valid human action before expiry → timer cancelled (no double-action).

- [ ] **7.8 Verify** all tests green. Commit: `feat(party): turn timer + timebank`

---

## Task 8: Hand loop — `onHandComplete` + next hand

**Files:** `party/src/matchRoom.ts` (extend), `party/src/matchRoom.test.ts` (extend)

**Goal:** When `tableState.street === "complete"`, detect if any seat busted this hand (chips
dropped to 0), record bust order, then start the next hand (rotating the button past busted
seats) — unless the match clock says no new hand should start.

**Steps:**

- [ ] **8.1 `onHandComplete()` implementation**

```ts
private onHandComplete(): void {
  if (!this.tableState) return;
  this.turnTimer.cancel();

  // Detect newly busted seats
  for (const seat of this.tableState.seats) {
    if (!seat) continue;
    if (seat.status === "busted" && !this.bustOrder.includes(seat.id)) {
      this.bustOrder.push(seat.id);
    }
  }

  // Check match clock
  const elapsedMs = Date.now() - this.matchStartMs;
  const format = MATCH_FORMATS[this.tableState.format]!;
  const matchOver = elapsedMs >= format.matchDurationMs || this.isMatchOver();
  if (matchOver) {
    this.endMatch();
    return;
  }

  // Start next hand after a brief inter-hand pause
  setTimeout(() => this.startNextHand(), INTER_HAND_PAUSE_MS);
}
```

Define `INTER_HAND_PAUSE_MS = 3_000` as a local constant (not poker-numeric, so allowed; but
also fine to put in `constants.ts` — your call). 

- [ ] **8.2 `isMatchOver()` helper**

Match is over when ≤1 non-busted seat remains (heads-up ends when one player is eliminated),
OR match clock expired.

```ts
private isMatchOver(): boolean {
  if (!this.tableState) return true;
  const active = this.tableState.seats.filter(s => s && s.status !== "busted");
  return active.length <= 1;
}
```

- [ ] **8.3 `startNextHand()` method**

```ts
private startNextHand(): void {
  if (!this.tableState) return;
  const elapsedMs = Date.now() - this.matchStartMs;
  const seed = csprngSeed();
  const deck = shuffledDeck(seed);
  // Rotate button: next non-busted seat after current button
  const nextButton = nextNonBustedSeat(this.tableState.seats, this.tableState.buttonIndex);
  this.tableState = createHand(this.tableState.seats, nextButton, elapsedMs, this.tableState.format, deck);
  this.broadcastSnapshots();
  this.sendDealPrivate();
  this.sendYourTurn();
}
```

- [ ] **8.4 `nextNonBustedSeat(seats, currentButton)` pure helper** — scan forward from
  `(currentButton + 1) % seats.length`, skipping busted seats. Returns the next valid seat index.

- [ ] **8.5 `sendDealPrivate()` refactored** from `startMatch()` so both can call it.

- [ ] **8.6 Tests**
  - Hand completes with a bust → `bustOrder` gains that player's id.
  - Single player remaining → `isMatchOver()` true.
  - Match clock expired (`elapsedMs >= matchDurationMs`) → `endMatch()` called, no next hand.
  - Normal hand completion → `startNextHand()` called after pause.
  - Button rotates past busted seat correctly.

- [ ] **8.7 Verify** all tests green. Commit: `feat(party): hand loop — bust detection + next hand`

---

## Task 9: Match clock + blind escalation

**Files:** `party/src/matchRoom.ts` (extend), `party/src/matchRoom.test.ts` (extend)

**Goal:** `elapsedMs` is computed as `Date.now() - matchStartMs` at each `createHand` call.
`blindLevelAt(elapsedMs, format)` (from `@poker/shared`) returns the current `{ sb, bb }`.
`createHand` already receives `elapsedMs` and `format` and uses `blindLevelAt` internally
to post the correct blinds. So the match clock is already handled — this task verifies the
wiring and adds the grace-finish rule.

**Grace-finish rule (`MATCH_GRACE_FINISH = true`):** If a hand is already in progress when the
match clock expires (`elapsedMs >= matchDurationMs`), that hand plays to completion before the
match ends. No new hand starts after the buzzer.

**Steps:**

- [ ] **9.1 Confirm `createHand` receives correct `elapsedMs`**

In `startNextHand()` and `startMatch()`, verify that `elapsedMs` is computed as
`Date.now() - this.matchStartMs` and passed as the third argument to `createHand`. This means
`blindLevelAt` sees the real elapsed time and returns the correct blind level.

- [ ] **9.2 Grace-finish check in `onHandComplete`**

Already handled by the clock check in Task 8: once a hand completes and `elapsedMs >= matchDurationMs`,
`endMatch()` is called. No new hand starts. The check is placed *after* the hand finishes, not
during it — the in-progress hand always completes.

- [ ] **9.3 Tests**
  - `elapsedMs = 0` → first blind level (10/20 for turbo).
  - `elapsedMs = 130_000` (just past first level boundary for turbo at 120s) → second level (15/30).
  - `elapsedMs >= matchDurationMs` in `onHandComplete` → `endMatch()` called, no `startNextHand`.
  - A hand that started with 5s left on the clock plays to completion before match ends.

- [ ] **9.4 Verify** all tests green. Commit: `feat(party): match clock wiring + grace-finish verification`

---

## Task 10: Match end + ELO deltas + `matchOver`

**Files:** `party/src/matchRoom.ts` (extend)

**Goal:** `endMatch()` determines finishing places, calls `pairwiseElo`, and broadcasts
`matchOver` to all connections.

**Finishing place rules:**
- Busted players: ranked by bust order. First to bust = last place. Last to bust = one above survivors.
- Survivors (not busted when match ends): ranked by chip count, highest chips = 1st place.
- Ties in chip count at match end → same finishing place (Elo uses S=0.5 for ties).

**Steps:**

- [ ] **10.1 `endMatch()` method**

```ts
import { pairwiseElo, ELO_K_FACTOR, ELO_PROVISIONAL_K, ELO_PROVISIONAL_GAMES } from "@poker/shared";
import type { EloPlayer } from "@poker/shared";

private endMatch(): void {
  if (!this.tableState) return;
  this.turnTimer.cancel();

  // Build finish place map
  const finishPlaceById: Record<string, number> = {};

  // Survivors sorted by chips descending → places 1..n
  const survivors = this.tableState.seats
    .filter((s): s is NonNullable<typeof s> => s !== null && s.status !== "busted")
    .sort((a, b) => b.stack - a.stack);

  let place = 1;
  for (let i = 0; i < survivors.length; i++) {
    // Tie in chips → same place
    if (i > 0 && survivors[i]!.stack < survivors[i - 1]!.stack) place = i + 1;
    finishPlaceById[survivors[i]!.id] = place;
  }

  // Busted players: bust order reversed (last bust = best among busted)
  const totalPlayers = this.tableState.seats.filter(Boolean).length;
  const reversedBust = [...this.bustOrder].reverse();
  for (let i = 0; i < reversedBust.length; i++) {
    finishPlaceById[reversedBust[i]!] = survivors.length + 1 + i;
  }

  // Elo players (human only — bots don't affect ELO; for now include all for simplicity)
  const players: EloPlayer[] = this.tableState.seats
    .filter(Boolean)
    .map(s => ({ id: s!.id, rating: ELO_DEFAULT_RATING })); // Unit 3 will fetch real ratings

  const K = (id: string) => {
    // Unit 3 will use real gamesPlayed; for now everyone gets normal K
    return ELO_K_FACTOR;
  };

  const deltas = pairwiseElo(players, finishPlaceById, K);

  this.party.broadcast(encode({
    t: "matchOver",
    finishPlaceById,
    eloDeltas: deltas,
  }));
}
```

- [ ] **10.2 Add `matchOver` to `ServerMsg`** if not present:

```ts
{ t: "matchOver"; finishPlaceById: Record<string, number>; eloDeltas: Record<string, number> }
```

Import `ELO_DEFAULT_RATING` from `@poker/shared`.

- [ ] **10.3 Tests**
  - 3 survivors with chips 500/300/200, 3 busted (bust order: A, B, C) → places 1/2/3/4/5/6.
  - Tied survivors (same chip count) → same place.
  - `matchOver` broadcast contains `finishPlaceById` and `eloDeltas` for all seats.
  - ELO deltas are numbers (not NaN, not Infinity).

- [ ] **10.4 Verify** all tests green. Commit: `feat(party): match end + ELO deltas + matchOver broadcast`

---

## Task 11: Disconnect + reconnect grace

**Files:** `party/src/matchRoom.ts` (extend), `party/src/timers.ts` (extend)

**Goal:** When a player disconnects, start a `DISCONNECT_GRACE_MS` timer. If they reconnect and
re-authenticate within grace, restore their state (send current snapshot + `yourTurn` if they're
active). If the grace expires, auto-fold their next action and mark them as sitting out (skip
their seat in future hands — for Unit 2, treat as permanently folded for the match).

**Steps:**

- [ ] **11.1 Disconnect timer map**

```ts
private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>(); // playerId → handle
```

- [ ] **11.2 Handle disconnect in `onClose`**

```ts
const connState = this.players.get(conn.id);
if (connState?.authed && connState.playerId) {
  const timer = setTimeout(() => {
    this.onDisconnectExpired(connState.playerId, connState.seatIndex!);
  }, DISCONNECT_GRACE_MS);
  this.disconnectTimers.set(connState.playerId, timer);
}
this.players.delete(conn.id);
```

Import `DISCONNECT_GRACE_MS` from `@poker/shared`.

- [ ] **11.3 `onDisconnectExpired(playerId, seatIndex)` method**

If this player is the active seat (i.e. `nextToAct(this.tableState) === seatIndex`), trigger
auto-fold via the same logic as `onTurnExpired`. Mark their seat as "sitting out" so future hands
skip them (add a `sittingOut: Set<number>` to room state; `startNextHand` busts sitting-out
players with 0-chip change, or simply never deals them in — simpler for Unit 2: remove them from
future hand seats, treating as busted without chip loss). Document the choice.

- [ ] **11.4 Reconnect handling**

In the `hello` handler, check if `playerId` matches an existing `playerId` in `this.players`
(from a still-connected session — duplicate) or in `disconnectTimers` (reconnect). If reconnect:
- Cancel the grace timer.
- Re-register the connection with the same `seatIndex`.
- Send `seated`, then current `snapshot`, then `yourTurn` if they're the active seat.

- [ ] **11.5 Tests**
  - Player disconnects → grace timer starts.
  - Player reconnects within grace → timer cancelled, state restored, `snapshot` sent.
  - Grace expires while player is active seat → auto-fold emitted, game continues.
  - Grace expires while player is not active seat → no immediate effect (they sit out next hand).

- [ ] **11.6 Verify** all tests green. Commit: `feat(party): disconnect/reconnect grace`

---

## Task 12: Bot runner

**Files:** `party/src/botRunner.ts` (create), `party/src/matchRoom.ts` (extend),
`party/src/matchRoom.test.ts` (extend)

**Goal:** Bot seats are identified by `id.startsWith("bot-")`. When `sendYourTurn` finds the
active seat is a bot, schedule `decide()` after a random think delay and dispatch the action
through the same code path as a human action (calling `applyAction` directly, since bots have no
connection).

**Steps:**

- [ ] **12.1 Create `party/src/botRunner.ts`**

```ts
import { decide, mulberry32, deriveSeed } from "@poker/shared";
import type { PublicView, ActionMask, Action } from "@poker/shared";

export function decideBotAction(
  view: PublicView,
  holeCards: [number, number],
  mask: ActionMask,
  rng: () => number
): Action {
  return decide(view, holeCards, mask, rng);
}

export function botThinkDelayMs(rng: () => number, minMs: number, maxMs: number): number {
  return minMs + Math.floor(rng() * (maxMs - minMs));
}
```

- [ ] **12.2 Bot RNG** — each bot seat gets its own `mulberry32` instance seeded from the deck seed:

```ts
// In MatchRoom, store per-seat RNG:
private seatRngs: Array<(() => number) | null> = [];

// In startMatch, after creating deck:
this.seatRngs = Array.from({ length: TABLE_SIZE }, (_, i) => {
  return mulberry32(deriveSeed(seed, `bot-${i}`));
});
```

- [ ] **12.3 Modify `sendYourTurn`** to detect bot seats:

```ts
const seatId = this.tableState!.seats[seatIdx]?.id;
const isBot = seatId?.startsWith("bot-") ?? false;

if (isBot) {
  const rng = this.seatRngs[seatIdx] ?? mulberry32(0);
  const delay = botThinkDelayMs(rng, BOT_THINK_MIN_MS, BOT_THINK_MAX_MS);
  setTimeout(() => this.executeBotAction(seatIdx), delay);
} else {
  // ... send yourTurn to human conn, start turn timer
}
```

Import `BOT_THINK_MIN_MS`, `BOT_THINK_MAX_MS` from `@poker/shared`.

- [ ] **12.4 `executeBotAction(seatIdx)` method**

```ts
private executeBotAction(seatIdx: number): void {
  if (!this.tableState || this.tableState.street === "complete") return;
  if (nextToAct(this.tableState) !== seatIdx) return; // seat changed (shouldn't happen)

  const seat = this.tableState.seats[seatIdx];
  if (!seat?.holeCards) return;

  const rng = this.seatRngs[seatIdx] ?? mulberry32(0);
  const view = redactFor(seat.id, this.tableState);
  const mask = legalActions(this.tableState, seatIdx);
  const action = decideBotAction(view, seat.holeCards, mask, rng);

  const { state, events } = applyAction(this.tableState, action);
  this.tableState = state;
  for (const event of events) this.party.broadcast(encode({ t: "event", event }));
  this.broadcastSnapshots();

  if (this.tableState.street === "complete") {
    this.onHandComplete();
  } else {
    this.sendYourTurn();
  }
}
```

- [ ] **12.5 Fill bot seats in `startMatch`**

The `startMatch` roster logic (Task 4) already fills unfilled seats with `bot-${i}`. Confirm
that when fewer than `TABLE_SIZE` humans are connected, remaining seats get `id: "bot-${i}"`.
For unit testing, it's valid to start with 0 humans and all bots.

- [ ] **12.6 Tests**
  - Bot seat at `toAct` → `executeBotAction` called after delay (use `vi.useFakeTimers()`).
  - Bot action dispatched → snapshots broadcast, game continues.
  - Bot uses `decide()` — mock `decide` in tests to return deterministic action, verify it was called with correct `view`, `holeCards`, `mask`.
  - Turn timer is NOT started for bot seats.

- [ ] **12.7 Verify** all tests green. Commit: `feat(party): bot runner — decide() + think delay`

---

## Task 13: Integration smoke test — full match simulation

**Files:** `party/src/matchRoom.test.ts` (extend)

**Goal:** End-to-end test of a full match using one human + five bots. Verify chip conservation
across the entire match, that `matchOver` is broadcast with valid place assignments, and that ELO
deltas are all finite numbers summing to approximately zero (they won't be exactly zero with
uniform K, but should be close).

**Steps:**

- [ ] **13.1 Match harness**

Build a helper that:
1. Creates a mock `Party.Party` with `broadcast` captured, `connections` iterable, and
   `env = {}` (dev mode).
2. Instantiates `new MatchRoom(party)`.
3. Connects one human with `onConnect` → sends `hello` with `"dev:human-0"`.
4. Sends `startMatch` dev message to trigger `startMatch()`.
5. Intercepts `yourTurn` messages; if the seat is human, responds with a legal action (always
   call/check for simplicity); bots run automatically via the bot runner.
6. Runs until `matchOver` is broadcast or a timeout (use `vi.useFakeTimers()` advancing clock).

- [ ] **13.2 Assertions**
  - `matchOver` is received.
  - `finishPlaceById` contains all 6 seat IDs with distinct places 1–6.
  - `eloDeltas` contains all 6 seat IDs with finite non-NaN numbers.
  - **Chip conservation:** at every `snapshot` received, sum of all seat `stack` values equals
    `TABLE_SIZE * STARTING_STACK`. (Verify this across at least 3 consecutive snapshots.)

- [ ] **13.3 Verify** all tests green (including Unit 1 gates — `npm test` at root).
  Commit: `test(party): integration smoke test — full match chip conservation + matchOver`

---

## Task 14: Typecheck + lint cleanup + CLAUDE.md update

**Files:** `CLAUDE.md` (update), misc lint fixes

**Goal:** Final cleanup — all 14 tasks' code is clean, `npm run typecheck` and `npm run lint`
pass, and `CLAUDE.md` reflects the new modules.

**Steps:**

- [ ] **14.1 Run `npm run typecheck`** — fix all errors.
- [ ] **14.2 Run `npm run lint`** — fix all warnings/errors.
- [ ] **14.3 Update `CLAUDE.md`:**
  - Change `party/` workspace status from "placeholder" to "Build Unit 2 complete".
  - Add `party/src` module map table:

    | File | Role |
    |---|---|
    | `matchRoom.ts` | `Party.Server` — full match lifecycle |
    | `auth.ts` | `verifyJwt`, `parseDevToken` |
    | `timers.ts` | `TurnTimer` |
    | `botRunner.ts` | `decideBotAction`, `botThinkDelayMs` |

  - Add "Next unit" line: Build Unit 3 — Supabase schema, RLS, `report-match` edge function,
    real ELO persistence, player profiles.
  - Note any new `constants.ts` entries added in this unit.
  - Note any new `ServerMsg` / `ClientMsg` types added to `protocol.ts`.
- [ ] **14.4 Run `npm test`** one final time — all suites green.
- [ ] **14.5 Commit:** `chore(party): typecheck + lint + CLAUDE.md — Build Unit 2 complete`

---

## Definition of Done

- `npm test` green across all workspaces (existing Unit 1 gates must still pass).
- `npm run typecheck` clean.
- `npm run lint` clean.
- `npx partykit dev` starts without errors (TypeScript compiles).
- Integration smoke test (Task 13) passes: chip conservation verified, `matchOver` received.
- `CLAUDE.md` updated with new module map and next-unit pointer.
