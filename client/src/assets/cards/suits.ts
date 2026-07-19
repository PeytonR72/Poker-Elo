/**
 * Suit path data for the parametric playing-card deck.
 *
 * Each path is authored in a normalized `0 0 100 100` box (upright, filled),
 * so it can be placed/scaled anywhere via a single SVG transform. Spades and
 * clubs render near-black; hearts and diamonds render deep red — both chosen to
 * read cleanly on the off-white card face (#f2f0e9).
 */

export type Suit = "s" | "h" | "d" | "c";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";

/** Near-black for spades/clubs. */
export const SUIT_BLACK = "#1a1f26";
/** Deep red for hearts/diamonds (passes on the off-white face). */
export const SUIT_RED = "#c23b3b";

/** Off-white card face — deliberately NOT pure white. */
export const CARD_FACE = "#f2f0e9";
/** Thin warm border around the face. */
export const CARD_BORDER = "#d7d2c4";

export const SUIT_PATHS: Record<Suit, string> = {
  s: "M50 10C61 32 88 43 88 63c0 13-11 20-21 15-4-2-6 0-5 4 1 6 5 10 9 12H29c4-2 8-6 9-12 1-4-1-6-5-4-10 5-21-2-21-15 0-20 27-31 38-53Z",
  h: "M50 88C22 68 9 52 9 33 9 21 19 12 31 12c9 0 16 5 19 13 3-8 10-13 19-13 12 0 22 9 22 21 0 19-13 35-41 55Z",
  d: "M50 7 87 50 50 93 13 50Z",
  c: "M50 9c10 0 18 8 18 18 0 5-2 9-5 12 7-5 17-3 22 5 6 9 2 21-9 24-8 2-16-1-21-7 1 8 5 17 12 26H33c7-9 11-18 12-26-5 6-13 9-21 7-11-3-15-15-9-24 5-8 15-10 22-5-3-3-5-7-5-12 0-10 8-18 18-18Z",
};

/** Fill color for a suit. */
export function suitColor(suit: Suit): string {
  return suit === "h" || suit === "d" ? SUIT_RED : SUIT_BLACK;
}

/** Corner glyph label for a rank ("T" renders as "10"). */
export function rankLabel(rank: Rank): string {
  return rank === "T" ? "10" : rank;
}

export const COURTS: ReadonlySet<Rank> = new Set<Rank>(["J", "Q", "K"]);
