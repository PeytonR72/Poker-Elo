import { displayName } from "./displayName.js";

export interface ProfileRow {
  id: string;
  username: string | null;
  rating: number;
  games_played: number;
}

export interface LeaderboardEntry {
  position: number;
  id: string;
  name: string;
  rating: number;
  gamesPlayed: number;
  /** First-place finishes (from match_results); 0 when unknown. */
  wins: number;
  /** wins / gamesPlayed, or null when the player has no games. */
  winRate: number | null;
  isOwn: boolean;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  ownTail?: LeaderboardEntry;
}

function winRateOf(wins: number, gamesPlayed: number): number | null {
  return gamesPlayed > 0 ? wins / gamesPlayed : null;
}

function toEntry(
  r: ProfileRow,
  position: number,
  ownId: string | null,
  winsById: Record<string, number>,
): LeaderboardEntry {
  const wins = winsById[r.id] ?? 0;
  return {
    position,
    id: r.id,
    name: displayName(r),
    rating: r.rating,
    gamesPlayed: r.games_played,
    wins,
    winRate: winRateOf(wins, r.games_played),
    isOwn: r.id === ownId,
  };
}

export function buildLeaderboard(
  rows: ProfileRow[],
  ownRow: ProfileRow | null,
  ownPosition: number | null,
  ownId: string | null,
  winsById: Record<string, number> = {},
): Leaderboard {
  const sorted = [...rows].sort(
    (a, b) => b.rating - a.rating || displayName(a).localeCompare(displayName(b)),
  );
  let prevRating: number | undefined;
  let prevPosition = 0;
  const entries: LeaderboardEntry[] = sorted.map((r, i) => {
    if (prevRating === undefined || r.rating !== prevRating) {
      prevPosition = i + 1;
      prevRating = r.rating;
    }
    return toEntry(r, prevPosition, ownId, winsById);
  });

  const inTop = ownId != null && entries.some((e) => e.isOwn);
  if (!inTop && ownRow && ownPosition != null && ownRow.games_played > 0) {
    const ownTail = toEntry(ownRow, ownPosition, ownId, winsById);
    return { entries, ownTail };
  }
  return { entries };
}
