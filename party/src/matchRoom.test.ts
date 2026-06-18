import { describe, it, expect } from "vitest";
import type * as Party from "partykit/server";
import MatchRoom from "./matchRoom.js";

function mockConn(id: string): Party.Connection {
  const msgs: string[] = [];
  return {
    id,
    send: (msg: string) => {
      msgs.push(msg);
    },
    close: () => {},
    socket: {} as unknown,
    state: null,
    setState: () => {},
  } as unknown as Party.Connection;
}

function mockParty(): Party.Party {
  return {
    id: "test-room",
    connections: [],
    broadcast: () => {},
    env: {},
  } as unknown as Party.Party;
}

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
