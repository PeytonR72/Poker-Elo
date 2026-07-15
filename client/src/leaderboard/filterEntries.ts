import type { LeaderboardEntry } from "../data/leaderboard.js";

/** Case-insensitive client-side name filter over the loaded top-100. */
export function filterEntries(entries: LeaderboardEntry[], query: string): LeaderboardEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((entry) => entry.name.toLowerCase().includes(q));
}
