import type { LiveMatchInfo } from "@poker/shared";

/** In-memory live-match registry entry, with a self-healing expiry (see `listLive`). */
export interface StoredLiveMatch extends LiveMatchInfo {
  expiresAt: number;
}

/** Safety margin added past a format's matchDurationMs if a room fails to report its end. */
export const LIVE_MATCH_STALE_MARGIN_MS = 2 * 60 * 1000;

/** Register (or refresh) a match as live. */
export function registerStart(
  entries: Map<string, StoredLiveMatch>,
  info: LiveMatchInfo,
  matchDurationMs: number,
  now: number,
): void {
  entries.set(info.roomId, { ...info, expiresAt: now + matchDurationMs + LIVE_MATCH_STALE_MARGIN_MS });
}

/** Remove a match from the registry (reported match end). */
export function registerEnd(entries: Map<string, StoredLiveMatch>, roomId: string): void {
  entries.delete(roomId);
}

/**
 * The currently-live matches, sweeping out any stale entries whose room never reported
 * its end (self-healing on read — no background timer needed).
 */
export function listLive(entries: Map<string, StoredLiveMatch>, now: number): LiveMatchInfo[] {
  const out: LiveMatchInfo[] = [];
  for (const [roomId, entry] of entries) {
    if (entry.expiresAt <= now) {
      entries.delete(roomId);
      continue;
    }
    out.push({ roomId: entry.roomId, format: entry.format, startedAt: entry.startedAt, players: entry.players });
  }
  return out;
}
