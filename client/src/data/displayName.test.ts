import { describe, it, expect } from "vitest";
import { displayName } from "./displayName.js";

describe("displayName", () => {
  it("prefixes bots with the robot glyph and their persona name", () => {
    expect(displayName({ id: "bot-2-crazy-mike" })).toBe("🤖 Crazy Mike");
  });
  it("falls back to the baseline persona for an unrecognized/legacy bot id", () => {
    expect(displayName({ id: "bot-3" })).toBe("🤖 Grinder Greg");
  });
  it("uses a non-empty username", () => {
    expect(displayName({ id: "abcdef0123", username: "Phil" })).toBe("Phil");
  });
  it("falls back to player_<8> when username is null/empty/whitespace", () => {
    expect(displayName({ id: "abcdef0123456", username: null })).toBe("player_abcdef01");
    expect(displayName({ id: "abcdef0123456", username: "   " })).toBe("player_abcdef01");
    expect(displayName({ id: "abcdef0123456" })).toBe("player_abcdef01");
  });
});
