import type { ActionMask } from "@poker/shared";
import { MATCH_FORMATS, cardToString } from "@poker/shared";

export interface ButtonState {
  fold: boolean;
  check: boolean;
  call: boolean;
  raise: boolean;
  callAmount: number;
}

export function maskToButtons(mask: ActionMask): ButtonState {
  return {
    fold: mask.canFold,
    check: mask.canCheck,
    call: mask.canCall,
    raise: mask.canRaise,
    callAmount: mask.callAmount,
  };
}

/** Clamp a desired raise-TO total into the legal [minRaiseTo, maxRaiseTo] range. */
export function clampRaiseTo(value: number, mask: ActionMask): number {
  if (value < mask.minRaiseTo) return mask.minRaiseTo;
  if (value > mask.maxRaiseTo) return mask.maxRaiseTo;
  return Math.round(value);
}

/** Human label for the current blind level, derived from the format's blind ladder. */
export function blindLevelLabel(sb: number, bb: number, format: string): string {
  const fmt = MATCH_FORMATS[format];
  if (fmt) {
    const idx = fmt.blindLevels.findIndex((l) => l.sb === sb && l.bb === bb);
    if (idx >= 0) return `Level ${idx + 1}`;
  }
  return `Blinds ${sb}/${bb}`;
}

export function formatCard(card: number): string {
  return cardToString(card);
}

export function formatChips(n: number): string {
  return n.toLocaleString("en-US");
}
