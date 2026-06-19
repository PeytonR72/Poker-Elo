# PokerElo — Agent Guide

PokerElo is a ranked, no-real-money web poker app (play for ELO). Flagship: 6-max single-table
No-Limit Hold'em, timed match. This repo is an npm-workspaces TS monorepo.

## Golden rules (NON-NEGOTIABLE)

1. **All poker numbers live in `shared/src/constants.ts` ONCE.** Never hardcode a poker-numeric
   value (stack, blind, timer, K-factor, table size) anywhere else.
2. **Server-authoritative.** The `shared/` engine is pure `(state, action) -> newState`, but only
   the (future) PartyKit server runs mutating transitions on the real, secret deck. Clients send
   intent only and receive `redactFor(...)` views — never the deck, seed, or foreign hole cards.

## Conventions

- **Relative imports end in `.js`** even though sources are `.ts` (`import { x } from "./x.js"`).
- Tests colocated: `src/foo.ts` ↔ `src/foo.test.ts`. Vitest.
- `Action.amount` is **raise-TO** (total chips committed this street), NOT raise-by.
- `Action.seat` (not `seatIndex`) — that is the field name on the Action type.
- A card is an int `0..51`: `rank = c % 13` (0=2 … 12=A), `suit = (c / 13) | 0`.
- TypeScript strict + `noUncheckedIndexedAccess`. Index access yields `T | undefined`; assert with
  `!` only when provably in-bounds, otherwise guard.
- `committedThisStreet` and `committedTotal` — the Seat fields used for chip tracking.
- `SeatStatus` values use `"allin"` (lowercase, one word), not `"allIn"`.
- `GameEvent` discriminant field names: `blind`, `action`, `street`, `award`, `handComplete`.
- `settleShowdown` and `awardSingleWinner` both return `{ state, events }` (immutable — never
  mutate the input state).

## Workspaces

- `shared/` `@poker/shared` — pure engine (Build Unit 1 complete).
- `client/` — React/Vite (placeholder).
- `party/` — PartyKit rooms (Build Unit 2 complete).
- `supabase/` — migrations + edge function (empty).

## `shared/src` module map

| File | Exports |
|---|---|
| `rng.ts` | `mulberry32`, `deriveSeed` |
| `roomCode.ts` | `ROOM_CODE_ALPHABET`, `makeRoomCode` |
| `constants.ts` | `STARTING_STACK`, `TABLE_SIZE`, `MATCH_FORMATS`, `MATCH_CODE_LENGTH`, `RANK_TIERS`, `ELO_*`, `BOT_*`, `TIMEBANK_*`, `RANKED_MIN_ONLINE`, `QUEUE_MATCH_INTERVAL_MS`, `RATING_WINDOW_*`, `DISCONNECT_GRACE_MS`, `DEFAULT_FORMAT`, `HEADS_UP_EARLY_END`, `MATCH_GRACE_FINISH`, `RANKS`, `SUITS` |
| `cards.ts` | `Card`, `makeCard`, `rankOf`, `suitOf`, `cardToString`, `cardFromString` |
| `deck.ts` | `fullDeck`, `shuffledDeck` |
| `protocol.ts` | `ClientMsg`, `ServerMsg`, `encode`, `decode` |
| `handEval/index.ts` | `HandCategory`, `evaluate5`, `evaluate7`, `evaluate7Naive`, `pack` |
| `engine/types.ts` | `Action`, `ActionType`, `ActionMask`, `GameEvent`, `Seat`, `SeatStatus`, `TableState`, `Street`, `Pot` |
| `engine/state.ts` | `createSeat`, `createHand`, `cloneState` |
| `engine/betting.ts` | `nextToAct`, `firstNeedsToAct`, `inHandCount`, `activeCount`, `firstActivePostflop`, `blindLevelAt` |
| `engine/legalActions.ts` | `legalActions`, `seatNeedsToAct` |
| `engine/pots.ts` | `buildPots` |
| `engine/showdown.ts` | `settleShowdown`, `awardSingleWinner` |
| `engine/reducer.ts` | `applyAction` |
| `engine/selectors.ts` | `redactFor`, `PublicSeat`, `PublicView` |
| `elo/pairwise.ts` | `pairwiseElo`, `EloPlayer`, `rankForRating` — **Note:** `pairwiseElo` deltas are NOT zero-sum when K differs between players (provisional vs normal). The persistence layer must apply each player's delta independently, not assume a balanced ledger. |
| `bots/policy.ts` | `decide` |

All of the above are re-exported from `shared/src/index.ts` (the public barrel).

## `party/src` module map

| File | Exports / Role |
|---|---|
| `matchRoom.ts` | `MatchRoom` — PartyKit `Party.Server`; full game loop, timers, ELO |
| `auth.ts` | `verifyJwt(token, secret)`, `parseDevToken("dev:<id>")` |
| `timers.ts` | `TurnTimer` — `start(ms, cb)` (auto-cancels previous), `cancel()` |
| `botRunner.ts` | `decideBotAction(view, holeCards, mask, rng)`, `botThinkDelayMs(rng, min, max)` |

**Key conventions for `party/`:**
- `party.getConnections()` is an **iterable**, not a Map — iterate it; no `.get()`.
- `timebankUsed` is broadcast BEFORE `yourTurn` so the client can update the clock first.
- `pairwiseElo` deltas are applied independently per player (not assumed zero-sum).
- CSPRNG seed: `crypto.getRandomValues(new Uint32Array(4))` XOR-folded to 32-bit.

## Commands

- `npm test` — run all Vitest suites. Single file: `npm test -- shared/src/x.test.ts`.
- `npm run typecheck` — `tsc -b`.
- `npm run lint` — ESLint.

## Release gates (must stay green)

- **Hand-eval oracle gate:** `evaluate7` ordering matches `evaluate7Naive` over 100k seeded hands.
  File: `shared/src/handEval/oracle.property.test.ts`
- **Chip-conservation gate:** side-pot build + showdown distribution conserves chips over
  3000 randomized multi-all-in hands.
  File: `shared/src/engine/conservation.property.test.ts`

## Match formats & rating

- Formats `rapid` / `turbo` (default) / `long` in `constants.ts`. Match length is a HARD cap;
  a hand in progress at the buzzer plays out (grace-finish). Blinds escalate then hold.
- Rating: opponent-relative pairwise Elo, default 400, K=24 (provisional 48 for first 30 games).
  Rank tiers (display): Fish/Limper/Grinder/Shark/Semi-Pro/Final Tablist.

## Security requirements

- **CSPRNG seeds (Build Unit 2 — server):** `shuffledDeck(seed)` is deterministic by design
  (test/replay interface). The PartyKit server MUST generate seeds via `crypto.getRandomValues` or
  `crypto.randomInt`, NEVER from a user-supplied, clock-based, or otherwise predictable source.
  A 32-bit seed from a CSPRNG is acceptable; a 128-bit seed is preferred. Violation exposes
  opponents' hole cards to an attacker who can brute-force ~4B deck states from community cards.

## Status

**Build Unit 1 (scaffold + pure engine) is complete.**
**Build Unit 2 (PartyKit `MatchRoom` server) is complete** — server-authoritative deal, private
hole cards, action loop, turn timer/timebank, match clock/blinds/bust placement/end, ELO deltas,
disconnect grace, and bot runner are all implemented and tested.
Next unit: client UI (React/Vite) — connect to MatchRoom via PartyKit, render redacted views.

## Working practice

- Scout skills every turn (TDD, systematic-debugging, verification-before-completion).
- Keep this file updated as modules land and conventions are set.
