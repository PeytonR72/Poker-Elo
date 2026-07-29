import { decide, mulberry32, deriveSeed, personaForSeatId } from "@poker/shared";
import type { PublicView, ActionMask, Action } from "@poker/shared";

export function decideBotAction(
  view: PublicView,
  holeCards: [number, number],
  mask: ActionMask,
  rng: () => number,
  seatId: string,
): Action {
  return decide(view, holeCards, mask, rng, personaForSeatId(seatId));
}

export function botThinkDelayMs(rng: () => number, minMs: number, maxMs: number): number {
  return minMs + Math.floor(rng() * (maxMs - minMs));
}

export { mulberry32, deriveSeed };
