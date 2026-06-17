import { describe, it, expect } from "vitest";
import { evaluate5 } from "./evaluate5.js";
import { evaluate7Naive } from "./evaluate7Naive.js";
import { HandCategory } from "./categories.js";
import { cardFromString as C } from "../cards.js";

const five = (s: string) => s.split(" ").map(C);

function categoryOf(value: number): number {
  return Math.floor(value / 16 ** 5);
}

describe("evaluate5 categories", () => {
  it("ranks the canonical category ladder correctly", () => {
    const royal = evaluate5(five("As Ks Qs Js Ts"));
    const quads = evaluate5(five("9c 9d 9h 9s Kc"));
    const boat = evaluate5(five("8c 8d 8h Kc Kd"));
    const flush = evaluate5(five("Ah Th 7h 4h 2h"));
    const straight = evaluate5(five("8c 7d 6h 5s 4c"));
    const trips = evaluate5(five("Qc Qd Qh 9s 2c"));
    const twoPair = evaluate5(five("Jc Jd 4h 4s 9c"));
    const pair = evaluate5(five("5c 5d Kh 9s 2c"));
    const high = evaluate5(five("Ah Qd 9h 5s 2c"));
    const ordered = [high, pair, twoPair, trips, straight, flush, boat, quads, royal];
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!).toBeGreaterThan(ordered[i - 1]!);
    }
    expect(categoryOf(royal)).toBe(HandCategory.StraightFlush);
    expect(categoryOf(quads)).toBe(HandCategory.Quads);
    expect(categoryOf(high)).toBe(HandCategory.HighCard);
  });

  it("handles the wheel (A-2-3-4-5) as a 5-high straight", () => {
    const wheel = evaluate5(five("Ah 2c 3d 4s 5h"));
    const sixHigh = evaluate5(five("2c 3d 4s 5h 6c"));
    expect(categoryOf(wheel)).toBe(HandCategory.Straight);
    expect(sixHigh).toBeGreaterThan(wheel);
    const broadway = evaluate5(five("Ts Jd Qh Ks Ac"));
    expect(broadway).toBeGreaterThan(sixHigh);
  });

  it("recognizes the steel wheel (A-2-3-4-5 suited) as a straight flush", () => {
    const steel = evaluate5(five("Ah 2h 3h 4h 5h"));
    expect(categoryOf(steel)).toBe(HandCategory.StraightFlush);
    const sixHighSf = evaluate5(five("2h 3h 4h 5h 6h"));
    expect(sixHighSf).toBeGreaterThan(steel);
  });

  it("kicker comparisons resolve same-category ties", () => {
    const aceKing = evaluate5(five("Ah Ad Kc 7d 2s"));
    const aceQueen = evaluate5(five("Ah Ad Qc 7d 2s"));
    expect(aceKing).toBeGreaterThan(aceQueen);
  });
});

describe("evaluate7Naive picks best 5 of 7", () => {
  const seven = (s: string) => s.split(" ").map(C);
  it("finds a flush using the board", () => {
    expect(categoryOf(evaluate7Naive(seven("Ah Kd 2h 5h 9h Jh 3c")))).toBe(HandCategory.Flush);
  });
  it("board plays a straight everyone shares", () => {
    expect(categoryOf(evaluate7Naive(seven("2c 7d 5h 6s 4c 3d Kh")))).toBe(HandCategory.Straight);
  });
});
