// Discriminated-union wire protocol. decode() validates the TAG ONLY; the server
// re-guards every payload (security-critical) in a later unit.

import type { ActionMask } from "./engine/legalActions.js";
import type { GameEvent } from "./engine/types.js";

export type ClientMsg =
  | { t: "hello"; jwt: string }
  | { t: "action"; seat: number; action: "fold" | "check" | "call" | "raise"; amount?: number }
  | { t: "sitOut" }
  | { t: "ping"; ts: number }
  | { t: "startMatch" };

export type ServerMsg =
  | { t: "seated"; seatIndex: number; playerId: string }
  | { t: "dealPrivate"; holeCards: [number, number] }
  | { t: "snapshot"; view: unknown }
  | { t: "event"; event: GameEvent }
  | { t: "yourTurn"; mask: ActionMask; deadlineTs: number }
  | { t: "matchOver"; placements: unknown; eloDeltas?: unknown }
  | { t: "error"; message: string };

export function encode(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg);
}

export function decode<T extends { t: string }>(raw: string): T {
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    throw new Error("protocol: invalid JSON");
  }
  if (typeof o !== "object" || o === null || typeof (o as { t?: unknown }).t !== "string") {
    throw new Error("protocol: missing tag");
  }
  return o as T;
}
