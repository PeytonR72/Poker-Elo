import { describe, it, expect } from "vitest";
import { RANK_TIERS } from "@poker/shared";
import { tierProgress } from "./arenaTier.js";

describe("tierProgress", () => {
  it("places a default rating in the first tier with progress toward the next", () => {
    const p = tierProgress(400); // Fish (floor 0) → Limper (floor 500)
    expect(p.tier).toBe("Fish");
    expect(p.nextTier).toBe("Limper");
    expect(p.pointsToNext).toBe(100);
    expect(p.percent).toBeCloseTo(80); // 400 / 500 band
    expect(p.isTopTier).toBe(false);
  });

  it("reports the correct band at a mid tier", () => {
    const p = tierProgress(500); // Limper (500) → Grinder (750)
    expect(p.tier).toBe("Limper");
    expect(p.nextTier).toBe("Grinder");
    expect(p.pointsToNext).toBe(250);
    expect(p.percent).toBeCloseTo(0);
  });

  it("marks the top tier with no next and 100%", () => {
    const top = RANK_TIERS[RANK_TIERS.length - 1]!;
    const p = tierProgress(top.minRating + 500);
    expect(p.tier).toBe(top.name);
    expect(p.nextTier).toBeNull();
    expect(p.pointsToNext).toBeNull();
    expect(p.percent).toBe(100);
    expect(p.isTopTier).toBe(true);
  });

  it("never returns negative points-to-next", () => {
    const p = tierProgress(RANK_TIERS[1]!.minRating - 1);
    expect(p.pointsToNext).toBeGreaterThanOrEqual(0);
  });
});
