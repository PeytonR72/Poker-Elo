import { describe, it, expect } from "vitest";
import type * as Party from "partykit/server";
import { SignJWT } from "jose";
import { encode, TABLE_SIZE } from "@poker/shared";
import MatchRoom, { csprngSeed } from "./matchRoom.js";

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
