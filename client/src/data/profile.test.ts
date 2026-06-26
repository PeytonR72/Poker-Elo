import { describe, it, expect } from "vitest";
import { buildProfile, type MatchResultRow } from "./profile.js";
import type { ProfileRow } from "./leaderboard.js";

const profile: ProfileRow = { id: "me", username: "Me", rating: 520, games_played: 3 };

const result = (over: Partial<MatchResultRow>): MatchResultRow => ({
  match_id: "m", finish_place: 2, elo_delta: -8, rating_after: 512,
  matches: { format: "turbo", ended_at: "2026-06-20T10:00:00Z" }, ...over,
});

describe("buildProfile", () => {
  it("derives header stats including tier, first-place count and best finish", () => {
    const { header } = buildProfile(profile, [
      result({ finish_place: 1 }),
      result({ finish_place: 4 }),
      result({ finish_place: 1 }),
    ]);
    expect(header.name).toBe("Me");
    expect(header.tier).toBe("Limper"); // rating 520 -> Limper per RANK_TIERS (Limper = 500..749)
    expect(header.gamesPlayed).toBe(3);
    expect(header.firstPlaceCount).toBe(2);
    expect(header.bestFinish).toBe(1);
  });

  it("maps history rows to display fields using MATCH_FORMATS labels", () => {
    const { history } = buildProfile(profile, [result({ match_id: "m1" })]);
    expect(history[0]).toEqual({
      matchId: "m1", date: "2026-06-20T10:00:00Z", formatLabel: "Turbo",
      finishPlace: 2, eloDelta: -8, ratingAfter: 512,
    });
  });

  it("handles empty history and missing match join", () => {
    const empty = buildProfile(profile, []);
    expect(empty.history).toEqual([]);
    expect(empty.header.bestFinish).toBeNull();
    expect(empty.header.firstPlaceCount).toBe(0);

    const { history } = buildProfile(profile, [result({ matches: null })]);
    expect(history[0]?.formatLabel).toBe("—");
    expect(history[0]?.date).toBe("");
  });

  it("falls back to the raw format string when unknown", () => {
    const { history } = buildProfile(profile, [
      result({ matches: { format: "mystery", ended_at: "2026-06-01T00:00:00Z" } }),
    ]);
    expect(history[0]?.formatLabel).toBe("mystery");
  });
});
