import { rankOf, suitOf, type Card } from "../cards.js";
import { HandCategory, pack } from "./categories.js";

/** Evaluate exactly 5 cards -> packed comparable integer. */
export function evaluate5(cards: Card[]): number {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const suits = cards.map(suitOf);
  const isFlush = suits.every((s) => s === suits[0]);

  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0]! - uniq[4]! === 4) straightHigh = uniq[0]!;
    else if (uniq[0] === 12 && uniq[1] === 3 && uniq[2] === 2 && uniq[3] === 1 && uniq[4] === 0)
      straightHigh = 3; // wheel: 5-high
  }

  const countByRank = new Map<number, number>();
  for (const r of ranks) countByRank.set(r, (countByRank.get(r) ?? 0) + 1);
  const groups = [...countByRank.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const counts = groups.map((g) => g[1]);
  const gr = groups.map((g) => g[0]);

  if (isFlush && straightHigh >= 0) return pack(HandCategory.StraightFlush, [straightHigh]);
  if (counts[0] === 4) return pack(HandCategory.Quads, [gr[0]!, gr[1]!]);
  if (counts[0] === 3 && counts[1] === 2) return pack(HandCategory.FullHouse, [gr[0]!, gr[1]!]);
  if (isFlush) return pack(HandCategory.Flush, ranks);
  if (straightHigh >= 0) return pack(HandCategory.Straight, [straightHigh]);
  if (counts[0] === 3) return pack(HandCategory.Trips, [gr[0]!, gr[1]!, gr[2]!]);
  if (counts[0] === 2 && counts[1] === 2)
    return pack(HandCategory.TwoPair, [gr[0]!, gr[1]!, gr[2]!]);
  if (counts[0] === 2) return pack(HandCategory.Pair, [gr[0]!, gr[1]!, gr[2]!, gr[3]!]);
  return pack(HandCategory.HighCard, ranks);
}
