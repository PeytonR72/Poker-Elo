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
  isOwn: boolean;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
  ownTail?: LeaderboardEntry;
}

export function buildLeaderboard(
  rows: ProfileRow[],
  ownRow: ProfileRow | null,
  ownPosition: number | null,
  ownId: string | null,
): Leaderboard {
  const sorted = [...rows].sort(
    (a, b) => b.rating - a.rating || displayName(a).localeCompare(displayName(b)),
  );
  const entries: LeaderboardEntry[] = sorted.map((r, i) => ({
    position: i + 1,
    id: r.id,
    name: displayName(r),
    rating: r.rating,
    gamesPlayed: r.games_played,
    isOwn: r.id === ownId,
  }));

  const inTop = ownId != null && entries.some((e) => e.isOwn);
  if (!inTop && ownRow && ownPosition != null && ownRow.games_played > 0) {
    const ownTail: LeaderboardEntry = {
      position: ownPosition,
      id: ownRow.id,
      name: displayName(ownRow),
      rating: ownRow.rating,
      gamesPlayed: ownRow.games_played,
      isOwn: true,
    };
    return { entries, ownTail };
  }
  return { entries };
}
