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
- A card is an int `0..51`: `rank = c % 13` (0=2 … 12=A), `suit = (c / 13) | 0`.
- TypeScript strict + `noUncheckedIndexedAccess`. Index access yields `T | undefined`; assert with
  `!` only when provably in-bounds, otherwise guard.

## Workspaces

- `shared/` `@poker/shared` — pure engine (this is the only thing built so far).
- `client/` — React/Vite (placeholder).
- `party/` — PartyKit rooms (placeholder).
- `supabase/` — migrations + edge function (empty).

## Commands

- `npm test` — run all Vitest suites. Single file: `npm test -- shared/src/x.test.ts`.
- `npm run typecheck` — `tsc -b`.
- `npm run lint` — ESLint.

## Release gates (must stay green)

- **Hand-eval oracle gate:** `evaluate7` ordering matches `evaluate7Naive` over 100k seeded hands.
- **Chip-conservation gate:** side-pot build + showdown distribution conserves chips over
  randomized multi-all-in hands.

## Match formats & rating

- Formats `rapid` / `turbo` (default) / `long` in `constants.ts`. Match length is a HARD cap;
  a hand in progress at the buzzer plays out (grace-finish). Blinds escalate then hold.
- Rating: opponent-relative pairwise Elo, default 400, K=24 (provisional 48 for first 30 games).
  Rank tiers (display): Fish/Limper/Grinder/Shark/Semi-Pro/Final Tablist.

## Working practice

- Scout skills every turn (TDD, systematic-debugging, verification-before-completion).
- Keep this file updated as modules land and conventions are set.
