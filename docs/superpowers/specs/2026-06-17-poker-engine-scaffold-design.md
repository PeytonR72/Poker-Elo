# PokerElo — Build Unit 1: Scaffold + Pure Engine — Design

**Date:** 2026-06-17
**Status:** Approved (design); spec under user review
**Scope:** Phase 0 (monorepo scaffold) + Phase 1 (pure poker engine in `shared/`)

---

## 1. Context

PokerElo is a ranked, no-real-money web poker app (chess.com-style: you play for ELO).
Flagship ranked format is **6-max single-table No-Limit Texas Hold'em, timed (~10 min turbo)**.
Busting before the buzzer locks finishing place by bust order; survivors rank above bust-outs by
chips. Rating is **opponent-relative pairwise Elo**. Two modes: Casual (bots fill, no ELO) and
Ranked (humans only, ELO). Persistence via Supabase; live state via PartyKit; the pure rules
engine lives in `shared/`.

The full app spans 7 phases (scaffold → engine → server → persistence → matchmaking → client →
deploy). **This spec covers only the first buildable unit: the scaffold and the pure engine.**
Every later unit depends on this one being correct, and this unit needs zero external credentials
— it is entirely TDD-able offline.

### Critical architecture rule (applies to the whole project, set up here)
Poker is **fully server-authoritative**. The shared engine is pure `(state, action) -> newState`,
but only the future PartyKit server ever runs the mutating transitions on the real (secret) deck.
The engine in this unit must be written so that secret state (deck, seed, foreign hole cards) is
cleanly separable and redactable.

---

## 2. Scope & boundary

**In scope (this unit):**
- npm-workspaces monorepo scaffold with TS/Vitest/ESLint/Prettier tooling.
- The complete pure engine in `shared/`: cards, deck, hand evaluation, betting state machine,
  pots/showdown, redaction selector, pairwise Elo, bot policy, protocol shell.
- `constants.ts` with multi-format match config.
- A living `CLAUDE.md`.
- All of it TDD'd; the two property tests are release gates.

**Explicitly NOT in scope (later units):**
- PartyKit `MatchRoom` / `LobbyRoom`, timers, bot runner, match loop.
- Supabase schema, RLS, `report-match` edge function.
- React client / SVG table / routes.
- Matchmaking, deploy.
- Real antes (see §5), puzzles, GTO solver, wingman/2v2 format (only *structurally* allowed for).

---

## 3. Repo scaffold (Phase 0)

```
shared/   @poker/shared — PURE TS. No DOM, no IO, no Math.random in logic. Source of truth.
client/   placeholder workspace (package.json + empty src) — built in a later unit.
party/    placeholder workspace (package.json + empty src) — built in a later unit.
supabase/ empty dir — built in a later unit.
docs/     specs + design docs.
```

- `tsconfig.base.json`: `moduleResolution: "Bundler"`, `strict: true`,
  `noUncheckedIndexedAccess: true`. Each workspace extends it.
- **`.js` import-specifier rule kept** even though sources are `.ts` (relative imports end in
  `.js`). Documented in CLAUDE.md and enforced by lint where practical.
- Vitest (workspace-aware), ESLint, Prettier. Root scripts: `test`, `typecheck`, `lint`.
- Built fresh (no zoomies dependency), mirroring the proven patterns:
  - `shared/src/rng.ts` — `mulberry32(seed)` + `deriveSeed(base, label)`. Pure, deterministic.
  - `shared/src/roomCode.ts` — match-code generation (length from constants).
  - `shared/src/constants.ts` — see §4.
  - `shared/src/protocol.ts` — `encode`/`decode` shell. **`decode` validates the tag only**; the
    server (later unit) re-guards every payload. Discriminated-union message types stubbed here so
    later units extend rather than invent.
- **Gate:** `npm run test` and `npm run typecheck` green on an essentially empty engine.

---

## 4. `constants.ts` — the golden-rule file (with match formats)

All poker numbers live here ONCE. Nothing poker-numeric is hardcoded anywhere else (client,
server, edge function all import from here in later units).

**Shared constants:**
- `TABLE_SIZE = 6`
- `STARTING_STACK = 1000`
- `ELO_DEFAULT_RATING = 1000`, `ELO_K_FACTOR`, provisional K, provisional-games threshold
- `RANKED_MIN_ONLINE`, rating-window growth params, `QUEUE_MATCH_INTERVAL_MS`
- `BOT_FILL_WAIT_MS`, bot decision-delay bounds
- `DISCONNECT_GRACE_MS`, timebank params
- `MATCH_CODE_LENGTH`
- `MATCH_GRACE_FINISH` (finish the in-progress hand after the buzzer)
- `HEADS_UP_EARLY_END` (collapse-to-one ends match)

**Match formats** — a `MATCH_FORMATS` map keyed by id (`rapid` | `turbo` | `standard`), with
`DEFAULT_FORMAT = "turbo"`. Each format defines `matchDurationMs`, `blindLevelDurationMs`,
`turnTimeMs`, and a `blindLevels` ladder. Blinds **escalate and hold at the top level** once the
clock passes the last level boundary. Start stack $1000 = 50 BB at level 1, ~10 BB at the top.

| Format | Match length | Level len | Turn timer | Blind ladder (SB/BB) |
|---|---|---|---|---|
| **rapid** | ~5 min | ~60s | ~15s | 10/20 → 15/30 → 25/50 → 40/80 → 50/100 |
| **turbo** *(default)* | ~10 min | ~120s | ~20s | 10/20 → 15/30 → 20/40 → 30/60 → 50/100 |
| **standard** | ~18 min | ~180s | ~25s | 10/20 → 15/30 → 20/40 → 30/60 → 40/80 → 50/100 → 75/150 |

**Antes decision:** v1 uses **blind escalation only, no separate antes.** A true big-blind ante
posts dead money preflop and complicates the betting/pot logic; it is deferred. The engine should
not make assumptions that would block adding antes later, but no ante mechanics are built now.

---

## 5. Card & hand evaluation (`shared/src/`)

- **`cards.ts`** — a card is an int `0..51`. `rank = c % 13` (0 = deuce … 12 = ace),
  `suit = (c / 13) | 0`. Fast and trivially serializable. Tests: string round-trips
  (`"As"`, `"Td"`, …), a full 52-distinct-card deck.
- **`deck.ts`** — `shuffledDeck(seed)` via Fisher-Yates over `mulberry32`.
  Property tests: same seed → identical permutation; output is always a permutation of all 52.
  **The seed is server-only and is never sent to clients** (enforced structurally + in later units).
- **`handEval/`** — 7-card evaluator, built in two layers:
  1. **`evaluate7Naive`** (the **oracle**): enumerate all C(7,5)=21 five-card subsets, categorize
     each, return the max. Simple and obviously correct.
  2. **`evaluate7`** (fast path): per-suit bitmasks for flush / straight-flush, a rank-count array
     for quads/trips/pairs, producing a single **packed comparable integer `value`** (higher =
     better; equal = exact tie).
  - **Release gate (property test):** 100k seeded random 7-card hands — `evaluate7` ordering must
    exactly match `evaluate7Naive` ordering — plus crafted cases: the wheel (A-2-3-4-5), the steel
    wheel (straight flush wheel), board-plays-the-hand, and exact split ties.

---

## 6. Engine state machine (`shared/src/engine/`)

Pure, immutable reducer. No mutation of inputs; returns new state.

- **`types.ts` / `state.ts`** — `TableState`, `Seat`, `Pot`, `HandState`. `createHand` deals from a
  supplied (server-owned) deck, posts blinds for the active level, rotates the button among
  non-busted seats. **`Action.amount` is "raise-TO"** (total chips committed by this player this
  street), NOT "raise-by" — documented loudly in code and CLAUDE.md.
  - **Format-agnostic roster:** seats carry an optional `group`/`team` field (unused in v1's 6
    independent players) so the future wingman 2v2 format attaches without re-architecting. The
    engine must not hardwire "6 fully independent players" where a grouping could later matter.
- **`legalActions.ts`** — `legalActions(state, seat) -> ActionMask` returning fold availability,
  call amount, and min/max raise-to. This is the **single source of truth** consumed by both the
  future client action bar and the future server validation. No duplicated rules.
- **`betting.ts` + `reducer.ts`** — `applyAction(state, action) -> { state, events }`. Handles:
  street advance (deal flop/turn/river by popping the deck), action order (UTG first preflop,
  first non-folded seat left of button postflop), the **big-blind option**, **min-raise sizing**,
  and the **incomplete-raise-doesn't-reopen-the-betting** rule. Emits an `events[]` list
  (blind posted, dealt, action taken, street dealt, showdown, pot awarded) for the future server
  to build snapshots/animations from.
- **`pots.ts` + `showdown.ts`** — construct main + side pots by all-in level with correct
  eligibility; distribute with split-pot ties; **odd chip goes to the first eligible seat left of
  the button**; folded contributions remain as dead money in the pot. **Release gate (property
  test):** chip conservation — across randomized multi-all-in hands, total chips out = total chips
  in, for every distribution.
- **`selectors.ts`** — `redactFor(playerId, state)` returns the public view for one player: their
  own hole cards, all public state, and **no deck, no foreign hole cards, no seed**. This is the
  anti-cheat boundary the server will rely on.

**Highest-risk areas getting extra tests:** multi-all-in side-pot construction/distribution
(chip-conservation), all-in showdown with folded dead money, min-raise / incomplete-raise
reopening behavior, button rotation past busted seats.

---

## 7. Elo & bots (`shared/src/`)

- **`elo/pairwise.ts`** — `pairwiseElo(players, finishPlaceById, K) -> deltaById`. For each of the
  C(6,2)=15 pairs: `S = 1` (better place) / `0` (worse) / `0.5` (tie in finishing place),
  `E = 1 / (1 + 10^((Rj - Ri) / 400))`, accumulate `K * (S - E)` per player. **Do NOT divide K by
  (N-1)** (ranked must feel meaningful). Tie-in-chips at the buzzer → same finishing place → S=0.5.
  Provisional players use a higher K. K and provisional params come from `constants.ts`.
- **`bots/policy.ts`** — pure `decide(view, hole, rng) -> Action`. Tight-aggressive with position
  awareness (preflop hand tiers by position), postflop made-hand bucket derived from `evaluate7`
  vs pot odds, push/fold when short-stacked, and a low rng-gated bluff frequency. Pure + seeded RNG
  → fully testable. Consumes only the redacted view + its own hole cards (same info a human has).

---

## 8. Protocol shell (`shared/src/protocol.ts`)

A discriminated-union message protocol, `encode`/`decode` helpers. **`decode` validates the tag
only**; full payload re-validation is the future server's job (security-critical there). Message
types are stubbed so later units extend the union rather than reinvent it:
- `ClientMsg`: `hello` (jwt) / `action` / `sitOut` / `ping`.
- `ServerMsg`: `seated` / `dealPrivate` / `snapshot` (redacted) / `event` / `yourTurn`
  (legal mask + deadline) / `matchOver` / `error`.
A round-trip test (encode→decode preserves tag + shape) is the only protocol test in this unit.

---

## 9. Working practices (apply for the whole build, established now)

- **Living `CLAUDE.md`.** Created at scaffold and updated continuously: every time a module lands,
  a convention is set, a constant is added, or a non-obvious decision is made. It documents the two
  golden rules (all poker numbers in `constants.ts`; fully server-authoritative), the raise-TO
  convention, the `.js` import rule, the card int encoding, the redaction/anti-cheat boundary, the
  TDD gates, and how to run tests. It is treated as a first-class deliverable, not an afterthought.
- **Skill/plugin scouting every turn.** Before acting each turn, evaluate whether a skill
  (test-driven-development, systematic-debugging, verification-before-completion, etc.) or plugin
  adds value, and invoke it if so. TDD discipline in particular is mandatory for this unit.
- **TDD-first ordering.** Build strictly in the Phase-1 order, each module red→green before the
  next: cards/deck → handEval (oracle then fast path, 100k gate) → engine types/state →
  legalActions/betting/reducer → pots/showdown (chip-conservation gate) → elo → bots → protocol.

---

## 10. Verification (this unit's definition of done)

- `npm run test` green; `npm run typecheck` green; `npm run lint` clean.
- **Gate 1:** hand-eval 100k property test (`evaluate7` matches `evaluate7Naive`) passes,
  plus crafted edge cases.
- **Gate 2:** side-pot chip-conservation property test passes across randomized multi-all-in hands.
- A short manual sanity script can deal a hand, run a few actions through `applyAction`, reach
  showdown, and distribute pots with conserved chips.
- `CLAUDE.md` reflects the final conventions and how to run everything.

---

## 11. Out of scope / deferred (tracked, not built here)
Server rooms, timers, bot runner; Supabase schema/RLS/edge function; React UI; matchmaking;
deploy; real antes; wingman/2v2 (structurally allowed for only); spectating; puzzles; GTO solver.
