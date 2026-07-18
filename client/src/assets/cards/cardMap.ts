/**
 * Engine-integration helpers for the playing-card deck.
 *
 * The engine encodes a card as an int `0..51`:
 *   rank = c % 13   (0 = 2 … 12 = A)   → RANKS = "23456789TJQKA"
 *   suit = (c / 13) | 0                → SUITS = "cdhs"
 * `cardIntToProps` lets Phase 4 render engine cards directly with `<PlayingCard>`.
 */

import { RANKS, SUITS } from "@poker/shared";
import type { Rank, Suit } from "./suits.js";

export type { Rank, Suit } from "./suits.js";

export interface CardProps {
  rank: Rank;
  suit: Suit;
}

/** Convert an engine card int (0..51) to `<PlayingCard>` props. */
export function cardIntToProps(c: number): CardProps {
  if (!Number.isInteger(c) || c < 0 || c > 51) {
    throw new RangeError(`cardIntToProps: card int out of range: ${c}`);
  }
  const rank = RANKS[c % 13];
  const suit = SUITS[(c / 13) | 0];
  // Provably in-bounds given the guard above, but keep noUncheckedIndexedAccess happy.
  if (rank === undefined || suit === undefined) {
    throw new RangeError(`cardIntToProps: card int out of range: ${c}`);
  }
  return { rank: rank as Rank, suit: suit as Suit };
}
