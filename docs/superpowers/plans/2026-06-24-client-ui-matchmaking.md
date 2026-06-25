# Build Unit 4: Client UI + Matchmaking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React/Vite client (Auth → Lobby → Game) and a PartyKit matchmaking "lobby" party, plus the minimal `MatchRoom`/protocol changes (roster provisioning + a match-clock message) needed to wire them together.

**Architecture:** A new singleton `lobby` PartyKit party runs an expanding-rating-window matchmaker; when it forms a table it provisions a `MatchRoom` over the cross-party HTTP API and sends matched players a `matchFound`. `MatchRoom` gains a `/provision` `onRequest` handler, roster-aware start with bot-fill, and a `matchInfo` broadcast. The client is a Vite SPA whose pure cores (`matchReducer`, `viewHelpers`, `lobbyReducer`) are unit-tested; React components render the server's redacted `PublicView` and send intent only.

**Tech Stack:** TypeScript (strict + `noUncheckedIndexedAccess`), React 18, Vite 5, `partysocket`, `@supabase/supabase-js` v2, PartyKit, Vitest.

## Global Constraints

- All poker-numeric values come from `shared/src/constants.ts` — import, never hardcode (`MATCH_FORMATS`, `STARTING_STACK`, `TABLE_SIZE`, `RANK_TIERS`/`rankForRating`, `RANKED_MIN_ONLINE`, `QUEUE_MATCH_INTERVAL_MS`, `RATING_WINDOW_INITIAL`, `RATING_WINDOW_GROWTH_PER_SEC`, `BOT_FILL_WAIT_MS`, `DEFAULT_FORMAT`, `ELO_DEFAULT_RATING`).
- Relative imports end in `.js` in TS source (even though sources are `.ts`/`.tsx`).
- TypeScript strict + `noUncheckedIndexedAccess`. Guard `T | undefined` from index access; `!` only when provably in-bounds.
- `Action.amount` is **raise-TO** (total committed this street), not raise-by. The field is `Action.seat`, not `seatIndex`.
- Server-authoritative: client sends intent only; opponent hole cards arrive as `null` (redacted server-side).
- Bot seat IDs start with `"bot-"`.
- Dev mode (client): when `VITE_PARTYKIT_HOST` starts with `localhost`, send the JWT as `dev:<userId>` (consumed by `parseDevToken`). Dev mode (server): `SUPABASE_JWT_SECRET` empty.
- `verbatimModuleSyntax` is on — type-only imports must use `import type`.
- `npm test`, `npm run typecheck`, `npm run lint` must all stay green.

---

### Task 1: Protocol additions (lobby messages + matchInfo)

**Files:**
- Modify: `shared/src/protocol.ts`
- Test: `shared/src/protocol.test.ts` (create)

**Interfaces:**
- Produces (added to `ClientMsg`): `{ t: "enqueue"; rating: number; format: string }`, `{ t: "leave" }`
- Produces (added to `ServerMsg`): `{ t: "matchInfo"; format: string; matchStartMs: number; matchDurationMs: number }`, `{ t: "queueStatus"; waiting: number; position: number; etaSec: number }`, `{ t: "matchFound"; roomId: string; format: string }`

- [ ] **Step 1: Write the failing test**

Create `shared/src/protocol.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { encode, decode } from "./protocol.js";
import type { ClientMsg, ServerMsg } from "./protocol.js";

describe("protocol: lobby + matchInfo messages", () => {
  it("round-trips an enqueue client message", () => {
    const msg: ClientMsg = { t: "enqueue", rating: 412, format: "turbo" };
    const back = decode<ClientMsg>(encode(msg));
    expect(back).toEqual(msg);
  });

  it("round-trips a leave client message", () => {
    const msg: ClientMsg = { t: "leave" };
    expect(decode<ClientMsg>(encode(msg))).toEqual(msg);
  });

  it("round-trips a matchInfo server message", () => {
    const msg: ServerMsg = {
      t: "matchInfo",
      format: "turbo",
      matchStartMs: 1000,
      matchDurationMs: 600000,
    };
    expect(decode<ServerMsg>(encode(msg))).toEqual(msg);
  });

  it("round-trips queueStatus and matchFound", () => {
    const status: ServerMsg = { t: "queueStatus", waiting: 3, position: 1, etaSec: 12 };
    const found: ServerMsg = { t: "matchFound", roomId: "ABC123", format: "turbo" };
    expect(decode<ServerMsg>(encode(status))).toEqual(status);
    expect(decode<ServerMsg>(encode(found))).toEqual(found);
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npm test -- shared/src/protocol.test.ts`
Expected: FAIL — the new message variants are not assignable (TS) / file under test lacks them.

- [ ] **Step 3: Add the message variants**

In `shared/src/protocol.ts`, extend the two unions. Replace the `ClientMsg` type with:

```typescript
export type ClientMsg =
  | { t: "hello"; jwt: string }
  | { t: "action"; seat: number; action: "fold" | "check" | "call" | "raise"; amount?: number }
  | { t: "sitOut" }
  | { t: "ping"; ts: number }
  | { t: "startMatch" }
  | { t: "enqueue"; rating: number; format: string }
  | { t: "leave" };
```

Replace the `ServerMsg` type with:

```typescript
export type ServerMsg =
  | { t: "seated"; seatIndex: number; playerId: string }
  | { t: "dealPrivate"; holeCards: [number, number] }
  | { t: "snapshot"; view: unknown }
  | { t: "event"; event: GameEvent }
  | { t: "yourTurn"; mask: ActionMask; deadlineTs: number }
  | { t: "timebankUsed"; seatIdx: number; remainingMs: number }
  | { t: "matchOver"; finishPlaceById: Record<string, number>; eloDeltas: Record<string, number> }
  | { t: "matchInfo"; format: string; matchStartMs: number; matchDurationMs: number }
  | { t: "queueStatus"; waiting: number; position: number; etaSec: number }
  | { t: "matchFound"; roomId: string; format: string }
  | { t: "error"; message: string };
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npm test -- shared/src/protocol.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add shared/src/protocol.ts shared/src/protocol.test.ts
git commit -m "feat(protocol): lobby messages + matchInfo server message"
```

---

### Task 2: Pure matchmaker core (`formMatches`)

**Files:**
- Create: `party/src/matchmaker.ts`
- Test: `party/src/matchmaker.test.ts`

**Interfaces:**
- Produces:
  - `interface Waiter { playerId: string; rating: number; format: string; enqueuedAt: number }`
  - `interface FormedMatch { format: string; humanIds: string[] }`
  - `function formMatches(waiters: Waiter[], now: number, onlineCount: number): { matches: FormedMatch[]; matchedIds: Set<string> }`
  - `function botFillEtaSec(waiter: Waiter, now: number): number`

- [ ] **Step 1: Write the failing test**

Create `party/src/matchmaker.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formMatches, botFillEtaSec } from "./matchmaker.js";
import type { Waiter } from "./matchmaker.js";
import {
  TABLE_SIZE,
  RANKED_MIN_ONLINE,
  BOT_FILL_WAIT_MS,
} from "@poker/shared";

const T0 = 1_000_000;
function w(id: string, rating: number, ageMs = 0, format = "turbo"): Waiter {
  return { playerId: id, rating, format, enqueuedAt: T0 - ageMs };
}

describe("formMatches", () => {
  it("forms a full human table when TABLE_SIZE compatible players wait", () => {
    const waiters = Array.from({ length: TABLE_SIZE }, (_, i) => w(`p${i}`, 400 + i));
    const { matches, matchedIds } = formMatches(waiters, T0, RANKED_MIN_ONLINE);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.humanIds).toHaveLength(TABLE_SIZE);
    expect(matchedIds.size).toBe(TABLE_SIZE);
  });

  it("does not form a match for fresh sub-table waiters when enough are online", () => {
    const waiters = [w("a", 400), w("b", 410), w("c", 420)];
    const { matches } = formMatches(waiters, T0, RANKED_MIN_ONLINE);
    expect(matches).toHaveLength(0);
  });

  it("bot-fills after BOT_FILL_WAIT_MS elapses for the oldest waiter", () => {
    const waiters = [w("a", 400, BOT_FILL_WAIT_MS + 1), w("b", 410, 500), w("c", 420, 500)];
    const { matches } = formMatches(waiters, T0, RANKED_MIN_ONLINE);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.humanIds).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(matches[0]!.humanIds.length).toBeLessThanOrEqual(TABLE_SIZE);
  });

  it("bot-fills immediately when fewer than RANKED_MIN_ONLINE are online", () => {
    const waiters = [w("a", 400)];
    const { matches } = formMatches(waiters, T0, RANKED_MIN_ONLINE - 1);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.humanIds).toEqual(["a"]);
  });

  it("keeps far-apart ratings separate while windows are small, groups them once windows grow", () => {
    // ratings 400 and 900 — far apart. Fresh: not grouped. Old enough: grouped (window expands).
    const fresh = [w("a", 400), w("b", 900)];
    expect(formMatches(fresh, T0, RANKED_MIN_ONLINE).matches).toHaveLength(0);

    const old = [w("a", 400, BOT_FILL_WAIT_MS + 1), w("b", 900, BOT_FILL_WAIT_MS + 1)];
    const { matches } = formMatches(old, T0, RANKED_MIN_ONLINE);
    // window after long wait is large enough to overlap; both land in one bot-filled match
    expect(matches).toHaveLength(1);
    expect(matches[0]!.humanIds).toEqual(expect.arrayContaining(["a", "b"]));
  });

  it("does not mix formats", () => {
    const waiters = [
      ...Array.from({ length: TABLE_SIZE }, (_, i) => w(`r${i}`, 400, BOT_FILL_WAIT_MS + 1, "rapid")),
      w("t0", 400, BOT_FILL_WAIT_MS + 1, "turbo"),
    ];
    const { matches } = formMatches(waiters, T0, RANKED_MIN_ONLINE);
    const formats = matches.map((m) => m.format).sort();
    expect(formats).toEqual(["rapid", "turbo"]);
    const rapid = matches.find((m) => m.format === "rapid")!;
    expect(rapid.humanIds).toHaveLength(TABLE_SIZE);
  });
});

describe("botFillEtaSec", () => {
  it("counts down toward the bot-fill deadline", () => {
    expect(botFillEtaSec(w("a", 400, 0), T0)).toBe(Math.ceil(BOT_FILL_WAIT_MS / 1000));
    expect(botFillEtaSec(w("a", 400, BOT_FILL_WAIT_MS), T0)).toBe(0);
    expect(botFillEtaSec(w("a", 400, BOT_FILL_WAIT_MS + 5000), T0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npm test -- party/src/matchmaker.test.ts`
Expected: FAIL — `./matchmaker.js` does not exist.

- [ ] **Step 3: Implement the matchmaker**

Create `party/src/matchmaker.ts`:

```typescript
import {
  TABLE_SIZE,
  RANKED_MIN_ONLINE,
  RATING_WINDOW_INITIAL,
  RATING_WINDOW_GROWTH_PER_SEC,
  BOT_FILL_WAIT_MS,
} from "@poker/shared";

export interface Waiter {
  playerId: string;
  rating: number;
  format: string;
  enqueuedAt: number; // ms epoch
}

export interface FormedMatch {
  format: string;
  humanIds: string[]; // 1..TABLE_SIZE humans; MatchRoom fills the rest with bots
}

/** Acceptance half-width around a waiter's rating, expanding with wait time. */
function windowFor(waiter: Waiter, now: number): number {
  const waitSec = Math.max(0, (now - waiter.enqueuedAt) / 1000);
  return RATING_WINDOW_INITIAL + RATING_WINDOW_GROWTH_PER_SEC * waitSec;
}

/** True when candidate's rating mutually overlaps every member's expanding window. */
function fits(candidate: Waiter, members: Waiter[], now: number): boolean {
  const cw = windowFor(candidate, now);
  for (const m of members) {
    const limit = Math.min(cw, windowFor(m, now));
    if (Math.abs(candidate.rating - m.rating) > limit) return false;
  }
  return true;
}

/** Seconds until this waiter becomes eligible for a bot-filled match (0 once elapsed). */
export function botFillEtaSec(waiter: Waiter, now: number): number {
  const waited = now - waiter.enqueuedAt;
  return Math.max(0, Math.ceil((BOT_FILL_WAIT_MS - waited) / 1000));
}

/**
 * Greedy expanding-window matchmaker. Groups oldest-first; emits a match when a group
 * reaches TABLE_SIZE, or when the seed is bot-fill eligible (waited >= BOT_FILL_WAIT_MS,
 * or fewer than RANKED_MIN_ONLINE players online) and the group has >= 1 human.
 */
export function formMatches(
  waiters: Waiter[],
  now: number,
  onlineCount: number,
): { matches: FormedMatch[]; matchedIds: Set<string> } {
  const matches: FormedMatch[] = [];
  const matchedIds = new Set<string>();

  // Bucket by format, each sorted oldest-first.
  const buckets = new Map<string, Waiter[]>();
  for (const wtr of waiters) {
    const list = buckets.get(wtr.format) ?? [];
    list.push(wtr);
    buckets.set(wtr.format, list);
  }

  for (const [format, listRaw] of buckets) {
    const list = [...listRaw].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    const used = new Set<string>();

    for (const seed of list) {
      if (used.has(seed.playerId)) continue;
      const group: Waiter[] = [seed];

      for (const cand of list) {
        if (group.length >= TABLE_SIZE) break;
        if (cand.playerId === seed.playerId || used.has(cand.playerId)) continue;
        if (fits(cand, group, now)) group.push(cand);
      }

      const full = group.length >= TABLE_SIZE;
      const botFillEligible =
        now - seed.enqueuedAt >= BOT_FILL_WAIT_MS || onlineCount < RANKED_MIN_ONLINE;

      if (full || botFillEligible) {
        for (const g of group) {
          used.add(g.playerId);
          matchedIds.add(g.playerId);
        }
        matches.push({ format, humanIds: group.map((g) => g.playerId) });
      }
    }
  }

  return { matches, matchedIds };
}
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npm test -- party/src/matchmaker.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add party/src/matchmaker.ts party/src/matchmaker.test.ts
git commit -m "feat(lobby): pure expanding-window matchmaker core"
```

---

### Task 3: Lobby party (queue wiring + provisioning)

**Files:**
- Create: `party/src/lobby.ts`
- Test: `party/src/lobby.test.ts`

**Interfaces:**
- Consumes: `formMatches`, `botFillEtaSec`, `Waiter` from Task 2; `verifyJwt`, `parseDevToken` from `./auth.js`; `makeRoomCode` from `@poker/shared`.
- Produces (class `Lobby implements Party.Server`): handles `hello`/`enqueue`/`leave`; runs a ticker; provisions matches via `this.party.context.parties.main.get(roomId).fetch(...)`; sends `queueStatus`/`matchFound`. Exposes test getters `waiterCount`, `runMatchTick()`.

- [ ] **Step 1: Write the failing test**

Create `party/src/lobby.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import Lobby from "./lobby.js";
import { encode } from "@poker/shared";
import type * as Party from "partykit/server";

interface FakeConn {
  id: string;
  sent: string[];
  send(m: string): void;
  close(): void;
}
function makeConn(id: string): FakeConn {
  return { id, sent: [], send(m) { this.sent.push(m); }, close() {} };
}

function makeLobby(provisioned: Array<{ roomId: string; body: unknown }>): {
  lobby: Lobby;
  conns: Map<string, FakeConn>;
} {
  const conns = new Map<string, FakeConn>();
  const party = {
    id: "lobby",
    env: {}, // dev mode (no SUPABASE_JWT_SECRET)
    getConnections: () => conns.values(),
    broadcast: () => {},
    context: {
      parties: {
        main: {
          get: (roomId: string) => ({
            fetch: async (init: { body: string }) => {
              provisioned.push({ roomId, body: JSON.parse(init.body) });
              return new Response("OK");
            },
          }),
        },
      },
    },
  } as unknown as Party.Party;
  const lobby = new Lobby(party);
  return { lobby, conns };
}

async function connect(lobby: Lobby, conns: Map<string, FakeConn>, id: string): Promise<FakeConn> {
  const conn = makeConn(id);
  conns.set(id, conn);
  lobby.onConnect(conn as unknown as Party.Connection);
  await lobby.onMessage(encode({ t: "hello", jwt: `dev:${id}` }), conn as unknown as Party.Connection);
  return conn;
}

describe("Lobby party", () => {
  it("authenticates a dev hello and enqueues a player", async () => {
    const { lobby, conns } = makeLobby([]);
    const conn = await connect(lobby, conns, "user-1");
    await lobby.onMessage(encode({ t: "enqueue", rating: 400, format: "turbo" }), conn as unknown as Party.Connection);
    expect(lobby.waiterCount).toBe(1);
  });

  it("removes a player from the queue on leave", async () => {
    const { lobby, conns } = makeLobby([]);
    const conn = await connect(lobby, conns, "user-1");
    await lobby.onMessage(encode({ t: "enqueue", rating: 400, format: "turbo" }), conn as unknown as Party.Connection);
    await lobby.onMessage(encode({ t: "leave" }), conn as unknown as Party.Connection);
    expect(lobby.waiterCount).toBe(0);
  });

  it("provisions a MatchRoom and sends matchFound on a bot-filled tick", async () => {
    const provisioned: Array<{ roomId: string; body: unknown }> = [];
    const { lobby, conns } = makeLobby(provisioned);
    const conn = await connect(lobby, conns, "user-1");
    await lobby.onMessage(encode({ t: "enqueue", rating: 400, format: "turbo" }), conn as unknown as Party.Connection);

    // Fewer than RANKED_MIN_ONLINE online → bot-fill eligible immediately.
    await lobby.runMatchTick();

    expect(provisioned).toHaveLength(1);
    const body = provisioned[0]!.body as { format: string; humanIds: string[] };
    expect(body.format).toBe("turbo");
    expect(body.humanIds).toEqual(["user-1"]);

    const found = conn.sent.map((s) => JSON.parse(s)).find((m) => m.t === "matchFound");
    expect(found).toBeDefined();
    expect(found.roomId).toBe(provisioned[0]!.roomId);
    expect(lobby.waiterCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npm test -- party/src/lobby.test.ts`
Expected: FAIL — `./lobby.js` does not exist.

- [ ] **Step 3: Implement the lobby party**

Create `party/src/lobby.ts`:

```typescript
import type * as Party from "partykit/server";
import {
  encode,
  decode,
  makeRoomCode,
  QUEUE_MATCH_INTERVAL_MS,
} from "@poker/shared";
import { verifyJwt, parseDevToken } from "./auth.js";
import { formMatches, botFillEtaSec } from "./matchmaker.js";
import type { Waiter } from "./matchmaker.js";

type ConnState = { playerId: string; authed: boolean };

export default class Lobby implements Party.Server {
  static options = { hibernate: false } satisfies Party.ServerOptions;

  private conns = new Map<string, ConnState>(); // conn.id → state
  private waiters = new Map<string, Waiter & { connId: string }>(); // playerId → waiter
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(readonly party: Party.Party) {}

  onConnect(conn: Party.Connection): void {
    this.conns.set(conn.id, { playerId: "", authed: false });
  }

  onClose(conn: Party.Connection): void {
    const state = this.conns.get(conn.id);
    if (state?.playerId) this.waiters.delete(state.playerId);
    this.conns.delete(conn.id);
    if (this.waiters.size === 0) this.stopTicker();
  }

  async onMessage(raw: string | ArrayBuffer, sender: Party.Connection): Promise<void> {
    let msg: { t: string; jwt?: string; rating?: number; format?: string };
    try {
      msg = decode(raw as string);
    } catch {
      sender.send(encode({ t: "error", message: "invalid_message" }));
      sender.close();
      return;
    }

    const state = this.conns.get(sender.id);
    if (!state) return;

    if (msg.t === "hello") {
      if (state.authed) return;
      const playerId = await this.authenticate(msg.jwt);
      if (!playerId) {
        sender.send(encode({ t: "error", message: "auth_failed" }));
        sender.close();
        return;
      }
      state.playerId = playerId;
      state.authed = true;
      return;
    }

    if (!state.authed) {
      sender.send(encode({ t: "error", message: "not_authed" }));
      return;
    }

    if (msg.t === "enqueue") {
      const rating = typeof msg.rating === "number" ? msg.rating : null;
      const format = typeof msg.format === "string" ? msg.format : null;
      if (rating === null || format === null) {
        sender.send(encode({ t: "error", message: "bad_enqueue" }));
        return;
      }
      this.waiters.set(state.playerId, {
        playerId: state.playerId,
        rating,
        format,
        enqueuedAt: Date.now(),
        connId: sender.id,
      });
      this.startTicker();
      this.broadcastQueueStatus();
      return;
    }

    if (msg.t === "leave") {
      this.waiters.delete(state.playerId);
      this.broadcastQueueStatus();
      if (this.waiters.size === 0) this.stopTicker();
      return;
    }
  }

  private async authenticate(jwt: string | undefined): Promise<string | null> {
    if (typeof jwt !== "string") return null;
    const secret = this.party.env["SUPABASE_JWT_SECRET"] as string | undefined;
    try {
      if (!secret || secret === "") {
        const dev = parseDevToken(jwt);
        return dev ? dev.sub : null;
      }
      const auth = await verifyJwt(jwt, secret);
      return auth.sub;
    } catch {
      return null;
    }
  }

  private startTicker(): void {
    if (this.ticker !== null) return;
    this.ticker = setInterval(() => void this.runMatchTick(), QUEUE_MATCH_INTERVAL_MS);
  }

  private stopTicker(): void {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  /** One matchmaking pass — exposed for tests. */
  async runMatchTick(): Promise<void> {
    if (this.waiters.size === 0) return;
    const now = Date.now();
    const onlineCount = this.waiters.size;
    const { matches, matchedIds } = formMatches([...this.waiters.values()], now, onlineCount);

    for (const match of matches) {
      const roomId = makeRoomCode();
      try {
        await this.party.context.parties.main.get(roomId).fetch({
          method: "POST",
          body: JSON.stringify({ format: match.format, humanIds: match.humanIds }),
        });
      } catch {
        continue; // provisioning failed — leave players queued for the next tick
      }
      for (const playerId of match.humanIds) {
        const waiter = this.waiters.get(playerId);
        if (waiter) this.sendTo(waiter.connId, { t: "matchFound", roomId, format: match.format });
      }
    }

    for (const id of matchedIds) this.waiters.delete(id);
    if (this.waiters.size === 0) this.stopTicker();
    else this.broadcastQueueStatus();
  }

  private broadcastQueueStatus(): void {
    const now = Date.now();
    // position within each format bucket, oldest-first
    const byFormat = new Map<string, Array<Waiter & { connId: string }>>();
    for (const w of this.waiters.values()) {
      const list = byFormat.get(w.format) ?? [];
      list.push(w);
      byFormat.set(w.format, list);
    }
    for (const list of byFormat.values()) {
      list.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
      list.forEach((w, i) => {
        this.sendTo(w.connId, {
          t: "queueStatus",
          waiting: list.length,
          position: i + 1,
          etaSec: botFillEtaSec(w, now),
        });
      });
    }
  }

  private sendTo(connId: string, msg: Parameters<typeof encode>[0]): void {
    for (const c of this.party.getConnections()) {
      if (c.id === connId) {
        c.send(encode(msg));
        return;
      }
    }
  }

  /** Exposed for tests. */
  get waiterCount(): number {
    return this.waiters.size;
  }
}
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npm test -- party/src/lobby.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

```bash
git add party/src/lobby.ts party/src/lobby.test.ts
git commit -m "feat(lobby): matchmaking party with queue, ticker, and provisioning"
```

---

### Task 4: MatchRoom provisioning + matchInfo

**Files:**
- Modify: `party/src/matchRoom.ts`
- Modify: `party/src/matchRoom.test.ts` (append new describe block)

**Interfaces:**
- Consumes: `MATCH_FORMATS` (already imported), `DISCONNECT_GRACE_MS` (already imported).
- Produces: `onRequest(req)` accepting `POST { format, humanIds }`; roster-aware `startMatch` (bot-fills unseated humans); `matchInfo` broadcast on start + reconnect. New test getters `isProvisioned`, `expectedHumans`.

- [ ] **Step 1: Write the failing tests**

Append to `party/src/matchRoom.test.ts`:

```typescript
// ---------- Task: provisioning + matchInfo ----------

describe("MatchRoom provisioning + matchInfo", () => {
  function makeProvisionRoom(env: Record<string, string> = {}): {
    room: MatchRoom;
    broadcasts: string[];
    conns: Map<string, { id: string; sent: string[]; send(m: string): void; close(): void }>;
  } {
    const broadcasts: string[] = [];
    const conns = new Map<string, { id: string; sent: string[]; send(m: string): void; close(): void }>();
    const party = {
      id: "room-1",
      env,
      getConnections: () => conns.values(),
      broadcast: (m: string) => { broadcasts.push(m); },
    } as unknown as Party.Party;
    return { room: new MatchRoom(party), broadcasts, conns };
  }

  function req(body: unknown): Party.Request {
    return { method: "POST", json: async () => body } as unknown as Party.Request;
  }

  it("stores the expected roster + format from a provision request", async () => {
    const { room } = makeProvisionRoom();
    await (room as unknown as { onRequest(r: Party.Request): Promise<Response> })
      .onRequest(req({ format: "rapid", humanIds: ["h1", "h2"] }));
    expect((room as unknown as { isProvisioned: boolean }).isProvisioned).toBe(true);
    expect([...(room as unknown as { expectedHumans: Set<string> }).expectedHumans]).toEqual(["h1", "h2"]);
  });

  it("starts the match (bot-filling) when all expected humans are seated", async () => {
    const { room, conns } = makeProvisionRoom();
    await (room as unknown as { onRequest(r: Party.Request): Promise<Response> })
      .onRequest(req({ format: "turbo", humanIds: ["h1"] }));

    const conn = { id: "c1", sent: [] as string[], send(m: string) { this.sent.push(m); }, close() {} };
    conns.set("c1", conn);
    room.onConnect(conn as unknown as Party.Connection);
    await room.onMessage(encode({ t: "hello", jwt: "dev:h1" }), conn as unknown as Party.Connection);

    expect(room.currentTableState).not.toBeNull();
    expect(room.currentTableState!.format).toBe("turbo");
  });

  it("broadcasts matchInfo on match start", async () => {
    const { room, broadcasts, conns } = makeProvisionRoom();
    await (room as unknown as { onRequest(r: Party.Request): Promise<Response> })
      .onRequest(req({ format: "turbo", humanIds: ["h1"] }));
    const conn = { id: "c1", sent: [] as string[], send(m: string) { this.sent.push(m); }, close() {} };
    conns.set("c1", conn);
    room.onConnect(conn as unknown as Party.Connection);
    await room.onMessage(encode({ t: "hello", jwt: "dev:h1" }), conn as unknown as Party.Connection);

    const info = broadcasts.map((b) => JSON.parse(b)).find((m) => m.t === "matchInfo");
    expect(info).toBeDefined();
    expect(info.format).toBe("turbo");
    expect(info.matchDurationMs).toBe(MATCH_FORMATS["turbo"]!.matchDurationMs);
    expect(typeof info.matchStartMs).toBe("number");
  });

  it("rejects a player not on the provisioned roster", async () => {
    const { room, conns } = makeProvisionRoom();
    await (room as unknown as { onRequest(r: Party.Request): Promise<Response> })
      .onRequest(req({ format: "turbo", humanIds: ["h1"] }));
    const conn = { id: "c2", sent: [] as string[], send(m: string) { this.sent.push(m); }, close() {} };
    conns.set("c2", conn);
    room.onConnect(conn as unknown as Party.Connection);
    await room.onMessage(encode({ t: "hello", jwt: "dev:stranger" }), conn as unknown as Party.Connection);

    const err = conn.sent.map((s) => JSON.parse(s)).find((m) => m.t === "error");
    expect(err?.message).toBe("not_invited");
    expect(room.currentTableState).toBeNull();
  });
});
```

> The test file already imports `MatchRoom`, `encode`, `MATCH_FORMATS`, and `Party`. If `MATCH_FORMATS` is not yet imported at the top of `matchRoom.test.ts`, add it to the existing `@poker/shared` import.

- [ ] **Step 2: Run the tests — confirm they fail**

Run: `npm test -- party/src/matchRoom.test.ts`
Expected: FAIL — `onRequest`, `isProvisioned`, `expectedHumans`, roster start, and `matchInfo` do not exist.

- [ ] **Step 3: Add provisioning fields + onRequest**

In `party/src/matchRoom.ts`, add these private fields inside the class (next to the other private fields near the top of the class body, after `private botRngSeed = 0;`):

```typescript
  private provisioned = false;
  private provisionedFormat: string | null = null;
  private expectedHumanIds: Set<string> = new Set();
  private connectGraceTimer: ReturnType<typeof setTimeout> | null = null;
```

Add the `onRequest` method (place it just after the `constructor`):

```typescript
  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    if (this.provisioned || this.tableState !== null) return new Response("OK"); // idempotent
    let body: { format?: unknown; humanIds?: unknown };
    try {
      body = (await req.json()) as { format?: unknown; humanIds?: unknown };
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
    }
    const format = typeof body.format === "string" ? body.format : null;
    const humanIds = Array.isArray(body.humanIds)
      ? body.humanIds.filter((x): x is string => typeof x === "string")
      : null;
    if (!format || !humanIds || humanIds.length === 0) {
      return new Response(JSON.stringify({ error: "bad_roster" }), { status: 400 });
    }
    this.provisioned = true;
    this.provisionedFormat = format;
    this.expectedHumanIds = new Set(humanIds);
    // Start once every expected human connects, or bot-fill after the connect grace.
    this.connectGraceTimer = setTimeout(() => {
      this.connectGraceTimer = null;
      this.startMatch();
    }, DISCONNECT_GRACE_MS);
    return new Response("OK");
  }
```

- [ ] **Step 4: Enforce the roster + provisioned start in `onMessage`**

In the `hello` handling path of `onMessage`, in the **seat assignment (new connection)** branch, immediately after `playerId` is resolved and before assigning a seat, add the roster check. Find this block:

```typescript
    // Seat assignment (new connection, not a reconnect)
    const usedSeats = new Set(
```

Insert immediately before it:

```typescript
    // Provisioned rooms only admit invited humans.
    if (this.provisioned && !this.expectedHumanIds.has(playerId)) {
      sender.send(encode({ t: "error", message: "not_invited" }));
      sender.close();
      return;
    }

```

Then find the existing auto-start tail at the end of `onMessage`:

```typescript
    // Start match when all TABLE_SIZE seats are filled
    const authedCount = [...this.players.values()].filter((p) => p.authed).length;
    if (authedCount === TABLE_SIZE) {
      this.startMatch();
    }
```

Replace it with:

```typescript
    // Start match when the table is full, or (provisioned) when all invited humans are seated.
    const authedCount = [...this.players.values()].filter((p) => p.authed).length;
    if (this.provisioned) {
      const seatedExpected = [...this.players.values()].filter(
        (p) => p.authed && this.expectedHumanIds.has(p.playerId),
      ).length;
      if (seatedExpected >= this.expectedHumanIds.size) {
        if (this.connectGraceTimer !== null) {
          clearTimeout(this.connectGraceTimer);
          this.connectGraceTimer = null;
        }
        this.startMatch();
      }
    } else if (authedCount === TABLE_SIZE) {
      this.startMatch();
    }
```

- [ ] **Step 5: Use the provisioned format + broadcast matchInfo in `startMatch`**

In `startMatch()`, change the format line. Find:

```typescript
    const format = MATCH_FORMATS[DEFAULT_FORMAT]!;
```

Replace with:

```typescript
    const formatId = this.provisionedFormat ?? DEFAULT_FORMAT;
    const format = MATCH_FORMATS[formatId] ?? MATCH_FORMATS[DEFAULT_FORMAT]!;
```

Then find where `createHand` is called inside `startMatch` and change its `format` argument from `DEFAULT_FORMAT` to `formatId`. Find:

```typescript
      handNumber: this.handNumber,
      elapsedMs,
      format: DEFAULT_FORMAT,
    });
    this.handNumber++;
```

Replace with:

```typescript
      handNumber: this.handNumber,
      elapsedMs,
      format: formatId,
    });
    this.handNumber++;
```

Finally, at the very end of `startMatch()`, after `this.sendYourTurn();`, add the matchInfo broadcast:

```typescript
    this.party.broadcast(encode({
      t: "matchInfo",
      format: formatId,
      matchStartMs: this.matchStartMs,
      matchDurationMs: format.matchDurationMs,
    }));
```

- [ ] **Step 6: Send matchInfo on reconnect**

In `onMessage`, inside the reconnect branch, find where the snapshot is sent to the reconnecting player:

```typescript
      // Send current snapshot so the reconnecting player is up to date
      if (this.tableState) {
        const view = redactFor(playerId, this.tableState);
        sender.send(encode({ t: "snapshot", view }));
```

Insert immediately after the `sender.send(encode({ t: "snapshot", view }));` line:

```typescript
        const rFormat = this.tableState.format;
        const rFmt = MATCH_FORMATS[rFormat];
        if (rFmt) {
          sender.send(encode({
            t: "matchInfo",
            format: rFormat,
            matchStartMs: this.matchStartMs,
            matchDurationMs: rFmt.matchDurationMs,
          }));
        }
```

- [ ] **Step 7: Add test getters**

Add near the other test getters at the bottom of the class (e.g. after `get currentSeatRngs`):

```typescript
  /** Exposed for tests — provisioning status. */
  get isProvisioned(): boolean {
    return this.provisioned;
  }

  /** Exposed for tests — expected human roster. */
  get expectedHumans(): Set<string> {
    return this.expectedHumanIds;
  }
```

- [ ] **Step 8: Run the tests — confirm they pass**

Run: `npm test -- party/src/matchRoom.test.ts`
Expected: PASS — new block green, all prior tests still green.

- [ ] **Step 9: Full suite + typecheck + lint + commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

```bash
git add party/src/matchRoom.ts party/src/matchRoom.test.ts
git commit -m "feat(party): MatchRoom provisioning, roster-aware start, matchInfo broadcast"
```

---

### Task 5: Register the lobby party in partykit.json

**Files:**
- Modify: `partykit.json`

**Interfaces:**
- Produces: a `parties` entry mapping `lobby` → `party/src/lobby.ts` so clients can connect with `party: "lobby"`.

- [ ] **Step 1: Edit partykit.json**

Replace the contents of `partykit.json` with:

```json
{
  "name": "poker-elo",
  "main": "party/src/matchRoom.ts",
  "parties": {
    "lobby": "party/src/lobby.ts"
  },
  "compatibilityDate": "2024-11-01",
  "vars": {
    "SUPABASE_JWT_SECRET": "",
    "SUPABASE_URL": "",
    "SUPABASE_SERVICE_ROLE_KEY": ""
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck`
Expected: PASS.

```bash
git add partykit.json
git commit -m "chore(party): register lobby party in partykit.json"
```

---

### Task 6: Client scaffold (Vite + React + TS)

**Files:**
- Modify: `client/package.json`
- Create: `client/vite.config.ts`, `client/tsconfig.json`, `client/index.html`, `client/.env.example`, `client/.gitignore`
- Create: `client/src/main.tsx`, `client/src/index.css`, `client/src/App.tsx`
- Create: `client/src/lib/env.ts`, `client/src/lib/supabase.ts`
- Modify: `tsconfig.json` (root — add client reference)

**Interfaces:**
- Produces: a buildable Vite app shell; `lib/env.ts` exporting `PARTYKIT_HOST`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `isDevHost()`; `lib/supabase.ts` exporting a configured `supabase` client.

- [ ] **Step 1: Replace `client/package.json`**

```json
{
  "name": "@poker/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@poker/shared": "*",
    "@supabase/supabase-js": "^2.45.0",
    "partysocket": "^1.0.2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run from the repo root:
```bash
npm install
```
Expected: installs React, Vite, partysocket, supabase-js into the workspace. (`@poker/shared` resolves via the workspace.)

- [ ] **Step 3: Create `client/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./.tsbuild",
    "rootDir": "src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client", "vitest/globals"]
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 4: Add the client reference to the root `tsconfig.json`**

Replace the root `tsconfig.json` `references` array so it reads:

```json
  "references": [
    { "path": "./shared" },
    { "path": "./party" },
    { "path": "./client" }
  ],
```

- [ ] **Step 5: Create `client/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

- [ ] **Step 6: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PokerElo</title>
    <link rel="stylesheet" href="/src/index.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `client/src/index.css`**

```css
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: #0e1116;
  color: #e6e6e6;
}
button { font: inherit; cursor: pointer; }
input { font: inherit; }
```

- [ ] **Step 8: Create `client/.gitignore`**

```
node_modules
dist
.tsbuild
.env
.env.local
```

- [ ] **Step 9: Create `client/.env.example`**

```
VITE_PARTYKIT_HOST=localhost:1999
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 10: Create `client/src/lib/env.ts`**

```typescript
export const PARTYKIT_HOST: string = import.meta.env["VITE_PARTYKIT_HOST"] ?? "localhost:1999";
export const SUPABASE_URL: string = import.meta.env["VITE_SUPABASE_URL"] ?? "";
export const SUPABASE_ANON_KEY: string = import.meta.env["VITE_SUPABASE_ANON_KEY"] ?? "";

/** True when pointing at a local PartyKit dev server (use dev:<id> tokens). */
export function isDevHost(): boolean {
  return PARTYKIT_HOST.startsWith("localhost") || PARTYKIT_HOST.startsWith("127.0.0.1");
}
```

- [ ] **Step 11: Create `client/src/lib/supabase.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

- [ ] **Step 12: Create `client/src/App.tsx` (temporary shell)**

```tsx
export default function App() {
  return <div style={{ padding: 24 }}>PokerElo — client scaffold OK</div>;
}
```

- [ ] **Step 13: Create `client/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 14: Verify typecheck + build**

Run: `npm run typecheck`
Expected: PASS (client now part of the build graph).

Run: `npm run build --workspace @poker/client`
Expected: Vite produces `client/dist` with no errors.

- [ ] **Step 15: Commit**

```bash
git add client tsconfig.json package-lock.json
git commit -m "feat(client): Vite + React + TS scaffold, env + supabase libs"
```

---

### Task 7: viewHelpers (pure)

**Files:**
- Create: `client/src/game/viewHelpers.ts`
- Test: `client/src/game/viewHelpers.test.ts`

**Interfaces:**
- Produces:
  - `interface ButtonState { fold: boolean; check: boolean; call: boolean; raise: boolean; callAmount: number }`
  - `function maskToButtons(mask: ActionMask): ButtonState`
  - `function clampRaiseTo(value: number, mask: ActionMask): number`
  - `function blindLevelLabel(sb: number, bb: number, format: string): string`
  - `function formatCard(card: number): string`
  - `function formatChips(n: number): string`

- [ ] **Step 1: Write the failing test**

Create `client/src/game/viewHelpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { maskToButtons, clampRaiseTo, blindLevelLabel, formatCard, formatChips } from "./viewHelpers.js";
import type { ActionMask } from "@poker/shared";
import { MATCH_FORMATS, cardFromString } from "@poker/shared";

function mask(over: Partial<ActionMask> = {}): ActionMask {
  return {
    seat: 0, canFold: true, canCheck: false, canCall: true, callAmount: 20,
    canRaise: true, minRaiseTo: 40, maxRaiseTo: 200, ...over,
  };
}

describe("maskToButtons", () => {
  it("reflects the mask flags and call amount", () => {
    const b = maskToButtons(mask());
    expect(b).toEqual({ fold: true, check: false, call: true, raise: true, callAmount: 20 });
  });
  it("disables call/raise when the mask forbids them", () => {
    const b = maskToButtons(mask({ canCall: false, canRaise: false, canCheck: true, callAmount: 0 }));
    expect(b.call).toBe(false);
    expect(b.raise).toBe(false);
    expect(b.check).toBe(true);
  });
});

describe("clampRaiseTo", () => {
  it("clamps below the minimum up to minRaiseTo", () => {
    expect(clampRaiseTo(10, mask())).toBe(40);
  });
  it("clamps above the maximum down to maxRaiseTo", () => {
    expect(clampRaiseTo(9999, mask())).toBe(200);
  });
  it("passes an in-range value through", () => {
    expect(clampRaiseTo(120, mask())).toBe(120);
  });
});

describe("blindLevelLabel", () => {
  it("labels the current level by matching sb/bb against the format", () => {
    const lvl = MATCH_FORMATS["turbo"]!.blindLevels[2]!; // { sb: 20, bb: 40 }
    expect(blindLevelLabel(lvl.sb, lvl.bb, "turbo")).toBe("Level 3");
  });
  it("falls back when the blinds do not match a known level", () => {
    expect(blindLevelLabel(7, 13, "turbo")).toBe("Blinds 7/13");
  });
});

describe("formatCard", () => {
  it("formats a card int as its short string", () => {
    const c = cardFromString("As");
    expect(formatCard(c)).toBe("As");
  });
});

describe("formatChips", () => {
  it("renders a plain integer chip count", () => {
    expect(formatChips(1000)).toBe("1,000");
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npm test -- client/src/game/viewHelpers.test.ts`
Expected: FAIL — `./viewHelpers.js` does not exist.

- [ ] **Step 3: Implement `viewHelpers.ts`**

Create `client/src/game/viewHelpers.ts`:

```typescript
import type { ActionMask } from "@poker/shared";
import { MATCH_FORMATS, cardToString } from "@poker/shared";

export interface ButtonState {
  fold: boolean;
  check: boolean;
  call: boolean;
  raise: boolean;
  callAmount: number;
}

export function maskToButtons(mask: ActionMask): ButtonState {
  return {
    fold: mask.canFold,
    check: mask.canCheck,
    call: mask.canCall,
    raise: mask.canRaise,
    callAmount: mask.callAmount,
  };
}

/** Clamp a desired raise-TO total into the legal [minRaiseTo, maxRaiseTo] range. */
export function clampRaiseTo(value: number, mask: ActionMask): number {
  if (value < mask.minRaiseTo) return mask.minRaiseTo;
  if (value > mask.maxRaiseTo) return mask.maxRaiseTo;
  return Math.round(value);
}

/** Human label for the current blind level, derived from the format's blind ladder. */
export function blindLevelLabel(sb: number, bb: number, format: string): string {
  const fmt = MATCH_FORMATS[format];
  if (fmt) {
    const idx = fmt.blindLevels.findIndex((l) => l.sb === sb && l.bb === bb);
    if (idx >= 0) return `Level ${idx + 1}`;
  }
  return `Blinds ${sb}/${bb}`;
}

export function formatCard(card: number): string {
  return cardToString(card);
}

export function formatChips(n: number): string {
  return n.toLocaleString("en-US");
}
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npm test -- client/src/game/viewHelpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/game/viewHelpers.ts client/src/game/viewHelpers.test.ts
git commit -m "feat(client): pure view helpers (mask buttons, raise clamp, blind label, card fmt)"
```

---

### Task 8: matchReducer (pure)

**Files:**
- Create: `client/src/game/matchReducer.ts`
- Test: `client/src/game/matchReducer.test.ts`

**Interfaces:**
- Consumes: `ServerMsg`, `PublicView`, `ActionMask`, `GameEvent` types from `@poker/shared`.
- Produces:
  - `interface MatchUiState { ownSeat: number | null; ownHole: [number, number] | null; view: PublicView | null; matchInfo: { format: string; matchStartMs: number; matchDurationMs: number } | null; turn: { mask: ActionMask; deadlineTs: number } | null; timebankMs: number | null; result: { finishPlaceById: Record<string, number>; eloDeltas: Record<string, number> } | null; error: string | null; lastEvent: GameEvent | null }`
  - `const initialMatchState: MatchUiState`
  - `function matchReducer(state: MatchUiState, msg: ServerMsg): MatchUiState`

- [ ] **Step 1: Write the failing test**

Create `client/src/game/matchReducer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { matchReducer, initialMatchState } from "./matchReducer.js";
import type { MatchUiState } from "./matchReducer.js";
import type { ServerMsg, PublicView, ActionMask } from "@poker/shared";

function view(over: Partial<PublicView> = {}): PublicView {
  return {
    seats: [], buttonIndex: 0, street: "preflop", board: [], sb: 10, bb: 20,
    currentBet: 20, lastRaiseSize: 20, toAct: 0, handNumber: 0, pots: [], ...over,
  };
}
const mask: ActionMask = {
  seat: 0, canFold: true, canCheck: false, canCall: true, callAmount: 20,
  canRaise: true, minRaiseTo: 40, maxRaiseTo: 200,
};
function run(msgs: ServerMsg[], start: MatchUiState = initialMatchState): MatchUiState {
  return msgs.reduce(matchReducer, start);
}

describe("matchReducer", () => {
  it("records own seat on seated", () => {
    const s = run([{ t: "seated", seatIndex: 3, playerId: "me" }]);
    expect(s.ownSeat).toBe(3);
  });

  it("stores own hole cards on dealPrivate", () => {
    const s = run([{ t: "dealPrivate", holeCards: [0, 13] }]);
    expect(s.ownHole).toEqual([0, 13]);
  });

  it("replaces the view on snapshot", () => {
    const s = run([{ t: "snapshot", view: view({ handNumber: 7 }) }]);
    expect(s.view?.handNumber).toBe(7);
  });

  it("stores matchInfo", () => {
    const s = run([{ t: "matchInfo", format: "turbo", matchStartMs: 5, matchDurationMs: 600000 }]);
    expect(s.matchInfo).toEqual({ format: "turbo", matchStartMs: 5, matchDurationMs: 600000 });
  });

  it("sets the turn on yourTurn and clears it on a snapshot where it is no longer our turn", () => {
    const s1 = run([
      { t: "seated", seatIndex: 0, playerId: "me" },
      { t: "yourTurn", mask, deadlineTs: 123 },
    ]);
    expect(s1.turn?.deadlineTs).toBe(123);
    const s2 = matchReducer(s1, { t: "snapshot", view: view({ toAct: 2 }) });
    expect(s2.turn).toBeNull();
  });

  it("keeps the turn when a snapshot still has us to act", () => {
    const s1 = run([
      { t: "seated", seatIndex: 0, playerId: "me" },
      { t: "yourTurn", mask, deadlineTs: 123 },
    ]);
    const s2 = matchReducer(s1, { t: "snapshot", view: view({ toAct: 0 }) });
    expect(s2.turn?.deadlineTs).toBe(123);
  });

  it("updates timebank only for our own seat", () => {
    const s1 = run([{ t: "seated", seatIndex: 1, playerId: "me" }]);
    const s2 = matchReducer(s1, { t: "timebankUsed", seatIdx: 4, remainingMs: 9000 });
    expect(s2.timebankMs).toBeNull();
    const s3 = matchReducer(s1, { t: "timebankUsed", seatIdx: 1, remainingMs: 9000 });
    expect(s3.timebankMs).toBe(9000);
  });

  it("captures final standings and deltas on matchOver and clears the turn", () => {
    const s1 = run([
      { t: "seated", seatIndex: 0, playerId: "me" },
      { t: "yourTurn", mask, deadlineTs: 1 },
    ]);
    const s2 = matchReducer(s1, {
      t: "matchOver",
      finishPlaceById: { me: 1, "bot-0": 2 },
      eloDeltas: { me: 12, "bot-0": -12 },
    });
    expect(s2.result?.finishPlaceById["me"]).toBe(1);
    expect(s2.result?.eloDeltas["me"]).toBe(12);
    expect(s2.turn).toBeNull();
  });

  it("captures an error message", () => {
    const s = run([{ t: "error", message: "not_your_turn" }]);
    expect(s.error).toBe("not_your_turn");
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npm test -- client/src/game/matchReducer.test.ts`
Expected: FAIL — `./matchReducer.js` does not exist.

- [ ] **Step 3: Implement `matchReducer.ts`**

Create `client/src/game/matchReducer.ts`:

```typescript
import type { ServerMsg, PublicView, ActionMask, GameEvent } from "@poker/shared";

export interface MatchUiState {
  ownSeat: number | null;
  ownHole: [number, number] | null;
  view: PublicView | null;
  matchInfo: { format: string; matchStartMs: number; matchDurationMs: number } | null;
  turn: { mask: ActionMask; deadlineTs: number } | null;
  timebankMs: number | null;
  result: { finishPlaceById: Record<string, number>; eloDeltas: Record<string, number> } | null;
  error: string | null;
  lastEvent: GameEvent | null;
}

export const initialMatchState: MatchUiState = {
  ownSeat: null,
  ownHole: null,
  view: null,
  matchInfo: null,
  turn: null,
  timebankMs: null,
  result: null,
  error: null,
  lastEvent: null,
};

export function matchReducer(state: MatchUiState, msg: ServerMsg): MatchUiState {
  switch (msg.t) {
    case "seated":
      return { ...state, ownSeat: msg.seatIndex };
    case "dealPrivate":
      return { ...state, ownHole: msg.holeCards };
    case "snapshot": {
      const view = msg.view as PublicView;
      // Clear our turn once the server's view shows it is no longer our seat to act.
      const stillOurTurn = state.ownSeat !== null && view.toAct === state.ownSeat;
      return { ...state, view, turn: stillOurTurn ? state.turn : null };
    }
    case "matchInfo":
      return {
        ...state,
        matchInfo: {
          format: msg.format,
          matchStartMs: msg.matchStartMs,
          matchDurationMs: msg.matchDurationMs,
        },
      };
    case "yourTurn":
      return { ...state, turn: { mask: msg.mask, deadlineTs: msg.deadlineTs } };
    case "timebankUsed":
      return state.ownSeat === msg.seatIdx ? { ...state, timebankMs: msg.remainingMs } : state;
    case "event":
      return { ...state, lastEvent: msg.event };
    case "matchOver":
      return {
        ...state,
        turn: null,
        result: { finishPlaceById: msg.finishPlaceById, eloDeltas: msg.eloDeltas },
      };
    case "error":
      return { ...state, error: msg.message };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npm test -- client/src/game/matchReducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/game/matchReducer.ts client/src/game/matchReducer.test.ts
git commit -m "feat(client): pure matchReducer (ServerMsg -> MatchUiState)"
```

---

### Task 9: lobbyReducer (pure)

**Files:**
- Create: `client/src/lobby/lobbyReducer.ts`
- Test: `client/src/lobby/lobbyReducer.test.ts`

**Interfaces:**
- Consumes: `ServerMsg` from `@poker/shared`.
- Produces:
  - `interface LobbyUiState { status: "idle" | "queued" | "matched"; waiting: number; position: number; etaSec: number; match: { roomId: string; format: string } | null; error: string | null }`
  - `const initialLobbyState: LobbyUiState`
  - `function lobbyReducer(state: LobbyUiState, msg: ServerMsg): LobbyUiState`

- [ ] **Step 1: Write the failing test**

Create `client/src/lobby/lobbyReducer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { lobbyReducer, initialLobbyState } from "./lobbyReducer.js";

describe("lobbyReducer", () => {
  it("moves to queued and records status on queueStatus", () => {
    const s = lobbyReducer(initialLobbyState, { t: "queueStatus", waiting: 4, position: 2, etaSec: 8 });
    expect(s.status).toBe("queued");
    expect(s).toMatchObject({ waiting: 4, position: 2, etaSec: 8 });
  });

  it("moves to matched and stores the room on matchFound", () => {
    const s = lobbyReducer(initialLobbyState, { t: "matchFound", roomId: "ABC123", format: "turbo" });
    expect(s.status).toBe("matched");
    expect(s.match).toEqual({ roomId: "ABC123", format: "turbo" });
  });

  it("captures an error", () => {
    const s = lobbyReducer(initialLobbyState, { t: "error", message: "auth_failed" });
    expect(s.error).toBe("auth_failed");
  });

  it("ignores unrelated game messages", () => {
    const s = lobbyReducer(initialLobbyState, { t: "snapshot", view: {} });
    expect(s).toEqual(initialLobbyState);
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails**

Run: `npm test -- client/src/lobby/lobbyReducer.test.ts`
Expected: FAIL — `./lobbyReducer.js` does not exist.

- [ ] **Step 3: Implement `lobbyReducer.ts`**

Create `client/src/lobby/lobbyReducer.ts`:

```typescript
import type { ServerMsg } from "@poker/shared";

export interface LobbyUiState {
  status: "idle" | "queued" | "matched";
  waiting: number;
  position: number;
  etaSec: number;
  match: { roomId: string; format: string } | null;
  error: string | null;
}

export const initialLobbyState: LobbyUiState = {
  status: "idle",
  waiting: 0,
  position: 0,
  etaSec: 0,
  match: null,
  error: null,
};

export function lobbyReducer(state: LobbyUiState, msg: ServerMsg): LobbyUiState {
  switch (msg.t) {
    case "queueStatus":
      return {
        ...state,
        status: "queued",
        waiting: msg.waiting,
        position: msg.position,
        etaSec: msg.etaSec,
      };
    case "matchFound":
      return { ...state, status: "matched", match: { roomId: msg.roomId, format: msg.format } };
    case "error":
      return { ...state, error: msg.message };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run the test — confirm it passes**

Run: `npm test -- client/src/lobby/lobbyReducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lobby/lobbyReducer.ts client/src/lobby/lobbyReducer.test.ts
git commit -m "feat(client): pure lobbyReducer"
```

---

### Task 10: Session hook + Auth screen

**Files:**
- Create: `client/src/auth/useSession.ts`, `client/src/auth/AuthScreen.tsx`

**Interfaces:**
- Consumes: `supabase` from `../lib/supabase.js`; `isDevHost` from `../lib/env.js`.
- Produces:
  - `useSession()` → `{ session: Session | null; userId: string | null; loading: boolean; getJwt: () => string | null; signIn; signUp; signOut }`
  - `<AuthScreen onSignedIn />` (uses `useSession` via props or directly) rendering an email/password form.

- [ ] **Step 1: Create `client/src/auth/useSession.ts`**

```typescript
import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase.js";
import { isDevHost } from "../lib/env.js";

export interface SessionApi {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  getJwt: () => string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export function useSession(): SessionApi {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const getJwt = useCallback((): string | null => {
    if (!session) return null;
    // Local PartyKit dev server has no JWT secret → it accepts dev:<id> tokens.
    return isDevHost() ? `dev:${session.user.id}` : session.access_token;
  }, [session]);

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
  }, []);

  return { session, userId, loading, getJwt, signIn, signUp, signOut };
}
```

- [ ] **Step 2: Create `client/src/auth/AuthScreen.tsx`**

```tsx
import type React from "react";
import { useState } from "react";
import type { SessionApi } from "./useSession.js";

export default function AuthScreen({ auth }: { auth: SessionApi }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = mode === "in" ? await auth.signIn(email, password) : await auth.signUp(email, password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div style={{ maxWidth: 360, margin: "10vh auto", padding: 24 }}>
      <h1 style={{ textAlign: "center" }}>PokerElo</h1>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input type="email" placeholder="email" value={email} required
          onChange={(e) => setEmail(e.target.value)} style={{ padding: 10 }} />
        <input type="password" placeholder="password" value={password} required minLength={6}
          onChange={(e) => setPassword(e.target.value)} style={{ padding: 10 }} />
        <button type="submit" disabled={busy} style={{ padding: 10, background: "#2d7d46", color: "white", border: 0, borderRadius: 6 }}>
          {mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
      {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
      <button onClick={() => setMode(mode === "in" ? "up" : "in")}
        style={{ marginTop: 12, background: "none", border: 0, color: "#7aa2f7" }}>
        {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/auth
git commit -m "feat(client): Supabase session hook + auth screen"
```

---

### Task 11: Lobby socket hook + Lobby screen

**Files:**
- Create: `client/src/lobby/useLobbySocket.ts`, `client/src/lobby/LobbyScreen.tsx`

**Interfaces:**
- Consumes: `lobbyReducer`, `initialLobbyState` from `./lobbyReducer.js`; `PARTYKIT_HOST` from `../lib/env.js`; `supabase` from `../lib/supabase.js`; `encode`, `ELO_DEFAULT_RATING`, `rankForRating`, `MATCH_FORMATS`, `DEFAULT_FORMAT` from `@poker/shared`.
- Produces:
  - `useLobbySocket(getJwt)` → `{ state: LobbyUiState; enqueue(rating, format): void; leave(): void }`
  - `<LobbyScreen auth onMatchFound />`

- [ ] **Step 1: Create `client/src/lobby/useLobbySocket.ts`**

```typescript
import { useEffect, useRef, useReducer } from "react";
import PartySocket from "partysocket";
import { encode, decode } from "@poker/shared";
import type { ServerMsg } from "@poker/shared";
import { PARTYKIT_HOST } from "../lib/env.js";
import { lobbyReducer, initialLobbyState } from "./lobbyReducer.js";

export function useLobbySocket(getJwt: () => string | null) {
  const [state, dispatch] = useReducer(lobbyReducer, initialLobbyState);
  const sockRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    const socket = new PartySocket({ host: PARTYKIT_HOST, party: "lobby", room: "global" });
    sockRef.current = socket;
    socket.addEventListener("open", () => {
      const jwt = getJwt();
      if (jwt) socket.send(encode({ t: "hello", jwt }));
    });
    socket.addEventListener("message", (e: MessageEvent) => {
      dispatch(decode<ServerMsg>(e.data as string));
    });
    return () => socket.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enqueue(rating: number, format: string): void {
    sockRef.current?.send(encode({ t: "enqueue", rating, format }));
  }
  function leave(): void {
    sockRef.current?.send(encode({ t: "leave" }));
  }

  return { state, enqueue, leave };
}
```

- [ ] **Step 2: Create `client/src/lobby/LobbyScreen.tsx`**

```tsx
import { useEffect, useState } from "react";
import { ELO_DEFAULT_RATING, rankForRating, MATCH_FORMATS, DEFAULT_FORMAT } from "@poker/shared";
import { supabase } from "../lib/supabase.js";
import type { SessionApi } from "../auth/useSession.js";
import { useLobbySocket } from "./useLobbySocket.js";

export default function LobbyScreen({
  auth,
  onMatchFound,
}: {
  auth: SessionApi;
  onMatchFound: (roomId: string, format: string) => void;
}) {
  const { state, enqueue, leave } = useLobbySocket(auth.getJwt);
  const [rating, setRating] = useState<number>(ELO_DEFAULT_RATING);
  const [format, setFormat] = useState<string>(DEFAULT_FORMAT);

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

  useEffect(() => {
    if (state.status === "matched" && state.match) {
      onMatchFound(state.match.roomId, state.match.format);
    }
  }, [state.status, state.match, onMatchFound]);

  return (
    <div style={{ maxWidth: 480, margin: "8vh auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Lobby</h1>
        <button onClick={() => void auth.signOut()} style={{ background: "none", border: 0, color: "#7aa2f7" }}>
          Sign out
        </button>
      </div>
      <p>Rating: <b>{rating}</b> — <b>{rankForRating(rating)}</b></p>

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

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/lobby/useLobbySocket.ts client/src/lobby/LobbyScreen.tsx
git commit -m "feat(client): lobby socket hook + lobby screen"
```

---

### Task 12: Match socket hook + Game screen (felt table)

**Files:**
- Create: `client/src/game/useMatchSocket.ts`
- Create: `client/src/game/CardView.tsx`, `client/src/game/Board.tsx`, `client/src/game/SeatView.tsx`, `client/src/game/ActionBar.tsx`, `client/src/game/MatchClock.tsx`, `client/src/game/MatchOver.tsx`, `client/src/game/Table.tsx`, `client/src/game/GameScreen.tsx`

**Interfaces:**
- Consumes: `matchReducer`, `initialMatchState`, `MatchUiState` from `./matchReducer.js`; `maskToButtons`, `clampRaiseTo`, `blindLevelLabel`, `formatCard`, `formatChips` from `./viewHelpers.js`; `PARTYKIT_HOST` from `../lib/env.js`; `encode`, `decode`, `STARTING_STACK`, `rankForRating` from `@poker/shared`.
- Produces:
  - `useMatchSocket(roomId, getJwt)` → `{ state: MatchUiState; sendAction(action, amount?): void }`
  - `<GameScreen roomId getJwt onLeave />`

- [ ] **Step 1: Create `client/src/game/useMatchSocket.ts`**

```typescript
import { useEffect, useRef, useReducer } from "react";
import PartySocket from "partysocket";
import { encode, decode } from "@poker/shared";
import type { ServerMsg } from "@poker/shared";
import { PARTYKIT_HOST } from "../lib/env.js";
import { matchReducer, initialMatchState } from "./matchReducer.js";

type ActionType = "fold" | "check" | "call" | "raise";

export function useMatchSocket(roomId: string, getJwt: () => string | null) {
  const [state, dispatch] = useReducer(matchReducer, initialMatchState);
  const sockRef = useRef<PartySocket | null>(null);
  const seatRef = useRef<number | null>(null);
  seatRef.current = state.ownSeat;

  useEffect(() => {
    const socket = new PartySocket({ host: PARTYKIT_HOST, party: "main", room: roomId });
    sockRef.current = socket;
    socket.addEventListener("open", () => {
      const jwt = getJwt();
      if (jwt) socket.send(encode({ t: "hello", jwt }));
    });
    socket.addEventListener("message", (e: MessageEvent) => {
      dispatch(decode<ServerMsg>(e.data as string));
    });
    return () => socket.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  function sendAction(action: ActionType, amount?: number): void {
    const seat = seatRef.current;
    if (seat === null) return;
    sockRef.current?.send(encode({ t: "action", seat, action, amount }));
  }

  return { state, sendAction };
}
```

- [ ] **Step 2: Create `client/src/game/CardView.tsx`**

```tsx
import { formatCard } from "./viewHelpers.js";

const RED = new Set(["h", "d"]);

export default function CardView({ card }: { card: number | null }) {
  const base: React.CSSProperties = {
    width: 38, height: 54, borderRadius: 6, display: "inline-flex",
    alignItems: "center", justifyContent: "center", fontWeight: 700, margin: 2,
  };
  if (card === null) {
    return <span style={{ ...base, background: "#24304a", border: "1px solid #3a4straight" as unknown as string }} />;
  }
  const s = formatCard(card);
  const suit = s.slice(-1);
  return (
    <span style={{ ...base, background: "#f5f5f5", color: RED.has(suit) ? "#c1121f" : "#111" }}>
      {s}
    </span>
  );
}
```

> Note: fix the placeholder card style to a valid color — use `border: "1px solid #3a4664"`. (Replace the broken token above with this when typing the file.)

Create it with this corrected body:

```tsx
import type React from "react";
import { formatCard } from "./viewHelpers.js";

const RED = new Set(["h", "d"]);

export default function CardView({ card }: { card: number | null }) {
  const base: React.CSSProperties = {
    width: 38, height: 54, borderRadius: 6, display: "inline-flex",
    alignItems: "center", justifyContent: "center", fontWeight: 700, margin: 2,
  };
  if (card === null) {
    return <span style={{ ...base, background: "#24304a", border: "1px solid #3a4664" }} />;
  }
  const s = formatCard(card);
  const suit = s.slice(-1);
  return (
    <span style={{ ...base, background: "#f5f5f5", color: RED.has(suit) ? "#c1121f" : "#111" }}>
      {s}
    </span>
  );
}
```

- [ ] **Step 3: Create `client/src/game/Board.tsx`**

```tsx
import CardView from "./CardView.js";
import { formatChips } from "./viewHelpers.js";

export default function Board({ board, pot }: { board: number[]; pot: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div>{board.map((c, i) => <CardView key={i} card={c} />)}</div>
      <div style={{ marginTop: 8, fontSize: 14, opacity: 0.85 }}>Pot: {formatChips(pot)}</div>
    </div>
  );
}
```

- [ ] **Step 4: Create `client/src/game/SeatView.tsx`**

```tsx
import type React from "react";
import type { PublicSeat } from "@poker/shared";
import CardView from "./CardView.js";
import { formatChips } from "./viewHelpers.js";

export default function SeatView({
  seat,
  isOwn,
  isToAct,
  ownHole,
}: {
  seat: PublicSeat | null;
  isOwn: boolean;
  isToAct: boolean;
  ownHole: [number, number] | null;
}) {
  if (!seat) {
    return <div style={box(false)}><span style={{ opacity: 0.4 }}>empty</span></div>;
  }
  const hole = seat.holeCards ?? (isOwn ? ownHole : null);
  const label = seat.isBot ? `🤖 ${seat.id}` : seat.id.slice(0, 8);
  const dim = seat.status === "folded" || seat.status === "busted";
  return (
    <div style={{ ...box(isToAct), opacity: dim ? 0.5 : 1 }}>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{label}{isOwn ? " (you)" : ""}</div>
      <div>
        <CardView card={hole ? hole[0] : null} />
        <CardView card={hole ? hole[1] : null} />
      </div>
      <div style={{ fontSize: 13, marginTop: 4 }}>
        {formatChips(seat.stack)}{seat.status === "allin" ? " · ALL IN" : ""}
      </div>
    </div>
  );
}

function box(active: boolean): React.CSSProperties {
  return {
    width: 130, padding: 8, borderRadius: 10, textAlign: "center",
    background: "#16203a", border: active ? "2px solid #f0c419" : "2px solid transparent",
  };
}
```

- [ ] **Step 5: Create `client/src/game/ActionBar.tsx`**

```tsx
import type React from "react";
import { useState } from "react";
import type { ActionMask } from "@poker/shared";
import { maskToButtons, clampRaiseTo, formatChips } from "./viewHelpers.js";

export default function ActionBar({
  mask,
  onAction,
}: {
  mask: ActionMask;
  onAction: (action: "fold" | "check" | "call" | "raise", amount?: number) => void;
}) {
  const b = maskToButtons(mask);
  const [raiseTo, setRaiseTo] = useState<number>(mask.minRaiseTo);

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", padding: 12 }}>
      {b.fold && <button onClick={() => onAction("fold")} style={btn("#7a2d2d")}>Fold</button>}
      {b.check && <button onClick={() => onAction("check")} style={btn("#2d5d7a")}>Check</button>}
      {b.call && <button onClick={() => onAction("call", b.callAmount)} style={btn("#2d5d7a")}>Call {formatChips(b.callAmount)}</button>}
      {b.raise && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="range"
            min={mask.minRaiseTo}
            max={mask.maxRaiseTo}
            value={raiseTo}
            onChange={(e) => setRaiseTo(clampRaiseTo(Number(e.target.value), mask))}
          />
          <button onClick={() => onAction("raise", clampRaiseTo(raiseTo, mask))} style={btn("#2d7d46")}>
            Raise to {formatChips(raiseTo)}
          </button>
        </span>
      )}
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { padding: "10px 16px", background: bg, color: "white", border: 0, borderRadius: 6 };
}
```

- [ ] **Step 6: Create `client/src/game/MatchClock.tsx`**

```tsx
import { useEffect, useState } from "react";
import { blindLevelLabel } from "./viewHelpers.js";

export default function MatchClock({
  matchStartMs,
  matchDurationMs,
  format,
  sb,
  bb,
}: {
  matchStartMs: number;
  matchDurationMs: number;
  format: string;
  sb: number;
  bb: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remainingMs = Math.max(0, matchStartMs + matchDurationMs - now);
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000);
  return (
    <div style={{ textAlign: "center", fontSize: 14 }}>
      <span style={{ marginRight: 12 }}>⏱ {mm}:{String(ss).padStart(2, "0")}</span>
      <span>{blindLevelLabel(sb, bb, format)} ({sb}/{bb})</span>
    </div>
  );
}
```

- [ ] **Step 7: Create `client/src/game/MatchOver.tsx`**

```tsx
export default function MatchOver({
  ownId,
  finishPlaceById,
  eloDeltas,
  onLeave,
}: {
  ownId: string | null;
  finishPlaceById: Record<string, number>;
  eloDeltas: Record<string, number>;
  onLeave: () => void;
}) {
  const rows = Object.entries(finishPlaceById).sort((a, b) => a[1] - b[1]);
  return (
    <div style={{ maxWidth: 420, margin: "10vh auto", padding: 24, background: "#16203a", borderRadius: 12 }}>
      <h2 style={{ textAlign: "center" }}>Match Over</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th align="left">#</th><th align="left">Player</th><th align="right">ELO</th></tr></thead>
        <tbody>
          {rows.map(([id, place]) => {
            const d = eloDeltas[id] ?? 0;
            return (
              <tr key={id} style={{ fontWeight: id === ownId ? 700 : 400 }}>
                <td>{place}</td>
                <td>{id.startsWith("bot-") ? `🤖 ${id}` : id.slice(0, 8)}{id === ownId ? " (you)" : ""}</td>
                <td align="right" style={{ color: d >= 0 ? "#5dd39e" : "#ff6b6b" }}>{d >= 0 ? `+${d}` : d}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button onClick={onLeave} style={{ marginTop: 16, padding: "10px 16px", width: "100%" }}>
        Back to Lobby
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Create `client/src/game/Table.tsx`**

```tsx
import type React from "react";
import type { MatchUiState } from "./matchReducer.js";
import SeatView from "./SeatView.js";
import Board from "./Board.js";

// Six fixed positions around an oval (own seat forced to the bottom-center by rotation).
const POSITIONS: Array<React.CSSProperties> = [
  { left: "50%", bottom: "2%", transform: "translateX(-50%)" },
  { left: "8%", bottom: "22%" },
  { left: "8%", top: "22%" },
  { left: "50%", top: "2%", transform: "translateX(-50%)" },
  { right: "8%", top: "22%" },
  { right: "8%", bottom: "22%" },
];

export default function Table({ state }: { state: MatchUiState }) {
  const view = state.view;
  if (!view) return <p style={{ textAlign: "center" }}>Waiting for the table…</p>;
  const n = view.seats.length;
  const own = state.ownSeat ?? 0;
  const pot = view.pots.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div style={{ position: "relative", width: "min(900px, 95vw)", height: 520, margin: "0 auto" }}>
      <div style={{
        position: "absolute", inset: "12% 6%", borderRadius: "50%",
        background: "radial-gradient(ellipse at center, #1f7a4d, #0f5132)",
        border: "10px solid #5b3a1e",
      }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Board board={view.board} pot={pot} />
      </div>
      {view.seats.map((seat, i) => {
        // Rotate so our seat sits at POSITIONS[0] (bottom-center).
        const slot = (i - own + n) % n;
        const pos = POSITIONS[slot] ?? POSITIONS[0]!;
        return (
          <div key={i} style={{ position: "absolute", ...pos }}>
            <SeatView
              seat={seat}
              isOwn={i === state.ownSeat}
              isToAct={view.toAct === i}
              ownHole={state.ownHole}
            />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 9: Create `client/src/game/GameScreen.tsx`**

```tsx
import { useMatchSocket } from "./useMatchSocket.js";
import Table from "./Table.js";
import ActionBar from "./ActionBar.js";
import MatchClock from "./MatchClock.js";
import MatchOver from "./MatchOver.js";

export default function GameScreen({
  roomId,
  getJwt,
  ownId,
  onLeave,
}: {
  roomId: string;
  getJwt: () => string | null;
  ownId: string | null;
  onLeave: () => void;
}) {
  const { state, sendAction } = useMatchSocket(roomId, getJwt);

  if (state.result) {
    return (
      <MatchOver
        ownId={ownId}
        finishPlaceById={state.result.finishPlaceById}
        eloDeltas={state.result.eloDeltas}
        onLeave={onLeave}
      />
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {state.matchInfo && state.view && (
        <MatchClock
          matchStartMs={state.matchInfo.matchStartMs}
          matchDurationMs={state.matchInfo.matchDurationMs}
          format={state.matchInfo.format}
          sb={state.view.sb}
          bb={state.view.bb}
        />
      )}
      <Table state={state} />
      {state.turn ? (
        <ActionBar mask={state.turn.mask} onAction={sendAction} />
      ) : (
        <div style={{ textAlign: "center", padding: 12, opacity: 0.7 }}>Waiting…</div>
      )}
      {state.error && <p style={{ textAlign: "center", color: "#ff6b6b" }}>{state.error}</p>}
    </div>
  );
}
```

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add client/src/game
git commit -m "feat(client): match socket hook + felt-table game screen"
```

---

### Task 13: Wire App router + final verification

**Files:**
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `useSession` from `./auth/useSession.js`; `AuthScreen`, `LobbyScreen`, `GameScreen`.
- Produces: the top-level screen state machine (auth → lobby → game) and back.

- [ ] **Step 1: Replace `client/src/App.tsx`**

```tsx
import { useState } from "react";
import { useSession } from "./auth/useSession.js";
import AuthScreen from "./auth/AuthScreen.js";
import LobbyScreen from "./lobby/LobbyScreen.js";
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

  return (
    <LobbyScreen
      auth={auth}
      onMatchFound={(roomId, format) => setMatch({ roomId, format })}
    />
  );
}
```

- [ ] **Step 2: Full verification**

Run: `npm test`
Expected: all suites pass (shared, party, client).

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS (no errors; `argsIgnorePattern` warnings only, if any).

Run: `npm run build --workspace @poker/client`
Expected: Vite build succeeds.

- [ ] **Step 3: Manual smoke test (documented; requires two terminals)**

```bash
# Terminal 1 — local PartyKit (dev mode: no SUPABASE_JWT_SECRET)
npx partykit dev

# Terminal 2 — client
cd client && npm run dev
```

Set `client/.env` from `.env.example` (a real Supabase project for auth; `VITE_PARTYKIT_HOST=localhost:1999`).
Sign in, click **Find Match** — with fewer than `RANKED_MIN_ONLINE` online the matchmaker bot-fills, the lobby provisions a `MatchRoom`, the client switches to the felt table, hole cards deal, the action bar appears on your turn, and `matchOver` shows standings + ELO deltas.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat(client): app screen router (auth -> lobby -> game)"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Lobby/`matchInfo` protocol messages | Task 1 |
| Expanding-window matchmaker + bot-fill | Task 2 |
| Lobby party: queue, ticker, provisioning, queueStatus/matchFound | Task 3 |
| MatchRoom provisioning `onRequest` + roster start + bot-fill | Task 4 |
| `matchInfo` broadcast on start + reconnect | Task 4 |
| Register lobby party | Task 5 |
| Vite/React scaffold, env, supabase client | Task 6 |
| Dev `dev:<userId>` token on localhost | Task 6 (`isDevHost`) + Task 10 (`getJwt`) |
| viewHelpers (mask→buttons, raise clamp, blind label, card fmt) | Task 7 |
| matchReducer (ServerMsg → UI state) | Task 8 |
| lobbyReducer | Task 9 |
| Supabase email/password auth | Task 10 |
| Lobby screen: rating/rank, join queue, queue status | Task 11 |
| Game screen: board, seats, own hole cards, pot, action buttons from mask, clock, matchOver | Task 12 |
| Felt poker table visual | Task 12 (`Table.tsx`) |
| App router auth→lobby→game | Task 13 |
| Unit tests on core logic | Tasks 2, 3, 4, 7, 8, 9 |

**Placeholder scan:** Task 12 Step 2 intentionally flags and corrects a broken color token before the file is written (the corrected `CardView.tsx` body is the one to create). No other TBDs.

**Type consistency:**
- `ServerMsg`/`ClientMsg` variants added in Task 1 are consumed unchanged in `matchReducer` (Task 8), `lobbyReducer` (Task 9), `useMatchSocket`/`useLobbySocket` (Tasks 11–12).
- `MatchUiState` shape defined in Task 8 is consumed by `Table`/`GameScreen` (Task 12) using the same field names (`ownSeat`, `ownHole`, `view`, `matchInfo`, `turn`, `result`).
- `formMatches` return `{ matches, matchedIds }` (Task 2) is consumed exactly in `lobby.ts` (Task 3).
- `onRequest` body `{ format, humanIds }` produced by `lobby.ts` (Task 3) matches the parser in `matchRoom.ts` (Task 4).
- `getJwt: () => string | null` defined in Task 10 is the prop type used by Tasks 11–13.

**Constraint check:** No new poker-numeric literals introduced; all stacks/blinds/timers/windows come from `@poker/shared`. Relative imports use `.js`. Type-only imports use `import type`.
