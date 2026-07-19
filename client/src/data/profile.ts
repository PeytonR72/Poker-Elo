import { rankForRating, MATCH_FORMATS } from "@poker/shared";
import { displayName } from "./displayName.js";
import type { ProfileRow } from "./leaderboard.js";

export interface MatchResultRow {
  match_id: string;
  finish_place: number;
  elo_delta: number;
  rating_after: number;
  matches: { format: string; ended_at: string; started_at?: string | null } | null;
}

/**
 * Human-readable match length from ISO start/end timestamps (e.g. "12m 30s").
 * Returns null when either bound is missing or the span is non-positive.
 */
export function durationLabel(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined,
): string | null {
  if (!startedAt || !endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export interface ProfileHeader {
  id: string;
  name: string;
  rating: number;
  tier: string;
  gamesPlayed: number;
  firstPlaceCount: number;
  bestFinish: number | null;
  /** firstPlaceCount / gamesPlayed, or null when no games have been played. */
  winRate: number | null;
  /**
   * Current run of consecutive same-outcome finishes counting back from the
   * most recent match — e.g. "W3" (3 wins) or "L2" (2 non-wins). A win is a
   * 1st-place finish. Null when there is no match history.
   */
  streak: string | null;
}

export interface ProfileHistoryEntry {
  matchId: string;
  date: string;
  formatLabel: string;
  finishPlace: number;
  eloDelta: number;
  ratingAfter: number;
  /** Match length ("12m 30s"), or null when start/end timestamps are absent. */
  durationLabel: string | null;
}

export interface ProfileData {
  header: ProfileHeader;
  history: ProfileHistoryEntry[];
}

/**
 * Current streak from a most-recent-first list of finish places. A win is a
 * 1st-place finish. Returns e.g. "W3"/"L2", or null for an empty list.
 */
export function computeStreak(placesNewestFirst: number[]): string | null {
  const first = placesNewestFirst[0];
  if (first === undefined) return null;
  const isWin = first === 1;
  let run = 0;
  for (const p of placesNewestFirst) {
    if ((p === 1) === isWin) run += 1;
    else break;
  }
  return `${isWin ? "W" : "L"}${run}`;
}

export function buildProfile(profile: ProfileRow, results: MatchResultRow[]): ProfileData {
  const places = results.map((r) => r.finish_place);
  const firstPlaceCount = places.filter((p) => p === 1).length;
  const header: ProfileHeader = {
    id: profile.id,
    name: displayName(profile),
    rating: profile.rating,
    tier: rankForRating(profile.rating),
    gamesPlayed: profile.games_played,
    firstPlaceCount,
    bestFinish: places.length > 0 ? Math.min(...places) : null,
    winRate: profile.games_played > 0 ? firstPlaceCount / profile.games_played : null,
    streak: computeStreak(places),
  };
  const history: ProfileHistoryEntry[] = results.map((r) => ({
    matchId: r.match_id,
    date: r.matches?.ended_at ?? "",
    formatLabel: r.matches ? (MATCH_FORMATS[r.matches.format]?.label ?? r.matches.format) : "—",
    finishPlace: r.finish_place,
    eloDelta: r.elo_delta,
    ratingAfter: r.rating_after,
    durationLabel: durationLabel(r.matches?.started_at, r.matches?.ended_at),
  }));
  return { header, history };
}
