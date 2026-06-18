import { decide, mulberry32, deriveSeed } from "@poker/shared";
import type { PublicView, ActionMask, Action } from "@poker/shared";

export function decideBotAction(
  view: PublicView,
  holeCards: [number, number],
  mask: ActionMask,
  rng: () => number,
): Action {
  return decide(view, holeCards, mask, rng);
}

export function botThinkDelayMs(rng: () => number, minMs: number, maxMs: number): number {
  return minMs + Math.floor(rng() * (maxMs - minMs));
}

export { mulberry32, deriveSeed };
