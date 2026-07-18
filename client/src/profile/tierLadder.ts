import { RANK_TIERS, rankForRating } from "@poker/shared";

export type TierState = "passed" | "current" | "future";

export interface TierRung {
  name: string;
  minRating: number;
  state: TierState;
  /** progress toward the NEXT tier, 0..1; 1 at the top tier (current only). */
  progressToNext: number;
}

/**
 * Projects a rating onto the full tier ladder. Every tier below the player's
 * current tier is "passed", the matched tier is "current", higher tiers are
 * "future". `progressToNext` is only meaningful (non-zero) on the current rung
 * and measures how far the rating has climbed toward the next tier's floor.
 * Pure — unit-tested; no `RANK_TIERS` mutation.
 */
export function tierLadder(rating: number): TierRung[] {
  const currentName = rankForRating(rating);
  const currentIdx = RANK_TIERS.findIndex((t) => t.name === currentName);

  return RANK_TIERS.map((tier, i) => {
    let state: TierState;
    if (i < currentIdx) state = "passed";
    else if (i === currentIdx) state = "current";
    else state = "future";

    let progressToNext = 0;
    if (state === "current") {
      const next = RANK_TIERS[i + 1];
      if (!next) {
        progressToNext = 1; // top tier — fully filled
      } else {
        const span = next.minRating - tier.minRating;
        progressToNext = span > 0 ? clamp01((rating - tier.minRating) / span) : 0;
      }
    }
    return { name: tier.name, minRating: tier.minRating, state, progressToNext };
  });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
