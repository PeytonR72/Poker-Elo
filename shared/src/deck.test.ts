import { describe, it, expect } from "vitest";
import { shuffledDeck } from "./deck.js";

describe("shuffledDeck", () => {
  it("same seed -> identical permutation", () => {
    expect(shuffledDeck(123)).toEqual(shuffledDeck(123));
  });

  it("different seeds -> different permutation (very likely)", () => {
    expect(shuffledDeck(1)).not.toEqual(shuffledDeck(2));
  });

  it("is always a permutation of all 52 cards", () => {
    for (const seed of [0, 1, 42, 999, 123456]) {
      const d = shuffledDeck(seed);
      expect(d).toHaveLength(52);
      expect([...d].sort((a, b) => a - b)).toEqual(Array.from({ length: 52 }, (_, i) => i));
    }
  });
});
