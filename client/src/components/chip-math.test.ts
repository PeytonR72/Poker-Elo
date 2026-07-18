import { describe, it, expect } from "vitest";
import { chipBreakdown, visibleDiscs } from "./chip-math.js";

describe("chipBreakdown", () => {
  it("breaks an amount greedily, largest denomination first", () => {
    expect(chipBreakdown(680)).toEqual([
      { value: 500, count: 1 },
      { value: 100, count: 1 },
      { value: 25, count: 3 },
      { value: 5, count: 1 },
    ]);
  });

  it("uses the 1-chip for remainders below the smallest colored denom", () => {
    expect(chipBreakdown(3)).toEqual([{ value: 1, count: 3 }]);
    expect(chipBreakdown(7)).toEqual([
      { value: 5, count: 1 },
      { value: 1, count: 2 },
    ]);
  });

  it("conserves the total value across the breakdown", () => {
    for (const amount of [1, 42, 137, 999, 5000, 12345]) {
      const total = chipBreakdown(amount).reduce((s, t) => s + t.value * t.count, 0);
      expect(total).toBe(amount);
    }
  });

  it("returns [] for zero, negative, or non-finite amounts", () => {
    expect(chipBreakdown(0)).toEqual([]);
    expect(chipBreakdown(-5)).toEqual([]);
    expect(chipBreakdown(NaN)).toEqual([]);
  });

  it("floors fractional amounts", () => {
    expect(chipBreakdown(26.9)).toEqual([
      { value: 25, count: 1 },
      { value: 1, count: 1 },
    ]);
  });
});

describe("visibleDiscs", () => {
  it("caps the visible stack and reports the hidden remainder", () => {
    // 2500 = five 500 discs + more → hidden count grows past max
    const { discs, hidden } = visibleDiscs(1500, 5);
    expect(discs).toHaveLength(3); // three 500s
    expect(hidden).toBe(0);
  });

  it("hides discs beyond the max", () => {
    const { discs, hidden } = visibleDiscs(6, 3); // 5,1 -> flat [5,1]
    expect(discs).toEqual([5, 1]);
    expect(hidden).toBe(0);

    const many = visibleDiscs(5, 3, [1]); // five 1-discs
    expect(many.discs).toEqual([1, 1, 1]);
    expect(many.hidden).toBe(2);
  });
});
