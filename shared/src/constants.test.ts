import { describe, it, expect } from "vitest";
import {
  TABLE_SIZE,
  STARTING_STACK,
  ELO_DEFAULT_RATING,
  ELO_K_FACTOR,
  ELO_PROVISIONAL_K,
  ELO_PROVISIONAL_GAMES,
  MATCH_FORMATS,
  DEFAULT_FORMAT,
  RANK_TIERS,
  rankForRating,
} from "./constants.js";

describe("core constants", () => {
  it("has a 6-max table and $1000 start", () => {
    expect(TABLE_SIZE).toBe(6);
    expect(STARTING_STACK).toBe(1000);
  });

  it("starts rating at 400", () => {
    expect(ELO_DEFAULT_RATING).toBe(400);
    expect(ELO_K_FACTOR).toBe(24);
    expect(ELO_PROVISIONAL_K).toBe(48);
    expect(ELO_PROVISIONAL_GAMES).toBe(30);
  });
});

describe("match formats", () => {
  it("default format is turbo and exists", () => {
    expect(DEFAULT_FORMAT).toBe("turbo");
    expect(MATCH_FORMATS[DEFAULT_FORMAT]).toBeDefined();
  });

  it("every format has ascending blind levels and a positive duration", () => {
    for (const id of Object.keys(MATCH_FORMATS)) {
      const f = MATCH_FORMATS[id]!;
      expect(f.matchDurationMs).toBeGreaterThan(0);
      expect(f.turnTimeMs).toBeGreaterThan(0);
      expect(f.blindLevels.length).toBeGreaterThan(0);
      for (let i = 1; i < f.blindLevels.length; i++) {
        const prev = f.blindLevels[i - 1]!;
        const cur = f.blindLevels[i]!;
        expect(cur.bb).toBeGreaterThan(prev.bb);
        expect(cur.sb).toBe(cur.bb / 2);
      }
      // first level is 10/20
      expect(f.blindLevels[0]).toEqual({ sb: 10, bb: 20 });
    }
  });

  it("turbo caps at 50/100, long caps at 75/150", () => {
    const turbo = MATCH_FORMATS.turbo!.blindLevels;
    expect(turbo[turbo.length - 1]).toEqual({ sb: 50, bb: 100 });
    const long = MATCH_FORMATS.long!.blindLevels;
    expect(long[long.length - 1]).toEqual({ sb: 75, bb: 150 });
  });
});

describe("rank tiers", () => {
  it("maps ratings to the right rank", () => {
    expect(rankForRating(0)).toBe("Fish");
    expect(rankForRating(400)).toBe("Fish");
    expect(rankForRating(500)).toBe("Limper");
    expect(rankForRating(749)).toBe("Limper");
    expect(rankForRating(750)).toBe("Grinder");
    expect(rankForRating(1000)).toBe("Shark");
    expect(rankForRating(1300)).toBe("Semi-Pro");
    expect(rankForRating(1750)).toBe("Final Tablist");
    expect(rankForRating(3000)).toBe("Final Tablist");
  });

  it("RANK_TIERS is ordered by ascending floor", () => {
    for (let i = 1; i < RANK_TIERS.length; i++) {
      expect(RANK_TIERS[i]!.minRating).toBeGreaterThan(RANK_TIERS[i - 1]!.minRating);
    }
  });
});
