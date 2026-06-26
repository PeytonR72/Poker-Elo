# PokerElo — Agent Guide

PokerElo is a ranked, no-real-money web poker app (play for ELO). Flagship: 6-max single-table
No-Limit Hold'em, timed match. This repo is an npm-workspaces TS monorepo.

## Golden rules (NON-NEGOTIABLE)

1. **All poker numbers live in `shared/src/constants.ts` ONCE.** Never hardcode a poker-numeric
   value (stack, blind, timer, K-factor, table size) anywhere else.
2. **Server-authoritative.** The `shared/` engine is pure `(state, action) -> newState`, but only
   the PartyKit server runs mutating transitions on the real, secret deck. Clients send
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
- `client/` — React/Vite SPA: auth → Home (Play/Leaderboard/Profile tabs) → felt-table game (Build Units 4–5 complete).
- `party/` — PartyKit `MatchRoom` + matchmaking `lobby` party (Build Units 2 & 4 complete).
- `supabase/` — `profiles`/`matches`/`match_results` migration + `report-match` edge fn (Build Unit 3 complete).

## `shared/src` module map

| File | Exports |
|---|---|
| `rng.ts` | `mulberry32`, `deriveSeed` |
| `roomCode.ts` | `ROOM_CODE_ALPHABET`, `makeRoomCode` |
| `constants.ts` | `STARTING_STACK`, `TABLE_SIZE`, `MATCH_FORMATS`, `MATCH_CODE_LENGTH`, `RANK_TIERS`, `ELO_*`, `BOT_*`, `TIMEBANK_*`, `RANKED_MIN_ONLINE`, `QUEUE_MATCH_INTERVAL_MS`, `RATING_WINDOW_*`, `DISCONNECT_GRACE_MS`, `DEFAULT_FORMAT`, `HEADS_UP_EARLY_END`, `MATCH_GRACE_FINISH`, `RANKS`, `SUITS` |
| `cards.ts` | `Card`, `makeCard`, `rankOf`, `suitOf`, `cardToString`, `cardFromString` |
| `deck.ts` | `fullDeck`, `shuffledDeck` |
| `protocol.ts` | `ClientMsg` (game: `hello`/`action`/`sitOut`/`ping`/`startMatch`; lobby: `enqueue`/`leave`), `ServerMsg` (game: `seated`/`dealPrivate`/`snapshot`/`event`/`yourTurn`/`timebankUsed`/`matchOver`/`matchInfo`/`error`; lobby: `queueStatus`/`matchFound`), `encode`, `decode` |
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
| `matchRoom.ts` | `MatchRoom` — PartyKit `Party.Server` (the `main` party); full game loop, timers, ELO, report-match, **roster provisioning** (`onRequest` POST `{ format, humanIds }`), roster-aware start + bot-fill, `matchInfo` broadcast |
| `lobby.ts` | `Lobby` — PartyKit `Party.Server` (the `lobby` party); queue, `QUEUE_MATCH_INTERVAL_MS` ticker, provisions a `MatchRoom` via `this.party.context.parties.main.get(roomId).fetch(...)`, sends `queueStatus`/`matchFound` |
| `matchmaker.ts` | `formMatches(waiters, now, onlineCount)` — pure expanding-rating-window grouping + bot-fill; `botFillEtaSec`; types `Waiter`, `FormedMatch` |
| `auth.ts` | `verifyJwt(token, secret)`, `parseDevToken("dev:<id>")` |
| `timers.ts` | `TurnTimer` — `start(ms, cb)` (auto-cancels previous), `cancel()` |
| `botRunner.ts` | `decideBotAction(view, holeCards, mask, rng)`, `botThinkDelayMs(rng, min, max)` |

Parties are registered in `partykit.json` (`main` = `matchRoom.ts`, `parties.lobby` = `lobby.ts`).

**Key conventions for `party/`:**
- `party.getConnections()` is an **iterable**, not a Map — iterate it; no `.get()`.
- `timebankUsed` is broadcast BEFORE `yourTurn` so the client can update the clock first.
- `pairwiseElo` deltas are applied independently per player (not assumed zero-sum).
- CSPRNG seed: `crypto.getRandomValues(new Uint32Array(4))` XOR-folded to 32-bit.
- A provisioned room only admits invited humans (`not_invited` otherwise); the grace timer
  (`DISCONNECT_GRACE_MS`) bot-fills missing humans but does **not** start an all-bot match (zero
  humans seated → room stays idle). `makeRoomCode` uses `Math.random` (room codes are not
  deck-secret; rooms enforce the roster).

## `client/src` module map

| File | Exports / Role |
|---|---|
| `App.tsx` | Screen router: loading → `AuthScreen` → (`match` set) `GameScreen` → else `Home` |
| `lib/env.ts` | `PARTYKIT_HOST`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `isDevHost()` (exact-hostname match) |
| `lib/supabase.ts` | configured `supabase` client |
| `auth/useSession.ts` | Supabase session hook; `getJwt()` → `dev:<id>` on local host, else `access_token` |
| `auth/AuthScreen.tsx` | email/password sign-in/up |
| `lobby/lobbyReducer.ts` | **pure** `lobbyReducer` (lobby `ServerMsg` → `LobbyUiState`) — tested |
| `lobby/useLobbySocket.ts` | connects to `lobby` party, enqueue/leave |
| `lobby/LobbyScreen.tsx` | rating/rank (from `profiles`), queue UI |
| `game/matchReducer.ts` | **pure** `matchReducer` (game `ServerMsg` → `MatchUiState`) — tested |
| `game/viewHelpers.ts` | **pure** `maskToButtons`, `clampRaiseTo` (raise-TO), `blindLevelLabel`, `formatCard`, `formatChips` — tested |
| `game/useMatchSocket.ts` | connects to `main` room, `hello` + `sendAction` |
| `game/*.tsx` | `GameScreen`, `Table` (felt), `SeatView`, `Board`, `CardView`, `ActionBar`, `MatchClock`, `MatchOver` |
| `data/displayName.ts` | `displayName` — player label (bot glyph / username / `player_<8>`) |
| `data/leaderboard.ts` | `ProfileRow`, `LeaderboardEntry`, `Leaderboard`, `buildLeaderboard` |
| `data/profile.ts` | `MatchResultRow`, `ProfileHeader`, `ProfileHistoryEntry`, `ProfileData`, `buildProfile` |
| `home/Home.tsx` | `Home` — tabbed shell (Play/Leaderboard/Profile) + rating badge header |
| `home/RatingBadge.tsx` | `RatingBadge` — rating + tier chip |
| `leaderboard/useLeaderboard.ts` | `useLeaderboard` — top-100 + own-rank fetch |
| `leaderboard/LeaderboardScreen.tsx` | `LeaderboardScreen` |
| `profile/useProfile.ts` | `useProfile` — profile row + joined match history fetch |
| `profile/ProfileScreen.tsx` | `ProfileScreen` |

**Key conventions for `client/`:**
- Dev mode is keyed on `isDevHost()` (host is exactly `localhost`/`127.0.0.1`, port stripped) — it
  gates the unsigned `dev:<userId>` token; never widen this to a prefix match.
- Pure cores (`matchReducer`/`lobbyReducer`/`viewHelpers`) hold the logic and are unit-tested;
  components stay thin. `import type React from "react"` is required wherever `React.CSSProperties`/
  `React.FormEvent` is referenced (`react-jsx` runtime, no auto-global `React`).
- Vite-only; do not `import` CSS from `.tsx` (breaks `tsc`) — link the stylesheet from `index.html`.
  `client/tsconfig.json` is composite, emits to `.tsbuild` (gitignored), referenced by root `tsc -b`.
- Run the client: `npm run dev` (inside `client/`); env via `client/.env` (see `.env.example`).
- Pure shaping cores live in `client/src/data/` (tested); hooks do Supabase I/O; components are thin. Usernames come from `profiles.username` (added in `20260625000001_usernames.sql`, seeded by the `handle_new_user` trigger from signup metadata).

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

## Deployment

- **Client**: https://client-coral-eight-91.vercel.app (Vercel, production). Build: `npm run build --workspace @poker/client` from repo root; output `client/dist`. Env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PARTYKIT_HOST`) set in Vercel project `peytonr7272-gmailcoms-projects/client`.
- **Supabase**: live project `wydnwnitnexifndwdsmg` (us-west-2). Both migrations applied. `report-match` edge function deployed and ACTIVE.
- **PartyKit**: NOT deployed to cloud (partykit.dev platform hit Cloudflare's 10k domain limit). Run `npx partykit dev` locally (port 1999) for gameplay. Future hosting options: Cloudflare Workers Paid ($5/mo via `partykit deploy`) or Fly.io free tier (run partykit dev in a container). When deployed, update `VITE_PARTYKIT_HOST` in Vercel env and redeploy.
- **PartyKit cloud secrets**: `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` already set via `npx partykit env add` (stored encrypted in PartyKit Cloud, ready for when deploy becomes possible).
- **Windows dev**: `npx partykit dev` and `npx partykit deploy` work on Windows (patch applied via `patch-package`; `postinstall` re-applies after `npm install`).

## Status

**Build Units 1–6 are complete:**
- **Unit 1** — scaffold + pure engine (`shared/`).
- **Unit 2** — PartyKit `MatchRoom`: server-authoritative deal, action loop, turn timer/timebank,
  match clock/blinds/bust/end, ELO deltas, disconnect grace, bot runner.
- **Unit 3** — Supabase persistence: `profiles`/`matches`/`match_results` migration + RLS,
  `report-match` edge function, fire-and-forget wiring from `MatchRoom.endMatch()`.
- **Unit 4** — React/Vite client (auth → lobby → felt-table game) + matchmaking `lobby` party,
  `MatchRoom` roster provisioning + `matchInfo`.
- **Unit 5** — Read-side UI: username migration + auth capture, `displayName` helper, leaderboard
  (top-100 + own-rank), profile + match history, Home tabbed shell, `MatchOver` uses centralized
  `displayName`. All pure cores tested; hooks do Supabase I/O; components are thin.
- **Unit 6** — Production deployment: client live on Vercel, `report-match` edge function deployed,
  PartyKit Windows dev crash fixed (patch-package). PartyKit cloud hosting deferred (platform limit);
  gameplay requires local `npx partykit dev` until a hosting solution is chosen.

**Not yet done / next:** PartyKit cloud hosting (Cloudflare Workers Paid or Fly.io).

## Working practice

- Scout skills every turn (TDD, systematic-debugging, verification-before-completion).
- Keep this file updated as modules land and conventions are set.
