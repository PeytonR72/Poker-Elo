import { describe, it, expect } from "vitest";
import { RANK_TIERS } from "@poker/shared";
import { tierLadder } from "./tierLadder.js";

describe("tierLadder", () => {
  it("returns one rung per RANK_TIER in order", () => {
    const rungs = tierLadder(400);
    expect(rungs.map((r) => r.name)).toEqual(RANK_TIERS.map((t) => t.name));
  });

  it("marks passed / current / future around the rating's tier", () => {
    // rating 1000 → Shark (index 3): Fish/Limper/Grinder passed, Shark current, rest future.
    const states = tierLadder(1000).map((r) => r.state);
    expect(states).toEqual(["passed", "passed", "passed", "current", "future", "future"]);
  });

  it("computes progress toward the next tier on the current rung", () => {
    // Limper floor 500, Grinder floor 750 → span 250. rating 625 is halfway.
    const rungs = tierLadder(625);
    const current = rungs.find((r) => r.state === "current")!;
    expect(current.name).toBe("Limper");
    expect(current.progressToNext).toBeCloseTo(0.5);
  });

  it("fills the top tier's progress to 1", () => {
    const rungs = tierLadder(2000);
    const current = rungs.find((r) => r.state === "current")!;
    expect(current.name).toBe("Final Tablist");
    expect(current.progressToNext).toBe(1);
  });

  it("reports zero progress on non-current rungs", () => {
    for (const r of tierLadder(1000)) {
      if (r.state !== "current") expect(r.progressToNext).toBe(0);
    }
  });
});
