import { rankForRating, MATCH_FORMATS } from "@poker/shared";
import { displayName } from "./displayName.js";
import type { ProfileRow } from "./leaderboard.js";

export interface MatchResultRow {
  match_id: string;
  finish_place: number;
  elo_delta: number;
  rating_after: number;
  matches: { format: string; ended_at: string } | null;
}

export interface ProfileHeader {
  id: string;
  name: string;
  rating: number;
  tier: string;
  gamesPlayed: number;
  firstPlaceCount: number;
  bestFinish: number | null;
}

export interface ProfileHistoryEntry {
  matchId: string;
  date: string;
  formatLabel: string;
  finishPlace: number;
  eloDelta: number;
  ratingAfter: number;
}

export interface ProfileData {
  header: ProfileHeader;
  history: ProfileHistoryEntry[];
}

export function buildProfile(profile: ProfileRow, results: MatchResultRow[]): ProfileData {
  const places = results.map((r) => r.finish_place);
  const header: ProfileHeader = {
    id: profile.id,
    name: displayName(profile),
    rating: profile.rating,
    tier: rankForRating(profile.rating),
    gamesPlayed: profile.games_played,
    firstPlaceCount: places.filter((p) => p === 1).length,
    bestFinish: places.length > 0 ? Math.min(...places) : null,
  };
  const history: ProfileHistoryEntry[] = results.map((r) => ({
    matchId: r.match_id,
    date: r.matches?.ended_at ?? "",
    formatLabel: r.matches ? (MATCH_FORMATS[r.matches.format]?.label ?? r.matches.format) : "—",
    finishPlace: r.finish_place,
    eloDelta: r.elo_delta,
    ratingAfter: r.rating_after,
  }));
  return { header, history };
}
