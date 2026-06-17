import type { Card } from "../cards.js";
import { evaluate5 } from "./evaluate5.js";

const COMBOS: number[][] = (() => {
  const r: number[][] = [];
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++) for (let e = d + 1; e < 7; e++) r.push([a, b, c, d, e]);
  return r;
})();

/** Oracle: best 5-of-7 by brute force. Slow but obviously correct. */
export function evaluate7Naive(cards: Card[]): number {
  let best = -1;
  for (const cmb of COMBOS) {
    const v = evaluate5([
      cards[cmb[0]!]!,
      cards[cmb[1]!]!,
      cards[cmb[2]!]!,
      cards[cmb[3]!]!,
      cards[cmb[4]!]!,
    ]);
    if (v > best) best = v;
  }
  return best;
}
