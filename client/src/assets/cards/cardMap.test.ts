import { describe, it, expect } from "vitest";
import { RANKS, SUITS } from "@poker/shared";
import { cardIntToProps } from "./cardMap.js";

describe("cardIntToProps", () => {
  it("maps card 0 to the 2 of clubs", () => {
    expect(cardIntToProps(0)).toEqual({ rank: "2", suit: "c" });
  });

  it("maps card 51 to the ace of spades", () => {
    expect(cardIntToProps(51)).toEqual({ rank: "A", suit: "s" });
  });

  it("matches the engine's rank/suit decomposition for all 52 cards", () => {
    for (let c = 0; c < 52; c++) {
      const props = cardIntToProps(c);
      expect(props.rank).toBe(RANKS[c % 13]);
      expect(props.suit).toBe(SUITS[(c / 13) | 0]);
    }
  });

  it("produces 52 distinct cards", () => {
    const seen = new Set<string>();
    for (let c = 0; c < 52; c++) {
      const { rank, suit } = cardIntToProps(c);
      seen.add(`${rank}${suit}`);
    }
    expect(seen.size).toBe(52);
  });

  it.each([-1, 52, 1.5, NaN, 100])("throws for out-of-range int %s", (bad) => {
    expect(() => cardIntToProps(bad)).toThrow(RangeError);
  });
});
