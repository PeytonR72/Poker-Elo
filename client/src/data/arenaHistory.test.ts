import { describe, it, expect } from "vitest";
import { TABLE_SIZE } from "@poker/shared";
import {
  buildArenaHistory,
  ratingSeries,
  ordinal,
  type ArenaMatchRow,
} from "./arenaHistory.js";

function row(over: Partial<ArenaMatchRow> & { match_id: string }): ArenaMatchRow {
  return {
    finish_place: 3,
    elo_delta: 5,
    rating_after: 405,
    matches: { format: "turbo", ended_at: "2026-07-10T00:00:00Z" },
    ...over,
  };
}

describe("ordinal", () => {
  it("handles common places", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(21)).toBe("21st");
  });
});

describe("buildArenaHistory", () => {
  it("shapes rows with placement, format label, and win flag", () => {
    const out = buildArenaHistory([
      row({ match_id: "a", finish_place: 1, elo_delta: 12, rating_after: 412 }),
    ]);
    expect(out[0]).toMatchObject({
      matchId: "a",
      formatLabel: "Turbo",
      finishPlace: 1,
      placement: `1st / ${TABLE_SIZE}`,
      eloDelta: 12,
      won: true,
    });
  });

  it("limits to the requested count (newest-first input)", () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ match_id: `m${i}` }));
    expect(buildArenaHistory(rows, 5)).toHaveLength(5);
    expect(buildArenaHistory(rows, 5)[0]!.matchId).toBe("m0");
  });

  it("falls back gracefully when the joined match row is missing", () => {
    const out = buildArenaHistory([row({ match_id: "x", matches: null })]);
    expect(out[0]!.formatLabel).toBe("—");
    expect(out[0]!.date).toBe("");
  });

  it("marks non-first finishes as not won", () => {
    const out = buildArenaHistory([row({ match_id: "b", finish_place: 4 })]);
    expect(out[0]!.won).toBe(false);
  });
});

describe("ratingSeries", () => {
  it("reverses newest-first rows into chronological order", () => {
    const rows = [
      row({ match_id: "c", rating_after: 430 }),
      row({ match_id: "b", rating_after: 420 }),
      row({ match_id: "a", rating_after: 410 }),
    ];
    expect(ratingSeries(rows)).toEqual([410, 420, 430]);
  });

  it("keeps only the newest n before reversing", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row({ match_id: `m${i}`, rating_after: 400 + i }),
    );
    // newest-first: rating_after 400 is newest. keep 3 newest → 400,401,402, reversed
    expect(ratingSeries(rows, 3)).toEqual([402, 401, 400]);
  });
});
