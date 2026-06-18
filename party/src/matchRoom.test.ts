import { describe, it, expect } from "vitest";
import type * as Party from "partykit/server";
import { SignJWT } from "jose";
import { encode, TABLE_SIZE } from "@poker/shared";
import MatchRoom from "./matchRoom.js";

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

function mockParty(env: Record<string, string> = {}): Party.Party {
  return {
    id: "test-room",
    connections: [],
    broadcast: () => {},
    env,
  } as unknown as Party.Party;
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

    // Fill all TABLE_SIZE seats
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
