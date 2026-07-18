/**
 * Pure chip-denomination math for <ChipStack>. These are visual design
 * constants (how many discs to draw), NOT poker game constants, so they live
 * here rather than in @poker/shared.
 */

export interface ChipTier {
  value: number;
  /** number of physical discs of this denomination */
  count: number;
}

/** Chip denominations, high → low. 1 is a neutral remainder disc. */
export const CHIP_DENOMS = [500, 100, 25, 5, 1] as const;
export type ChipDenom = (typeof CHIP_DENOMS)[number];

/**
 * Greedy breakdown of `amount` into chip denominations, largest first.
 * Non-negative integers only; a fractional/negative amount yields `[]`.
 */
export function chipBreakdown(
  amount: number,
  denoms: readonly number[] = CHIP_DENOMS,
): ChipTier[] {
  if (!Number.isFinite(amount) || amount <= 0) return [];
  let remaining = Math.floor(amount);
  const tiers: ChipTier[] = [];
  for (const value of denoms) {
    if (value <= 0) continue;
    const count = Math.floor(remaining / value);
    if (count > 0) {
      tiers.push({ value, count });
      remaining -= count * value;
    }
  }
  return tiers;
}

/**
 * Flatten a breakdown into individual discs (high → low), capped at `max`
 * visible. Returns the visible disc denominations plus how many were hidden.
 */
export function visibleDiscs(
  amount: number,
  max = 5,
  denoms: readonly number[] = CHIP_DENOMS,
): { discs: number[]; hidden: number } {
  const flat: number[] = [];
  for (const tier of chipBreakdown(amount, denoms)) {
    for (let i = 0; i < tier.count; i++) flat.push(tier.value);
  }
  return { discs: flat.slice(0, max), hidden: Math.max(0, flat.length - max) };
}
