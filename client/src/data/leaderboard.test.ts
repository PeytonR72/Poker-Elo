import { describe, it, expect } from "vitest";
import { buildLeaderboard, type ProfileRow } from "./leaderboard.js";

const row = (over: Partial<ProfileRow>): ProfileRow => ({
  id: "x", username: null, rating: 400, games_played: 1, ...over,
});

describe("buildLeaderboard", () => {
  it("assigns 1-based positions in rating-desc order with name tie-break", () => {
    const rows = [
      row({ id: "a", username: "Bob", rating: 500 }),
      row({ id: "b", username: "Amy", rating: 500 }),
      row({ id: "c", username: "Cy", rating: 600 }),
    ];
    const { entries } = buildLeaderboard(rows, null, null, null);
    expect(entries.map((e) => [e.position, e.id])).toEqual([[1, "c"], [2, "b"], [2, "a"]]);
  });

  it("flags the own row when it is inside the list and adds no tail", () => {
    const rows = [row({ id: "a", rating: 500 }), row({ id: "me", rating: 450 })];
    const lb = buildLeaderboard(rows, null, null, "me");
    expect(lb.entries.find((e) => e.id === "me")?.isOwn).toBe(true);
    expect(lb.ownTail).toBeUndefined();
  });

  it("appends an own tail when the player is outside the list", () => {
    const rows = [row({ id: "a", rating: 500 })];
    const ownRow = row({ id: "me", username: "Me", rating: 410, games_played: 4 });
    const lb = buildLeaderboard(rows, ownRow, 87, "me", { me: 1 });
    expect(lb.ownTail).toEqual({
      position: 87, id: "me", name: "Me", rating: 410, gamesPlayed: 4,
      wins: 1, winRate: 0.25, isOwn: true,
    });
  });

  it("derives wins and win-rate from the wins map (default 0 when absent)", () => {
    const rows = [
      row({ id: "a", rating: 600, games_played: 10 }),
      row({ id: "b", rating: 500, games_played: 4 }),
    ];
    const { entries } = buildLeaderboard(rows, null, null, null, { a: 3 });
    const a = entries.find((e) => e.id === "a")!;
    const b = entries.find((e) => e.id === "b")!;
    expect([a.wins, a.winRate]).toEqual([3, 0.3]);
    expect([b.wins, b.winRate]).toEqual([0, 0]);
  });

  it("reports a null win-rate when the player has zero games", () => {
    const { entries } = buildLeaderboard([row({ id: "z", games_played: 0 })], null, null, null);
    expect(entries[0]?.winRate).toBeNull();
  });

  it("omits the tail when the own player has played zero games", () => {
    const rows = [row({ id: "a", rating: 500 })];
    const ownRow = row({ id: "me", rating: 400, games_played: 0 });
    expect(buildLeaderboard(rows, ownRow, 99, "me").ownTail).toBeUndefined();
  });

  it("skips position after a tie (competition ranking)", () => {
    const rows = [
      row({ id: "a", rating: 600 }),
      row({ id: "b", rating: 500 }),
      row({ id: "c", rating: 500 }),
      row({ id: "d", rating: 400 }),
    ];
    const { entries } = buildLeaderboard(rows, null, null, null);
    expect(entries.map((e) => e.position)).toEqual([1, 2, 2, 4]);
  });

  it("returns an empty board for no rows", () => {
    expect(buildLeaderboard([], null, null, null)).toEqual({ entries: [] });
  });
});
