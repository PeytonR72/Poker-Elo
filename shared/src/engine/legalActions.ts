import type { TableState } from "./types.js";

export interface ActionMask {
  seat: number;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  /** Chips to add to call (0 when checking). */
  callAmount: number;
  canRaise: boolean;
  /** Total this street for a minimum raise (clamped to all-in if stack-limited). */
  minRaiseTo: number;
  /** Total this street for an all-in raise. */
  maxRaiseTo: number;
}

export function legalActions(state: TableState, i: number): ActionMask {
  const s = state.seats[i];
  if (!s || s.status !== "active") {
    return {
      seat: i,
      canFold: false,
      canCheck: false,
      canCall: false,
      callAmount: 0,
      canRaise: false,
      minRaiseTo: 0,
      maxRaiseTo: 0,
    };
  }
  const toCall = Math.max(0, state.currentBet - s.committedThisStreet);
  const callAmount = Math.min(toCall, s.stack);
  const maxRaiseTo = s.committedThisStreet + s.stack;
  const fullMinRaiseTo = state.currentBet + state.lastRaiseSize;
  // A seat may raise only if it has not yet acted on the current bet (full reopen / fresh)
  // and it has chips beyond the current bet. An incomplete all-in does NOT reopen, so a
  // seat whose hasActed is still true cannot re-raise.
  const canRaise = !s.hasActed && maxRaiseTo > state.currentBet;
  return {
    seat: i,
    canFold: true,
    canCheck: toCall === 0,
    canCall: toCall > 0 && s.stack > 0,
    callAmount,
    canRaise,
    minRaiseTo: Math.min(fullMinRaiseTo, maxRaiseTo),
    maxRaiseTo,
  };
}
