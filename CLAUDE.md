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
| `protocol.ts` | `ClientMsg` (game: `hello` — takes an optional `spectate` flag, decided atomically at auth time — /`action`/`sitOut`/`ping`/`startMatch`/`spectate` (standalone, for an already-authed-but-unseated connection); lobby: `enqueue`/`leave`/`liveMatches`), `ServerMsg` (game: `seated`/`dealPrivate`/`snapshot`/`event`/`yourTurn`/`timebankUsed`/`matchOver`/`matchInfo`/`spectatorCount`/`error`; lobby: `queueStatus`/`matchFound`/`liveMatches`), `LiveMatchInfo`, `LiveMatchPlayer`, `encode`, `decode` |
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
| `bots/policy.ts` | `decide(view, hole, mask, rng, persona?)` — `persona` defaults to `GRINDER_GREG`, reproducing the original fixed tight-aggressive numbers |
| `bots/personalities.ts` | `BotPersona`, `BOT_PERSONALITIES` (8 named styles — see below), `GRINDER_GREG` (baseline), `assignPersonas(count, rng)`, `makeBotSeatId(seatIndex, persona)`, `personaForSeatId(id)` |

All of the above are re-exported from `shared/src/index.ts` (the public barrel).

## `party/src` module map

| File | Exports / Role |
|---|---|
| `matchRoom.ts` | `MatchRoom` — `partyserver` `Server<Env>` Durable Object (the `MAIN` binding); full game loop, timers, ELO, report-match, **roster provisioning** (`onRequest` POST `{ format, humanIds, humanRatings? }`), roster-aware start + bot-fill, `matchInfo` broadcast, **spectator role** (see `spectator.ts`), reports match start/end to the lobby's live-match registry (best-effort `onRequest` POST to `LOBBY`) |
| `lobby.ts` | `Lobby` — `partyserver` `Server<Env>` Durable Object (the `LOBBY` binding); queue, `QUEUE_MATCH_INTERVAL_MS` ticker, provisions a `MatchRoom` via `getServerByName(this.env.MAIN, roomId)`, sends `queueStatus`/`matchFound`; **live-match registry** (see `liveMatches.ts`) — `onRequest` accepts `MatchRoom`'s start/end reports, `liveMatches` client message answers with the current list |
| `matchmaker.ts` | `formMatches(waiters, now)` — pure expanding-rating-window grouping + bot-fill; `botFillEtaSec`; types `Waiter`, `FormedMatch`. Bot-fill eligibility is *only* `now - seed.enqueuedAt >= BOT_FILL_WAIT_MS` — there is no online-count short-circuit (a prior bug passed `waiters.size` as `onlineCount` and compared it to `RANKED_MIN_ONLINE`, so a lone queued player always beat the threshold and matched in one ~3s tick instead of waiting the intended 20s). `RANKED_MIN_ONLINE` is unused by the matchmaker as a result but stays exported from `constants.ts`. |
| `spectator.ts` | `canBecomeSpectator`, `viewFor`, `countSpectators` — pure spectator decision logic, unit-tested (see `spectator.test.ts`); `viewFor` is the security boundary: spectators always get `redactFor(null, …)`, never a seat-holder's view |
| `liveMatches.ts` | `registerStart`, `registerEnd`, `listLive`, `LIVE_MATCH_STALE_MARGIN_MS` — pure in-memory live-match registry (roomId → entry), unit-tested; `listLive` self-heals by sweeping expired entries on read |
| `auth.ts` | `verifyJwt(token, { secret?, supabaseUrl?, jwks? })` — dispatches on the JWT's own `alg` header: `HS256` verifies against `secret` (legacy Supabase projects), anything else (e.g. `ES256`) verifies against `jwks` if provided (test injection point), else `${supabaseUrl}/auth/v1/.well-known/jwks.json`. `parseDevToken("dev:<id>")` |
| `env.ts` | `Env` — typed Durable Object bindings (`MAIN`, `LOBBY`) + secrets (`SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `DEV_TOKENS`) |
| `worker.ts` | The Worker `fetch` entrypoint — delegates to `partyserver`'s `routePartykitRequest`; exports `MatchRoom`/`Lobby` as the deployed Durable Object classes |
| `timers.ts` | `TurnTimer` — `start(ms, cb)` (auto-cancels previous), `cancel()` |
| `botRunner.ts` | `decideBotAction(view, holeCards, mask, rng)`, `botThinkDelayMs(rng, min, max)` |

Durable Object bindings are declared in `wrangler.jsonc` (`MAIN` → `MatchRoom`, `LOBBY` → `Lobby`),
with the Worker entrypoint at `worker.ts`. `partykit`/`partykit.json` are gone from this repo —
`party/` is deployed with `wrangler`, not the `partykit` CLI (see
`docs/deploy-partyserver-cloudflare.md`).

**Key conventions for `party/`:**
- `this.getConnections()`/`this.broadcast()`/`this.env`/`this.name` are inherited from
  `partyserver`'s `Server<Env>` base class (no more `party.getConnections()`/`party.env`/`party.id`
  wrapper object — that was the old PartyKit `Party.Party` shape).
- `timebankUsed` is broadcast BEFORE `yourTurn` so the client can update the clock first.
- `pairwiseElo` deltas are applied independently per player (not assumed zero-sum).
- CSPRNG seed: `crypto.getRandomValues(new Uint32Array(4))` XOR-folded to 32-bit.
- **Bot personalities:** `matchRoom.ts`'s `startMatch()` assigns each bot seat a distinct
  `BotPersona` (`shared/src/bots/personalities.ts`, `assignPersonas`) via a CSPRNG-seeded shuffle,
  and ids bot seats `bot-<seatIndex>-<personaId>` (`makeBotSeatId`) instead of the old bare
  `bot-<i>`. `startsWith("bot-")` checks elsewhere (report-match filtering, `seatRngs` derivation,
  the client's `displayName`/`usePlayerNames`) still match the new format unchanged.
  `botRunner.decideBotAction` resolves the persona from the seat id (`personaForSeatId`, falls
  back to the baseline `GRINDER_GREG` for an unrecognized/legacy id) and passes it into
  `decide()`. Every persona is a set of frequencies/thresholds/multipliers layered onto the same
  decision tree — nothing routes on a hardcoded always/never branch, so no two hands with the same
  bot play out identically. Roster: Grinder Greg (baseline TAG), Crazy Mike (maniac — 3-bets/opens
  very wide and large), Nit Nancy (rock — premium-only), Calling Station Stan (rarely raises, calls
  down ~70%), Shovey Chad (push/fold from 25bb, not just the standard 12bb), Passive Pete
  (rarely bets/raises, mild calling), Tricky Rick (frequent postflop bluffs), Loose Lucy (wide
  preflop opens, weak-tight postflop).
- A provisioned room only admits invited humans (`not_invited` otherwise); the grace timer
  (`DISCONNECT_GRACE_MS`) bot-fills missing humans but does **not** start an all-bot match (zero
  humans seated → room stays idle). `makeRoomCode` uses `Math.random` (room codes are not
  deck-secret; rooms enforce the roster).
- **Spectator role:** anyone signed in can watch a live match without a seat. The `spectate` flag
  rides on `hello` itself (`{ t: "hello", jwt, spectate?: boolean }`), decided atomically as part
  of authentication — NOT via a follow-up message, because auth can complete fully synchronously
  (e.g. dev tokens never `await`), leaving no window for a second message to race seat assignment.
  A spectator connection is never seated, never affects matchmaking/bot-fill, and holds no
  disconnect-grace timer or saved timebank (`onClose`/`onError` branch on the spectator flag before
  any of that runs). `spectatorCount` broadcasts to every connection (players and spectators) on
  change. The security-critical piece — spectators must never see hole cards before showdown — is
  `viewFor` in `spectator.ts` (`redactFor(null, …)` always, never a seat-holder's view).
- **No automated tests for `matchRoom.ts`/`lobby.ts`.** `partyserver`'s `Server` class imports
  Cloudflare's `cloudflare:workers` built-in at module load time, which crashes under plain
  Node/Vitest regardless of mocking strategy (confirmed across multiple investigation attempts,
  including Cloudflare's own official `@cloudflare/vitest-pool-workers`, which crashes internally
  and unfixably in this environment). Verification for these two files is: `npm run typecheck` +
  careful diff review for any change, plus a manual/scripted `wrangler dev` integration check
  (see `docs/deploy-partyserver-cloudflare.md` and the partyserver-migration plan under
  `docs/superpowers/plans/` for the pattern) before any deploy. `auth.ts`/`matchmaker.ts`/
  `timers.ts`/`botRunner.ts`/`spectator.ts`/`liveMatches.ts` have no PartyKit/partyserver
  dependency and keep normal Vitest coverage — pull new server-side decision logic into a plain
  function in one of these rather than inlining it in `matchRoom.ts`/`lobby.ts` wherever practical,
  specifically so it stays testable. The Unit 10 `wrangler dev` integration check (2 players + 1
  spectator) caught a real bug this way: a first design deferred the spectate decision to a
  follow-up message assuming `hello`'s auth always yields — false for dev tokens, so the spectator
  connection got silently auto-seated as a real player. Fixed by moving the decision onto `hello`
  itself (see above) — a reminder that a security boundary must never depend on message-arrival
  timing, only integration-level testing surfaced it.

## `client/src` module map

| File | Exports / Role |
|---|---|
| `App.tsx` | Screen router: loading → `AuthScreen` → (`match` set, `{ roomId, format, spectator? }`) `GameScreen` → else `Home` |
| `lib/env.ts` | `PARTYKIT_HOST`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `isDevHost()` (exact-hostname match) |
| `lib/supabase.ts` | configured `supabase` client |
| `auth/useSession.ts` | Supabase session hook; `getJwt()` → `dev:<id>` on local host, else `access_token` |
| `auth/AuthScreen.tsx` | email/password sign-in/up |
| `lobby/lobbyReducer.ts` | **pure** `lobbyReducer` (lobby `ServerMsg` → `LobbyUiState`, incl. `liveMatches`) — tested |
| `lobby/useLobbySocket.ts` | connects to `lobby` party, enqueue/leave, requests `liveMatches` on connect + polls every 15s (lobby only answers on request, no push) |
| `lobby/LobbyScreen.tsx` | rating/rank (from `profiles`), queue UI, `onWatch` → spectate a live match |
| `lobby/LiveTablesCard.tsx` | "Live Tables" module (Arena lower row) — format badge, player names/ratings (via `usePlayerNames`), elapsed time, Watch button; empty state "No live tables right now." |
| `game/matchReducer.ts` | **pure** `matchReducer` (game `ServerMsg` → `MatchUiState`, incl. `spectatorCount`) — tested |
| `game/viewHelpers.ts` | **pure** `maskToButtons`, `clampRaiseTo` (raise-TO), `blindLevelLabel`, `formatCard`, `formatChips` — tested |
| `game/useMatchSocket.ts` | connects to `main` room, `hello` (with an optional `spectate` flag) + `sendAction` |
| `game/*.tsx` | `GameScreen` (`spectator?: boolean` prop — hides the action bar/waiting strip entirely, shows a SPECTATING pill + count, never renders hero hole cards), `Table` (felt, symmetric 6-max hexagon layout), `SeatView`, `Board`, `CardView`, `ActionBar`, `MatchClock`, `MatchOver` |
| `data/displayName.ts` | `displayName` — player label (bot glyph + persona name via `personaForSeatId` / username / `player_<8>`) |
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
- Styling is Tailwind v4 design tokens (`client/src/index.css` `@theme`/`@theme inline`) + shadcn/ui
  (`client/src/components/ui/`, `@/` alias sanctioned only inside `components/` and `lib/utils.ts`)
  + `motion` (Framer Motion) for animation, with the app root wrapped in
  `<MotionConfig reducedMotion="user">` (`client/src/main.tsx`) so `prefers-reduced-motion` degrades
  animations to instant transitions.

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

- **Client**: https://poker-elo.vercel.app (Vercel, production). Build: `npm run build --workspace @poker/client` from repo root; output `client/dist`. Env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PARTYKIT_HOST`) set in Vercel project `peytonr7272-gmailcoms-projects/client`.
- **Supabase**: live project `wydnwnitnexifndwdsmg` (us-west-2). Both migrations applied. `report-match` edge function deployed and ACTIVE.
- **`party/` (game server)**: live cloud-prem at `party.pokerelo.us`, deployed via `wrangler` (Cloudflare's own CLI) to the user's own Cloudflare account — `partykit`/`partykit.json` are gone from this repo entirely. Runs on the Workers **Free** plan (SQLite-backed Durable Objects via an explicit `new_sqlite_classes` migration in `party/wrangler.jsonc` — the `partykit` CLI could not generate this migration type for cloud-prem deploys, which is why this repo moved off it; see `docs/deploy-partyserver-cloudflare.md`). Secrets (`SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) are set via `wrangler secret put`; `DEV_TOKENS` is intentionally never set in production (its absence is what makes `dev:<id>` tokens rejected — verify with the smoke test in the runbook after every deploy). `VITE_PARTYKIT_HOST` on Vercel points at `party.pokerelo.us`.
- **Local dev**: `npm run dev` inside `party/` (now `wrangler dev`, not `npx partykit dev`) — needs a local `party/.dev.vars` with `DEV_TOKENS=true` (git-ignored). `wrangler dev` listens on `localhost:8787` by default; `client/.env`'s `VITE_PARTYKIT_HOST` must point there for local dev to reach it (fixed in Unit 10 — was still `localhost:1999` from the pre-Unit-8 `partykit` era).

## Status

**Build Units 1–8 are complete:**
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
- **Unit 7** — Bug fixes + polish: `auth_failed` fixed (dev tokens always tried first, gated on
  `party.env["DEV_TOKENS"] === "true"`); rating badge refreshes on return from match; Profile Back
  button restores originating tab; Supabase fetch errors surfaced inline; stale error banners cleared
  on next message in `matchReducer`/`lobbyReducer`; raise slider resets on new hand/street;
  SVG favicon wired; password `autoComplete` attribute added. All 234 tests green.
- **Unit 8** — `party/` migrated from the `partykit` CLI/platform to Cloudflare's `partyserver` +
  `wrangler`, deployed cloud-prem to `party.pokerelo.us` on the Workers **Free** plan. `MatchRoom`/
  `Lobby` converted to `partyserver` `Server<Env>` Durable Object subclasses (mechanical shell
  conversion — business logic unchanged); `matchRoom.test.ts`/`lobby.test.ts` (98 tests) removed —
  `partyserver`'s `Server` class cannot be loaded under plain Node/Vitest by design (confirmed via
  extensive investigation, see `docs/superpowers/plans/2026-07-11-partyserver-migration.md`'s
  Revision Notes), so these are now verified via `wrangler dev` integration checks instead of
  automated unit tests. Also fixed a real, previously-latent bug surfaced by this deploy:
  `party/src/auth.ts`'s `verifyJwt` only supported the legacy shared-secret `HS256` scheme; this
  Supabase project signs JWTs with asymmetric `ES256` keys, verified via JWKS — `verifyJwt` now
  dispatches on the token's own `alg` header to support both. Root `npm test` is now 138 tests
  (234 − 98 deleted + 2 new `auth.test.ts` cases for the JWKS dispatch logic).

- **Unit 9** — Deploy hygiene: `eslint.config.js` now ignores `**/.wrangler/**`, so `npm run lint`
  is literally clean (zero errors/warnings) instead of relying on future agents to know the
  `party/.wrangler/tmp/` build-artifact errors are expected noise. Real favicon PNGs
  (`favicon-32.png`/`icon-192.png`/`icon-512.png`) rasterized from the existing SVG via `sharp`
  (client devDependency only) plus description/OG meta tags added to `client/index.html`.
  `GameScreen` is now lazy-loaded (`React.lazy`/`Suspense` in `App.tsx`), splitting it into its own
  ~50 kB chunk — manually verified end to end against local `wrangler dev` (queue → match-found →
  table handoff, no blank frame, no double-transition); the shared entry chunk stays above Vite's
  500 kB warning threshold since `GameScreen` was only ~50 kB of the original 767 kB bundle and the
  rest is cross-screen framework weight. `verifyJwt` gained an optional `jwks` key-resolver
  override (used in preference to fetching `supabaseUrl`'s JWKS when present, no behavior change
  when absent) so `auth.test.ts` can now cover the ES256/JWKS success path fully offline via
  `createLocalJWKSet`, instead of only against live production traffic. Root `npm test` is now 224
  tests (221 + 3 new ES256/JWKS success-path cases).

- **Unit 10** — Spectator mode: anyone signed in can watch a live match without a seat.
  `shared/src/protocol.ts` gained `spectate` (an optional flag on `hello`, decided atomically at
  auth time — see `party/` conventions above for why NOT a follow-up message), `spectatorCount`,
  and `liveMatches` (client request / server response, plus `LiveMatchInfo`/`LiveMatchPlayer`
  types). `party/src/matchRoom.ts` tracks spectator connections via a role flag on `ConnState`;
  the security-critical redaction logic lives in the new `spectator.ts` (`canBecomeSpectator`,
  `viewFor`, `countSpectators` — unit-tested). `party/src/lobby.ts` gained an in-memory live-match
  registry (new `liveMatches.ts`: `registerStart`/`registerEnd`/`listLive`, unit-tested,
  self-healing stale-entry sweep) that `MatchRoom` reports to on match start/end. Client: `GameScreen`
  reuses one component for both roles via a `spectator?: boolean` prop; new `LiveTablesCard` module
  in the Arena's lower row; `App.tsx`'s match state gained an optional `spectator` flag threaded
  through `Home` → `LobbyScreen` → `GameScreen`, preserving Unit 9's lazy/Suspense/PageTransition
  structure unchanged. Verified via a scripted `wrangler dev` integration check (2 players + 1
  spectator) rather than a live two-browser session (blocked in this environment: even on
  `localhost`, reaching a signed-in session still requires real Supabase auth, and email
  confirmation is ON) — deferred to the user to do manually after deploy. Also fixed, in this unit:
  a real seat-layout bug (the 6-max position arrays put 3 seats on the left and only 2 on the
  right — `Table.tsx` now uses a symmetric hexagon) and the `client/.env`/`​.env.example`
  `VITE_PARTYKIT_HOST` port (see Deployment above). Root `npm test` is now 245 tests (224 + 21 new:
  spectator protocol round-trips, `spectator.ts`/`liveMatches.ts` pure-logic suites,
  `matchReducer`/`lobbyReducer` coverage for the new messages).

**Not yet done / next:** Further bundle splitting (`manualChunks` for
`motion`/`radix-ui`/`@supabase/supabase-js`) would be needed to clear the 500 kB chunk-size warning
entirely. The Unit 10 manual two-browser spectate check (real Supabase accounts, post-deploy) is
still owed.

**Post-Unit-10 fixes/polish:** Fixed a real matchmaking bug where a lone queued player matched in
one ~3s tick instead of the intended 20s bot-fill wait (`onlineCount` short-circuit in
`matchmaker.ts` — see `party/src` module map above); `formMatches` dropped the `onlineCount`
parameter. Enlarged the playing-card corner index (rank/suit) in `playing-card.tsx` and the hero's
own hole-card footprint in `SeatView.tsx` for readability, verified visually via a local
`wrangler dev` + `vite` Playwright session (desktop and 390px-compact). Added bot personalities
(`shared/src/bots/personalities.ts`, 8 named playing styles) — see the `party/src` module map
above for the full rundown; verified end-to-end in the same Playwright session (distinct persona
names/styles appearing at a live bot-filled table).

## Working practice

- Scout skills every turn (TDD, systematic-debugging, verification-before-completion).
- Keep this file updated as modules land and conventions are set.
