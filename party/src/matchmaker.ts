import {
  TABLE_SIZE,
  RANKED_MIN_ONLINE,
  RATING_WINDOW_INITIAL,
  RATING_WINDOW_GROWTH_PER_SEC,
  BOT_FILL_WAIT_MS,
} from "@poker/shared";

export interface Waiter {
  playerId: string;
  rating: number;
  format: string;
  enqueuedAt: number; // ms epoch
}

export interface FormedMatch {
  format: string;
  humanIds: string[]; // 1..TABLE_SIZE humans; MatchRoom fills the rest with bots
}

/** Acceptance half-width around a waiter's rating, expanding with wait time. */
function windowFor(waiter: Waiter, now: number): number {
  const waitSec = Math.max(0, (now - waiter.enqueuedAt) / 1000);
  return RATING_WINDOW_INITIAL + RATING_WINDOW_GROWTH_PER_SEC * waitSec;
}

/** True when candidate's rating mutually overlaps every member's expanding window. */
function fits(candidate: Waiter, members: Waiter[], now: number): boolean {
  const cw = windowFor(candidate, now);
  for (const m of members) {
    const limit = Math.min(cw, windowFor(m, now));
    if (Math.abs(candidate.rating - m.rating) > limit) return false;
  }
  return true;
}

/** Seconds until this waiter becomes eligible for a bot-filled match (0 once elapsed). */
export function botFillEtaSec(waiter: Waiter, now: number): number {
  const waited = now - waiter.enqueuedAt;
  return Math.max(0, Math.ceil((BOT_FILL_WAIT_MS - waited) / 1000));
}

/**
 * Greedy expanding-window matchmaker. Groups oldest-first; emits a match when a group
 * reaches TABLE_SIZE, or when the seed is bot-fill eligible (waited >= BOT_FILL_WAIT_MS,
 * or fewer than RANKED_MIN_ONLINE players online) and the group has >= 1 human.
 */
export function formMatches(
  waiters: Waiter[],
  now: number,
  onlineCount: number,
): { matches: FormedMatch[]; matchedIds: Set<string> } {
  const matches: FormedMatch[] = [];
  const matchedIds = new Set<string>();

  // Bucket by format, each sorted oldest-first.
  const buckets = new Map<string, Waiter[]>();
  for (const wtr of waiters) {
    const list = buckets.get(wtr.format) ?? [];
    list.push(wtr);
    buckets.set(wtr.format, list);
  }

  for (const [format, listRaw] of buckets) {
    const list = [...listRaw].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    const used = new Set<string>();

    for (const seed of list) {
      if (used.has(seed.playerId)) continue;
      const group: Waiter[] = [seed];

      for (const cand of list) {
        if (group.length >= TABLE_SIZE) break;
        if (cand.playerId === seed.playerId || used.has(cand.playerId)) continue;
        if (fits(cand, group, now)) group.push(cand);
      }

      const full = group.length >= TABLE_SIZE;
      const botFillEligible =
        now - seed.enqueuedAt >= BOT_FILL_WAIT_MS || onlineCount < RANKED_MIN_ONLINE;

      if (full || botFillEligible) {
        for (const g of group) {
          used.add(g.playerId);
          matchedIds.add(g.playerId);
        }
        matches.push({ format, humanIds: group.map((g) => g.playerId) });
      }
    }
  }

  return { matches, matchedIds };
}
