import { describe, it, expect } from "vitest";
import { encode, decode } from "./protocol.js";
import type { ClientMsg, ServerMsg } from "./protocol.js";

describe("protocol encode/decode", () => {
  it("round-trips a client action message", () => {
    const msg: ClientMsg = { t: "action", seat: 3, action: "raise", amount: 60 };
    expect(decode<ClientMsg>(encode(msg))).toEqual(msg);
  });

  it("round-trips a server snapshot message", () => {
    const msg: ServerMsg = { t: "snapshot", view: { board: [] } };
    expect(decode<ServerMsg>(encode(msg))).toEqual(msg);
  });

  it("validates the tag only and rejects a malformed envelope", () => {
    expect(() => decode("not json")).toThrow();
    expect(() => decode(JSON.stringify({ noTag: true }))).toThrow();
  });
});

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

describe("protocol: spectator messages", () => {
  it("round-trips a spectate client message", () => {
    const msg: ClientMsg = { t: "spectate" };
    expect(decode<ClientMsg>(encode(msg))).toEqual(msg);
  });

  it("round-trips a hello message with the spectate flag set", () => {
    const msg: ClientMsg = { t: "hello", jwt: "dev:u1", spectate: true };
    expect(decode<ClientMsg>(encode(msg))).toEqual(msg);
  });

  it("round-trips a spectatorCount server message", () => {
    const msg: ServerMsg = { t: "spectatorCount", n: 4 };
    expect(decode<ServerMsg>(encode(msg))).toEqual(msg);
  });

  it("round-trips a liveMatches request and response", () => {
    const request: ClientMsg = { t: "liveMatches" };
    const response: ServerMsg = {
      t: "liveMatches",
      matches: [
        {
          roomId: "ABC123",
          format: "turbo",
          startedAt: 1000,
          players: [
            { playerId: "user-1", rating: 500 },
            { playerId: "user-2", rating: 480 },
          ],
        },
      ],
    };
    expect(decode<ClientMsg>(encode(request))).toEqual(request);
    expect(decode<ServerMsg>(encode(response))).toEqual(response);
  });

  it("round-trips a liveMatches response with an empty list", () => {
    const response: ServerMsg = { t: "liveMatches", matches: [] };
    expect(decode<ServerMsg>(encode(response))).toEqual(response);
  });
});
