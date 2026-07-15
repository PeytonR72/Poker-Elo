import { describe, expect, it } from "vitest";
import { avatarUrl } from "./avatar.js";

describe("avatarUrl", () => {
  it("is deterministic per seed and URL-encodes it", () => {
    expect(avatarUrl("abc")).toBe(avatarUrl("abc"));
    expect(avatarUrl("a b")).toContain("seed=a%20b");
    expect(avatarUrl("x")).toMatch(/^https:\/\/api\.dicebear\.com\/9\.x\/adventurer-neutral\/svg\?/);
  });
});
