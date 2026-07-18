import { describe, expect, it } from "vitest";
import { cardFromString } from "@poker/shared";
import { handNameFor, describePackedHand, unpackHandValue } from "./handName.js";
import { evaluate7, HandCategory, pack } from "@poker/shared";

const c = (s: string) => cardFromString(s);

describe("describePackedHand", () => {
  it("names each category from a packed value", () => {
    expect(describePackedHand(pack(HandCategory.HighCard, [12, 10, 8, 6, 4]))).toBe("Ace High");
    expect(describePackedHand(pack(HandCategory.Pair, [3, 12, 10, 8]))).toBe("Pair of Fives");
    expect(describePackedHand(pack(HandCategory.TwoPair, [11, 9, 2]))).toBe(
      "Two Pair, Kings and Jacks",
    );
    expect(describePackedHand(pack(HandCategory.Trips, [7]))).toBe("Three of a Kind, Nines");
    expect(describePackedHand(pack(HandCategory.Straight, [8]))).toBe("Straight, Ten High");
    expect(describePackedHand(pack(HandCategory.Flush, [12]))).toBe("Flush, Ace High");
    expect(describePackedHand(pack(HandCategory.FullHouse, [11, 9]))).toBe(
      "Full House, Kings full of Jacks",
    );
    expect(describePackedHand(pack(HandCategory.Quads, [0]))).toBe("Four of a Kind, Twos");
    expect(describePackedHand(pack(HandCategory.StraightFlush, [10]))).toBe(
      "Straight Flush, Queen High",
    );
    expect(describePackedHand(pack(HandCategory.StraightFlush, [12]))).toBe("Royal Flush");
  });

  it("pluralizes Six correctly", () => {
    expect(describePackedHand(pack(HandCategory.Pair, [4, 12, 10, 8]))).toBe("Pair of Sixes");
  });

  it("round-trips through unpack", () => {
    const packed = pack(HandCategory.FullHouse, [11, 9]);
    const { category, kickers } = unpackHandValue(packed);
    expect(category).toBe(HandCategory.FullHouse);
    expect(kickers.slice(0, 2)).toEqual([11, 9]);
  });
});

describe("handNameFor", () => {
  it("returns null with fewer than 5 cards", () => {
    expect(handNameFor([c("As"), c("Ks")], [])).toBeNull();
  });

  it("names a real flush at showdown", () => {
    const hole = [c("As"), c("2s")];
    const board = [c("7s"), c("9s"), c("Ks"), c("3d"), c("4c")];
    expect(handNameFor(hole, board)).toBe("Flush, Ace High");
    // consistency with the engine evaluator
    expect(describePackedHand(evaluate7([...hole, ...board]))).toBe("Flush, Ace High");
  });

  it("names a full house", () => {
    const hole = [c("Kh"), c("Kd")];
    const board = [c("Ks"), c("9c"), c("9h"), c("2d"), c("4s")];
    expect(handNameFor(hole, board)).toBe("Full House, Kings full of Nines");
  });
});
