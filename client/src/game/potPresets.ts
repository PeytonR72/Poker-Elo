import type { ActionMask } from "@poker/shared";
import { clampRaiseTo } from "./viewHelpers.js";

/** Min / ½ Pot / Pot / Max raise-TO presets, clamped legal and deduped. */
export function potPresets(
  mask: ActionMask,
  potTotal: number,
  currentBet: number,
): { label: string; raiseTo: number }[] {
  if (!mask.canRaise) return [];
  const call = mask.canCall ? mask.callAmount : 0;
  // Pot-fraction raise-TO: current bet matched, plus fraction of (pot + our call).
  const f = (frac: number) => clampRaiseTo(currentBet + Math.round(frac * (potTotal + call)), mask);
  const out = [
    { label: "Min", raiseTo: clampRaiseTo(mask.minRaiseTo, mask) },
    { label: "1/3 Pot", raiseTo: f(1 / 3) },
    { label: "1/2 Pot", raiseTo: f(0.5) },
    { label: "Pot", raiseTo: f(1) },
    { label: "Max", raiseTo: clampRaiseTo(mask.maxRaiseTo, mask) },
  ];
  const seen = new Set<number>();
  return out.filter((o) => (seen.has(o.raiseTo) ? false : (seen.add(o.raiseTo), true)));
}
