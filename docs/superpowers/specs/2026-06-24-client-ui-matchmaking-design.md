# Build Unit 4: Client UI + Matchmaking — Design

**Status:** Approved (design phase)
**Date:** 2026-06-24

## Goal

Add the player-facing **client** (React/Vite) and a real **matchmaking server** so players can
authenticate, queue for a ranked match, get placed at a table, and play 6-max No-Limit Hold'em
against humans and/or bots — rendering the server-authoritative redacted views from the existing
`MatchRoom`.

Build Units 1–3 (engine, `MatchRoom`, persistence) are complete. This unit adds the client and the
matchmaking layer, plus small, bounded changes to `MatchRoom` and the wire protocol.

## Non-negotiable constraints

- **All poker-numeric values come from `shared/src/constants.ts`.** The client and lobby import
  `MATCH_FORMATS`, `STARTING_STACK`, `TABLE_SIZE`, `RANK_TIERS`/`rankForRating`,
  `RANKED_MIN_ONLINE`, `QUEUE_MATCH_INTERVAL_MS`, `RATING_WINDOW_INITIAL`,
  `RATING_WINDOW_GROWTH_PER_SEC`, `BOT_FILL_WAIT_MS`, `DEFAULT_FORMAT`, `BOT_DECISION_DELAY_*`.
  Nothing poker-numeric is hardcoded anywhere new.
- **Server-authoritative.** The client sends intent only (`hello`, `action`, etc.) and renders
  `redactFor(...)` views. Opponent hole cards arrive as `null` (already redacted server-side).
- **Relative imports end in `.js`** in TS source (monorepo convention).
- **TypeScript strict + `noUncheckedIndexedAccess`.**
- `Action.amount` is **raise-TO** (total committed this street), not raise-by. The field is
  `Action.seat`, not `seatIndex`.
- Bot seats have IDs starting `"bot-"`.
- Dev mode: when `VITE_PARTYKIT_HOST` is localhost, the client sends `dev:<userId>` as the JWT
  (consumed by `parseDevToken`). The server is in dev mode when `SUPABASE_JWT_SECRET` is empty.
- `npm test`, `npm run typecheck`, `npm run lint` must stay green.

## Component map

### New backend

| File | Role |
|---|---|
| `party/src/lobby.ts` | Singleton PartyKit "lobby" party — queue + matchmaker |
| `party/src/lobby.test.ts` | Vitest tests for the matchmaker grouping/bot-fill logic |
| `shared/src/protocol.ts` | Add lobby `ClientMsg`/`ServerMsg` variants + `matchInfo` server msg |
| `party/src/matchRoom.ts` | Add roster **provisioning** (`onRequest`) + roster-aware start with bot-fill; broadcast `matchInfo` |
| `partykit.json` | Register the `lobby` party alongside `main` |

### New client (`client/`)

```
client/
  index.html
  vite.config.ts
  tsconfig.json
  package.json            (deps + dev/build/preview/test scripts)
  src/
    main.tsx              mount React
    App.tsx               screen router on {auth, lobby, game} state
    lib/env.ts            VITE_* env access + isDevHost(localhost)
    lib/supabase.ts       Supabase client from env
    auth/
      useSession.ts       Supabase auth state + JWT accessor
      AuthScreen.tsx      email/password sign-in/up
    lobby/
      useLobbySocket.ts   connect to lobby party, enqueue, receive status/matchFound
      lobbyReducer.ts     PURE: ServerMsg(lobby) -> LobbyUiState
      LobbyScreen.tsx     rating/rank display, join queue, queue status
    game/
      useMatchSocket.ts   thin WS wrapper: send hello, dispatch ServerMsg
      matchReducer.ts     PURE: ServerMsg(game) -> MatchUiState (the tested core)
      viewHelpers.ts      PURE: maskToButtons, raise clamp, blind-level label, card fmt
      GameScreen.tsx      orchestrates table + action bar + clock + match-over
      Table.tsx, SeatView.tsx, Board.tsx, CardView.tsx,
      ActionBar.tsx, MatchClock.tsx, MatchOver.tsx
```

The lobby and `MatchRoom` stay independent: the lobby decides *who plays together* and *where*;
`MatchRoom` runs the game. They communicate only via a provisioning request (a defined interface),
never shared memory.

## Matchmaking protocol & flow

### Wire messages (added to `shared/src/protocol.ts`)

Lobby client → server:
- `{ t: "hello"; jwt: string }` (auth; reuses `verifyJwt`/`parseDevToken`)
- `{ t: "enqueue"; rating: number; format: string }`
- `{ t: "leave" }`

Lobby server → client:
- `{ t: "queueStatus"; waiting: number; position: number; etaSec: number }`
- `{ t: "matchFound"; roomId: string; format: string }`
- `{ t: "error"; message: string }`

Game (existing, unchanged) plus one addition:
- `{ t: "matchInfo"; format: string; matchStartMs: number; matchDurationMs: number }` —
  sent to each player on match start and on reconnect, so the client can render the match
  countdown and blind-level timer.

> Note on `decode()`: it validates the **tag only**; each server re-guards payloads. The lobby
> party validates `enqueue` fields (numeric rating, known format) before acting.

### Matchmaker algorithm (`lobby.ts`)

State: a list of waiters `{ connId, playerId, rating, format, enqueuedAt }`.

A ticker runs every `QUEUE_MATCH_INTERVAL_MS`. Per format bucket:

1. Each waiter has an expanding acceptance window:
   `window(w) = RATING_WINDOW_INITIAL + RATING_WINDOW_GROWTH_PER_SEC × waitSec(w)`.
2. Sort the bucket by `enqueuedAt` (oldest first). Greedily accumulate a group: a candidate joins
   the group only if every current member's rating is within the candidate's window **and** the
   candidate is within every member's window (mutual overlap). When a group reaches `TABLE_SIZE`,
   form a match.
3. **Bot-fill:** if the oldest waiter in the bucket has waited ≥ `BOT_FILL_WAIT_MS`, or fewer than
   `RANKED_MIN_ONLINE` players are currently in the lobby, form a match from the available
   window-compatible humans (≥ 1) and fill the remaining seats with bots. (`MatchRoom` creates the
   actual `bot-…` seats; the lobby just provisions the human roster + format.)
4. On forming a match:
   - `roomId = makeRoomCode()`.
   - Provision the `MatchRoom`: POST to the `main` party for `roomId` with
     `{ format, humanIds: string[] }` via the PartyKit cross-party API
     (`this.party.context.parties.main.get(roomId).fetch(...)`).
   - Send each grouped human `{ t: "matchFound", roomId, format }`.
   - Remove them from the waiters list.

Waiting players receive a `queueStatus` on each tick (and on enqueue) with their queue position and
a coarse ETA estimate.

> `RANKED_MIN_ONLINE` use: below this many lobby connections, a full human table is unlikely, so the
> matchmaker shortcuts to bot-fill rather than making players wait the full `BOT_FILL_WAIT_MS`.

## MatchRoom provisioning + match clock (`matchRoom.ts`)

Bounded additions; existing behavior (6-human auto-start, dev `startMatch`, action loop, timers,
ELO, persistence) is preserved.

1. **`onRequest(req)`** — handles `POST /provision` with body `{ format, humanIds: string[] }`.
   Stores `expectedHumanIds: Set<string>`, the chosen `format`, and a `provisioned` flag. Idempotent
   (a second provision for an already-started room is ignored). Returns 200.
2. **Roster-aware start.** When provisioned, seat humans by arrival as they `hello` in. Start the
   match when **all expected humans are seated**, or after a short **connect-grace** window
   (reuse `DISCONNECT_GRACE_MS`), whichever comes first; fill any unseated/empty seats with bots.
   The current "start when `authedCount === TABLE_SIZE`" path remains as a fallback for the
   non-provisioned (e.g. dev) case.
3. **`matchInfo` broadcast.** On `startMatch`, after building state, broadcast
   `{ t: "matchInfo", format, matchStartMs, matchDurationMs }` (duration from
   `MATCH_FORMATS[format].matchDurationMs`). On reconnect, send it to the reconnecting player along
   with the snapshot.

The provisioned `format` overrides `DEFAULT_FORMAT` in `startMatch`.

## Client architecture

### Screen router (`App.tsx`)

A small state machine over `useSession`:
- **No session →** `AuthScreen`.
- **Session, not matched →** `LobbyScreen`.
- **Session + `matchFound` (roomId, format) →** `GameScreen`.

### Auth (`auth/`)

- `useSession` wraps `supabase.auth`: tracks the current session, exposes `signIn`, `signUp`,
  `signOut`, and a `getJwt()` that returns `session.access_token` (or `dev:<userId>` when the host
  is localhost).
- `AuthScreen`: email/password form, sign-in and sign-up, error display.

### Lobby (`lobby/`)

- On mount, fetch the player's `profiles` row (`rating`, `games_played`) via Supabase; if no row
  exists yet, show the default rating (`ELO_DEFAULT_RATING`) and `rankForRating`.
- "Find Match" connects to the lobby party (`party: "lobby"`), sends `hello` then
  `enqueue { rating, format }`. Displays `queueStatus` (waiting count, position, ETA) and a Cancel
  that sends `leave`. On `matchFound`, hand `{ roomId, format }` up to `App` to switch to the game.
- `lobbyReducer` is the pure state transition over lobby `ServerMsg`.

### Game (`game/`)

- `useMatchSocket(roomId, getJwt)` opens a `PartySocket` to the `main` party for `roomId`, sends
  `{ t: "hello", jwt }` on open, and dispatches every decoded `ServerMsg` into `matchReducer`.
  Exposes `state` and a `send(action)` for the action bar.
- `matchReducer(state, msg)` — **pure**, the tested core. Handles:
  - `seated` → record own seat index.
  - `dealPrivate` → store own hole cards (merged into the own seat for rendering).
  - `snapshot` → replace `view` (the `PublicView`); re-merge own private cards when the view
    doesn't reveal them.
  - `matchInfo` → store `{ format, matchStartMs, matchDurationMs }`.
  - `yourTurn` → store `{ mask, deadlineTs }`; clear it once an action is sent or a new snapshot
    arrives where it is no longer our turn.
  - `timebankUsed` → update remaining timebank for the clock.
  - `event` → optional action-log/animation hint (kept minimal; view is the source of truth).
  - `matchOver` → store final `{ finishPlaceById, eloDeltas }`.
  - `error` → store a user-visible message.
- `viewHelpers` (pure):
  - `maskToButtons(mask)` → which of fold/check/call/raise are enabled + call amount label.
  - `clampRaiseTo(value, mask)` → clamp into `[minRaiseTo, maxRaiseTo]`.
  - `blindLevelLabel(sb, bb, format)` → match against `MATCH_FORMATS[format].blindLevels` to derive
    a level label.
  - card formatting via shared `cardToString`.
- **Felt table UI:** green oval table, six seats positioned around it (own seat at the bottom),
  each showing id (bots labeled), stack, status, and hole cards (own only; opponents face-down or
  revealed at showdown when the view includes them). Community board and pot(s) centered. The
  `ActionBar` shows enabled buttons from the mask and a raise slider clamped to the legal raise-TO
  range. `MatchClock` renders the match countdown (from `matchInfo`) and current blind level.
  `MatchOver` shows final standings (places) and ELO deltas.

## Error handling

- Auth failures (bad credentials, expired JWT) surface inline on the relevant screen.
- A server `error` message is shown non-destructively (banner/toast); fatal ones (`auth_failed`,
  `table_full`) return the player to the lobby.
- Socket disconnects: the client shows a "reconnecting…" state and re-opens the socket, re-sending
  `hello` (the server's disconnect-grace + reconnect path restores the seat and resends snapshot +
  `matchInfo`).
- The raise slider cannot submit a value outside `[minRaiseTo, maxRaiseTo]`; call sends the exact
  `mask.callAmount`. (The server re-validates regardless.)

## Testing strategy

Pure logic is unit-tested with Vitest (colocated `*.test.ts`); UI components are verified manually
via the dev server.

- `game/matchReducer.test.ts` — sequences of `ServerMsg` → asserted `MatchUiState`: seating,
  private-card merge, snapshot/board/pot updates, `yourTurn` gating cleared correctly,
  `matchInfo` stored, `matchOver` standings + deltas, `error` capture.
- `game/viewHelpers.test.ts` — mask→button enablement, raise clamp at both bounds, blind-level
  labeling, card formatting.
- `lobby/lobbyReducer.test.ts` — `queueStatus`/`matchFound`/`error` handling.
- `party/lobby.test.ts` — matchmaker: window-overlap grouping forms a full table; bot-fill triggers
  after `BOT_FILL_WAIT_MS` / below `RANKED_MIN_ONLINE`; provisioning request shape; dequeue on
  match.
- `party/matchRoom.test.ts` — new cases: provisioning stores roster + format; provisioned start
  fires when all expected humans seated; connect-grace start bot-fills missing humans; `matchInfo`
  broadcast on start and on reconnect. Existing tests stay green.

## Build sequence

1. `shared/src/protocol.ts` — add lobby messages + `matchInfo`. (typecheck)
2. `party/src/lobby.ts` + tests — matchmaker grouping + bot-fill + provisioning request.
3. `party/src/matchRoom.ts` — provisioning `onRequest`, roster-aware start, `matchInfo` broadcast;
   extend `matchRoom.test.ts`. `partykit.json` — register `lobby` party.
4. `client/` scaffold — Vite + React + TS config, `package.json` deps/scripts, `index.html`,
   `main.tsx`, `App.tsx` shell.
5. Socket layer + reducers (TDD): `matchReducer`, `viewHelpers`, `lobbyReducer`, `useMatchSocket`,
   `useLobbySocket`.
6. Screens & felt table: `AuthScreen`, `LobbyScreen`, `GameScreen` + table components.
7. Wire env (`VITE_PARTYKIT_HOST`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), manual run
   against a local PartyKit + dev tokens; final `npm test`/`typecheck`/`lint`.

## Out of scope

- Spectator mode, leaderboard browsing, friends, chat.
- Persisting queue state across lobby restarts (in-memory queue is acceptable for this unit).
- Mobile-specific layouts (responsive-friendly but desktop-first).
