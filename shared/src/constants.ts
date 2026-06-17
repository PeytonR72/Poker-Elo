// ── GOLDEN RULE ─────────────────────────────────────────────────────────────
// Every poker-numeric value in the entire app lives here ONCE. Client, server,
// and the edge function all import from this file. Nothing poker-numeric is
// hardcoded anywhere else.
// ────────────────────────────────────────────────────────────────────────────

export const TABLE_SIZE = 6;
export const STARTING_STACK = 1000;

// ── Rating (opponent-relative pairwise Elo) ─────────────────────────────────
export const ELO_DEFAULT_RATING = 400;
export const ELO_K_FACTOR = 24;
export const ELO_PROVISIONAL_K = 48;
export const ELO_PROVISIONAL_GAMES = 30;

// ── Matchmaking / lobby (consumed by later units) ───────────────────────────
export const RANKED_MIN_ONLINE = 6;
export const QUEUE_MATCH_INTERVAL_MS = 3000;
export const RATING_WINDOW_INITIAL = 100;
export const RATING_WINDOW_GROWTH_PER_SEC = 20;
export const BOT_FILL_WAIT_MS = 20000;
export const BOT_DECISION_DELAY_MIN_MS = 600;
export const BOT_DECISION_DELAY_MAX_MS = 2200;

// ── Live match timing (consumed by later units) ─────────────────────────────
export const DISCONNECT_GRACE_MS = 20000;
export const TIMEBANK_INITIAL_MS = 30000;
export const TIMEBANK_REPLENISH_MS = 0;
export const MATCH_CODE_LENGTH = 6;

// A hand already in progress when the buzzer fires plays out to completion.
export const MATCH_GRACE_FINISH = true;
// Collapse-to-one ends the match early.
export const HEADS_UP_EARLY_END = true;

// ── Match formats ───────────────────────────────────────────────────────────
export interface BlindLevel {
  sb: number;
  bb: number;
}

export interface MatchFormat {
  id: string;
  label: string;
  matchDurationMs: number; // HARD cap: no new hand starts after this (grace-finish current hand)
  blindLevelDurationMs: number;
  turnTimeMs: number; // HARD per-turn cap
  blindLevels: BlindLevel[]; // escalate, then HOLD at the last level
}

const MIN = 60_000;

export const MATCH_FORMATS: Record<string, MatchFormat> = {
  rapid: {
    id: "rapid",
    label: "Rapid",
    matchDurationMs: 5 * MIN,
    blindLevelDurationMs: 60_000,
    turnTimeMs: 15_000,
    blindLevels: [
      { sb: 10, bb: 20 },
      { sb: 15, bb: 30 },
      { sb: 25, bb: 50 },
      { sb: 40, bb: 80 },
      { sb: 50, bb: 100 },
    ],
  },
  turbo: {
    id: "turbo",
    label: "Turbo",
    matchDurationMs: 10 * MIN,
    blindLevelDurationMs: 120_000,
    turnTimeMs: 20_000,
    blindLevels: [
      { sb: 10, bb: 20 },
      { sb: 15, bb: 30 },
      { sb: 20, bb: 40 },
      { sb: 30, bb: 60 },
      { sb: 50, bb: 100 },
    ],
  },
  long: {
    id: "long",
    label: "Long",
    matchDurationMs: 20 * MIN,
    blindLevelDurationMs: 180_000,
    turnTimeMs: 25_000,
    blindLevels: [
      { sb: 10, bb: 20 },
      { sb: 15, bb: 30 },
      { sb: 20, bb: 40 },
      { sb: 30, bb: 60 },
      { sb: 40, bb: 80 },
      { sb: 50, bb: 100 },
      { sb: 75, bb: 150 },
    ],
  },
};

export const DEFAULT_FORMAT = "turbo";

/** Blind level for an elapsed match time (clamped to the top level). */
export function blindLevelAt(format: MatchFormat, elapsedMs: number): BlindLevel {
  const idx = Math.min(
    Math.floor(elapsedMs / format.blindLevelDurationMs),
    format.blindLevels.length - 1,
  );
  return format.blindLevels[idx]!;
}

// ── Rank tiers (display only; derived from rating) ──────────────────────────
export interface RankTier {
  name: string;
  minRating: number; // inclusive floor
}

export const RANK_TIERS: RankTier[] = [
  { name: "Fish", minRating: 0 },
  { name: "Limper", minRating: 500 },
  { name: "Grinder", minRating: 750 },
  { name: "Shark", minRating: 1000 },
  { name: "Semi-Pro", minRating: 1300 },
  { name: "Final Tablist", minRating: 1750 },
];

export function rankForRating(rating: number): string {
  let name = RANK_TIERS[0]!.name;
  for (const tier of RANK_TIERS) {
    if (rating >= tier.minRating) name = tier.name;
    else break;
  }
  return name;
}
