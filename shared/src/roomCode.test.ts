import { describe, it, expect } from "vitest";
import { makeRoomCode, ROOM_CODE_ALPHABET } from "./roomCode.js";
import { mulberry32 } from "./rng.js";

describe("makeRoomCode", () => {
  it("produces a code of the requested length from the alphabet", () => {
    const rng = mulberry32(42);
    const code = makeRoomCode(6, rng);
    expect(code).toHaveLength(6);
    for (const ch of code) {
      expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it("is deterministic for a seeded rng", () => {
    expect(makeRoomCode(6, mulberry32(1))).toBe(makeRoomCode(6, mulberry32(1)));
  });

  it("excludes ambiguous characters", () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[O0I1l]/);
  });
});
