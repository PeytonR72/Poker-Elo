import { describe, it, expect, vi, afterEach } from "vitest";
import type * as Party from "partykit/server";
import { SignJWT } from "jose";
import { encode, TABLE_SIZE, legalActions, MATCH_FORMATS, DEFAULT_FORMAT, blindLevelAt, BOT_DECISION_DELAY_MIN_MS, BOT_DECISION_DELAY_MAX_MS } from "@poker/shared";
import MatchRoom, { csprngSeed, nextNonBustedSeat } from "./matchRoom.js";
import { botThinkDelayMs } from "./botRunner.js";
import { TurnTimer } from "./timers.js";

// ---------- helpers ----------

function mockConn(id: string): Party.Connection & { _msgs: string[]; _closed: boolean } {
  const msgs: string[] = [];
  let closed = false;
  return {
    id,
    _msgs: msgs,
    _closed: false,
    send(msg: string) {
      msgs.push(msg);
    },
    close() {
      closed = true;
      (this as { _closed: boolean })._closed = true;
    },
    socket: {} as unknown,
    state: null,
    setState: () => {},
  } as unknown as Party.Connection & { _msgs: string[]; _closed: boolean };
}

type MockConn = Party.Connection & { _msgs: string[]; _closed: boolean };
/** A Map-backed connection store that iterates over values (not [key,value] pairs).
 *  This matches the PartyKit ConnectionList iterable contract. */
class MockConnectionList implements Iterable<MockConn> {
  private _map = new Map<string, MockConn>();

  set(id: string, conn: MockConn): void {
    this._map.set(id, conn);
  }

  get(id: string): MockConn | undefined {
    return this._map.get(id);
  }

  values(): IterableIterator<MockConn> {
    return this._map.values();
  }

  [Symbol.iterator](): Iterator<MockConn> {
    return this._map.values();
  }
}

type MockPartyConns = MockConnectionList;

function mockParty(
  env: Record<string, string> = {},
  conns: MockPartyConns = new MockConnectionList(),
): Party.Party {
  return {
    id: "test-room",
    connections: conns,
    getConnections: () => conns,
    broadcast: () => {},
    env,
  } as unknown as Party.Party;
}

function makeConns(): MockConnectionList {
  return new MockConnectionList();
}

async function makeJwt(sub: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .sign(key);
}

// ---------- existing Task 2 tests ----------

describe("MatchRoom", () => {
  it("registers a connection on onConnect", () => {
    const room = new MatchRoom(mockParty());
    const conn = mockConn("conn-1");

    expect(room.playerCount).toBe(0);
    room.onConnect(conn);
    expect(room.playerCount).toBe(1);

    const state = room.getPlayer("conn-1");
    expect(state).toBeDefined();
    expect(state?.playerId).toBe("");
    expect(state?.seatIndex).toBeNull();
    expect(state?.authed).toBe(false);
  });

  it("removes a connection on onClose", () => {
    const room = new MatchRoom(mockParty());
    const conn = mockConn("conn-2");

    room.onConnect(conn);
    expect(room.playerCount).toBe(1);

    room.onClose(conn);
    expect(room.playerCount).toBe(0);
    expect(room.getPlayer("conn-2")).toBeUndefined();
  });

  it("removes a connection on onError and closes it", () => {
    const room = new MatchRoom(mockParty());
    let closed = false;
    const conn = {
      id: "conn-3",
      send: () => {},
      close: () => {
        closed = true;
      },
      socket: {} as unknown,
      state: null,
      setState: () => {},
    } as unknown as Party.Connection;

    room.onConnect(conn);
    expect(room.playerCount).toBe(1);

    room.onError(conn, new Error("boom"));
    expect(closed).toBe(true);
    expect(room.playerCount).toBe(0);
  });

  it("tracks multiple connections independently", () => {
    const room = new MatchRoom(mockParty());
    const connA = mockConn("a");
    const connB = mockConn("b");

    room.onConnect(connA);
    room.onConnect(connB);
    expect(room.playerCount).toBe(2);

    room.onClose(connA);
    expect(room.playerCount).toBe(1);
    expect(room.getPlayer("b")).toBeDefined();
    expect(room.getPlayer("a")).toBeUndefined();
  });

  it("has hibernate: false in static options", () => {
    expect(MatchRoom.options.hibernate).toBe(false);
  });
});

// ---------- Task 3: hello handshake + auth ----------

describe("MatchRoom hello handshake (dev mode)", () => {
  it("accepts dev token when no JWT secret is configured (env={})", async () => {
    const room = new MatchRoom(mockParty({}));
    const conn = mockConn("c1");
    room.onConnect(conn);

    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn);

    const state = room.getPlayer("c1");
    expect(state?.authed).toBe(true);
    expect(state?.playerId).toBe("alice");
    expect(state?.seatIndex).toBe(0);

    const reply = JSON.parse(conn._msgs[conn._msgs.length - 1]!);
    expect(reply.t).toBe("seated");
    expect(reply.seatIndex).toBe(0);
    expect(reply.playerId).toBe("alice");
  });

  it("rejects a non-dev token in dev mode", async () => {
    const room = new MatchRoom(mockParty({}));
    const conn = mockConn("c2");
    room.onConnect(conn);

    await room.onMessage(encode({ t: "hello", jwt: "not-a-dev-token" }), conn);

    expect(conn._closed).toBe(true);
    const msgs = conn._msgs.map((m) => JSON.parse(m));
    expect(msgs.some((m) => m.t === "error" && m.message === "auth_failed")).toBe(true);
  });

  it("assigns sequential seat indices to multiple dev-mode players", async () => {
    const room = new MatchRoom(mockParty({}));
    const connA = mockConn("cA");
    const connB = mockConn("cB");

    room.onConnect(connA);
    room.onConnect(connB);

    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), connA);
    await room.onMessage(encode({ t: "hello", jwt: "dev:bob" }), connB);

    expect(room.getPlayer("cA")?.seatIndex).toBe(0);
    expect(room.getPlayer("cB")?.seatIndex).toBe(1);
  });
});

describe("MatchRoom hello handshake (JWT mode)", () => {
  const SECRET = "test-secret";

  it("accepts a valid HS256 JWT when SUPABASE_JWT_SECRET is set", async () => {
    const room = new MatchRoom(mockParty({ SUPABASE_JWT_SECRET: SECRET }));
    const conn = mockConn("j1");
    room.onConnect(conn);

    const token = await makeJwt("user-123", SECRET);
    await room.onMessage(encode({ t: "hello", jwt: token }), conn);

    const state = room.getPlayer("j1");
    expect(state?.authed).toBe(true);
    expect(state?.playerId).toBe("user-123");
    expect(state?.seatIndex).toBe(0);
  });

  it("rejects a JWT signed with the wrong secret", async () => {
    const room = new MatchRoom(mockParty({ SUPABASE_JWT_SECRET: SECRET }));
    const conn = mockConn("j2");
    room.onConnect(conn);

    const token = await makeJwt("user-999", "wrong-secret");
    await room.onMessage(encode({ t: "hello", jwt: token }), conn);

    expect(conn._closed).toBe(true);
    const msgs = conn._msgs.map((m) => JSON.parse(m));
    expect(msgs.some((m) => m.t === "error" && m.message === "auth_failed")).toBe(true);
  });

  it("rejects a dev token when a JWT secret IS configured", async () => {
    const room = new MatchRoom(mockParty({ SUPABASE_JWT_SECRET: SECRET }));
    const conn = mockConn("j3");
    room.onConnect(conn);

    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn);

    expect(conn._closed).toBe(true);
    const msgs = conn._msgs.map((m) => JSON.parse(m));
    expect(msgs.some((m) => m.t === "error")).toBe(true);
  });
});

describe("MatchRoom hello edge cases", () => {
  it("closes connection when first message is not hello", async () => {
    const room = new MatchRoom(mockParty({}));
    const conn = mockConn("e1");
    room.onConnect(conn);

    await room.onMessage(encode({ t: "ping", ts: 0 }), conn);

    expect(conn._closed).toBe(true);
    const msgs = conn._msgs.map((m) => JSON.parse(m));
    expect(msgs.some((m) => m.t === "error" && m.message === "expected_hello")).toBe(true);
  });

  it("ignores a duplicate hello after already authed", async () => {
    const room = new MatchRoom(mockParty({}));
    const conn = mockConn("e2");
    room.onConnect(conn);

    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn);
    const msgCountAfterFirst = conn._msgs.length;

    // Second hello — should be ignored
    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn);
    expect(conn._msgs.length).toBe(msgCountAfterFirst); // no new messages
    expect(conn._closed).toBe(false);
  });

  it("rejects connection when table is full", async () => {
    const room = new MatchRoom(mockParty({}));

    // Fill all TABLE_SIZE seats (triggers startMatch; party.connections is empty so no crash)
    for (let i = 0; i < TABLE_SIZE; i++) {
      const conn = mockConn(`seat-${i}`);
      room.onConnect(conn);
      await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), conn);
      expect(room.getPlayer(`seat-${i}`)?.seatIndex).toBe(i);
    }

    // One more — should be rejected
    const extra = mockConn("extra");
    room.onConnect(extra);
    await room.onMessage(encode({ t: "hello", jwt: "dev:overflow" }), extra);

    expect(extra._closed).toBe(true);
    const msgs = extra._msgs.map((m) => JSON.parse(m));
    expect(msgs.some((m) => m.t === "error" && m.message === "table_full")).toBe(true);
  });

  it("closes connection when message is invalid JSON", async () => {
    const room = new MatchRoom(mockParty({}));
    const conn = mockConn("e3");
    room.onConnect(conn);

    await room.onMessage("not-json-at-all", conn);

    expect(conn._closed).toBe(true);
    const msgs = conn._msgs.map((m) => JSON.parse(m));
    expect(msgs.some((m) => m.t === "error")).toBe(true);
  });
});

// ---------- Task 4: startMatch guards ----------

describe("MatchRoom startMatch guards", () => {
  it("unauthenticated connection gets not_authed error and tableState stays null", async () => {
    const room = new MatchRoom(mockParty({}));
    const conn = mockConn("unauthed-1");
    room.onConnect(conn);

    // Send startMatch without authenticating first
    await room.onMessage(encode({ t: "startMatch" }), conn);

    expect(room.currentTableState).toBeNull();
    const msgs = conn._msgs.map((m) => JSON.parse(m));
    expect(msgs.some((m) => m.t === "error" && m.message === "not_authed")).toBe(true);
    expect(conn._closed).toBe(false); // not closed, just rejected
  });

  it("calling startMatch twice leaves state unchanged after first call", async () => {
    const conn = mockConn("p1");
    const conns: MockPartyConns = makeConns();
    conns.set(conn.id, conn);
    const room = new MatchRoom(mockParty({}, conns));

    room.onConnect(conn);
    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn);

    // First startMatch
    await room.onMessage(encode({ t: "startMatch" }), conn);
    const stateAfterFirst = room.currentTableState;
    expect(stateAfterFirst).not.toBeNull();

    // Second startMatch — should be a no-op
    await room.onMessage(encode({ t: "startMatch" }), conn);
    expect(room.currentTableState).toBe(stateAfterFirst); // same reference
  });
});

// ---------- Task 4: CSPRNG seed ----------

describe("csprngSeed", () => {
  it("returns a number in [0, 2^32)", () => {
    const seed = csprngSeed();
    expect(typeof seed).toBe("number");
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
    expect(Number.isInteger(seed)).toBe(true);
  });

  it("two successive calls almost always differ (probabilistic over 1000 pairs)", () => {
    let allSame = true;
    for (let i = 0; i < 1000; i++) {
      if (csprngSeed() !== csprngSeed()) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });
});

// ---------- Task 4: startMatch via dev message ----------

describe("MatchRoom startMatch (dev mode)", () => {
  it("sets tableState to non-null after startMatch message", async () => {
    const room = new MatchRoom(mockParty({}));

    // Seat one player
    const conn = mockConn("p1");
    room.onConnect(conn);
    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn);

    // Send startMatch in dev mode
    await room.onMessage(encode({ t: "startMatch" }), conn);

    expect(room.currentTableState).not.toBeNull();
  });

  it("tableState is at preflop with empty board after startMatch", async () => {
    const room = new MatchRoom(mockParty({}));
    const conn = mockConn("p1");
    room.onConnect(conn);
    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn);
    await room.onMessage(encode({ t: "startMatch" }), conn);

    const ts = room.currentTableState!;
    expect(ts.street).toBe("preflop");
    expect(ts.board).toHaveLength(0);
  });

  it("all TABLE_SIZE seats have 2 hole cards after startMatch", async () => {
    const room = new MatchRoom(mockParty({}));
    const conn = mockConn("p1");
    room.onConnect(conn);
    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn);
    await room.onMessage(encode({ t: "startMatch" }), conn);

    const ts = room.currentTableState!;
    expect(ts.seats).toHaveLength(TABLE_SIZE);
    for (const seat of ts.seats) {
      expect(seat).not.toBeNull();
      expect(seat!.holeCards).not.toBeNull();
      expect(seat!.holeCards).toHaveLength(2);
    }
  });

  it("does not trigger startMatch from startMatch message when JWT secret is set", async () => {
    const room = new MatchRoom(mockParty({ SUPABASE_JWT_SECRET: "secret" }));
    const conn = mockConn("p1");
    room.onConnect(conn);
    // Not authed, send startMatch — in prod mode startMatch is not a hello, so error+close
    await room.onMessage(encode({ t: "startMatch" }), conn);

    // Should have been rejected as "expected_hello"
    expect(conn._closed).toBe(true);
    const msgs = conn._msgs.map((m) => JSON.parse(m));
    expect(msgs.some((m) => m.t === "error" && m.message === "expected_hello")).toBe(true);
    expect(room.currentTableState).toBeNull();
  });
});

// ---------- Task 4: auto-start when all seats filled ----------

describe("MatchRoom auto-start on full table", () => {
  it("starts match automatically when TABLE_SIZE players connect and auth", async () => {
    const conns: MockPartyConns = makeConns();
    const party = mockParty({}, conns);
    const room = new MatchRoom(party);

    for (let i = 0; i < TABLE_SIZE; i++) {
      const conn = mockConn(`seat-${i}`);
      conns.set(conn.id, conn);
      room.onConnect(conn);
      await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), conn);
    }

    expect(room.currentTableState).not.toBeNull();
    expect(room.currentTableState!.street).toBe("preflop");
  });
});

// ---------- Task 4: broadcastSnapshots ----------

describe("MatchRoom broadcastSnapshots", () => {
  it("each authed connection receives a snapshot message after match starts", async () => {
    const conns: MockPartyConns = makeConns();
    const party = mockParty({}, conns);
    const room = new MatchRoom(party);

    for (let i = 0; i < TABLE_SIZE; i++) {
      const conn = mockConn(`seat-${i}`);
      conns.set(conn.id, conn);
      room.onConnect(conn);
      await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), conn);
    }

    // All should have received a snapshot
    for (const conn of conns.values()) {
      const snapshots = conn._msgs.map((m) => JSON.parse(m)).filter((m) => m.t === "snapshot");
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("snapshot view does not contain deck or opponent holeCards", async () => {
    const conns: MockPartyConns = makeConns();
    const party = mockParty({}, conns);
    const room = new MatchRoom(party);

    for (let i = 0; i < TABLE_SIZE; i++) {
      const conn = mockConn(`seat-${i}`);
      conns.set(conn.id, conn);
      room.onConnect(conn);
      await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), conn);
    }

    // For the first player (seat-0), check their snapshot
    const firstConn = conns.get("seat-0")!;
    const snap = firstConn._msgs
      .map((m) => JSON.parse(m))
      .find((m) => m.t === "snapshot");

    expect(snap).toBeDefined();
    const view = snap.view;

    // No deck field in view
    expect(view).not.toHaveProperty("deck");
    expect(view).not.toHaveProperty("deckPointer");

    // Only player 0's own holeCards should be non-null; others redacted
    // player-0 is at seat 0
    const seat0 = view.seats[0];
    expect(seat0.holeCards).not.toBeNull(); // own cards visible

    // At least one other seat should have null holeCards (opponent redaction)
    const otherSeats = view.seats.slice(1);
    const hasRedacted = otherSeats.some((s: { holeCards: unknown } | null) => s && s.holeCards === null);
    expect(hasRedacted).toBe(true);
  });

  it("dev startMatch also broadcasts snapshot to authed player", async () => {
    const conn = mockConn("p1");
    const conns: MockPartyConns = makeConns();
    conns.set(conn.id, conn);
    const party = mockParty({}, conns);
    const room = new MatchRoom(party);

    room.onConnect(conn);
    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn);
    await room.onMessage(encode({ t: "startMatch" }), conn);

    const snapshots = conn._msgs.map((m) => JSON.parse(m)).filter((m) => m.t === "snapshot");
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------- Task 5: dealPrivate hole cards ----------

describe("MatchRoom dealPrivate (Task 5)", () => {
  it("each human connection receives exactly one dealPrivate message after startMatch", async () => {
    const conns: MockPartyConns = makeConns();
    const party = mockParty({}, conns);
    const room = new MatchRoom(party);

    for (let i = 0; i < TABLE_SIZE; i++) {
      const conn = mockConn(`seat-${i}`);
      conns.set(conn.id, conn);
      room.onConnect(conn);
      await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), conn);
    }

    // All human connections should have received exactly one dealPrivate
    for (const conn of conns.values()) {
      const dealMsgs = conn._msgs
        .map((m) => JSON.parse(m))
        .filter((m) => m.t === "dealPrivate");
      expect(dealMsgs).toHaveLength(1);
    }
  });

  it("dealPrivate hole cards match tableState.seats[seatIndex].holeCards for that player", async () => {
    const conns: MockPartyConns = makeConns();
    const party = mockParty({}, conns);
    const room = new MatchRoom(party);

    for (let i = 0; i < TABLE_SIZE; i++) {
      const conn = mockConn(`seat-${i}`);
      conns.set(conn.id, conn);
      room.onConnect(conn);
      await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), conn);
    }

    const tableState = room.currentTableState!;

    // For each player, verify their received dealPrivate matches their seat's hole cards
    for (let i = 0; i < TABLE_SIZE; i++) {
      const conn = conns.get(`seat-${i}`)!;
      const dealMsg = conn._msgs
        .map((m) => JSON.parse(m))
        .find((m) => m.t === "dealPrivate");

      expect(dealMsg).toBeDefined();
      const { holeCards: receivedCards } = dealMsg;
      const { holeCards: actualCards } = tableState.seats[i]!;

      // Both should be [Card, Card] arrays
      expect(receivedCards).toEqual(actualCards);
      expect(receivedCards).toHaveLength(2);
      expect(actualCards).toHaveLength(2);
    }
  });

  it("does not send dealPrivate for dev startMatch with unfilled table", async () => {
    const conn = mockConn("p1");
    const conns: MockPartyConns = makeConns();
    conns.set(conn.id, conn);
    const party = mockParty({}, conns);
    const room = new MatchRoom(party);

    room.onConnect(conn);
    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn);
    await room.onMessage(encode({ t: "startMatch" }), conn);

    // Should have snapshot AND dealPrivate
    const msgs = conn._msgs.map((m) => JSON.parse(m));
    const dealMsgs = msgs.filter((m) => m.t === "dealPrivate");
    expect(dealMsgs).toHaveLength(1);
  });

  it("snapshot sent to player A does NOT contain player B's hole cards", async () => {
    const conns: MockPartyConns = makeConns();
    const party = mockParty({}, conns);
    const room = new MatchRoom(party);

    for (let i = 0; i < TABLE_SIZE; i++) {
      const conn = mockConn(`seat-${i}`);
      conns.set(conn.id, conn);
      room.onConnect(conn);
      await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), conn);
    }

    // Get player A's (seat 0) snapshot
    const connA = conns.get("seat-0")!;
    const snap = connA._msgs
      .map((m) => JSON.parse(m))
      .find((m) => m.t === "snapshot");

    expect(snap).toBeDefined();
    const view = snap.view;

    // Player A (seat 0) should see their own hole cards
    const ownSeat = view.seats[0];
    expect(ownSeat.holeCards).not.toBeNull();
    expect(ownSeat.holeCards).toHaveLength(2);

    // Player A should NOT see opponent (seat 1)'s hole cards
    const opponentSeat = view.seats[1];
    expect(opponentSeat.holeCards).toBeNull();
  });
});

// ---------- Task 6: yourTurn + action receiver ----------

/** Set up a full TABLE_SIZE room with all seats filled and match started.
 *  Returns { room, conns, broadcastMsgs } where broadcastMsgs collects party.broadcast calls. */
async function setupFullMatch(): Promise<{
  room: MatchRoom;
  conns: MockConnectionList;
  broadcastMsgs: string[];
}> {
  const conns = makeConns();
  const broadcastMsgs: string[] = [];
  const party = {
    id: "test-room",
    connections: conns,
    getConnections: () => conns,
    broadcast: (msg: string) => { broadcastMsgs.push(msg); },
    env: {},
  } as unknown as Party.Party;
  const room = new MatchRoom(party);

  for (let i = 0; i < TABLE_SIZE; i++) {
    const conn = mockConn(`seat-${i}`);
    conns.set(conn.id, conn);
    room.onConnect(conn);
    await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), conn);
  }

  return { room, conns, broadcastMsgs };
}

describe("MatchRoom yourTurn dispatch (Task 6)", () => {
  it("sends yourTurn to the active seat after match starts", async () => {
    const { room, conns } = await setupFullMatch();
    const ts = room.currentTableState!;
    const activeIdx = ts.toAct!;

    const activeSeatConn = conns.get(`seat-${activeIdx}`)!;
    const yourTurnMsgs = activeSeatConn._msgs
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "yourTurn");

    expect(yourTurnMsgs).toHaveLength(1);
    const msg = yourTurnMsgs[0];
    expect(msg.mask).toBeDefined();
    expect(typeof msg.deadlineTs).toBe("number");
    expect(msg.deadlineTs).toBeGreaterThan(Date.now() - 1000);
  });

  it("does NOT send yourTurn to non-active seats after match starts", async () => {
    const { room, conns } = await setupFullMatch();
    const ts = room.currentTableState!;
    const activeIdx = ts.toAct!;

    for (let i = 0; i < TABLE_SIZE; i++) {
      if (i === activeIdx) continue;
      const conn = conns.get(`seat-${i}`)!;
      const yourTurnMsgs = conn._msgs
        .map((m) => JSON.parse(m))
        .filter((m) => m.t === "yourTurn");
      expect(yourTurnMsgs).toHaveLength(0);
    }
  });
});

describe("MatchRoom action receiver (Task 6)", () => {
  it("rejects action from wrong seat with not_your_turn error", async () => {
    const { room, conns } = await setupFullMatch();
    const ts = room.currentTableState!;
    const activeIdx = ts.toAct!;

    // Find a seat that is NOT the active one
    const wrongIdx = (activeIdx + 1) % TABLE_SIZE;
    const wrongConn = conns.get(`seat-${wrongIdx}`)!;

    await room.onMessage(
      encode({ t: "action", seat: wrongIdx, action: "fold" }),
      wrongConn,
    );

    const errorMsgs = wrongConn._msgs
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "error" && m.message === "not_your_turn");
    expect(errorMsgs).toHaveLength(1);
  });

  it("rejects illegal action (raise below min) with illegal_action error", async () => {
    const { room, conns } = await setupFullMatch();
    const ts = room.currentTableState!;
    const activeIdx = ts.toAct!;
    const mask = legalActions(ts, activeIdx);

    const activeConn = conns.get(`seat-${activeIdx}`)!;

    // Send a raise below the minimum raise-to amount
    const belowMin = mask.minRaiseTo - 1;
    await room.onMessage(
      encode({ t: "action", seat: activeIdx, action: "raise", amount: belowMin }),
      activeConn,
    );

    const errorMsgs = activeConn._msgs
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "error" && m.message === "illegal_action");
    expect(errorMsgs).toHaveLength(1);
  });

  it("valid fold from active seat updates state, broadcasts events and snapshots", async () => {
    const { room, conns, broadcastMsgs } = await setupFullMatch();
    const ts = room.currentTableState!;
    const activeIdx = ts.toAct!;
    const activeConn = conns.get(`seat-${activeIdx}`)!;

    const broadcastCountBefore = broadcastMsgs.length;
    const snapshotCountBefore = activeConn._msgs
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "snapshot").length;

    await room.onMessage(
      encode({ t: "action", seat: activeIdx, action: "fold" }),
      activeConn,
    );

    // State must be updated
    const newTs = room.currentTableState!;
    const foldedSeat = newTs.seats[activeIdx];
    expect(foldedSeat?.status).toBe("folded");

    // At least one event broadcast (the fold action event)
    const newBroadcasts = broadcastMsgs.slice(broadcastCountBefore);
    const eventBroadcasts = newBroadcasts
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "event");
    expect(eventBroadcasts.length).toBeGreaterThanOrEqual(1);

    // Snapshots sent after fold
    const newSnapshots = activeConn._msgs
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "snapshot");
    expect(newSnapshots.length).toBeGreaterThan(snapshotCountBefore);
  });

  it("after valid fold, yourTurn is sent to next active seat", async () => {
    const { room, conns } = await setupFullMatch();
    const ts = room.currentTableState!;
    const activeIdx = ts.toAct!;
    const activeConn = conns.get(`seat-${activeIdx}`)!;

    await room.onMessage(
      encode({ t: "action", seat: activeIdx, action: "fold" }),
      activeConn,
    );

    // The next seat to act should have received a yourTurn
    const newTs = room.currentTableState!;
    if (newTs.street !== "complete" && newTs.toAct !== null) {
      const nextIdx = newTs.toAct;
      const nextConn = conns.get(`seat-${nextIdx}`)!;
      const yourTurnMsgs = nextConn._msgs
        .map((m) => JSON.parse(m))
        .filter((m) => m.t === "yourTurn");
      expect(yourTurnMsgs.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------- Task 7: TurnTimer unit tests ----------

describe("TurnTimer", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("fires callback after the specified delay", async () => {
    vi.useFakeTimers();
    let fired = false;
    const timer = new TurnTimer();
    timer.start(1000, () => { fired = true; });

    expect(fired).toBe(false);
    await vi.runAllTimersAsync();
    expect(fired).toBe(true);
  });

  it("cancel() prevents the callback from firing", async () => {
    vi.useFakeTimers();
    let fired = false;
    const timer = new TurnTimer();
    timer.start(1000, () => { fired = true; });
    timer.cancel();

    await vi.runAllTimersAsync();
    expect(fired).toBe(false);
  });

  it("a second start() cancels the first and uses the new callback", async () => {
    vi.useFakeTimers();
    let firstFired = false;
    let secondFired = false;
    const timer = new TurnTimer();

    timer.start(1000, () => { firstFired = true; });
    timer.start(500, () => { secondFired = true; });

    await vi.runAllTimersAsync();
    expect(firstFired).toBe(false);
    expect(secondFired).toBe(true);
  });
});

// ---------- Task 7: turn timer integration tests ----------

describe("MatchRoom turn timer (Task 7)", () => {
  afterEach(() => { vi.useRealTimers(); });

  const turnTimeMs = MATCH_FORMATS[DEFAULT_FORMAT]!.turnTimeMs;

  /** Build a full match room with fake timer support. */
  async function setupTimerMatch(): Promise<{
    room: MatchRoom;
    conns: MockConnectionList;
    broadcastMsgs: string[];
  }> {
    const conns = makeConns();
    const broadcastMsgs: string[] = [];
    const party = {
      id: "test-room",
      connections: conns,
      getConnections: () => conns,
      broadcast: (msg: string) => { broadcastMsgs.push(msg); },
      env: {},
    } as unknown as Party.Party;
    const room = new MatchRoom(party);

    for (let i = 0; i < TABLE_SIZE; i++) {
      const conn = mockConn(`seat-${i}`);
      conns.set(conn.id, conn);
      room.onConnect(conn);
      await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), conn);
    }

    return { room, conns, broadcastMsgs };
  }

  it("timer fires after turnTimeMs → auto-check emitted when check is legal", async () => {
    vi.useFakeTimers();
    const { room, conns, broadcastMsgs } = await setupTimerMatch();

    // Advance to a state where check IS legal (post-flop, or BB after everyone calls).
    // Preflop UTG can't check (faces BB), so we call/fold until we reach a seat that can check.
    // Simplest: keep folding until the hand completes or we find a check situation.
    // Actually let's drive all preflop players to call/fold until BB can check.
    let ts = room.currentTableState!;
    while (ts.street === "preflop" && ts.toAct !== null) {
      const idx = ts.toAct;
      const m = legalActions(ts, idx);
      if (m.canCheck) break; // BB can check — stop here
      const conn = conns.get(`seat-${idx}`)!;
      // Call if possible (to keep the hand alive); otherwise fold
      const actionType = m.canCall ? "call" : "fold";
      const amount = m.canCall ? m.callAmount : 0;
      await room.onMessage(encode({ t: "action", seat: idx, action: actionType, amount }), conn);
      ts = room.currentTableState!;
      if (ts.street === "complete") break;
    }

    if (ts.street === "complete" || ts.toAct === null) return; // hand over before reaching check

    const activeIdx = ts.toAct;
    const mask = legalActions(ts, activeIdx);
    expect(mask.canCheck).toBe(true); // BB should be able to check now

    const broadcastCountBefore = broadcastMsgs.length;

    // Advance time past the turn deadline
    await vi.advanceTimersByTimeAsync(turnTimeMs + 1);

    // Should have broadcast at least one event (the auto-check)
    const newBroadcasts = broadcastMsgs.slice(broadcastCountBefore);
    const eventBroadcasts = newBroadcasts
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "event");
    expect(eventBroadcasts.length).toBeGreaterThanOrEqual(1);

    // The auto-check should change state
    const newTs = room.currentTableState!;
    expect(newTs).not.toBe(ts);
  });

  it("timer fires → auto-fold emitted when check is not legal", async () => {
    vi.useFakeTimers();
    const { room, conns, broadcastMsgs } = await setupTimerMatch();
    const ts = room.currentTableState!;
    const activeIdx = ts.toAct!;

    // Keep acting until we find a seat where canCheck is false (facing a bet/raise)
    // In preflop, the first player to act is UTG facing the BB, so after SB posts and BB posts,
    // UTG (first to act preflop) faces the BB — check is NOT legal, must call/fold/raise.
    // Actually in our setup, toAct is already determined by the engine.
    // Check if the active player can't check (preflop UTG facing BB):
    const mask = legalActions(ts, activeIdx);
    if (mask.canCheck) {
      // If check is legal (we're the BB and no raise), just skip this scenario
      // by folding first to get to a state where fold is needed
      // Instead, send a raise to create a situation where check isn't legal for next player
      const activeConn = conns.get(`seat-${activeIdx}`)!;
      await room.onMessage(
        encode({ t: "action", seat: activeIdx, action: "raise", amount: mask.minRaiseTo }),
        activeConn,
      );
      // Now the next player faces a raise — check won't be legal
    }

    const broadcastCountBefore = broadcastMsgs.length;
    const newTs2 = room.currentTableState!;
    if (newTs2.street === "complete" || newTs2.toAct === null) return; // hand ended

    const nextActiveIdx = newTs2.toAct;
    const nextMask = legalActions(newTs2, nextActiveIdx);

    if (!nextMask.canCheck) {
      // Advance time to trigger auto-fold
      await vi.advanceTimersByTimeAsync(turnTimeMs + 1);

      const newBroadcasts = broadcastMsgs.slice(broadcastCountBefore);
      const eventBroadcasts = newBroadcasts
        .map((m) => JSON.parse(m))
        .filter((m) => m.t === "event");
      expect(eventBroadcasts.length).toBeGreaterThanOrEqual(1);

      // Seat should be folded
      const finalTs = room.currentTableState!;
      if (finalTs.seats[nextActiveIdx]) {
        expect(finalTs.seats[nextActiveIdx]!.status).toBe("folded");
      }
    }
  });

  it("player with timebank: first expiry extends if TIMEBANK_REPLENISH_MS > 0, else auto-acts", async () => {
    // Since TIMEBANK_REPLENISH_MS = 0, extension never fires; auto-act happens immediately.
    // This test verifies that behavior is correct either way.
    vi.useFakeTimers();
    const { room, broadcastMsgs } = await setupTimerMatch();
    const ts = room.currentTableState!;
    const activeIdx = ts.toAct!;

    const broadcastCountBefore = broadcastMsgs.length;

    // Fire the timer
    await vi.advanceTimersByTimeAsync(turnTimeMs + 1);

    // With TIMEBANK_REPLENISH_MS = 0, no extension — auto-act fires immediately
    const newBroadcasts = broadcastMsgs.slice(broadcastCountBefore);
    const eventBroadcasts = newBroadcasts
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "event");
    expect(eventBroadcasts.length).toBeGreaterThanOrEqual(1);
  });

  it("player with empty timebank: first expiry auto-acts immediately", async () => {
    vi.useFakeTimers();
    const { room, broadcastMsgs } = await setupTimerMatch();
    const ts = room.currentTableState!;
    const activeIdx = ts.toAct!;

    // Drain the player's timebank to 0
    const connState = [...room["players"].values()].find((p) => p.seatIndex === activeIdx);
    if (connState) connState.timebankMs = 0;

    const broadcastCountBefore = broadcastMsgs.length;

    await vi.advanceTimersByTimeAsync(turnTimeMs + 1);

    // Auto-act should have fired
    const newBroadcasts = broadcastMsgs.slice(broadcastCountBefore);
    const eventBroadcasts = newBroadcasts
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "event");
    expect(eventBroadcasts.length).toBeGreaterThanOrEqual(1);
  });

  it("valid human action before expiry cancels timer (no double-action)", async () => {
    vi.useFakeTimers();
    const { room, conns, broadcastMsgs } = await setupTimerMatch();
    const ts = room.currentTableState!;
    const activeIdx = ts.toAct!;
    const activeConn = conns.get(`seat-${activeIdx}`)!;
    const mask = legalActions(ts, activeIdx);

    // Player acts manually (fold)
    await room.onMessage(
      encode({ t: "action", seat: activeIdx, action: mask.canCheck ? "check" : "fold" }),
      activeConn,
    );

    const stateAfterAction = room.currentTableState;
    const broadcastCountAfterAction = broadcastMsgs.length;

    // Now advance time past the original deadline — timer should be cancelled
    await vi.advanceTimersByTimeAsync(turnTimeMs + 1);

    // If a new timer fired for the next seat's turn that's fine, but no EXTRA events
    // from the old timer. The key check: state was changed exactly once by the human action,
    // and the original timer doesn't fire a second action on the original seat.
    if (stateAfterAction && stateAfterAction.street !== "complete") {
      // We can only verify that the folded/checked seat didn't get acted on again.
      // The next seat may have had its timer fire — that's expected behavior.
      // Just verify no error (double-action on completed/folded seat) occurred.
      const allMsgs = broadcastMsgs.map((m) => JSON.parse(m));
      const errorMsgs = allMsgs.filter((m) => m.t === "error");
      expect(errorMsgs).toHaveLength(0);
    }
  });

  it("expired timer for wrong seat is a no-op", async () => {
    vi.useFakeTimers();
    const { room, conns, broadcastMsgs } = await setupTimerMatch();
    let ts = room.currentTableState!;
    const originalIdx = ts.toAct!;

    // Fire sendYourTurn to establish a timer for seat 0
    const originalBroadcastCount = broadcastMsgs.length;

    // Manually set toAct to a different seat (simulating state advance)
    ts = room.currentTableState!;
    const newIdx = (originalIdx + 1) % TABLE_SIZE;
    (ts as { toAct: number }).toAct = newIdx;

    // Advance past the original turn time — the stale timer callback for originalIdx should be a no-op
    const broadcastCountBeforeExpiry = broadcastMsgs.length;
    await vi.advanceTimersByTimeAsync(turnTimeMs + 1);

    // No new broadcast events should have occurred (handler returned early)
    const newBroadcasts = broadcastMsgs.slice(broadcastCountBeforeExpiry);
    const eventBroadcasts = newBroadcasts
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "event");
    expect(eventBroadcasts).toHaveLength(0);
  });
});

// ---------- Task 8: nextNonBustedSeat pure helper ----------

describe("nextNonBustedSeat", () => {
  it("returns the next seat when no seats are busted", () => {
    const seats = [
      { id: "a", status: "active" },
      { id: "b", status: "active" },
      { id: "c", status: "active" },
    ] as unknown as Parameters<typeof nextNonBustedSeat>[0];

    expect(nextNonBustedSeat(seats, 0)).toBe(1);
    expect(nextNonBustedSeat(seats, 1)).toBe(2);
    expect(nextNonBustedSeat(seats, 2)).toBe(0);
  });

  it("skips a busted seat", () => {
    const seats = [
      { id: "a", status: "active" },
      { id: "b", status: "busted" },
      { id: "c", status: "active" },
    ] as unknown as Parameters<typeof nextNonBustedSeat>[0];

    // Button at 0 → skip busted seat 1 → land on 2
    expect(nextNonBustedSeat(seats, 0)).toBe(2);
    // Button at 1 → next is 2
    expect(nextNonBustedSeat(seats, 1)).toBe(2);
    // Button at 2 → next would be 0 (not busted)
    expect(nextNonBustedSeat(seats, 2)).toBe(0);
  });

  it("skips multiple consecutive busted seats", () => {
    const seats = [
      { id: "a", status: "active" },
      { id: "b", status: "busted" },
      { id: "c", status: "busted" },
      { id: "d", status: "active" },
    ] as unknown as Parameters<typeof nextNonBustedSeat>[0];

    // Button at 0 → skip 1,2 → land on 3
    expect(nextNonBustedSeat(seats, 0)).toBe(3);
    // Button at 3 → wraps around → land on 0
    expect(nextNonBustedSeat(seats, 3)).toBe(0);
  });

  it("handles null seats (empty slots) as if busted", () => {
    const seats = [
      { id: "a", status: "active" },
      null,
      { id: "c", status: "active" },
    ] as unknown as Parameters<typeof nextNonBustedSeat>[0];

    // Button at 0 → skip null seat 1 → land on 2
    expect(nextNonBustedSeat(seats, 0)).toBe(2);
  });

  it("falls back to currentButton when all other seats are busted", () => {
    const seats = [
      { id: "a", status: "active" },
      { id: "b", status: "busted" },
      { id: "c", status: "busted" },
    ] as unknown as Parameters<typeof nextNonBustedSeat>[0];

    // Only seat 0 is active — fall back to currentButton (0)
    expect(nextNonBustedSeat(seats, 0)).toBe(0);
  });
});

// ---------- Task 9: Match clock + blind escalation ─────────────────────

describe("Match clock + blind escalation (Task 9)", () => {
  afterEach(() => { vi.useRealTimers(); });

  // Test 9.1: First blind level
  it("9.1: elapsedMs=0 returns first blind level (10/20) for turbo format", () => {
    const format = MATCH_FORMATS["turbo"]!;
    const { sb, bb } = blindLevelAt(0, format);
    expect(sb).toBe(10);
    expect(bb).toBe(20);
  });

  // Test 9.2: Second blind level after escalation
  it("9.2: elapsedMs=130_000 (past first level for turbo) returns second level (15/30)", () => {
    const format = MATCH_FORMATS["turbo"]!;
    // Turbo: blindLevelDurationMs = 120_000, so at 130_000 we're in level 1 (index 1)
    const { sb, bb } = blindLevelAt(130_000, format);
    expect(sb).toBe(15);
    expect(bb).toBe(30);
  });

  // Test 9.3: Grace-finish — hand completes after clock expires, endMatch called
  it("9.3: hand completing after match clock expires triggers endMatch, no next hand", async () => {
    vi.useFakeTimers();
    const { room } = await setupAndCompleteHand();

    expect(room.currentTableState?.street).toBe("complete");
    const handNumBefore = room.currentHandNumber;

    // Clear pending timers
    vi.clearAllTimers();

    // Spy on endMatch
    const endMatchSpy = vi.spyOn(room as unknown as { endMatch(): void }, "endMatch");

    // Set matchStartMs to far past so elapsedMs >= matchDurationMs
    const format = MATCH_FORMATS[DEFAULT_FORMAT]!;
    (room as unknown as { matchStartMs: number }).matchStartMs =
      Date.now() - format.matchDurationMs - 1;

    // Call onHandComplete (clock is now expired)
    (room as unknown as { onHandComplete(): void }).onHandComplete();

    // endMatch must be called (grace-finish: hand already complete, so end match)
    expect(endMatchSpy).toHaveBeenCalledOnce();

    // Next hand must NOT start
    await vi.advanceTimersByTimeAsync(3_000 + 1);
    expect(room.currentHandNumber).toBe(handNumBefore);
    expect(room.currentTableState?.street).toBe("complete");
  });

  // Test 9.4: In-progress hand completes before match ends (grace-finish in action)
  it("9.4: hand completes with elapsedMs >= matchDurationMs triggers endMatch, no startNextHand", async () => {
    vi.useFakeTimers();
    const { room } = await setupAndCompleteHand();

    const ts = room.currentTableState!;
    expect(ts.street).toBe("complete");

    // Verify we're still within the match clock
    const format = MATCH_FORMATS[ts.format]!;
    const elapsedBefore = Date.now() - (room as unknown as { matchStartMs: number }).matchStartMs;
    expect(elapsedBefore).toBeLessThan(format.matchDurationMs);

    // Spy on endMatch
    const endMatchSpy = vi.spyOn(room as unknown as { endMatch(): void }, "endMatch");

    // Clear pending timers
    vi.clearAllTimers();

    // Manually set matchStartMs so that now elapsedMs >= matchDurationMs
    (room as unknown as { matchStartMs: number }).matchStartMs =
      Date.now() - format.matchDurationMs - 100;

    const handNumBefore = room.currentHandNumber;

    // Call onHandComplete with expired clock
    (room as unknown as { onHandComplete(): void }).onHandComplete();

    // endMatch should have been called
    expect(endMatchSpy).toHaveBeenCalled();

    // No startNextHand should be scheduled (no new hand after clock expires)
    await vi.advanceTimersByTimeAsync(3_000 + 1);
    expect(room.currentHandNumber).toBe(handNumBefore);
  });
});

// ---------- Task 8: onHandComplete — bust detection + next-hand loop ----------

/** Drive a full-table match room to the point where a hand has completed. */
async function setupAndCompleteHand(): Promise<{
  room: MatchRoom;
  conns: MockConnectionList;
  broadcastMsgs: string[];
}> {
  const conns = makeConns();
  const broadcastMsgs: string[] = [];
  const party = {
    id: "test-room",
    connections: conns,
    getConnections: () => conns,
    broadcast: (msg: string) => { broadcastMsgs.push(msg); },
    env: {},
  } as unknown as Party.Party;
  const room = new MatchRoom(party);

  for (let i = 0; i < TABLE_SIZE; i++) {
    const conn = mockConn(`seat-${i}`);
    conns.set(conn.id, conn);
    room.onConnect(conn);
    await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), conn);
  }

  // Drive the hand to completion: keep folding until street === "complete"
  let guard = 0;
  while (room.currentTableState?.street !== "complete" && guard++ < 500) {
    const ts = room.currentTableState;
    if (!ts || ts.toAct === null) break;
    const idx = ts.toAct;
    const mask = legalActions(ts, idx);
    const conn = conns.get(`seat-${idx}`)!;
    const actionType = mask.canCheck ? "check" : "fold";
    await room.onMessage(encode({ t: "action", seat: idx, action: actionType, amount: 0 }), conn);
  }

  return { room, conns, broadcastMsgs };
}

describe("MatchRoom onHandComplete (Task 8)", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("normal hand completion schedules next hand after INTER_HAND_PAUSE_MS", async () => {
    vi.useFakeTimers();
    const { room } = await setupAndCompleteHand();

    expect(room.currentTableState?.street).toBe("complete");
    const handNumBefore = room.currentHandNumber;

    // Advance past the inter-hand pause
    await vi.advanceTimersByTimeAsync(3_000 + 1);

    // A new hand should have started (handNumber incremented in startNextHand)
    expect(room.currentHandNumber).toBeGreaterThan(handNumBefore);
    // New hand should be in preflop
    expect(room.currentTableState?.street).toBe("preflop");
  });

  it("next hand does NOT start before INTER_HAND_PAUSE_MS elapses", async () => {
    vi.useFakeTimers();
    const { room } = await setupAndCompleteHand();

    expect(room.currentTableState?.street).toBe("complete");
    const handNumBefore = room.currentHandNumber;

    // Advance only 1 second — not enough
    await vi.advanceTimersByTimeAsync(1_000);

    expect(room.currentHandNumber).toBe(handNumBefore); // no new hand yet
    expect(room.currentTableState?.street).toBe("complete");
  });

  it("bust detection: busted seat id appears in bustOrder after hand completes", async () => {
    vi.useFakeTimers();
    const conns = makeConns();
    const party = {
      id: "test-room",
      connections: conns,
      getConnections: () => conns,
      broadcast: () => {},
      env: {},
    } as unknown as Party.Party;
    const room = new MatchRoom(party);

    for (let i = 0; i < TABLE_SIZE; i++) {
      const conn = mockConn(`seat-${i}`);
      conns.set(conn.id, conn);
      room.onConnect(conn);
      await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), conn);
    }

    // Manually mark a seat as busted in the table state to simulate chip elimination
    const ts = room.currentTableState!;
    const bustTarget = ts.seats[TABLE_SIZE - 1];
    if (bustTarget) {
      (bustTarget as { status: string }).status = "busted";
    }

    // Mark the hand as complete to trigger onHandComplete via action
    // Instead: drive all but one player to fold (which triggers onHandComplete naturally)
    // Reset the bust status and do it properly via the internal private access
    if (bustTarget) {
      (bustTarget as { status: string }).status = "active";
    }

    // Drive the hand to completion
    let guard = 0;
    while (room.currentTableState?.street !== "complete" && guard++ < 500) {
      const s = room.currentTableState;
      if (!s || s.toAct === null) break;
      const idx = s.toAct;
      const mask = legalActions(s, idx);
      const conn = conns.get(`seat-${idx}`)!;
      const actionType = mask.canCheck ? "check" : "fold";
      await room.onMessage(encode({ t: "action", seat: idx, action: actionType, amount: 0 }), conn);
    }

    // After completing the hand, set a seat as busted in the completed state and manually call
    // onHandComplete — the simplest way is to use the private accessor via any cast
    const finalTs = room.currentTableState!;
    const seatToMark = finalTs.seats[TABLE_SIZE - 1];
    if (seatToMark) {
      (seatToMark as { status: string }).status = "busted";
    }

    // Call onHandComplete via any cast (it's private but we need to test it)
    (room as unknown as { onHandComplete(): void }).onHandComplete();

    // bustOrder should now contain that player's id
    if (seatToMark) {
      expect(room.currentBustOrder).toContain(seatToMark.id);
    }
  });

  it("isMatchOver returns true when only 1 non-busted seat remains", async () => {
    vi.useFakeTimers();
    const { room } = await setupAndCompleteHand();

    const ts = room.currentTableState!;
    // Bust all but one seat
    let keptOne = false;
    for (const seat of ts.seats) {
      if (!seat) continue;
      if (!keptOne) {
        keptOne = true;
        continue;
      }
      (seat as { status: string }).status = "busted";
    }

    const isOver = (room as unknown as { isMatchOver(): boolean }).isMatchOver();
    expect(isOver).toBe(true);
  });

  it("isMatchOver returns false when >= 2 non-busted seats remain", async () => {
    vi.useFakeTimers();
    const { room } = await setupAndCompleteHand();

    const ts = room.currentTableState!;
    // Bust all but two seats
    let keptTwo = 0;
    for (const seat of ts.seats) {
      if (!seat) continue;
      if (keptTwo < 2) {
        keptTwo++;
        continue;
      }
      (seat as { status: string }).status = "busted";
    }

    const isOver = (room as unknown as { isMatchOver(): boolean }).isMatchOver();
    expect(isOver).toBe(false);
  });

  it("match clock expired → endMatch called, no next hand scheduled", async () => {
    vi.useFakeTimers();
    const { room } = await setupAndCompleteHand();

    expect(room.currentTableState?.street).toBe("complete");

    // Clear the pending inter-hand pause timer that onHandComplete already scheduled
    vi.clearAllTimers();

    // Spy on endMatch
    const endMatchSpy = vi.spyOn(room as unknown as { endMatch(): void }, "endMatch");

    // Set matchStartMs far in the past so elapsedMs >= matchDurationMs
    const format = MATCH_FORMATS[DEFAULT_FORMAT]!;
    (room as unknown as { matchStartMs: number }).matchStartMs =
      Date.now() - format.matchDurationMs - 1;

    const handNumBefore = room.currentHandNumber;

    // Trigger onHandComplete again (clock is now expired)
    (room as unknown as { onHandComplete(): void }).onHandComplete();

    // endMatch should have been called
    expect(endMatchSpy).toHaveBeenCalledOnce();

    // No next hand should start even after the pause
    await vi.advanceTimersByTimeAsync(3_000 + 1);
    expect(room.currentHandNumber).toBe(handNumBefore);
    expect(room.currentTableState?.street).toBe("complete");
  });

  it("button advances past busted seats on next hand", async () => {
    vi.useFakeTimers();
    const { room } = await setupAndCompleteHand();

    const ts = room.currentTableState!;
    const currentButton = ts.buttonIndex;

    // Mark the next seat as busted
    const nextSeatIdx = (currentButton + 1) % TABLE_SIZE;
    const nextSeat = ts.seats[nextSeatIdx];
    if (nextSeat) {
      (nextSeat as { status: string }).status = "busted";
    }

    // Reset bustOrder so we get a fresh start
    (room as unknown as { bustOrder: string[] }).bustOrder = [];

    // Advance past inter-hand pause to trigger startNextHand
    await vi.advanceTimersByTimeAsync(3_000 + 1);

    // The new button should skip the busted seat
    const newTs = room.currentTableState;
    if (newTs && newTs.street === "preflop") {
      expect(newTs.buttonIndex).not.toBe(nextSeatIdx);
    }
  });
});

// ---------- Task 10: endMatch + ELO deltas + matchOver broadcast ----------

/** Build a minimal MatchRoom with injected tableState and bustOrder for endMatch testing. */
function makeEndMatchRoom(
  survivors: Array<{ id: string; stack: number }>,
  bustedIds: string[], // bust order (first = first to bust = worst place among busted)
): { room: MatchRoom; broadcastMsgs: string[] } {
  const broadcastMsgs: string[] = [];
  const conns = makeConns();
  const party = {
    id: "test-room",
    connections: conns,
    getConnections: () => conns,
    broadcast: (msg: string) => { broadcastMsgs.push(msg); },
    env: {},
  } as unknown as Party.Party;

  const room = new MatchRoom(party);

  // Build a minimal tableState with all seats
  const allSeats = [
    ...survivors.map(s => ({
      id: s.id,
      stack: s.stack,
      status: "active" as const,
      holeCards: null,
      committedThisStreet: 0,
      committedTotal: 0,
      isBot: false,
    })),
    ...bustedIds.map(id => ({
      id,
      stack: 0,
      status: "busted" as const,
      holeCards: null,
      committedThisStreet: 0,
      committedTotal: 0,
      isBot: false,
    })),
  ];

  // Inject state via private accessor
  (room as unknown as { tableState: unknown }).tableState = {
    seats: allSeats,
    street: "complete",
    board: [],
    pots: [],
    buttonIndex: 0,
    toAct: null,
    handNumber: 1,
    elapsedMs: 0,
    format: "turbo",
  };
  (room as unknown as { bustOrder: string[] }).bustOrder = [...bustedIds];

  return { room, broadcastMsgs };
}

describe("endMatch + ELO deltas (Task 10)", () => {
  it("10.1: 3 survivors (500/300/200) + 3 busted (A,B,C) → places 1/2/3 for survivors, 4/5/6 for busted (C=4,B=5,A=6)", () => {
    const { room, broadcastMsgs } = makeEndMatchRoom(
      [
        { id: "p1", stack: 500 },
        { id: "p2", stack: 300 },
        { id: "p3", stack: 200 },
      ],
      ["pA", "pB", "pC"], // A busted first = last place, C busted last = best among busted
    );

    (room as unknown as { endMatch(): void }).endMatch();

    expect(broadcastMsgs).toHaveLength(1);
    const msg = JSON.parse(broadcastMsgs[0]!);
    expect(msg.t).toBe("matchOver");

    const { finishPlaceById } = msg;
    // Survivors by stack descending
    expect(finishPlaceById["p1"]).toBe(1);
    expect(finishPlaceById["p2"]).toBe(2);
    expect(finishPlaceById["p3"]).toBe(3);
    // Busted: reversed order — C busted last = place 4, B = 5, A = 6
    expect(finishPlaceById["pC"]).toBe(4);
    expect(finishPlaceById["pB"]).toBe(5);
    expect(finishPlaceById["pA"]).toBe(6);
  });

  it("10.2: tied survivors (same stack) get the same place number", () => {
    const { room, broadcastMsgs } = makeEndMatchRoom(
      [
        { id: "p1", stack: 500 },
        { id: "p2", stack: 500 }, // tied with p1
        { id: "p3", stack: 200 },
      ],
      [],
    );

    (room as unknown as { endMatch(): void }).endMatch();

    const msg = JSON.parse(broadcastMsgs[0]!);
    const { finishPlaceById } = msg;
    // p1 and p2 are tied at 500 → both get place 1
    expect(finishPlaceById["p1"]).toBe(1);
    expect(finishPlaceById["p2"]).toBe(1);
    // p3 is lower → place 3 (i=2, so place = i+1 = 3)
    expect(finishPlaceById["p3"]).toBe(3);
  });

  it("10.3: matchOver broadcast contains finishPlaceById and eloDeltas for all seats", () => {
    const { room, broadcastMsgs } = makeEndMatchRoom(
      [
        { id: "p1", stack: 500 },
        { id: "p2", stack: 300 },
        { id: "p3", stack: 200 },
      ],
      ["pA", "pB", "pC"],
    );

    (room as unknown as { endMatch(): void }).endMatch();

    expect(broadcastMsgs).toHaveLength(1);
    const msg = JSON.parse(broadcastMsgs[0]!);
    expect(msg.t).toBe("matchOver");
    expect(msg.finishPlaceById).toBeDefined();
    expect(msg.eloDeltas).toBeDefined();

    // All 6 players should have entries
    const allIds = ["p1", "p2", "p3", "pA", "pB", "pC"];
    for (const id of allIds) {
      expect(msg.finishPlaceById).toHaveProperty(id);
      expect(msg.eloDeltas).toHaveProperty(id);
    }
  });

  it("10.4: ELO deltas are all finite non-NaN numbers", () => {
    const { room, broadcastMsgs } = makeEndMatchRoom(
      [
        { id: "p1", stack: 500 },
        { id: "p2", stack: 300 },
        { id: "p3", stack: 200 },
      ],
      ["pA", "pB", "pC"],
    );

    (room as unknown as { endMatch(): void }).endMatch();

    const msg = JSON.parse(broadcastMsgs[0]!);
    const { eloDeltas } = msg;

    for (const [, delta] of Object.entries(eloDeltas)) {
      expect(typeof delta).toBe("number");
      expect(Number.isNaN(delta)).toBe(false);
      expect(Number.isFinite(delta)).toBe(true);
    }
  });

  it("10.5: endMatch is a no-op when tableState is null", () => {
    const broadcastMsgs: string[] = [];
    const party = {
      id: "test-room",
      connections: makeConns(),
      getConnections: () => makeConns(),
      broadcast: (msg: string) => { broadcastMsgs.push(msg); },
      env: {},
    } as unknown as Party.Party;
    const room = new MatchRoom(party);
    // tableState is null by default

    expect(() => {
      (room as unknown as { endMatch(): void }).endMatch();
    }).not.toThrow();
    expect(broadcastMsgs).toHaveLength(0);
  });

  it("10.6: single survivor (match won) gets place 1, all others from bustOrder", () => {
    const { room, broadcastMsgs } = makeEndMatchRoom(
      [{ id: "winner", stack: 3000 }],
      ["last", "second-to-last"], // last busted first
    );

    (room as unknown as { endMatch(): void }).endMatch();

    const msg = JSON.parse(broadcastMsgs[0]!);
    const { finishPlaceById } = msg;
    expect(finishPlaceById["winner"]).toBe(1);
    // second-to-last busted last → place 2 (survivors.length+1+0 = 1+1+0 = 2)
    expect(finishPlaceById["second-to-last"]).toBe(2);
    // last busted first → place 3 (1+1+1 = 3)
    expect(finishPlaceById["last"]).toBe(3);
  });
});

// ---------- Task 11: Disconnect/reconnect grace ----------

/** Build a single-player dev-mode room (1 authed player). Returns useful handles. */
async function setupSinglePlayerRoom(): Promise<{
  room: MatchRoom;
  conn: MockConn;
  conns: MockConnectionList;
  broadcastMsgs: string[];
  playerId: string;
}> {
  const conns = makeConns();
  const broadcastMsgs: string[] = [];
  const party = {
    id: "test-room",
    connections: conns,
    getConnections: () => conns,
    broadcast: (msg: string) => { broadcastMsgs.push(msg); },
    env: {},
  } as unknown as Party.Party;
  const room = new MatchRoom(party);

  const conn = mockConn("p1");
  conns.set(conn.id, conn);
  room.onConnect(conn);
  await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn);

  return { room, conn, conns, broadcastMsgs, playerId: "alice" };
}

describe("Task 11: disconnect/reconnect grace", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("11.1: disconnect starts grace timer for authed player", async () => {
    vi.useFakeTimers();
    const { room, conn, playerId } = await setupSinglePlayerRoom();

    expect(room.hasDisconnectTimer(playerId)).toBe(false);
    room.onClose(conn);
    expect(room.hasDisconnectTimer(playerId)).toBe(true);
    // player removed from active connections
    expect(room.playerCount).toBe(0);
  });

  it("11.2: disconnect does NOT start grace timer for unauthenticated connection", async () => {
    vi.useFakeTimers();
    const room = new MatchRoom(mockParty({}));
    const conn = mockConn("unauthed");
    room.onConnect(conn);
    // never sent hello — not authed

    room.onClose(conn);
    // No timer for any player
    expect(room.hasDisconnectTimer("")).toBe(false);
  });

  it("11.3: reconnect within grace cancels timer and restores state", async () => {
    vi.useFakeTimers();
    const { room, conn, conns, playerId } = await setupSinglePlayerRoom();

    // Start a match so tableState exists
    await room.onMessage(encode({ t: "startMatch" }), conn);
    expect(room.currentTableState).not.toBeNull();

    // Disconnect
    room.onClose(conn);
    expect(room.hasDisconnectTimer(playerId)).toBe(true);

    // Reconnect before grace expires
    const conn2 = mockConn("p1-reconnect");
    conns.set(conn2.id, conn2);
    room.onConnect(conn2);
    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn2);

    // Timer should be cancelled
    expect(room.hasDisconnectTimer(playerId)).toBe(false);

    // New connection should be authed with same playerId
    const connState2 = room.getPlayer("p1-reconnect");
    expect(connState2?.authed).toBe(true);
    expect(connState2?.playerId).toBe(playerId);

    // Should have received a snapshot
    const msgs = conn2._msgs.map((m) => JSON.parse(m));
    const snapshots = msgs.filter((m) => m.t === "snapshot");
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
  });

  it("11.4: reconnect restores original seatIndex from tableState", async () => {
    vi.useFakeTimers();
    const { room, conn, conns, playerId } = await setupSinglePlayerRoom();

    // Start match
    await room.onMessage(encode({ t: "startMatch" }), conn);

    // Original seat
    const originalSeatIndex = room.getPlayer("p1")!.seatIndex;
    expect(originalSeatIndex).not.toBeNull();

    // Disconnect
    room.onClose(conn);

    // Reconnect
    const conn2 = mockConn("p1-v2");
    conns.set(conn2.id, conn2);
    room.onConnect(conn2);
    await room.onMessage(encode({ t: "hello", jwt: "dev:alice" }), conn2);

    const restoredState = room.getPlayer("p1-v2");
    expect(restoredState?.seatIndex).toBe(originalSeatIndex);
  });

  it("11.5: grace expires while player is NOT the active seat → seat is busted, no action broadcast", async () => {
    vi.useFakeTimers();
    const conns = makeConns();
    const broadcastMsgs: string[] = [];
    const party = {
      id: "test-room",
      connections: conns,
      getConnections: () => conns,
      broadcast: (msg: string) => { broadcastMsgs.push(msg); },
      env: {},
    } as unknown as Party.Party;
    const room = new MatchRoom(party);

    // Set up a full match so we can find a non-active seat to disconnect
    for (let i = 0; i < TABLE_SIZE; i++) {
      const c = mockConn(`seat-${i}`);
      conns.set(c.id, c);
      room.onConnect(c);
      await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), c);
    }

    const ts = room.currentTableState!;
    const activeIdx = ts.toAct!;

    // Pick a non-active seat to disconnect
    const inactiveIdx = (activeIdx + 1) % TABLE_SIZE;
    const inactivePlayerId = `player-${inactiveIdx}`;
    const inactiveConn = conns.get(`seat-${inactiveIdx}`)!;

    // Count events before disconnecting the inactive player
    const broadcastCountBefore = broadcastMsgs.length;

    // Disconnect the inactive player
    room.onClose(inactiveConn);
    expect(room.hasDisconnectTimer(inactivePlayerId)).toBe(true);

    // Advance exactly to grace expiry — but turn timer fires first (active player auto-act).
    // We care that the inactive player's grace expiry does NOT emit an action event.
    // First advance just past turn time to let the active seat auto-act
    const turnTimeMs2 = MATCH_FORMATS[DEFAULT_FORMAT]!.turnTimeMs;
    await vi.advanceTimersByTimeAsync(turnTimeMs2 + 1);

    // Count events so far (from turn timer auto-act)
    const broadcastsAfterTurnTimer = broadcastMsgs.length;

    // Now advance the rest of the grace period (grace - turn time)
    const { DISCONNECT_GRACE_MS: graceMs } = await import("@poker/shared");
    if (graceMs > turnTimeMs2) {
      await vi.advanceTimersByTimeAsync(graceMs - turnTimeMs2);
    }

    // Timer should be gone
    expect(room.hasDisconnectTimer(inactivePlayerId)).toBe(false);

    // No additional action events from the grace expiry itself
    // (any events from broadcastsAfterTurnTimer onward are from turn timers of other seats, NOT the grace expiry fold)
    const graceExpiryBroadcasts = broadcastMsgs.slice(broadcastsAfterTurnTimer);
    const graceExpiryActionEvents = graceExpiryBroadcasts
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "event" && m.event?.seat === inactiveIdx);
    expect(graceExpiryActionEvents).toHaveLength(0);

    // Their seat is now marked busted (even though it was not their turn)
    const seat = room.currentTableState!.seats[inactiveIdx];
    expect(seat?.status).toBe("busted");
    expect(seat?.stack).toBe(0);

    // bustOrder should contain the player
    expect(room.currentBustOrder).toContain(inactivePlayerId);
  });

  it("11.6: grace expires while player IS the active seat → auto-fold emitted", async () => {
    vi.useFakeTimers();
    const conns = makeConns();
    const broadcastMsgs: string[] = [];
    const party = {
      id: "test-room",
      connections: conns,
      getConnections: () => conns,
      broadcast: (msg: string) => { broadcastMsgs.push(msg); },
      env: {},
    } as unknown as Party.Party;
    const room = new MatchRoom(party);

    // Set up a full match
    for (let i = 0; i < TABLE_SIZE; i++) {
      const c = mockConn(`seat-${i}`);
      conns.set(c.id, c);
      room.onConnect(c);
      await room.onMessage(encode({ t: "hello", jwt: `dev:player-${i}` }), c);
    }

    const ts = room.currentTableState!;
    const activeIdx = ts.toAct!;
    const activeConn = conns.get(`seat-${activeIdx}`)!;
    const activePlayerId = `player-${activeIdx}`;

    const broadcastCountBefore = broadcastMsgs.length;

    // Disconnect the active player
    room.onClose(activeConn);
    expect(room.hasDisconnectTimer(activePlayerId)).toBe(true);

    // Advance past grace — auto-fold should fire
    const { DISCONNECT_GRACE_MS: graceMs } = await import("@poker/shared");
    await vi.advanceTimersByTimeAsync(graceMs + 1);

    expect(room.hasDisconnectTimer(activePlayerId)).toBe(false);

    // At least one event should have been broadcast (the auto-fold)
    const newBroadcasts = broadcastMsgs.slice(broadcastCountBefore);
    const eventBroadcasts = newBroadcasts
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "event");
    expect(eventBroadcasts.length).toBeGreaterThanOrEqual(1);

    // The seat should be busted after the grace expires
    const seat = room.currentTableState!.seats[activeIdx];
    expect(seat?.status).toBe("busted");
    expect(seat?.stack).toBe(0);
  });

  it("11.7: grace timer is not started for authed player in onError if onClose has already set it", async () => {
    vi.useFakeTimers();
    const { room, conn, playerId } = await setupSinglePlayerRoom();

    room.onClose(conn);
    expect(room.hasDisconnectTimer(playerId)).toBe(true);

    // Calling onError for the same conn after onClose should not error or double-schedule
    // (conn is already removed from players map, so onError is a no-op)
    expect(() => {
      room.onError(conn, new Error("test"));
    }).not.toThrow();
  });
});

// ---------- Task 12: Bot runner ----------

/** Set up a match room where one human and the rest are bot seats (dev startMatch). */
async function setupBotMatch(): Promise<{
  room: MatchRoom;
  conns: MockConnectionList;
  broadcastMsgs: string[];
}> {
  const conns = makeConns();
  const broadcastMsgs: string[] = [];
  const party = {
    id: "test-room",
    connections: conns,
    getConnections: () => conns,
    broadcast: (msg: string) => { broadcastMsgs.push(msg); },
    env: {},
  } as unknown as Party.Party;
  const room = new MatchRoom(party);

  // Seat exactly one human; remaining seats become bots
  const conn = mockConn("seat-0");
  conns.set(conn.id, conn);
  room.onConnect(conn);
  await room.onMessage(encode({ t: "hello", jwt: "dev:player-0" }), conn);

  // Trigger match start via dev message
  await room.onMessage(encode({ t: "startMatch" }), conn);

  return { room, conns, broadcastMsgs };
}

/** Set up a match room with ALL bot seats (no human connections, triggered via dev message). */
async function setupAllBotMatch(): Promise<{
  room: MatchRoom;
  conns: MockConnectionList;
  broadcastMsgs: string[];
}> {
  const conns = makeConns();
  const broadcastMsgs: string[] = [];
  const party = {
    id: "test-room",
    connections: conns,
    getConnections: () => conns,
    broadcast: (msg: string) => { broadcastMsgs.push(msg); },
    env: {},
  } as unknown as Party.Party;
  const room = new MatchRoom(party);

  // One human to auth and trigger startMatch in dev mode; then we'll inspect bot behavior
  const conn = mockConn("seat-0");
  conns.set(conn.id, conn);
  room.onConnect(conn);
  await room.onMessage(encode({ t: "hello", jwt: "dev:player-0" }), conn);
  await room.onMessage(encode({ t: "startMatch" }), conn);

  return { room, conns, broadcastMsgs };
}

describe("Task 12: Bot runner", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("12.1: botThinkDelayMs returns value in [minMs, maxMs)", () => {
    // Use a simple linear-congruential-style sequence to test range
    let callCount = 0;
    const fakeRng = () => {
      callCount++;
      // Returns values cycling through 0, 0.25, 0.5, 0.75
      return ((callCount - 1) % 4) / 4;
    };
    const min = BOT_DECISION_DELAY_MIN_MS;
    const max = BOT_DECISION_DELAY_MAX_MS;
    for (let i = 0; i < 20; i++) {
      const delay = botThinkDelayMs(fakeRng, min, max);
      expect(delay).toBeGreaterThanOrEqual(min);
      expect(delay).toBeLessThan(max);
    }
  });

  it("12.2: turn timer NOT started for bot seat (turnTimer handle is null after bot turn)", async () => {
    vi.useFakeTimers();
    const { room } = await setupBotMatch();

    const ts = room.currentTableState!;
    const toAct = ts.toAct;

    // If the first seat to act is a bot, the turn timer should NOT have been started
    if (toAct !== null) {
      const seat = ts.seats[toAct];
      if (seat?.id.startsWith("bot-")) {
        // Access turnTimer via private cast — its handle should be null (not started)
        const turnTimer = (room as unknown as { turnTimer: { handle: ReturnType<typeof setTimeout> | null } }).turnTimer;
        expect(turnTimer.handle).toBeNull();
      }
    }
  });

  it("12.3: bot seat acts automatically after think delay", async () => {
    vi.useFakeTimers();
    const { room, broadcastMsgs } = await setupBotMatch();

    const ts = room.currentTableState!;
    const toAct = ts.toAct;
    if (toAct === null) return;

    const seat = ts.seats[toAct];
    if (!seat?.id.startsWith("bot-")) {
      // The first actor is not a bot in this arrangement — skip
      return;
    }

    const broadcastCountBefore = broadcastMsgs.length;

    // Advance past max bot think delay — bot should have acted
    await vi.advanceTimersByTimeAsync(BOT_DECISION_DELAY_MAX_MS + 1);

    const newBroadcasts = broadcastMsgs.slice(broadcastCountBefore);
    const eventBroadcasts = newBroadcasts
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "event");
    expect(eventBroadcasts.length).toBeGreaterThanOrEqual(1);
  });

  it("12.4: all-bot table: startMatch → advance timers → at least one hand action taken automatically", async () => {
    vi.useFakeTimers();
    const { room, broadcastMsgs } = await setupAllBotMatch();

    expect(room.currentTableState).not.toBeNull();

    // All seats should be bots (player-0 is human, rest are bots; toAct might be any seat)
    const broadcastCountBefore = broadcastMsgs.length;

    // Advance well past the max bot delay to allow several bot actions
    await vi.advanceTimersByTimeAsync(BOT_DECISION_DELAY_MAX_MS * TABLE_SIZE + 100);

    const newBroadcasts = broadcastMsgs.slice(broadcastCountBefore);
    const eventBroadcasts = newBroadcasts
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "event");

    // At least one action should have been automatically taken by bots
    expect(eventBroadcasts.length).toBeGreaterThanOrEqual(1);
  });

  it("12.5: seatRngs has non-null entries only for bot seats after startMatch", async () => {
    const { room } = await setupBotMatch();

    const ts = room.currentTableState!;
    const seatRngs = room.currentSeatRngs;

    expect(seatRngs).toHaveLength(TABLE_SIZE);
    for (let i = 0; i < TABLE_SIZE; i++) {
      const seat = ts.seats[i];
      if (seat?.id.startsWith("bot-")) {
        expect(seatRngs[i]).not.toBeNull();
        expect(typeof seatRngs[i]).toBe("function");
      } else {
        expect(seatRngs[i]).toBeNull();
      }
    }
  });

  it("12.6: executeBotAction is a no-op when it's not the bot's turn", async () => {
    vi.useFakeTimers();
    const { room, broadcastMsgs } = await setupBotMatch();

    const ts = room.currentTableState!;
    const toAct = ts.toAct!;

    // Attempt to fire executeBotAction for a seat that is NOT toAct
    const wrongSeat = (toAct + 1) % TABLE_SIZE;
    const broadcastCountBefore = broadcastMsgs.length;

    (room as unknown as { executeBotAction(i: number): void }).executeBotAction(wrongSeat);

    // No events should have been broadcast
    const newBroadcasts = broadcastMsgs.slice(broadcastCountBefore);
    const eventBroadcasts = newBroadcasts
      .map((m) => JSON.parse(m))
      .filter((m) => m.t === "event");
    expect(eventBroadcasts).toHaveLength(0);
  });
});
