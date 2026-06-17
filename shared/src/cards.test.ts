import { describe, it, expect } from "vitest";
import { rankOf, suitOf, makeCard, cardToString, cardFromString, fullDeck } from "./cards.js";

describe("cards", () => {
  it("round-trips known cards", () => {
    expect(cardFromString("2c")).toBe(0);
    expect(cardToString(0)).toBe("2c");
    expect(cardFromString("As")).toBe(51);
    expect(cardToString(51)).toBe("As");
  });

  it("rank/suit accessors agree with makeCard", () => {
    for (let r = 0; r < 13; r++) {
      for (let s = 0; s < 4; s++) {
        const c = makeCard(r, s);
        expect(rankOf(c)).toBe(r);
        expect(suitOf(c)).toBe(s);
      }
    }
  });

  it("round-trips every card via string", () => {
    for (let c = 0; c < 52; c++) {
      expect(cardFromString(cardToString(c))).toBe(c);
    }
  });

  it("fullDeck is 52 distinct cards 0..51", () => {
    const d = fullDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d).size).toBe(52);
    expect(Math.min(...d)).toBe(0);
    expect(Math.max(...d)).toBe(51);
  });

  it("throws on a bad string", () => {
    expect(() => cardFromString("Xx")).toThrow();
  });
});
