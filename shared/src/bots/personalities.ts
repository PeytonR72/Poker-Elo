/**
 * Bot playing styles. Each field generalizes a hardcoded number that used to live
 * directly in `policy.ts` — the same decision tree, just parameterized so different
 * personas route through it differently, and probabilistically (percentage-based)
 * rather than always taking the same branch for a given hand class.
 */
export interface BotPersona {
  id: string; // kebab-case, embedded in the bot's seat id (bot-<seatIndex>-<id>)
  name: string; // display name shown to players

  /** Shifts the 0-4 preflop hand-strength tier before clamping; loose personas play more hands. */
  tierBoost: number;
  /** Stack (in BB) at/under which the bot push/folds preflop instead of its normal tree. */
  jamThresholdBB: number;

  /** Freq of 3-betting (vs. calling) a tier-3 hand facing no bet. */
  raiseFreqTier3: number;
  /** BB size of a reraise a tier-3 hand will still 4-bet/jam into, vs. call/fold. */
  callToleranceTier3BB: number;

  /** Freq of opening a tier-2 hand facing no bet. */
  raiseFreqTier2: number;
  /** BB call size beyond which a tier-2 hand folds to a 3-bet. */
  foldThresholdTier2BB: number;

  /** Freq of opening a tier-1 hand facing no bet. */
  raiseFreqTier1: number;
  /** BB call size beyond which a tier-1 hand folds to a raise. */
  callThresholdTier1BB: number;

  /** Multiplier on postflop bet/raise sizing (as a fraction of pot). */
  sizeMult: number;
  /** Freq of betting a made pair when facing no bet. */
  betFreqPair: number;
  /** Freq of calling a big bet down with only a pair. */
  callDownFreq: number;
  /** Freq of betting with no made hand (a bluff). */
  bluffFreq: number;
}

export const GRINDER_GREG: BotPersona = {
  id: "grinder-greg",
  name: "Grinder Greg",
  tierBoost: 0,
  jamThresholdBB: 12,
  raiseFreqTier3: 0.7,
  callToleranceTier3BB: 6,
  raiseFreqTier2: 1.0,
  foldThresholdTier2BB: 4,
  raiseFreqTier1: 0.18,
  callThresholdTier1BB: 3,
  sizeMult: 1.0,
  betFreqPair: 0.25,
  callDownFreq: 0.1,
  bluffFreq: 0.12,
};

export const BOT_PERSONALITIES: BotPersona[] = [
  GRINDER_GREG,
  {
    id: "crazy-mike",
    name: "Crazy Mike",
    tierBoost: 2,
    jamThresholdBB: 12,
    raiseFreqTier3: 0.95,
    callToleranceTier3BB: 10,
    raiseFreqTier2: 1.0,
    foldThresholdTier2BB: 8,
    raiseFreqTier1: 0.6,
    callThresholdTier1BB: 6,
    sizeMult: 1.6,
    betFreqPair: 0.6,
    callDownFreq: 0.35,
    bluffFreq: 0.45,
  },
  {
    id: "nit-nancy",
    name: "Nit Nancy",
    tierBoost: -2,
    jamThresholdBB: 8,
    raiseFreqTier3: 0.3,
    callToleranceTier3BB: 3,
    raiseFreqTier2: 0.5,
    foldThresholdTier2BB: 2,
    raiseFreqTier1: 0.03,
    callThresholdTier1BB: 1,
    sizeMult: 0.8,
    betFreqPair: 0.05,
    callDownFreq: 0.02,
    bluffFreq: 0.01,
  },
  {
    id: "calling-station-stan",
    name: "Calling Station Stan",
    tierBoost: 1,
    jamThresholdBB: 10,
    raiseFreqTier3: 0.05,
    callToleranceTier3BB: 8,
    raiseFreqTier2: 0.1,
    foldThresholdTier2BB: 10,
    raiseFreqTier1: 0.02,
    callThresholdTier1BB: 8,
    sizeMult: 0.7,
    betFreqPair: 0.05,
    callDownFreq: 0.7,
    bluffFreq: 0.02,
  },
  {
    id: "shovey-chad",
    name: "Shovey Chad",
    tierBoost: 1,
    jamThresholdBB: 25,
    raiseFreqTier3: 0.6,
    callToleranceTier3BB: 8,
    raiseFreqTier2: 0.9,
    foldThresholdTier2BB: 5,
    raiseFreqTier1: 0.3,
    callThresholdTier1BB: 4,
    sizeMult: 1.3,
    betFreqPair: 0.35,
    callDownFreq: 0.2,
    bluffFreq: 0.2,
  },
  {
    id: "passive-pete",
    name: "Passive Pete",
    tierBoost: -1,
    jamThresholdBB: 10,
    raiseFreqTier3: 0.25,
    callToleranceTier3BB: 5,
    raiseFreqTier2: 0.5,
    foldThresholdTier2BB: 3,
    raiseFreqTier1: 0.05,
    callThresholdTier1BB: 2,
    sizeMult: 0.7,
    betFreqPair: 0.1,
    callDownFreq: 0.15,
    bluffFreq: 0.03,
  },
  {
    id: "tricky-rick",
    name: "Tricky Rick",
    tierBoost: 0,
    jamThresholdBB: 13,
    raiseFreqTier3: 0.6,
    callToleranceTier3BB: 6,
    raiseFreqTier2: 0.85,
    foldThresholdTier2BB: 4,
    raiseFreqTier1: 0.3,
    callThresholdTier1BB: 4,
    sizeMult: 1.1,
    betFreqPair: 0.4,
    callDownFreq: 0.15,
    bluffFreq: 0.35,
  },
  {
    id: "loose-lucy",
    name: "Loose Lucy",
    tierBoost: 2,
    jamThresholdBB: 12,
    raiseFreqTier3: 0.55,
    callToleranceTier3BB: 5,
    raiseFreqTier2: 0.9,
    foldThresholdTier2BB: 4,
    raiseFreqTier1: 0.5,
    callThresholdTier1BB: 3,
    sizeMult: 0.9,
    betFreqPair: 0.15,
    callDownFreq: 0.08,
    bluffFreq: 0.08,
  },
];

const PERSONA_BY_ID = new Map(BOT_PERSONALITIES.map((p) => [p.id, p]));

/**
 * Deterministically pick `count` distinct personas for a table, given the
 * room's own RNG. `count` must be <= BOT_PERSONALITIES.length.
 */
export function assignPersonas(count: number, rng: () => number): BotPersona[] {
  const pool = [...BOT_PERSONALITIES];
  // Fisher-Yates shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

/** Bot seat ids are `bot-<seatIndex>-<personaId>`; older `bot-<i>` ids fall back to the baseline. */
export function makeBotSeatId(seatIndex: number, persona: BotPersona): string {
  return `bot-${seatIndex}-${persona.id}`;
}

/** Resolves a bot's persona from its seat id, defaulting to the baseline style. */
export function personaForSeatId(id: string): BotPersona {
  const parts = id.split("-");
  const personaId = parts.slice(2).join("-");
  return PERSONA_BY_ID.get(personaId) ?? GRINDER_GREG;
}
