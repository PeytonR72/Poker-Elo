import type { TableState } from "./types.js";

/** Does this seat still owe an action on the current street? */
export function seatNeedsToAct(state: TableState, i: number): boolean {
  const s = state.seats[i];
  if (!s || s.status !== "active") return false;
  if (!s.hasActed) return true;
  return s.committedThisStreet < state.currentBet;
}

/** First seat needing to act, scanning clockwise starting AT `startInclusive`. */
export function firstNeedsToAct(state: TableState, startInclusive: number): number | null {
  const n = state.seats.length;
  for (let k = 0; k < n; k++) {
    const i = (startInclusive + k) % n;
    if (seatNeedsToAct(state, i)) return i;
  }
  return null;
}

/** Next seat needing to act, scanning clockwise AFTER `from` (exclusive). */
export function nextToAct(state: TableState, from: number): number | null {
  const n = state.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (seatNeedsToAct(state, i)) return i;
  }
  return null;
}

/** Seats that can still voluntarily act (active with chips). */
export function activeCount(state: TableState): number {
  let c = 0;
  for (const s of state.seats) if (s && s.status === "active") c++;
  return c;
}

/** Seats still contesting the pot (active or all-in, not folded/busted). */
export function inHandCount(state: TableState): number {
  let c = 0;
  for (const s of state.seats) if (s && (s.status === "active" || s.status === "allin")) c++;
  return c;
}

/** First active seat clockwise from the button (postflop first-to-act). */
export function firstActivePostflop(state: TableState): number | null {
  const n = state.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (state.buttonIndex + k) % n;
    const s = state.seats[i];
    if (s && s.status === "active") return i;
  }
  return null;
}
