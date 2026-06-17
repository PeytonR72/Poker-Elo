import { describe, it, expect } from "vitest";
import { evaluate7 } from "./evaluate7.js";
import { evaluate7Naive } from "./evaluate7Naive.js";
import { shuffledDeck } from "../deck.js";

describe("GATE: evaluate7 matches the oracle over 100k random hands", () => {
  it(
    "agrees exactly for 100k seeded hands",
    () => {
      const N = 100_000;
      for (let seed = 0; seed < N; seed++) {
        const hand = shuffledDeck(seed).slice(0, 7);
        const fast = evaluate7(hand);
        const slow = evaluate7Naive(hand);
        if (fast !== slow) {
          throw new Error(
            `mismatch at seed ${seed}: fast=${fast} slow=${slow} hand=${hand.join(",")}`,
          );
        }
      }
      expect(true).toBe(true);
    },
    { timeout: 30000 },
  );

  it(
    "pairwise ordering is consistent with the oracle (sampled)",
    () => {
      for (let seed = 0; seed < 20_000; seed++) {
        const a = shuffledDeck(seed).slice(0, 7);
        const b = shuffledDeck(seed + 1_000_000).slice(0, 7);
        expect(Math.sign(evaluate7(a) - evaluate7(b))).toBe(
          Math.sign(evaluate7Naive(a) - evaluate7Naive(b)),
        );
      }
    },
    { timeout: 30000 },
  );
});
