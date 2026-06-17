export type Card = number; // 0..51

export const RANKS = "23456789TJQKA"; // index 0..12 (0 = deuce, 12 = ace)
export const SUITS = "cdhs"; // clubs, diamonds, hearts, spades (index 0..3)

export function rankOf(c: Card): number {
  return c % 13;
}

export function suitOf(c: Card): number {
  return (c / 13) | 0;
}

export function makeCard(rank: number, suit: number): Card {
  return suit * 13 + rank;
}

export function cardToString(c: Card): string {
  return RANKS[rankOf(c)]! + SUITS[suitOf(c)]!;
}

export function cardFromString(s: string): Card {
  if (s.length !== 2) throw new Error(`bad card: ${s}`);
  const r = RANKS.indexOf(s[0]!);
  const su = SUITS.indexOf(s[1]!);
  if (r < 0 || su < 0) throw new Error(`bad card: ${s}`);
  return makeCard(r, su);
}

export function fullDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}
