import { describe, expect, it } from "vitest";
import type { LeaderboardEntry } from "../data/leaderboard.js";
import { displayName } from "../data/displayName.js";
import { filterEntries } from "./filterEntries.js";

const e = (username: string, id?: string): LeaderboardEntry => {
  const userId = id ?? username;
  return {
    position: 1,
    id: userId,
    name: displayName({ id: userId, username }),
    rating: 400,
    gamesPlayed: 10,
    isOwn: false,
  };
};

describe("filterEntries", () => {
  it("empty query returns all", () => {
    expect(filterEntries([e("Alice"), e("Bob")], "  ")).toHaveLength(2);
  });
  it("filters case-insensitively on display name", () => {
    const out = filterEntries([e("Alice"), e("Bob")], "ali");
    expect(out).toHaveLength(1);
  });
});
