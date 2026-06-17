import { rankOf, suitOf, type Card } from "../cards.js";
import { HandCategory, pack } from "./categories.js";

/** Fast 7-card evaluator using per-suit bitmasks + rank counts. */
export function evaluate7(cards: Card[]): number {
  const rankCount = new Array<number>(13).fill(0);
  const suitMask = [0, 0, 0, 0];
  const suitCount = [0, 0, 0, 0];
  let rankMask = 0;
  for (const c of cards) {
    const r = rankOf(c);
    const s = suitOf(c);
    rankCount[r] = (rankCount[r] ?? 0) + 1;
    suitMask[s] = (suitMask[s] ?? 0) | (1 << r);
    suitCount[s] = (suitCount[s] ?? 0) + 1;
    rankMask |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCount[s]! >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sf = straightHighFromMask(suitMask[flushSuit]!);
    if (sf >= 0) return pack(HandCategory.StraightFlush, [sf]);
  }

  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    const n = rankCount[r]!;
    if (n === 4) quads.push(r);
    else if (n === 3) trips.push(r);
    else if (n === 2) pairs.push(r);
  }

  if (quads.length) {
    return pack(HandCategory.Quads, [quads[0]!, highestExcept(rankMask, [quads[0]!])]);
  }
  if (trips.length >= 1 && (trips.length >= 2 || pairs.length >= 1)) {
    const pairRank = trips.length >= 2 ? trips[1]! : pairs[0]!;
    return pack(HandCategory.FullHouse, [trips[0]!, pairRank]);
  }
  if (flushSuit >= 0) {
    return pack(HandCategory.Flush, topNFromMask(suitMask[flushSuit]!, 5));
  }
  const st = straightHighFromMask(rankMask);
  if (st >= 0) return pack(HandCategory.Straight, [st]);

  if (trips.length) {
    const k = topNFromMask(clearBits(rankMask, [trips[0]!]), 2);
    return pack(HandCategory.Trips, [trips[0]!, k[0]!, k[1]!]);
  }
  if (pairs.length >= 2) {
    const k = highestExcept(rankMask, [pairs[0]!, pairs[1]!]);
    return pack(HandCategory.TwoPair, [pairs[0]!, pairs[1]!, k]);
  }
  if (pairs.length === 1) {
    const k = topNFromMask(clearBits(rankMask, [pairs[0]!]), 3);
    return pack(HandCategory.Pair, [pairs[0]!, k[0]!, k[1]!, k[2]!]);
  }
  return pack(HandCategory.HighCard, topNFromMask(rankMask, 5));
}

/** Highest straight high-card from a 13-bit rank mask (wheel-aware); -1 if none. */
function straightHighFromMask(mask: number): number {
  for (let high = 12; high >= 4; high--) {
    let ok = true;
    for (let k = 0; k < 5; k++) {
      if (!(mask & (1 << (high - k)))) {
        ok = false;
        break;
      }
    }
    if (ok) return high;
  }
  if (mask & (1 << 12) && mask & 8 && mask & 4 && mask & 2 && mask & 1) return 3; // wheel
  return -1;
}

function topNFromMask(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

function clearBits(mask: number, ranks: number[]): number {
  let m = mask;
  for (const r of ranks) m &= ~(1 << r);
  return m;
}

function highestExcept(mask: number, ranks: number[]): number {
  return topNFromMask(clearBits(mask, ranks), 1)[0] ?? 0;
}
