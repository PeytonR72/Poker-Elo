import { RANK_TIERS, rankForRating } from "@poker/shared";

/**
 * Pure tier-progress shaper for the Arena "current tier" card. Derives how far
 * a rating sits within its current tier band and how many points remain to the
 * next tier, using `RANK_TIERS` from `@poker/shared` (never hardcode thresholds).
 */
export interface TierProgress {
  tier: string;
  nextTier: string | null;
  /** points from `rating` up to the next tier's floor; null at the top tier */
  pointsToNext: number | null;
  /** 0..100 progress through the current tier band (100 at the top tier) */
  percent: number;
  isTopTier: boolean;
  currentFloor: number;
  nextFloor: number | null;
}

export function tierProgress(rating: number): TierProgress {
  // Index of the highest tier whose floor the rating has reached.
  let idx = 0;
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (rating >= RANK_TIERS[i]!.minRating) idx = i;
    else break;
  }

  const current = RANK_TIERS[idx]!;
  const next = RANK_TIERS[idx + 1] ?? null;

  if (!next) {
    return {
      tier: current.name,
      nextTier: null,
      pointsToNext: null,
      percent: 100,
      isTopTier: true,
      currentFloor: current.minRating,
      nextFloor: null,
    };
  }

  const band = next.minRating - current.minRating;
  const into = rating - current.minRating;
  const percent = band > 0 ? clamp((into / band) * 100, 0, 100) : 0;

  return {
    tier: current.name,
    nextTier: next.name,
    pointsToNext: Math.max(0, next.minRating - rating),
    percent,
    isTopTier: false,
    currentFloor: current.minRating,
    nextFloor: next.minRating,
  };
}

/** Convenience re-export so callers can label a rating without a second import. */
export function tierName(rating: number): string {
  return rankForRating(rating);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
