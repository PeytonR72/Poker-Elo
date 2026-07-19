import { MATCH_FORMATS, TABLE_SIZE } from "@poker/shared";

/**
 * Pure shapers for the Arena "recent matches" strip and the rating sparkline.
 * Consumes the same `match_results ⨝ matches` row shape the profile page uses,
 * but produces Arena-flavored view models (result chip, placement label, delta).
 * Supabase I/O lives in `lobby/useArenaHistory.ts`; these stay pure + tested.
 */
export interface ArenaMatchRow {
  match_id: string;
  finish_place: number;
  elo_delta: number;
  rating_after: number;
  matches: { format: string; ended_at: string } | null;
}

export interface ArenaHistoryEntry {
  matchId: string;
  /** raw ISO date string (empty when the joined match row is missing) */
  date: string;
  formatLabel: string;
  finishPlace: number;
  tableSize: number;
  /** e.g. "2nd / 6" */
  placement: string;
  eloDelta: number;
  ratingAfter: number;
  /** finished first */
  won: boolean;
}

/** English ordinal for a small finishing place (1 → "1st", 2 → "2nd", …). */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Shape the newest `limit` results into strip entries. Input rows are expected
 * newest-first (the Supabase query orders by `matches.ended_at` descending).
 */
export function buildArenaHistory(
  rows: ArenaMatchRow[],
  limit = 5,
): ArenaHistoryEntry[] {
  return rows.slice(0, limit).map((r) => ({
    matchId: r.match_id,
    date: r.matches?.ended_at ?? "",
    formatLabel: r.matches
      ? (MATCH_FORMATS[r.matches.format]?.label ?? r.matches.format)
      : "—",
    finishPlace: r.finish_place,
    tableSize: TABLE_SIZE,
    placement: `${ordinal(r.finish_place)} / ${TABLE_SIZE}`,
    eloDelta: r.elo_delta,
    ratingAfter: r.rating_after,
    won: r.finish_place === 1,
  }));
}

/**
 * Chronological (oldest → newest) rating trajectory for the sparkline. Takes
 * the newest-first rows, keeps the newest `n`, and reverses them so the line
 * reads left-to-right in time order.
 */
export function ratingSeries(rows: ArenaMatchRow[], n = 12): number[] {
  return rows
    .slice(0, n)
    .map((r) => r.rating_after)
    .reverse();
}
