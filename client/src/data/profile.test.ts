import { describe, it, expect } from "vitest";
import { buildProfile, computeStreak, durationLabel, type MatchResultRow } from "./profile.js";
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
    expect(header.winRate).toBeCloseTo(2 / 3);
    // Results are newest-first: [1, 4, 1] → current run is a single win.
    expect(header.streak).toBe("W1");
  });

  it("reports null win-rate and streak for a player with no games", () => {
    const fresh: ProfileRow = { id: "z", username: null, rating: 400, games_played: 0 };
    const { header } = buildProfile(fresh, []);
    expect(header.winRate).toBeNull();
    expect(header.streak).toBeNull();
  });

  it("maps history rows to display fields using MATCH_FORMATS labels", () => {
    const { history } = buildProfile(profile, [result({ match_id: "m1" })]);
    expect(history[0]).toEqual({
      matchId: "m1", date: "2026-06-20T10:00:00Z", formatLabel: "Turbo",
      finishPlace: 2, eloDelta: -8, ratingAfter: 512, durationLabel: null,
    });
  });

  it("computes a duration label when start/end timestamps are present", () => {
    const { history } = buildProfile(profile, [
      result({
        matches: {
          format: "turbo",
          started_at: "2026-06-20T10:00:00Z",
          ended_at: "2026-06-20T10:12:30Z",
        },
      }),
    ]);
    expect(history[0]?.durationLabel).toBe("12m 30s");
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

describe("computeStreak", () => {
  it("returns null for an empty list", () => {
    expect(computeStreak([])).toBeNull();
  });

  it("counts a consecutive win run from the most recent match", () => {
    expect(computeStreak([1, 1, 1, 3])).toBe("W3");
  });

  it("counts a consecutive loss run (any non-first place)", () => {
    expect(computeStreak([4, 2, 6, 1])).toBe("L3");
  });

  it("handles a single-match history", () => {
    expect(computeStreak([1])).toBe("W1");
    expect(computeStreak([5])).toBe("L1");
  });
});

describe("durationLabel", () => {
  it("returns null when either timestamp is missing", () => {
    expect(durationLabel(null, "2026-06-20T10:00:00Z")).toBeNull();
    expect(durationLabel("2026-06-20T10:00:00Z", undefined)).toBeNull();
  });

  it("returns null for a non-positive span", () => {
    expect(durationLabel("2026-06-20T10:05:00Z", "2026-06-20T10:00:00Z")).toBeNull();
  });

  it("formats minutes and seconds", () => {
    expect(durationLabel("2026-06-20T10:00:00Z", "2026-06-20T10:12:30Z")).toBe("12m 30s");
  });

  it("omits the minutes segment for sub-minute matches", () => {
    expect(durationLabel("2026-06-20T10:00:00Z", "2026-06-20T10:00:45Z")).toBe("45s");
  });
});
