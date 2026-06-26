# PokerElo — Handoff for Build Unit 5

_Last updated: 2026-06-25, after Build Unit 4 (Client UI + Matchmaking) merged to `master`._

Read `CLAUDE.md` first — it is the authoritative agent guide (golden rules, conventions, module
maps, status). This file is the orientation layer on top of it: where things stand, what's left,
and how to start Unit 5.

## Where the project stands

Build Units 1–4 are complete and on `master` (pushed to `origin`:
https://github.com/PeytonR72/Poker-Elo). All gates green: `npm test` (218 tests), `npm run
typecheck`, `npm run lint`, and `npm run build --workspace @poker/client`.

The app is **functionally complete end-to-end locally** but **not deployed** and has **no UI that
reads the persisted leaderboard/history**.

### End-to-end flow (how it fits together)

1. **Client** (`client/`, Vite+React) — user signs in with Supabase (`useSession`), lands in the
   **lobby**, picks a format, clicks Find Match.
2. **Lobby party** (`party/src/lobby.ts`) — authenticates (same `auth.ts` as the room), queues the
   player, and every `QUEUE_MATCH_INTERVAL_MS` runs the pure matchmaker (`party/src/matchmaker.ts`:
   expanding rating-window grouping + bot-fill). When a table forms it generates a room code,
   **provisions** the `MatchRoom` via the cross-party API (`POST { format, humanIds }`), and sends
   each player `matchFound { roomId, format }`.
3. **MatchRoom** (`party/src/matchRoom.ts`, the `main` party) — on `onRequest` stores the roster;
   admits only invited humans; starts when all expected humans are seated or after the connect
   grace (bot-filling missing seats, but never an all-bot match). Broadcasts `matchInfo` (clock).
   Runs the server-authoritative game loop, then `endMatch()` broadcasts `matchOver` and
   fire-and-forgets `report-match`.
4. **Persistence** (`supabase/`) — `report-match` edge function writes `matches`/`match_results`
   and increments `profiles.rating` (RLS: public read, service-role write).
5. Back in the **client**, `matchReducer` folds the redacted `PublicView` + events into UI state;
   the felt table renders; `matchOver` shows standings + ELO deltas.

## What Build Unit 5 could be

Pick **one** cohesive deliverable (one unit = one spec → plan → execute cycle). Start with the
`superpowers:brainstorming` skill and confirm scope with the user before building. Candidates,
roughly in priority order:

### A. Production deployment + live wiring  ← recommended first
The app can't be played by real users until it's deployed. This unit:
- Deploy the client (Vite) — Vercel is the natural fit; set the three `VITE_*` env vars.
- Deploy both PartyKit parties (`main` + `lobby`) to PartyKit Cloud; set `SUPABASE_JWT_SECRET`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` as PartyKit vars (currently empty placeholders in
  `partykit.json`).
- Create/point at a real Supabase project; apply `supabase/migrations/`; deploy the `report-match`
  edge function; wire real JWT auth (non-dev path).
- Turn the documented manual smoke test (in `docs/superpowers/plans/2026-06-24-client-ui-matchmaking.md`
  Task 13, Step 3) into a real end-to-end run.
- Note: there is a `vercel` plugin + skills available in this environment if deploying to Vercel.

### B. Leaderboard + profile/match-history UI
The persistence layer writes `profiles`/`matches`/`match_results` but nothing surfaces them.
Add client screens: global leaderboard (rank/rating, public read is already allowed by RLS), and a
per-player profile/history page. Pure-core + tested data shaping, thin components — same pattern as
Unit 4.

### C. Client polish + reconnect/spectator UX
Burn down the deferred minors (below), add a real reconnect indicator, optional spectator view
(`redactFor(null, …)` already supports spectators), action log/animations from `GameEvent`s.

## Deferred items (non-blocking, carried over from Unit 4 review)

These were triaged as acceptable-to-defer during the Unit 4 final review. Fold the relevant ones
into whichever unit touches that area:

1. **`useSession`** does not `setLoading(false)` if `supabase.auth.getSession()` rejects →
   perpetual "Loading…" on network failure. One-line `.catch`.
2. **`LobbyScreen`** Supabase profile fetch ignores the `error` field (graceful-degrades to
   `ELO_DEFAULT_RATING`).
3. **`ActionBar`** raise slider isn't reset when the mask changes between streets (it re-clamps on
   click, so the *sent* amount is always legal — cosmetic stale slider position only).
4. **Reducers** (`matchReducer`/`lobbyReducer`) never clear `error` → a transient server error
   (e.g. recoverable `illegal_action`) leaves a red banner pinned. Clear it on the next
   state-advancing message.
5. **Lobby `sendTo`** does an O(n) linear scan of connections per send (fine at lobby scale).
6. **`onlineCount`** passed to the matchmaker = current queue size (intended pool-size semantic per
   spec; revisit if you want a true "users online" count).

No known correctness/security bugs remain open. (Unit 4's review caught and fixed two: lobby
treating a failed-but-non-throwing provision as success, and the grace timer starting all-bot
phantom matches — both fixed with regression tests.)

## Conventions you must not break (see CLAUDE.md for the full list)

- **All poker-numeric values live once in `shared/src/constants.ts`** — never hardcode a stack,
  blind, timer, K-factor, table size, or rating window anywhere else.
- **Server-authoritative**: clients send intent only and render `redactFor(...)` views. Never leak
  the deck, seed, or foreign hole cards. The client must never fabricate opponent cards.
- `Action.amount` is **raise-TO** (total this street), not raise-by. The field is `Action.seat`.
- Relative imports end in `.js`; TypeScript strict + `noUncheckedIndexedAccess`;
  `verbatimModuleSyntax` (type-only imports use `import type`).
- The dev-token path (unsigned `dev:<userId>`) is gated by `isDevHost()` (exact hostname). Do not
  widen it; in production the real Supabase JWT path must be used (server `SUPABASE_JWT_SECRET` set).
- Tests colocated `*.test.ts`; keep the pure cores pure and tested, components thin.
- `npm test`, `npm run typecheck`, `npm run lint` must stay green. Release gates (hand-eval oracle,
  chip conservation) must stay green.

## Running locally

```bash
# install (workspace root)
npm install

# Terminal 1 — local PartyKit (dev mode: SUPABASE_JWT_SECRET empty -> accepts dev:<id> tokens)
npx partykit dev

# Terminal 2 — client
cd client && npm run dev
```

Set `client/.env` from `client/.env.example` (`VITE_PARTYKIT_HOST=localhost:1999`, plus a real
Supabase URL + anon key for auth). With fewer than `RANKED_MIN_ONLINE` players online the
matchmaker bot-fills, so a single signed-in user can start a match.

## How to work (process)

This repo uses the `superpowers` skills. For a new unit:
1. `superpowers:brainstorming` — explore intent + scope with the user, agree on the deliverable,
   write the design spec to `docs/superpowers/specs/`.
2. `superpowers:writing-plans` — produce the task-by-task implementation plan in
   `docs/superpowers/plans/`.
3. `superpowers:subagent-driven-development` — execute task-by-task (fresh implementer per task,
   spec+quality review after each, broad whole-branch review at the end). Branch off `master`
   first; finish with `superpowers:finishing-a-development-branch`.

Scout skills every turn (TDD, systematic-debugging, verification-before-completion), and keep
`CLAUDE.md` updated as modules land.
