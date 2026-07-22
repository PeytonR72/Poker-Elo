import { redactFor } from "@poker/shared";
import type { PublicView, TableState } from "@poker/shared";

/**
 * Pure decision logic for spectator handling, extracted out of `matchRoom.ts` so it can
 * be unit-tested under plain Vitest — `partyserver`'s `Server` class cannot load there
 * (see CLAUDE.md's Unit 8 notes), so `MatchRoom` itself is only verified via `wrangler dev`.
 */

/** Whether a connection may become a spectator. Seated connections are rejected. */
export function canBecomeSpectator(conn: { seatIndex: number | null }): { ok: true } | { ok: false; reason: string } {
  if (conn.seatIndex !== null) return { ok: false, reason: "already_seated" };
  return { ok: true };
}

/**
 * The redacted view a connection should receive. Spectators ALWAYS get `redactFor(null, …)`
 * — never a seat-holder's view — regardless of what their authenticated playerId happens to
 * be. Treat this as the security boundary: hole cards must never reach a spectator connection
 * before showdown.
 */
export function viewFor(conn: { spectator: boolean; playerId: string }, state: TableState): PublicView {
  return redactFor(conn.spectator ? null : conn.playerId, state);
}

/** Count of currently-connected spectators. */
export function countSpectators(conns: Iterable<{ spectator: boolean }>): number {
  let n = 0;
  for (const c of conns) if (c.spectator) n++;
  return n;
}
