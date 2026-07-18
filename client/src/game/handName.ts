import { evaluate7, HandCategory } from "@poker/shared";

// Rank index 0..12 → full display name (0 = 2 … 12 = Ace), per the engine's card
// encoding (rank = c % 13). Kept local to this display helper; the numeric source
// of truth remains @poker/shared.
const RANK_FULL = [
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Jack",
  "Queen",
  "King",
  "Ace",
] as const;

function rankFull(r: number): string {
  return RANK_FULL[r] ?? "?";
}

function rankPlural(r: number): string {
  const name = rankFull(r);
  if (name === "Six") return "Sixes";
  return name + "s";
}

/**
 * Decode an `evaluate7` packed value into [category, kickers[5]]. The pack layout
 * is `category` followed by 5 base-16 nibbles (most-significant kicker first),
 * so we peel the nibbles off the bottom. Values stay well under 2^31 (max
 * category 8 → 8·16^5 ≈ 8.4M), so bitwise ops are safe.
 */
export function unpackHandValue(packed: number): { category: HandCategory; kickers: number[] } {
  let x = packed;
  const kickers: number[] = [];
  for (let i = 0; i < 5; i++) {
    kickers.unshift(x & 0xf);
    x = Math.floor(x / 16);
  }
  return { category: x as HandCategory, kickers };
}

/** Human phrase for a packed hand value, e.g. "Flush, Ace High". */
export function describePackedHand(packed: number): string {
  const { category, kickers } = unpackHandValue(packed);
  const [k0 = 0, k1 = 0] = kickers;
  switch (category) {
    case HandCategory.StraightFlush:
      return k0 === 12 ? "Royal Flush" : `Straight Flush, ${rankFull(k0)} High`;
    case HandCategory.Quads:
      return `Four of a Kind, ${rankPlural(k0)}`;
    case HandCategory.FullHouse:
      return `Full House, ${rankPlural(k0)} full of ${rankPlural(k1)}`;
    case HandCategory.Flush:
      return `Flush, ${rankFull(k0)} High`;
    case HandCategory.Straight:
      return `Straight, ${rankFull(k0)} High`;
    case HandCategory.Trips:
      return `Three of a Kind, ${rankPlural(k0)}`;
    case HandCategory.TwoPair:
      return `Two Pair, ${rankPlural(k0)} and ${rankPlural(k1)}`;
    case HandCategory.Pair:
      return `Pair of ${rankPlural(k0)}`;
    case HandCategory.HighCard:
    default:
      return `${rankFull(k0)} High`;
  }
}

/**
 * Best 5-card hand name for a set of hole cards + board (2 + 3..5 engine card
 * ints). Returns null if fewer than 5 cards are available. Pure; used at
 * showdown to label the winning hand client-side.
 */
export function handNameFor(hole: readonly number[], board: readonly number[]): string | null {
  const cards = [...hole, ...board];
  if (cards.length < 5) return null;
  return describePackedHand(evaluate7(cards));
}
