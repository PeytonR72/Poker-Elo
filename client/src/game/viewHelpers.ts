import type { ActionMask } from "@poker/shared";
import { MATCH_FORMATS, TABLE_SIZE, cardToString } from "@poker/shared";

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

// 6-max position labels in seating order starting from the button.
const SIX_MAX_POSITIONS = ["BTN", "SB", "BB", "LJ", "HJ", "CO"];

/** Position label for a seat (e.g. "BTN", "CO") given the current button seat. */
export function positionLabel(seatIndex: number, buttonIndex: number): string {
  const offset = (seatIndex - buttonIndex + TABLE_SIZE) % TABLE_SIZE;
  return SIX_MAX_POSITIONS[offset] ?? "";
}

/** Quick raise-to shortcuts at 2x/3x/4x the current bet (or the min-open size pre-bet), clamped legal. */
export function quickRaiseOptions(mask: ActionMask, currentBet: number): { label: string; raiseTo: number }[] {
  if (!mask.canRaise) return [];
  const base = currentBet > 0 ? currentBet : mask.minRaiseTo;
  const options = [2, 3, 4].map((n) => ({ label: `${n}x`, raiseTo: clampRaiseTo(base * n, mask) }));
  // Dedupe (e.g. once multiple multiples collapse to the same all-in max).
  const seen = new Set<number>();
  return options.filter((o) => (seen.has(o.raiseTo) ? false : (seen.add(o.raiseTo), true)));
}
