export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

/**
 * Pack a category plus up to 5 rank kickers (each 0..12) into a single
 * comparable integer: higher = stronger, equal = exact tie.
 * Layout: category, then 5 base-16 nibbles (most significant kicker first).
 */
export function pack(category: HandCategory, kickers: number[]): number {
  let v = category;
  for (let i = 0; i < 5; i++) {
    v = v * 16 + (kickers[i] ?? 0);
  }
  return v;
}
