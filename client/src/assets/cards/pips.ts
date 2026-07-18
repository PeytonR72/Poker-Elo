/**
 * Traditional pip layouts for the number cards (2–10), data-driven so a single
 * parametric component can lay out every face. Positions are fractions:
 *   - `col`: horizontal lane — L(eft)/C(enter)/R(ight)
 *   - `y`:   vertical fraction of the central pip band (0 = top, 1 = bottom)
 * Pips in the bottom half are rendered rotated 180°, matching real decks.
 */

export type PipCol = "L" | "C" | "R";
export interface Pip {
  col: PipCol;
  y: number;
}

const T = 0.06; // top row
const B = 0.94; // bottom row (mirror of T)
const M = 0.5; // middle

// Standard French-deck pip arrangements.
export const PIP_LAYOUTS: Record<number, Pip[]> = {
  2: [
    { col: "C", y: T },
    { col: "C", y: B },
  ],
  3: [
    { col: "C", y: T },
    { col: "C", y: M },
    { col: "C", y: B },
  ],
  4: [
    { col: "L", y: T },
    { col: "R", y: T },
    { col: "L", y: B },
    { col: "R", y: B },
  ],
  5: [
    { col: "L", y: T },
    { col: "R", y: T },
    { col: "C", y: M },
    { col: "L", y: B },
    { col: "R", y: B },
  ],
  6: [
    { col: "L", y: T },
    { col: "R", y: T },
    { col: "L", y: M },
    { col: "R", y: M },
    { col: "L", y: B },
    { col: "R", y: B },
  ],
  7: [
    { col: "L", y: T },
    { col: "R", y: T },
    { col: "C", y: 0.28 },
    { col: "L", y: M },
    { col: "R", y: M },
    { col: "L", y: B },
    { col: "R", y: B },
  ],
  8: [
    { col: "L", y: T },
    { col: "R", y: T },
    { col: "C", y: 0.28 },
    { col: "L", y: M },
    { col: "R", y: M },
    { col: "C", y: 0.72 },
    { col: "L", y: B },
    { col: "R", y: B },
  ],
  9: [
    { col: "L", y: T },
    { col: "R", y: T },
    { col: "L", y: 0.36 },
    { col: "R", y: 0.36 },
    { col: "C", y: M },
    { col: "L", y: 0.64 },
    { col: "R", y: 0.64 },
    { col: "L", y: B },
    { col: "R", y: B },
  ],
  10: [
    { col: "L", y: T },
    { col: "R", y: T },
    { col: "C", y: 0.22 },
    { col: "L", y: 0.36 },
    { col: "R", y: 0.36 },
    { col: "L", y: 0.64 },
    { col: "R", y: 0.64 },
    { col: "C", y: 0.78 },
    { col: "L", y: B },
    { col: "R", y: B },
  ],
};

/** X pixel for a lane, within the 100-wide card viewBox. */
export function colX(col: PipCol): number {
  switch (col) {
    case "L":
      return 32;
    case "R":
      return 68;
    case "C":
      return 50;
  }
}
