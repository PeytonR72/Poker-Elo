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
