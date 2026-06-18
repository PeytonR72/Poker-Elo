import { describe, it, expect } from "vitest";
import { buildPots } from "./pots.js";
import { createSeat } from "./state.js";
import type { Seat } from "./types.js";

function seat(id: string, committedTotal: number, status: Seat["status"]): Seat {
  return { ...createSeat(id, false, 0), committedTotal, status };
}

describe("buildPots", () => {
  it("single pot when everyone contributes equally", () => {
    const pots = buildPots([
      seat("a", 100, "active"),
      seat("b", 100, "active"),
      seat("c", 100, "active"),
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0]!.amount).toBe(300);
    expect(pots[0]!.eligible.sort()).toEqual([0, 1, 2]);
  });

  it("builds a side pot when a short stack is all-in", () => {
    // a all-in 40, b and c put 100 each
    const pots = buildPots([
      seat("a", 40, "allin"),
      seat("b", 100, "active"),
      seat("c", 100, "active"),
    ]);
    // main pot: 40*3 = 120 eligible a,b,c ; side pot: 60*2 = 120 eligible b,c
    expect(pots).toHaveLength(2);
    expect(pots[0]!.amount).toBe(120);
    expect(pots[0]!.eligible.sort()).toEqual([0, 1, 2]);
    expect(pots[1]!.amount).toBe(120);
    expect(pots[1]!.eligible.sort()).toEqual([1, 2]);
  });

  it("folded chips are dead money in the pot but the folder is not eligible", () => {
    const pots = buildPots([
      seat("a", 100, "active"),
      seat("b", 100, "active"),
      seat("c", 50, "folded"), // folded after putting in 50
    ]);
    const total = pots.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(250); // all chips accounted for
    for (const p of pots) expect(p.eligible).not.toContain(2);
  });

  it("conserves chips: sum of pots equals sum of contributions", () => {
    const seats = [
      seat("a", 33, "allin"),
      seat("b", 77, "allin"),
      seat("c", 120, "active"),
      seat("d", 25, "folded"),
    ];
    const total = seats.reduce((s, x) => s + x.committedTotal, 0);
    const pots = buildPots(seats);
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(total);
  });
});
