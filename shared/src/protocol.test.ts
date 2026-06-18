import { describe, it, expect } from "vitest";
import { encode, decode, type ClientMsg, type ServerMsg } from "./protocol.js";

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
