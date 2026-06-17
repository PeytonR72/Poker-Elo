# PokerElo Scaffold + Pure Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the npm-workspaces monorepo scaffold and the complete pure poker engine in `shared/` (`@poker/shared`), fully TDD'd, with the hand-eval-vs-oracle and side-pot chip-conservation property tests as release gates.

**Architecture:** A single source-of-truth pure-TS package. Cards are ints `0..51`. Hand strength is a packed comparable integer produced two ways — a naive C(7,5) oracle and a fast bitmask evaluator — that must agree. The betting layer is a pure immutable reducer `applyAction(state, action) -> { state, events }` with `Action.amount` meaning **raise-TO**. Pots/showdown conserve chips. A `redactFor` selector is the anti-cheat boundary. Elo is opponent-relative pairwise. No DOM, no IO, no `Math.random` in logic.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `moduleResolution: Bundler`, `.js` import specifiers), npm workspaces, Vitest, ESLint, Prettier.

**Conventions (every task follows these):**

- Relative imports end in `.js` even though sources are `.ts` (e.g. `import { mulberry32 } from "./rng.js"`).
- Tests are colocated: `src/foo.ts` → `src/foo.test.ts`.
- Run tests from the repo root with `npm test` (Vitest workspace). Run a single file with `npm test -- src/path/file.test.ts`.
- Before each task, scout skills: use **superpowers:test-driven-development** for every module, **superpowers:systematic-debugging** if a test fails unexpectedly, **superpowers:verification-before-completion** before claiming a task done.
- After each task that establishes a convention or lands a module, update `CLAUDE.md` (Task 6 creates it; later tasks append to it).
- Commit after every green task.

---

## File Structure

```
package.json                 root, workspaces + scripts
tsconfig.base.json           shared compiler options
tsconfig.json                root solution refs (optional)
.eslintrc.cjs / eslint.config.js
.prettierrc.json
vitest.config.ts             root vitest (projects)
CLAUDE.md                    living doc
shared/
  package.json               @poker/shared
  tsconfig.json              extends base
  src/
    rng.ts                   mulberry32 + deriveSeed
    roomCode.ts              match code generation
    constants.ts             golden-rule numbers + MATCH_FORMATS + RANK_TIERS
    cards.ts                 card int <-> string, deck of 52
    deck.ts                  shuffledDeck(seed)
    protocol.ts              encode/decode (tag-only validation) + msg unions
    handEval/
      categories.ts          HandCategory enum + pack()
      evaluate5.ts           evaluate5(5 cards) -> packed int
      evaluate7Naive.ts      oracle: max over C(7,5)
      evaluate7.ts           fast bitmask evaluator
      index.ts               re-exports
    engine/
      types.ts               TableState/Seat/Pot/Action/Event/Street
      state.ts               createTable, createHand, blinds, button rotation
      legalActions.ts        legalActions(state, seat) -> ActionMask
      betting.ts             helpers: order, min-raise, reopening
      reducer.ts             applyAction(state, action) -> { state, events }
      pots.ts                buildPots(seats) -> Pot[]
      showdown.ts            settleShowdown(state) -> { state, events }
      selectors.ts           redactFor(playerId, state) -> PublicView
    elo/
      pairwise.ts            pairwiseElo(players, finishPlaceById, K)
    bots/
      policy.ts              decide(view, hole, rng) -> Action
client/   package.json placeholder + src/.gitkeep
party/    package.json placeholder + src/.gitkeep
supabase/ .gitkeep
```

---

## Task 1: Root monorepo scaffold

**Files:**

- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.prettierrc.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "pokerelo",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "workspaces": ["shared", "client", "party"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "eslint": "^9.13.0",
    "typescript-eslint": "^8.10.0",
    "@eslint/js": "^9.13.0",
    "prettier": "^3.3.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": false,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "composite": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 3: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: completes, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: root monorepo scaffold (workspaces, tsconfig, vitest, prettier)"
```

---

## Task 2: ESLint flat config

**Files:**

- Create: `eslint.config.js`

- [ ] **Step 1: Create `eslint.config.js`**

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Keep the .js import-specifier discipline visible; relax noise.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
```

- [ ] **Step 2: Verify lint runs (no source yet is fine)**

Run: `npm run lint`
Expected: exits 0 (no files to lint, or no errors).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: eslint flat config"
```

---

## Task 3: `shared` workspace package

**Files:**

- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/index.ts`
- Test: `shared/src/smoke.test.ts`

- [ ] **Step 1: Create `shared/package.json`**

```json
{
  "name": "@poker/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*"
  }
}
```

- [ ] **Step 2: Create `shared/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `shared/src/index.ts`**

```ts
export const PACKAGE_NAME = "@poker/shared";
```

- [ ] **Step 4: Write smoke test `shared/src/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("smoke", () => {
  it("exports the package name", () => {
    expect(PACKAGE_NAME).toBe("@poker/shared");
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm test -- shared/src/smoke.test.ts`
Expected: 1 passed.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: @poker/shared workspace with passing smoke test"
```

---

## Task 4: `rng.ts` — mulberry32 + deriveSeed

**Files:**

- Create: `shared/src/rng.ts`
- Test: `shared/src/rng.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/rng.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { mulberry32, deriveSeed } from "./rng.js";

describe("mulberry32", () => {
  it("is deterministic for a given seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("returns floats in [0, 1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });
});

describe("deriveSeed", () => {
  it("is deterministic and label-sensitive", () => {
    expect(deriveSeed(100, "hand:1")).toBe(deriveSeed(100, "hand:1"));
    expect(deriveSeed(100, "hand:1")).not.toBe(deriveSeed(100, "hand:2"));
    expect(deriveSeed(100, "hand:1")).not.toBe(deriveSeed(200, "hand:1"));
  });

  it("returns a 32-bit unsigned integer", () => {
    const s = deriveSeed(123, "x");
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/rng.test.ts`
Expected: FAIL — cannot find module `./rng.js`.

- [ ] **Step 3: Implement `shared/src/rng.ts`**

```ts
/** A pure deterministic PRNG. Never use Math.random in engine logic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a new 32-bit seed from a base seed and a string label (FNV-1a mix). */
export function deriveSeed(base: number, label: string): number {
  let h = (base >>> 0) ^ 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/rng.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): deterministic rng (mulberry32 + deriveSeed)"
```

---

## Task 5: `roomCode.ts` — match codes

**Files:**

- Create: `shared/src/roomCode.ts`
- Test: `shared/src/roomCode.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/roomCode.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { makeRoomCode, ROOM_CODE_ALPHABET } from "./roomCode.js";
import { mulberry32 } from "./rng.js";

describe("makeRoomCode", () => {
  it("produces a code of the requested length from the alphabet", () => {
    const rng = mulberry32(42);
    const code = makeRoomCode(6, rng);
    expect(code).toHaveLength(6);
    for (const ch of code) {
      expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it("is deterministic for a seeded rng", () => {
    expect(makeRoomCode(6, mulberry32(1))).toBe(makeRoomCode(6, mulberry32(1)));
  });

  it("excludes ambiguous characters", () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[O0I1l]/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/roomCode.test.ts`
Expected: FAIL — cannot find module `./roomCode.js`.

- [ ] **Step 3: Implement `shared/src/roomCode.ts`**

```ts
/** Unambiguous uppercase alphabet (no O/0/I/1/L). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Generate a room code of `length` chars using a provided rng (0..1). */
export function makeRoomCode(length: number, rng: () => number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(rng() * ROOM_CODE_ALPHABET.length);
    out += ROOM_CODE_ALPHABET[idx];
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/roomCode.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): room code generation"
```

---

## Task 6: `constants.ts` + living `CLAUDE.md`

**Files:**

- Create: `shared/src/constants.ts`
- Test: `shared/src/constants.test.ts`
- Create: `CLAUDE.md`

- [ ] **Step 1: Write the failing test `shared/src/constants.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  TABLE_SIZE,
  STARTING_STACK,
  ELO_DEFAULT_RATING,
  ELO_K_FACTOR,
  ELO_PROVISIONAL_K,
  ELO_PROVISIONAL_GAMES,
  MATCH_FORMATS,
  DEFAULT_FORMAT,
  RANK_TIERS,
  rankForRating,
} from "./constants.js";

describe("core constants", () => {
  it("has a 6-max table and $1000 start", () => {
    expect(TABLE_SIZE).toBe(6);
    expect(STARTING_STACK).toBe(1000);
  });

  it("starts rating at 400", () => {
    expect(ELO_DEFAULT_RATING).toBe(400);
    expect(ELO_K_FACTOR).toBe(24);
    expect(ELO_PROVISIONAL_K).toBe(48);
    expect(ELO_PROVISIONAL_GAMES).toBe(30);
  });
});

describe("match formats", () => {
  it("default format is turbo and exists", () => {
    expect(DEFAULT_FORMAT).toBe("turbo");
    expect(MATCH_FORMATS[DEFAULT_FORMAT]).toBeDefined();
  });

  it("every format has ascending blind levels and a positive duration", () => {
    for (const id of Object.keys(MATCH_FORMATS)) {
      const f = MATCH_FORMATS[id]!;
      expect(f.matchDurationMs).toBeGreaterThan(0);
      expect(f.turnTimeMs).toBeGreaterThan(0);
      expect(f.blindLevels.length).toBeGreaterThan(0);
      for (let i = 1; i < f.blindLevels.length; i++) {
        const prev = f.blindLevels[i - 1]!;
        const cur = f.blindLevels[i]!;
        expect(cur.bb).toBeGreaterThan(prev.bb);
        expect(cur.sb).toBe(cur.bb / 2);
      }
      // first level is 10/20
      expect(f.blindLevels[0]).toEqual({ sb: 10, bb: 20 });
    }
  });

  it("turbo caps at 50/100, long caps at 75/150", () => {
    const turbo = MATCH_FORMATS.turbo!.blindLevels;
    expect(turbo[turbo.length - 1]).toEqual({ sb: 50, bb: 100 });
    const long = MATCH_FORMATS.long!.blindLevels;
    expect(long[long.length - 1]).toEqual({ sb: 75, bb: 150 });
  });
});

describe("rank tiers", () => {
  it("maps ratings to the right rank", () => {
    expect(rankForRating(0)).toBe("Fish");
    expect(rankForRating(400)).toBe("Fish");
    expect(rankForRating(500)).toBe("Limper");
    expect(rankForRating(749)).toBe("Limper");
    expect(rankForRating(750)).toBe("Grinder");
    expect(rankForRating(1000)).toBe("Shark");
    expect(rankForRating(1300)).toBe("Semi-Pro");
    expect(rankForRating(1750)).toBe("Final Tablist");
    expect(rankForRating(3000)).toBe("Final Tablist");
  });

  it("RANK_TIERS is ordered by ascending floor", () => {
    for (let i = 1; i < RANK_TIERS.length; i++) {
      expect(RANK_TIERS[i]!.minRating).toBeGreaterThan(RANK_TIERS[i - 1]!.minRating);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/constants.test.ts`
Expected: FAIL — cannot find module `./constants.js`.

- [ ] **Step 3: Implement `shared/src/constants.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/constants.test.ts`
Expected: all passed.

- [ ] **Step 5: Create `CLAUDE.md` (the living doc)**

```markdown
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
```

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck`
Expected: exits 0.

```bash
git add -A && git commit -m "feat(shared): constants (formats, rating, rank tiers) + CLAUDE.md"
```

---

## Task 7: Placeholder workspaces (`client`, `party`, `supabase`)

**Files:**

- Create: `client/package.json`, `client/src/.gitkeep`
- Create: `party/package.json`, `party/src/.gitkeep`
- Create: `supabase/.gitkeep`

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "@poker/client",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 2: Create `party/package.json`**

```json
{
  "name": "@poker/party",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 3: Create the keep files**

Create empty files: `client/src/.gitkeep`, `party/src/.gitkeep`, `supabase/.gitkeep`.

- [ ] **Step 4: Verify workspaces still install/test clean**

Run: `npm install && npm test`
Expected: install OK; all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: placeholder client/party/supabase workspaces"
```

---

## Task 8: `cards.ts` — card int encoding

**Files:**

- Create: `shared/src/cards.ts`
- Test: `shared/src/cards.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/cards.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { rankOf, suitOf, makeCard, cardToString, cardFromString, fullDeck } from "./cards.js";

describe("cards", () => {
  it("round-trips known cards", () => {
    expect(cardFromString("2c")).toBe(0);
    expect(cardToString(0)).toBe("2c");
    expect(cardFromString("As")).toBe(51);
    expect(cardToString(51)).toBe("As");
  });

  it("rank/suit accessors agree with makeCard", () => {
    for (let r = 0; r < 13; r++) {
      for (let s = 0; s < 4; s++) {
        const c = makeCard(r, s);
        expect(rankOf(c)).toBe(r);
        expect(suitOf(c)).toBe(s);
      }
    }
  });

  it("round-trips every card via string", () => {
    for (let c = 0; c < 52; c++) {
      expect(cardFromString(cardToString(c))).toBe(c);
    }
  });

  it("fullDeck is 52 distinct cards 0..51", () => {
    const d = fullDeck();
    expect(d).toHaveLength(52);
    expect(new Set(d).size).toBe(52);
    expect(Math.min(...d)).toBe(0);
    expect(Math.max(...d)).toBe(51);
  });

  it("throws on a bad string", () => {
    expect(() => cardFromString("Xx")).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/cards.test.ts`
Expected: FAIL — cannot find module `./cards.js`.

- [ ] **Step 3: Implement `shared/src/cards.ts`**

```ts
export type Card = number; // 0..51

export const RANKS = "23456789TJQKA"; // index 0..12 (0 = deuce, 12 = ace)
export const SUITS = "cdhs"; // clubs, diamonds, hearts, spades (index 0..3)

export function rankOf(c: Card): number {
  return c % 13;
}
export function suitOf(c: Card): number {
  return (c / 13) | 0;
}
export function makeCard(rank: number, suit: number): Card {
  return suit * 13 + rank;
}
export function cardToString(c: Card): string {
  return RANKS[rankOf(c)]! + SUITS[suitOf(c)]!;
}
export function cardFromString(s: string): Card {
  if (s.length !== 2) throw new Error(`bad card: ${s}`);
  const r = RANKS.indexOf(s[0]!);
  const su = SUITS.indexOf(s[1]!);
  if (r < 0 || su < 0) throw new Error(`bad card: ${s}`);
  return makeCard(r, su);
}
export function fullDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/cards.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): card int encoding (cards.ts)"
```

---

## Task 9: `deck.ts` — seeded shuffle

**Files:**

- Create: `shared/src/deck.ts`
- Test: `shared/src/deck.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/deck.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { shuffledDeck } from "./deck.js";

describe("shuffledDeck", () => {
  it("same seed -> identical permutation", () => {
    expect(shuffledDeck(123)).toEqual(shuffledDeck(123));
  });

  it("different seeds -> different permutation (very likely)", () => {
    expect(shuffledDeck(1)).not.toEqual(shuffledDeck(2));
  });

  it("is always a permutation of all 52 cards", () => {
    for (const seed of [0, 1, 42, 999, 123456]) {
      const d = shuffledDeck(seed);
      expect(d).toHaveLength(52);
      expect([...d].sort((a, b) => a - b)).toEqual(Array.from({ length: 52 }, (_, i) => i));
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/deck.test.ts`
Expected: FAIL — cannot find module `./deck.js`.

- [ ] **Step 3: Implement `shared/src/deck.ts`**

```ts
import { mulberry32 } from "./rng.js";
import { fullDeck, type Card } from "./cards.js";

/** Fisher-Yates over mulberry32. The seed is SERVER-ONLY — never sent to clients. */
export function shuffledDeck(seed: number): Card[] {
  const deck = fullDeck();
  const rng = mulberry32(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = deck[i]!;
    deck[i] = deck[j]!;
    deck[j] = tmp;
  }
  return deck;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/deck.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): seeded Fisher-Yates shuffledDeck"
```

---

## Task 10: `handEval` categories + `evaluate5` + `evaluate7Naive` (oracle)

**Files:**

- Create: `shared/src/handEval/categories.ts`
- Create: `shared/src/handEval/evaluate5.ts`
- Create: `shared/src/handEval/evaluate7Naive.ts`
- Test: `shared/src/handEval/evaluate5.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/handEval/evaluate5.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { evaluate5 } from "./evaluate5.js";
import { evaluate7Naive } from "./evaluate7Naive.js";
import { HandCategory } from "./categories.js";
import { cardFromString as C } from "../cards.js";

const five = (s: string) => s.split(" ").map(C);

function categoryOf(value: number): number {
  return Math.floor(value / 16 ** 5);
}

describe("evaluate5 categories", () => {
  it("ranks the canonical category ladder correctly", () => {
    const royal = evaluate5(five("As Ks Qs Js Ts"));
    const quads = evaluate5(five("9c 9d 9h 9s Kc"));
    const boat = evaluate5(five("8c 8d 8h Kc Kd"));
    const flush = evaluate5(five("Ah Th 7h 4h 2h"));
    const straight = evaluate5(five("8c 7d 6h 5s 4c"));
    const trips = evaluate5(five("Qc Qd Qh 9s 2c"));
    const twoPair = evaluate5(five("Jc Jd 4h 4s 9c"));
    const pair = evaluate5(five("5c 5d Kh 9s 2c"));
    const high = evaluate5(five("Ah Qd 9h 5s 2c"));
    const ordered = [high, pair, twoPair, trips, straight, flush, boat, quads, royal];
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!).toBeGreaterThan(ordered[i - 1]!);
    }
    expect(categoryOf(royal)).toBe(HandCategory.StraightFlush);
    expect(categoryOf(quads)).toBe(HandCategory.Quads);
    expect(categoryOf(high)).toBe(HandCategory.HighCard);
  });

  it("handles the wheel (A-2-3-4-5) as a 5-high straight", () => {
    const wheel = evaluate5(five("Ah 2c 3d 4s 5h"));
    const sixHigh = evaluate5(five("2c 3d 4s 5h 6c"));
    expect(categoryOf(wheel)).toBe(HandCategory.Straight);
    expect(sixHigh).toBeGreaterThan(wheel);
    const broadway = evaluate5(five("Ts Jd Qh Ks Ac"));
    expect(broadway).toBeGreaterThan(sixHigh);
  });

  it("recognizes the steel wheel (A-2-3-4-5 suited) as a straight flush", () => {
    const steel = evaluate5(five("Ah 2h 3h 4h 5h"));
    expect(categoryOf(steel)).toBe(HandCategory.StraightFlush);
    const sixHighSf = evaluate5(five("2h 3h 4h 5h 6h"));
    expect(sixHighSf).toBeGreaterThan(steel);
  });

  it("kicker comparisons resolve same-category ties", () => {
    const aceKing = evaluate5(five("Ah Ad Kc 7d 2s"));
    const aceQueen = evaluate5(five("Ah Ad Qc 7d 2s"));
    expect(aceKing).toBeGreaterThan(aceQueen);
  });
});

describe("evaluate7Naive picks best 5 of 7", () => {
  const seven = (s: string) => s.split(" ").map(C);
  it("finds a flush using the board", () => {
    expect(categoryOf(evaluate7Naive(seven("Ah Kd 2h 5h 9h Jh 3c")))).toBe(HandCategory.Flush);
  });
  it("board plays a straight everyone shares", () => {
    expect(categoryOf(evaluate7Naive(seven("2c 7d 5h 6s 4c 3d Kh")))).toBe(HandCategory.Straight);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/handEval/evaluate5.test.ts`
Expected: FAIL — cannot find module `./categories.js`.

- [ ] **Step 3: Implement `shared/src/handEval/categories.ts`**

```ts
export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

/**
 * Pack a category plus up to 5 rank kickers (each 0..12) into a single
 * comparable integer: higher = stronger, equal = exact tie.
 * Layout: category, then 5 base-16 nibbles (most significant kicker first).
 */
export function pack(category: HandCategory, kickers: number[]): number {
  let v = category;
  for (let i = 0; i < 5; i++) {
    v = v * 16 + (kickers[i] ?? 0);
  }
  return v;
}
```

- [ ] **Step 4: Implement `shared/src/handEval/evaluate5.ts`**

```ts
import { rankOf, suitOf, type Card } from "../cards.js";
import { HandCategory, pack } from "./categories.js";

/** Evaluate exactly 5 cards -> packed comparable integer. */
export function evaluate5(cards: Card[]): number {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const suits = cards.map(suitOf);
  const isFlush = suits.every((s) => s === suits[0]);

  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0]! - uniq[4]! === 4) straightHigh = uniq[0]!;
    else if (uniq[0] === 12 && uniq[1] === 3 && uniq[2] === 2 && uniq[3] === 1 && uniq[4] === 0)
      straightHigh = 3; // wheel: 5-high
  }

  const countByRank = new Map<number, number>();
  for (const r of ranks) countByRank.set(r, (countByRank.get(r) ?? 0) + 1);
  const groups = [...countByRank.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const counts = groups.map((g) => g[1]);
  const gr = groups.map((g) => g[0]);

  if (isFlush && straightHigh >= 0) return pack(HandCategory.StraightFlush, [straightHigh]);
  if (counts[0] === 4) return pack(HandCategory.Quads, [gr[0]!, gr[1]!]);
  if (counts[0] === 3 && counts[1] === 2) return pack(HandCategory.FullHouse, [gr[0]!, gr[1]!]);
  if (isFlush) return pack(HandCategory.Flush, ranks);
  if (straightHigh >= 0) return pack(HandCategory.Straight, [straightHigh]);
  if (counts[0] === 3) return pack(HandCategory.Trips, [gr[0]!, gr[1]!, gr[2]!]);
  if (counts[0] === 2 && counts[1] === 2)
    return pack(HandCategory.TwoPair, [gr[0]!, gr[1]!, gr[2]!]);
  if (counts[0] === 2) return pack(HandCategory.Pair, [gr[0]!, gr[1]!, gr[2]!, gr[3]!]);
  return pack(HandCategory.HighCard, ranks);
}
```

- [ ] **Step 5: Implement `shared/src/handEval/evaluate7Naive.ts`**

```ts
import type { Card } from "../cards.js";
import { evaluate5 } from "./evaluate5.js";

const COMBOS: number[][] = (() => {
  const r: number[][] = [];
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++)
      for (let c = b + 1; c < 7; c++)
        for (let d = c + 1; d < 7; d++) for (let e = d + 1; e < 7; e++) r.push([a, b, c, d, e]);
  return r;
})();

/** Oracle: best 5-of-7 by brute force. Slow but obviously correct. */
export function evaluate7Naive(cards: Card[]): number {
  let best = -1;
  for (const cmb of COMBOS) {
    const v = evaluate5([
      cards[cmb[0]!]!,
      cards[cmb[1]!]!,
      cards[cmb[2]!]!,
      cards[cmb[3]!]!,
      cards[cmb[4]!]!,
    ]);
    if (v > best) best = v;
  }
  return best;
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -- shared/src/handEval/evaluate5.test.ts`
Expected: all passed.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(shared): hand categories, evaluate5, evaluate7Naive oracle"
```

---

## Task 11: `evaluate7` fast bitmask evaluator

**Files:**

- Create: `shared/src/handEval/evaluate7.ts`
- Create: `shared/src/handEval/index.ts`
- Test: `shared/src/handEval/evaluate7.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/handEval/evaluate7.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { evaluate7 } from "./evaluate7.js";
import { evaluate7Naive } from "./evaluate7Naive.js";
import { cardFromString as C } from "../cards.js";

const seven = (s: string) => s.split(" ").map(C);

describe("evaluate7 matches the oracle on crafted hands", () => {
  const cases = [
    "Ah Kd 2h 5h 9h Jh 3c",
    "2c 7d 5h 6s 4c 3d Kh",
    "Ah 2c 3d 4s 5h 9d Kc",
    "Ah 2h 3h 4h 5h 9d Kc",
    "9c 9d 9h 9s Kc 2d 3h",
    "8c 8d 8h Kc Kd 2s 3h",
    "Qc Qd Qh 9s 2c 5d 7h",
    "Jc Jd 4h 4s 9c 2d 7h",
    "5c 5d Kh 9s 2c 7d 8h",
    "Ah Qd 9h 5s 2c 7d 3h",
    "As Ks Qs Js Ts 2c 3d",
  ];
  for (const c of cases) {
    it(c, () => {
      expect(evaluate7(seven(c))).toBe(evaluate7Naive(seven(c)));
    });
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/handEval/evaluate7.test.ts`
Expected: FAIL — cannot find module `./evaluate7.js`.

- [ ] **Step 3: Implement `shared/src/handEval/evaluate7.ts`**

```ts
import { rankOf, suitOf, type Card } from "../cards.js";
import { HandCategory, pack } from "./categories.js";

/** Fast 7-card evaluator using per-suit bitmasks + rank counts. */
export function evaluate7(cards: Card[]): number {
  const rankCount = new Array<number>(13).fill(0);
  const suitMask = [0, 0, 0, 0];
  const suitCount = [0, 0, 0, 0];
  let rankMask = 0;
  for (const c of cards) {
    const r = rankOf(c);
    const s = suitOf(c);
    rankCount[r] = (rankCount[r] ?? 0) + 1;
    suitMask[s] = (suitMask[s] ?? 0) | (1 << r);
    suitCount[s] = (suitCount[s] ?? 0) + 1;
    rankMask |= 1 << r;
  }

  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCount[s]! >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sf = straightHighFromMask(suitMask[flushSuit]!);
    if (sf >= 0) return pack(HandCategory.StraightFlush, [sf]);
  }

  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    const n = rankCount[r]!;
    if (n === 4) quads.push(r);
    else if (n === 3) trips.push(r);
    else if (n === 2) pairs.push(r);
  }

  if (quads.length) {
    return pack(HandCategory.Quads, [quads[0]!, highestExcept(rankMask, [quads[0]!])]);
  }
  if (trips.length >= 1 && (trips.length >= 2 || pairs.length >= 1)) {
    const pairRank = trips.length >= 2 ? trips[1]! : pairs[0]!;
    return pack(HandCategory.FullHouse, [trips[0]!, pairRank]);
  }
  if (flushSuit >= 0) {
    return pack(HandCategory.Flush, topNFromMask(suitMask[flushSuit]!, 5));
  }
  const st = straightHighFromMask(rankMask);
  if (st >= 0) return pack(HandCategory.Straight, [st]);

  if (trips.length) {
    const k = topNFromMask(clearBits(rankMask, [trips[0]!]), 2);
    return pack(HandCategory.Trips, [trips[0]!, k[0]!, k[1]!]);
  }
  if (pairs.length >= 2) {
    const k = highestExcept(rankMask, [pairs[0]!, pairs[1]!]);
    return pack(HandCategory.TwoPair, [pairs[0]!, pairs[1]!, k]);
  }
  if (pairs.length === 1) {
    const k = topNFromMask(clearBits(rankMask, [pairs[0]!]), 3);
    return pack(HandCategory.Pair, [pairs[0]!, k[0]!, k[1]!, k[2]!]);
  }
  return pack(HandCategory.HighCard, topNFromMask(rankMask, 5));
}

/** Highest straight high-card from a 13-bit rank mask (wheel-aware); -1 if none. */
function straightHighFromMask(mask: number): number {
  for (let high = 12; high >= 4; high--) {
    let ok = true;
    for (let k = 0; k < 5; k++) {
      if (!(mask & (1 << (high - k)))) {
        ok = false;
        break;
      }
    }
    if (ok) return high;
  }
  if (mask & (1 << 12) && mask & 8 && mask & 4 && mask & 2 && mask & 1) return 3; // wheel
  return -1;
}
function topNFromMask(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}
function clearBits(mask: number, ranks: number[]): number {
  let m = mask;
  for (const r of ranks) m &= ~(1 << r);
  return m;
}
function highestExcept(mask: number, ranks: number[]): number {
  return topNFromMask(clearBits(mask, ranks), 1)[0] ?? 0;
}
```

- [ ] **Step 4: Implement `shared/src/handEval/index.ts`**

```ts
export { HandCategory, pack } from "./categories.js";
export { evaluate5 } from "./evaluate5.js";
export { evaluate7 } from "./evaluate7.js";
export { evaluate7Naive } from "./evaluate7Naive.js";
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- shared/src/handEval/evaluate7.test.ts`
Expected: all passed.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(shared): fast bitmask evaluate7 + handEval index"
```

---

## Task 12: Hand-eval oracle gate (100k property test)

**Files:**

- Test: `shared/src/handEval/oracle.property.test.ts`

- [ ] **Step 1: Write the property test `shared/src/handEval/oracle.property.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { evaluate7 } from "./evaluate7.js";
import { evaluate7Naive } from "./evaluate7Naive.js";
import { shuffledDeck } from "../deck.js";

describe("GATE: evaluate7 matches the oracle over 100k random hands", () => {
  it("agrees exactly for 100k seeded hands", () => {
    const N = 100_000;
    for (let seed = 0; seed < N; seed++) {
      const hand = shuffledDeck(seed).slice(0, 7);
      const fast = evaluate7(hand);
      const slow = evaluate7Naive(hand);
      if (fast !== slow) {
        throw new Error(
          `mismatch at seed ${seed}: fast=${fast} slow=${slow} hand=${hand.join(",")}`,
        );
      }
    }
    expect(true).toBe(true);
  });

  it("pairwise ordering is consistent with the oracle (sampled)", () => {
    for (let seed = 0; seed < 20_000; seed++) {
      const a = shuffledDeck(seed).slice(0, 7);
      const b = shuffledDeck(seed + 1_000_000).slice(0, 7);
      expect(Math.sign(evaluate7(a) - evaluate7(b))).toBe(
        Math.sign(evaluate7Naive(a) - evaluate7Naive(b)),
      );
    }
  });
});
```

- [ ] **Step 2: Run the gate**

Run: `npm test -- shared/src/handEval/oracle.property.test.ts`
Expected: PASS. If it fails, STOP and use **superpowers:systematic-debugging**: print the thrown
hand, run `evaluate5` on each 5-card subset, and find which subset the fast path mis-ranks.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test(shared): GATE - evaluate7 matches oracle over 100k hands"
```

---

## Task 13: Engine types + betting helpers + `createHand`

**Files:**

- Create: `shared/src/engine/types.ts`
- Create: `shared/src/engine/betting.ts`
- Create: `shared/src/engine/state.ts`
- Test: `shared/src/engine/state.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/engine/state.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createSeat, createHand } from "./state.js";
import { fullDeck } from "../cards.js";

function seats(stacks: (number | null)[]) {
  return stacks.map((s, i) => (s == null ? null : createSeat("p" + i, false, s)));
}

describe("createHand", () => {
  it("deals two hole cards to every active seat and sets preflop", () => {
    const st = createHand({
      seats: seats([1000, 1000, 1000, 1000, 1000, 1000]),
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: fullDeck(),
      handNumber: 1,
    });
    expect(st.street).toBe("preflop");
    for (const s of st.seats) {
      expect(s!.holeCards).not.toBeNull();
      expect(s!.holeCards!).toHaveLength(2);
    }
  });

  it("posts SB and BB and sets currentBet to the big blind", () => {
    const st = createHand({
      seats: seats([1000, 1000, 1000, 1000, 1000, 1000]),
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: fullDeck(),
      handNumber: 1,
    });
    expect(st.seats[1]!.committedThisStreet).toBe(10); // SB left of button
    expect(st.seats[2]!.committedThisStreet).toBe(20); // BB
    expect(st.currentBet).toBe(20);
    expect(st.lastRaiseSize).toBe(20);
    // UTG (seat 3) acts first 6-handed
    expect(st.toAct).toBe(3);
  });

  it("heads-up: button is SB and acts first preflop", () => {
    const st = createHand({
      seats: seats([1000, 1000, null, null, null, null]),
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: fullDeck(),
      handNumber: 1,
    });
    expect(st.seats[0]!.committedThisStreet).toBe(10); // button posts SB
    expect(st.seats[1]!.committedThisStreet).toBe(20); // BB
    expect(st.toAct).toBe(0); // button acts first heads-up
  });

  it("skips busted seats for blinds and dealing", () => {
    const st = createHand({
      seats: seats([1000, 0, 1000, 1000, null, null]),
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: fullDeck(),
      handNumber: 1,
    });
    // seat 1 is busted -> SB is seat 2, BB seat 3
    expect(st.seats[1]!.status).toBe("busted");
    expect(st.seats[1]!.holeCards).toBeNull();
    expect(st.seats[2]!.committedThisStreet).toBe(10);
    expect(st.seats[3]!.committedThisStreet).toBe(20);
  });

  it("throws when fewer than two players can start", () => {
    expect(() =>
      createHand({
        seats: seats([1000, 0, null, null, null, null]),
        buttonIndex: 0,
        sb: 10,
        bb: 20,
        deck: fullDeck(),
        handNumber: 1,
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/engine/state.test.ts`
Expected: FAIL — cannot find module `./state.js`.

- [ ] **Step 3: Implement `shared/src/engine/types.ts`**

```ts
import type { Card } from "../cards.js";

export type Street = "preflop" | "flop" | "turn" | "river" | "complete";
export type SeatStatus = "active" | "folded" | "allin" | "busted";

export interface Seat {
  id: string;
  isBot: boolean;
  stack: number;
  committedThisStreet: number;
  committedTotal: number;
  holeCards: [Card, Card] | null;
  status: SeatStatus;
  /** Acted since the last full bet/raise on the current street. */
  hasActed: boolean;
  /** Team grouping, unused in v1 (kept for future wingman/2v2 format). */
  group?: number;
}

export interface Pot {
  amount: number;
  eligible: number[]; // seat indices eligible to win this pot
}

export type ActionType = "fold" | "check" | "call" | "raise";

export interface Action {
  seat: number;
  type: ActionType;
  /** Raise-TO: total chips committed by this seat this street. Required for "raise". */
  amount?: number;
}

export type GameEvent =
  | { type: "blind"; seat: number; amount: number; blind: "sb" | "bb" }
  | { type: "action"; seat: number; action: ActionType; amount: number; allIn: boolean }
  | { type: "street"; street: Street; cards: Card[] }
  | { type: "showdown"; reveals: { seat: number; value: number }[] }
  | { type: "award"; seat: number; amount: number; potIndex: number }
  | { type: "handComplete" };

export interface TableState {
  seats: (Seat | null)[];
  buttonIndex: number;
  street: Street;
  board: Card[];
  /** Server-only. Never sent to clients via redactFor. */
  deck: Card[];
  deckPointer: number;
  sb: number;
  bb: number;
  currentBet: number;
  lastRaiseSize: number;
  toAct: number | null;
  lastAggressor: number | null;
  handNumber: number;
  pots: Pot[];
}
```

- [ ] **Step 4: Implement `shared/src/engine/betting.ts`**

```ts
import type { TableState } from "./types.js";

/** Does this seat still owe an action on the current street? */
export function seatNeedsToAct(state: TableState, i: number): boolean {
  const s = state.seats[i];
  if (!s || s.status !== "active") return false;
  if (!s.hasActed) return true;
  return s.committedThisStreet < state.currentBet;
}

/** First seat needing to act, scanning clockwise starting AT `startInclusive`. */
export function firstNeedsToAct(state: TableState, startInclusive: number): number | null {
  const n = state.seats.length;
  for (let k = 0; k < n; k++) {
    const i = (startInclusive + k) % n;
    if (seatNeedsToAct(state, i)) return i;
  }
  return null;
}

/** Next seat needing to act, scanning clockwise AFTER `from` (exclusive). */
export function nextToAct(state: TableState, from: number): number | null {
  const n = state.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (seatNeedsToAct(state, i)) return i;
  }
  return null;
}

/** Seats that can still voluntarily act (active with chips). */
export function activeCount(state: TableState): number {
  let c = 0;
  for (const s of state.seats) if (s && s.status === "active") c++;
  return c;
}

/** Seats still contesting the pot (active or all-in, not folded/busted). */
export function inHandCount(state: TableState): number {
  let c = 0;
  for (const s of state.seats) if (s && (s.status === "active" || s.status === "allin")) c++;
  return c;
}

/** First active seat clockwise from the button (postflop first-to-act). */
export function firstActivePostflop(state: TableState): number | null {
  const n = state.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (state.buttonIndex + k) % n;
    const s = state.seats[i];
    if (s && s.status === "active") return i;
  }
  return null;
}
```

- [ ] **Step 5: Implement `shared/src/engine/state.ts`**

```ts
import type { Card } from "../cards.js";
import type { Seat, TableState } from "./types.js";
import { firstNeedsToAct } from "./betting.js";

export function createSeat(id: string, isBot: boolean, stack: number): Seat {
  return {
    id,
    isBot,
    stack,
    committedThisStreet: 0,
    committedTotal: 0,
    holeCards: null,
    status: stack > 0 ? "active" : "busted",
    hasActed: false,
  };
}

function nextActive(seats: (Seat | null)[], from: number): number {
  const n = seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    const s = seats[i];
    if (s && s.status === "active") return i;
  }
  return -1;
}

function postBlind(state: TableState, idx: number, amount: number): void {
  const s = state.seats[idx]!;
  const put = Math.min(s.stack, amount);
  s.stack -= put;
  s.committedThisStreet += put;
  s.committedTotal += put;
  if (s.stack === 0) s.status = "allin";
}

export function createHand(params: {
  seats: (Seat | null)[];
  buttonIndex: number;
  sb: number;
  bb: number;
  deck: Card[];
  handNumber: number;
}): TableState {
  const { buttonIndex, sb, bb, deck, handNumber } = params;
  const seats = params.seats.map((s) =>
    s
      ? ({
          ...s,
          committedThisStreet: 0,
          committedTotal: 0,
          holeCards: null,
          status: s.stack > 0 ? "active" : "busted",
          hasActed: false,
        } as Seat)
      : null,
  );

  const players: number[] = [];
  for (let i = 0; i < seats.length; i++) if (seats[i]?.status === "active") players.push(i);
  if (players.length < 2) throw new Error("need >= 2 players to start a hand");

  const heads = players.length === 2;
  const sbIdx = heads ? findActiveAtOrAfter(seats, buttonIndex) : nextActive(seats, buttonIndex);
  const bbIdx = nextActive(seats, sbIdx);

  // Deal two cards each (one at a time, two rounds), starting left of button.
  const start = nextActive(seats, buttonIndex);
  const order: number[] = [];
  let cur = start;
  for (let c = 0; c < players.length; c++) {
    order.push(cur);
    cur = nextActive(seats, cur);
  }
  let ptr = 0;
  for (const i of order) seats[i]!.holeCards = [deck[ptr++]!, 0 as Card];
  for (const i of order) seats[i]!.holeCards![1] = deck[ptr++]!;

  const state: TableState = {
    seats,
    buttonIndex,
    street: "preflop",
    board: [],
    deck,
    deckPointer: ptr,
    sb,
    bb,
    currentBet: bb,
    lastRaiseSize: bb,
    toAct: null,
    lastAggressor: bbIdx,
    handNumber,
    pots: [],
  };

  postBlind(state, sbIdx, sb);
  postBlind(state, bbIdx, bb);
  // Blinds are forced; the players have not voluntarily acted yet.
  for (const i of players) seats[i]!.hasActed = false;

  const firstActor = heads ? sbIdx : nextActive(seats, bbIdx);
  state.toAct = firstNeedsToAct(state, firstActor);
  return state;
}

function findActiveAtOrAfter(seats: (Seat | null)[], idx: number): number {
  const s = seats[idx];
  if (s && s.status === "active") return idx;
  return nextActive(seats, idx);
}

/** Deep clone for the pure reducer (deck array is shared read-only; pointer is copied). */
export function cloneState(s: TableState): TableState {
  return {
    ...s,
    seats: s.seats.map((x) =>
      x ? { ...x, holeCards: x.holeCards ? [x.holeCards[0], x.holeCards[1]] : null } : null,
    ),
    board: [...s.board],
    pots: s.pots.map((p) => ({ amount: p.amount, eligible: [...p.eligible] })),
  };
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test -- shared/src/engine/state.test.ts`
Expected: all passed.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(engine): types, betting helpers, createHand"
```

---

## Task 14: `legalActions`

**Files:**

- Create: `shared/src/engine/legalActions.ts`
- Test: `shared/src/engine/legalActions.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/engine/legalActions.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createSeat, createHand } from "./state.js";
import { legalActions } from "./legalActions.js";
import { fullDeck } from "../cards.js";

function freshSixMax() {
  const seats = Array.from({ length: 6 }, (_, i) => createSeat("p" + i, false, 1000));
  return createHand({ seats, buttonIndex: 0, sb: 10, bb: 20, deck: fullDeck(), handNumber: 1 });
}

describe("legalActions", () => {
  it("UTG faces the big blind: can fold/call/raise, cannot check", () => {
    const st = freshSixMax();
    const m = legalActions(st, st.toAct!); // seat 3
    expect(m.canCheck).toBe(false);
    expect(m.canCall).toBe(true);
    expect(m.callAmount).toBe(20);
    expect(m.canFold).toBe(true);
    expect(m.canRaise).toBe(true);
    expect(m.minRaiseTo).toBe(40); // currentBet 20 + lastRaiseSize 20
    expect(m.maxRaiseTo).toBe(1000);
  });

  it("min-raise-to equals all-in when the stack is too short for a full raise", () => {
    const seats = [
      createSeat("a", false, 1000),
      createSeat("b", false, 1000),
      createSeat("c", false, 35), // can only raise to 35 max, below full min of 40
      null,
      null,
      null,
    ];
    const st = createHand({
      seats,
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: fullDeck(),
      handNumber: 1,
    });
    const m = legalActions(st, 2); // seat c is UTG (after BB? heads/3-handed) -> compute generally
    // seat c has stack 35, faces bet 20
    expect(m.maxRaiseTo).toBe(35);
    expect(m.minRaiseTo).toBe(35); // clamped to all-in
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/engine/legalActions.test.ts`
Expected: FAIL — cannot find module `./legalActions.js`.

- [ ] **Step 3: Implement `shared/src/engine/legalActions.ts`**

```ts
import type { TableState } from "./types.js";

export interface ActionMask {
  seat: number;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  /** Chips to add to call (0 when checking). */
  callAmount: number;
  canRaise: boolean;
  /** Total this street for a minimum raise (clamped to all-in if stack-limited). */
  minRaiseTo: number;
  /** Total this street for an all-in raise. */
  maxRaiseTo: number;
}

export function legalActions(state: TableState, i: number): ActionMask {
  const s = state.seats[i];
  if (!s || s.status !== "active") {
    return {
      seat: i,
      canFold: false,
      canCheck: false,
      canCall: false,
      callAmount: 0,
      canRaise: false,
      minRaiseTo: 0,
      maxRaiseTo: 0,
    };
  }
  const toCall = Math.max(0, state.currentBet - s.committedThisStreet);
  const callAmount = Math.min(toCall, s.stack);
  const maxRaiseTo = s.committedThisStreet + s.stack;
  const fullMinRaiseTo = state.currentBet + state.lastRaiseSize;
  // A seat may raise only if it has not yet acted on the current bet (full reopen / fresh)
  // and it has chips beyond the current bet. An incomplete all-in does NOT reopen, so a
  // seat whose hasActed is still true cannot re-raise.
  const canRaise = !s.hasActed && maxRaiseTo > state.currentBet;
  return {
    seat: i,
    canFold: true,
    canCheck: toCall === 0,
    canCall: toCall > 0 && s.stack > 0,
    callAmount,
    canRaise,
    minRaiseTo: Math.min(fullMinRaiseTo, maxRaiseTo),
    maxRaiseTo,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/engine/legalActions.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit + update `CLAUDE.md`**

Append to `CLAUDE.md` under conventions: "`legalActions(state, seat)` is the single source of truth
for both client action bar and server validation; a seat may raise only if `!hasActed` (incomplete
all-ins never reopen)."

```bash
git add -A && git commit -m "feat(engine): legalActions mask (single source for UI + server)"
```

---

## Task 15: `pots.ts` — main + side pots with dead money

**Files:**

- Create: `shared/src/engine/pots.ts`
- Test: `shared/src/engine/pots.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/engine/pots.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildPots } from "./pots.js";
import { createSeat } from "./state.js";
import type { Seat } from "./types.js";

function seat(id: string, committedTotal: number, status: Seat["status"]): Seat {
  return { ...createSeat(id, false, 0), committedTotal, status };
}

describe("buildPots", () => {
  it("single pot when everyone contributes equally", () => {
    const pots = buildPots([
      seat("a", 100, "active"),
      seat("b", 100, "active"),
      seat("c", 100, "active"),
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0]!.amount).toBe(300);
    expect(pots[0]!.eligible.sort()).toEqual([0, 1, 2]);
  });

  it("builds a side pot when a short stack is all-in", () => {
    // a all-in 40, b and c put 100 each
    const pots = buildPots([
      seat("a", 40, "allin"),
      seat("b", 100, "active"),
      seat("c", 100, "active"),
    ]);
    // main pot: 40*3 = 120 eligible a,b,c ; side pot: 60*2 = 120 eligible b,c
    expect(pots).toHaveLength(2);
    expect(pots[0]!.amount).toBe(120);
    expect(pots[0]!.eligible.sort()).toEqual([0, 1, 2]);
    expect(pots[1]!.amount).toBe(120);
    expect(pots[1]!.eligible.sort()).toEqual([1, 2]);
  });

  it("folded chips are dead money in the pot but the folder is not eligible", () => {
    const pots = buildPots([
      seat("a", 100, "active"),
      seat("b", 100, "active"),
      seat("c", 50, "folded"), // folded after putting in 50
    ]);
    const total = pots.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(250); // all chips accounted for
    for (const p of pots) expect(p.eligible).not.toContain(2);
  });

  it("conserves chips: sum of pots equals sum of contributions", () => {
    const seats = [
      seat("a", 33, "allin"),
      seat("b", 77, "allin"),
      seat("c", 120, "active"),
      seat("d", 25, "folded"),
    ];
    const total = seats.reduce((s, x) => s + x.committedTotal, 0);
    const pots = buildPots(seats);
    expect(pots.reduce((s, p) => s + p.amount, 0)).toBe(total);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/engine/pots.test.ts`
Expected: FAIL — cannot find module `./pots.js`.

- [ ] **Step 3: Implement `shared/src/engine/pots.ts`**

```ts
import type { Pot, Seat } from "./types.js";

/**
 * Build main + side pots from each seat's total contribution this hand.
 * Folded seats' chips are included as dead money but the folder is not eligible.
 * Invariant: sum of pot amounts == sum of all committedTotal (chip conservation).
 */
export function buildPots(seats: (Seat | null)[]): Pot[] {
  const contrib: { idx: number; amt: number; eligible: boolean }[] = [];
  for (let i = 0; i < seats.length; i++) {
    const s = seats[i];
    if (s && s.committedTotal > 0) {
      contrib.push({
        idx: i,
        amt: s.committedTotal,
        eligible: s.status === "active" || s.status === "allin",
      });
    }
  }

  const layers: Pot[] = [];
  let remaining = contrib.filter((c) => c.amt > 0);
  while (remaining.length) {
    const min = Math.min(...remaining.map((c) => c.amt));
    let amount = 0;
    const eligible: number[] = [];
    for (const c of remaining) {
      amount += min;
      c.amt -= min;
      if (c.eligible) eligible.push(c.idx);
    }
    layers.push({ amount, eligible });
    remaining = remaining.filter((c) => c.amt > 0);
  }

  // Merge consecutive layers with identical eligible sets; fold dead-only layers
  // (no eligible winners) into the previous pot so no chips are lost.
  const merged: Pot[] = [];
  for (const p of layers) {
    if (p.eligible.length === 0) {
      if (merged.length) merged[merged.length - 1]!.amount += p.amount;
      else merged.push({ amount: p.amount, eligible: [] });
      continue;
    }
    const last = merged[merged.length - 1];
    if (last && sameSet(last.eligible, p.eligible)) last.amount += p.amount;
    else merged.push({ amount: p.amount, eligible: [...p.eligible] });
  }
  return merged;
}

function sameSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/engine/pots.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(engine): side-pot construction with dead money"
```

---

## Task 16: `showdown.ts` — distribution, ties, odd chip, single-winner

**Files:**

- Create: `shared/src/engine/showdown.ts`
- Test: `shared/src/engine/showdown.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/engine/showdown.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { settleShowdown, awardSingleWinner } from "./showdown.js";
import { createSeat } from "./state.js";
import { cardFromString as C } from "../cards.js";
import type { GameEvent, Seat, TableState } from "./types.js";

function mkSeat(
  id: string,
  hole: string | null,
  committedTotal: number,
  status: Seat["status"],
): Seat {
  return {
    ...createSeat(id, false, 0),
    holeCards: hole ? (hole.split(" ").map(C) as [number, number]) : null,
    committedTotal,
    status,
  };
}

function mkState(seats: (Seat | null)[], board: string): TableState {
  return {
    seats,
    buttonIndex: 0,
    street: "river",
    board: board.split(" ").map(C),
    deck: [],
    deckPointer: 0,
    sb: 10,
    bb: 20,
    currentBet: 0,
    lastRaiseSize: 20,
    toAct: null,
    lastAggressor: null,
    handNumber: 1,
    pots: [],
  };
}

describe("settleShowdown", () => {
  it("awards the whole pot to the best hand", () => {
    const st = mkState(
      [
        mkSeat("a", "Ah Ad", 100, "active"),
        mkSeat("b", "Kh Kd", 100, "active"),
        null,
        null,
        null,
        null,
      ],
      "2c 7d 9s Jh 3c",
    );
    const events: GameEvent[] = [];
    settleShowdown(st, events);
    expect(st.seats[0]!.stack).toBe(200); // aces win
    expect(st.seats[1]!.stack).toBe(0);
    expect(st.street).toBe("complete");
  });

  it("splits a tied pot and gives the odd chip to the first seat left of the button", () => {
    // Royal flush on the board -> a and b tie; c folded 11 dead -> pot 51, split 26/25
    const st = mkState(
      [
        mkSeat("a", "2d 3h", 20, "active"),
        mkSeat("b", "4h 5s", 20, "active"),
        mkSeat("c", null, 11, "folded"),
        null,
        null,
        null,
      ],
      "Ac Kc Qc Jc Tc",
    );
    const events: GameEvent[] = [];
    settleShowdown(st, events); // button is seat 0, first left is seat 1
    expect(st.seats[1]!.stack).toBe(26); // odd chip
    expect(st.seats[0]!.stack).toBe(25);
  });

  it("respects side-pot eligibility (short all-in cannot win the side pot)", () => {
    // a all-in 40 with the nuts; b and c contest a 60*2 side pot, b wins it
    const st = mkState(
      [
        mkSeat("a", "Ah Ad", 40, "allin"), // best hand but only eligible for main
        mkSeat("b", "Kh Kd", 100, "active"),
        mkSeat("c", "Qh Qd", 100, "active"),
        null,
        null,
        null,
      ],
      "Ac 2d 7s Jh 3c", // a makes trip aces; b kings; c queens
    );
    const events: GameEvent[] = [];
    settleShowdown(st, events);
    // main pot 120 -> a (trips). side pot 120 -> b (kings beat queens).
    expect(st.seats[0]!.stack).toBe(120);
    expect(st.seats[1]!.stack).toBe(120);
    expect(st.seats[2]!.stack).toBe(0);
  });
});

describe("awardSingleWinner", () => {
  it("gives the entire pot to the only remaining seat", () => {
    const st = mkState(
      [
        mkSeat("a", "2c 3c", 30, "active"),
        mkSeat("b", "Kh Kd", 20, "folded"),
        null,
        null,
        null,
        null,
      ],
      "",
    );
    const events: GameEvent[] = [];
    awardSingleWinner(st, events);
    expect(st.seats[0]!.stack).toBe(50);
    expect(st.street).toBe("complete");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/engine/showdown.test.ts`
Expected: FAIL — cannot find module `./showdown.js`.

- [ ] **Step 3: Implement `shared/src/engine/showdown.ts`**

```ts
import { evaluate7 } from "../handEval/index.js";
import type { GameEvent, TableState } from "./types.js";
import { buildPots } from "./pots.js";

/** Award the whole pot to the last remaining seat (everyone else folded). */
export function awardSingleWinner(state: TableState, events: GameEvent[]): void {
  const total = buildPots(state.seats).reduce((a, p) => a + p.amount, 0);
  let winner = -1;
  for (let i = 0; i < state.seats.length; i++) {
    const s = state.seats[i];
    if (s && (s.status === "active" || s.status === "allin")) winner = i;
  }
  if (winner >= 0 && total > 0) {
    state.seats[winner]!.stack += total;
    events.push({ type: "award", seat: winner, amount: total, potIndex: 0 });
  }
  state.pots = [];
  state.street = "complete";
  state.toAct = null;
  events.push({ type: "handComplete" });
}

/** Build pots, evaluate contesting hands, distribute each pot (ties + odd chip). */
export function settleShowdown(state: TableState, events: GameEvent[]): void {
  const pots = buildPots(state.seats);
  const score = new Map<number, number>();
  const reveals: { seat: number; value: number }[] = [];
  for (let i = 0; i < state.seats.length; i++) {
    const s = state.seats[i];
    if (s && (s.status === "active" || s.status === "allin")) {
      const v = evaluate7([s.holeCards![0], s.holeCards![1], ...state.board]);
      score.set(i, v);
      reveals.push({ seat: i, value: v });
    }
  }
  events.push({ type: "showdown", reveals });

  pots.forEach((pot, idx) => {
    let best = -1;
    for (const i of pot.eligible) {
      const v = score.get(i);
      if (v != null && v > best) best = v;
    }
    const winners = pot.eligible.filter((i) => score.get(i) === best);
    distributePot(state, pot.amount, winners, idx, events);
  });

  state.pots = pots;
  state.street = "complete";
  state.toAct = null;
  events.push({ type: "handComplete" });
}

function distributePot(
  state: TableState,
  amount: number,
  winners: number[],
  potIndex: number,
  events: GameEvent[],
): void {
  if (winners.length === 0 || amount === 0) return;
  const ordered = orderFromButton(state, winners);
  const share = Math.floor(amount / winners.length);
  let remainder = amount - share * winners.length;
  for (const i of ordered) {
    let give = share;
    if (remainder > 0) {
      give += 1;
      remainder -= 1;
    }
    state.seats[i]!.stack += give;
    events.push({ type: "award", seat: i, amount: give, potIndex });
  }
}

/** Winners ordered from the first seat left of the button (odd-chip rule). */
function orderFromButton(state: TableState, winners: number[]): number[] {
  const n = state.seats.length;
  const set = new Set(winners);
  const out: number[] = [];
  for (let k = 1; k <= n; k++) {
    const i = (state.buttonIndex + k) % n;
    if (set.has(i)) out.push(i);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/engine/showdown.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(engine): showdown distribution (ties, odd chip, side-pot eligibility)"
```

---

## Task 17: `reducer.ts` — `applyAction` + street advance

**Files:**

- Create: `shared/src/engine/reducer.ts`
- Test: `shared/src/engine/reducer.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/engine/reducer.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createSeat, createHand } from "./state.js";
import { applyAction } from "./reducer.js";
import { legalActions } from "./legalActions.js";
import { fullDeck } from "../cards.js";

function sixMax(stacks = [1000, 1000, 1000, 1000, 1000, 1000]) {
  const seats = stacks.map((s, i) => createSeat("p" + i, false, s));
  return createHand({ seats, buttonIndex: 0, sb: 10, bb: 20, deck: fullDeck(), handNumber: 1 });
}

describe("reducer betting flow", () => {
  it("everyone folds to the big blind; BB wins the blinds", () => {
    let st = sixMax();
    for (const seat of [3, 4, 5, 0, 1]) st = applyAction(st, { seat, type: "fold" }).state;
    expect(st.street).toBe("complete");
    expect(st.seats[2]!.stack).toBe(1010); // 1000 - 20 + 30
  });

  it("limp/check around reaches the flop", () => {
    let st = sixMax();
    for (const seat of [3, 4, 5, 0]) st = applyAction(st, { seat, type: "call" }).state;
    st = applyAction(st, { seat: 1, type: "call" }).state;
    st = applyAction(st, { seat: 2, type: "check" }).state;
    expect(st.street).toBe("flop");
    expect(st.board).toHaveLength(3);
    expect(st.toAct).toBe(1); // SB acts first postflop
  });

  it("enforces min-raise sizing", () => {
    let st = sixMax();
    st = applyAction(st, { seat: 3, type: "raise", amount: 40 }).state;
    expect(st.currentBet).toBe(40);
    expect(legalActions(st, 4).minRaiseTo).toBe(60);
  });

  it("a full raise reopens betting to a player who already called", () => {
    let st = sixMax();
    st = applyAction(st, { seat: 3, type: "call" }).state;
    st = applyAction(st, { seat: 4, type: "raise", amount: 60 }).state;
    for (const seat of [5, 0, 1, 2]) st = applyAction(st, { seat, type: "fold" }).state;
    expect(st.toAct).toBe(3);
    expect(legalActions(st, 3).canRaise).toBe(true);
  });

  it("an incomplete all-in raise does NOT reopen for a player who already acted", () => {
    let st = sixMax([1000, 1000, 1000, 1000, 150, 1000]);
    st = applyAction(st, { seat: 3, type: "raise", amount: 100 }).state; // full, lastRaiseSize=80
    st = applyAction(st, { seat: 4, type: "raise", amount: 150 }).state; // all-in 150, +50 < 80
    expect(st.seats[4]!.status).toBe("allin");
    expect(st.currentBet).toBe(150);
    expect(legalActions(st, 5).canRaise).toBe(true); // seat 5 hasn't acted -> may raise
    for (const seat of [5, 0, 1, 2]) st = applyAction(st, { seat, type: "fold" }).state;
    expect(st.toAct).toBe(3);
    expect(legalActions(st, 3).canRaise).toBe(false); // capped: call or fold only
    expect(legalActions(st, 3).canCall).toBe(true);
  });

  it("all-in heads-up runs the board out to showdown", () => {
    const seats = [
      createSeat("a", false, 1000),
      createSeat("b", false, 1000),
      null,
      null,
      null,
      null,
    ];
    let st = createHand({ seats, buttonIndex: 0, sb: 10, bb: 20, deck: fullDeck(), handNumber: 1 });
    // button(0)=SB acts first; shove, other calls
    st = applyAction(st, { seat: 0, type: "raise", amount: 1000 }).state;
    st = applyAction(st, { seat: 1, type: "call" }).state;
    expect(st.street).toBe("complete");
    expect(st.board).toHaveLength(5);
    expect(st.seats[0]!.stack + st.seats[1]!.stack).toBe(2000); // chips conserved
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/engine/reducer.test.ts`
Expected: FAIL — cannot find module `./reducer.js`.

- [ ] **Step 3: Implement `shared/src/engine/reducer.ts`**

```ts
import type { Action, GameEvent, Seat, TableState } from "./types.js";
import { cloneState } from "./state.js";
import { legalActions } from "./legalActions.js";
import { nextToAct, inHandCount, activeCount, firstActivePostflop } from "./betting.js";
import { settleShowdown, awardSingleWinner } from "./showdown.js";

export function applyAction(
  state: TableState,
  action: Action,
): { state: TableState; events: GameEvent[] } {
  const s = cloneState(state);
  const events: GameEvent[] = [];
  if (s.street === "complete") throw new Error("hand is complete");
  if (s.toAct !== action.seat) throw new Error(`not seat ${action.seat}'s turn`);

  const seat = s.seats[action.seat]!;
  const mask = legalActions(s, action.seat);
  const prevBet = s.currentBet;
  let allIn = false;

  switch (action.type) {
    case "fold":
      seat.status = "folded";
      seat.hasActed = true;
      break;
    case "check":
      if (!mask.canCheck) throw new Error("illegal check");
      seat.hasActed = true;
      break;
    case "call": {
      if (!mask.canCall) throw new Error("illegal call");
      commit(seat, Math.min(s.currentBet - seat.committedThisStreet, seat.stack));
      seat.hasActed = true;
      if (seat.stack === 0) {
        seat.status = "allin";
        allIn = true;
      }
      break;
    }
    case "raise": {
      if (!mask.canRaise) throw new Error("illegal raise");
      let raiseTo = action.amount ?? mask.minRaiseTo;
      if (raiseTo < mask.minRaiseTo) raiseTo = mask.minRaiseTo;
      if (raiseTo > mask.maxRaiseTo) raiseTo = mask.maxRaiseTo;
      commit(seat, raiseTo - seat.committedThisStreet);
      seat.hasActed = true;
      if (seat.stack === 0) {
        seat.status = "allin";
        allIn = true;
      }
      const increment = raiseTo - prevBet;
      if (increment >= s.lastRaiseSize) {
        // full raise reopens betting to everyone else still active
        s.lastRaiseSize = increment;
        for (let j = 0; j < s.seats.length; j++) {
          const o = s.seats[j];
          if (o && o.status === "active" && j !== action.seat) o.hasActed = false;
        }
      }
      s.currentBet = Math.max(s.currentBet, raiseTo);
      s.lastAggressor = action.seat;
      break;
    }
  }

  events.push({
    type: "action",
    seat: action.seat,
    action: action.type,
    amount: seat.committedThisStreet,
    allIn,
  });

  if (inHandCount(s) === 1) {
    awardSingleWinner(s, events);
    return { state: s, events };
  }

  const next = nextToAct(s, action.seat);
  if (next === null) {
    advanceStreet(s, events);
    return { state: s, events };
  }
  s.toAct = next;
  return { state: s, events };
}

function commit(seat: Seat, amount: number): void {
  seat.stack -= amount;
  seat.committedThisStreet += amount;
  seat.committedTotal += amount;
}

function advanceStreet(s: TableState, events: GameEvent[]): void {
  for (const seat of s.seats) {
    if (seat) {
      seat.committedThisStreet = 0;
      seat.hasActed = false;
    }
  }
  s.currentBet = 0;
  s.lastRaiseSize = s.bb;
  s.lastAggressor = null;

  if (s.street === "river") {
    settleShowdown(s, events);
    return;
  }

  const deal = (street: TableState["street"], count: number) => {
    const cards = s.deck.slice(s.deckPointer, s.deckPointer + count);
    s.deckPointer += count;
    s.board.push(...cards);
    s.street = street;
    events.push({ type: "street", street, cards });
  };
  if (s.street === "preflop") deal("flop", 3);
  else if (s.street === "flop") deal("turn", 1);
  else if (s.street === "turn") deal("river", 1);

  // Nobody left to act (everyone all-in or a single active) -> run the board out.
  if (activeCount(s) <= 1) {
    advanceStreet(s, events);
    return;
  }
  s.toAct = firstActivePostflop(s);
  if (s.toAct === null) advanceStreet(s, events);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/engine/reducer.test.ts`
Expected: all passed. If a betting-order assertion fails, use **superpowers:systematic-debugging**:
log `toAct`, each seat's `hasActed`/`committedThisStreet`, and `currentBet` after each action.

- [ ] **Step 5: Commit + update `CLAUDE.md`**

Append to `CLAUDE.md`: "Engine reducer lives in `engine/reducer.ts` (`applyAction`). Street advance,
all-in runout, and showdown are internal; the reducer returns `{ state, events }` and never mutates
its input."

```bash
git add -A && git commit -m "feat(engine): applyAction reducer with street advance + runout"
```

---

## Task 18: Chip-conservation GATE (randomized property test)

**Files:**

- Test: `shared/src/engine/conservation.property.test.ts`

- [ ] **Step 1: Write the property test `shared/src/engine/conservation.property.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createSeat, createHand } from "./state.js";
import { applyAction } from "./reducer.js";
import { legalActions, type ActionMask } from "./legalActions.js";
import type { Action, TableState } from "./types.js";
import { shuffledDeck } from "../deck.js";
import { mulberry32 } from "../rng.js";

function totalChips(state: TableState): number {
  let t = 0;
  for (const s of state.seats) if (s) t += s.stack;
  return t;
}

function chooseRandom(mask: ActionMask, rng: () => number): Action {
  const roll = rng();
  if (mask.canRaise && roll < 0.35) {
    const span = mask.maxRaiseTo - mask.minRaiseTo;
    const to = mask.minRaiseTo + Math.floor(rng() * (span + 1));
    return { seat: mask.seat, type: "raise", amount: to };
  }
  if (mask.canCall && roll < 0.85) return { seat: mask.seat, type: "call" };
  if (mask.canCheck) return { seat: mask.seat, type: "check" };
  return { seat: mask.seat, type: "fold" };
}

describe("GATE: chips are conserved across randomized hands", () => {
  it("sum of stacks is invariant for many random multi-all-in hands", () => {
    for (let seed = 0; seed < 3000; seed++) {
      const rng = mulberry32(seed + 1);
      const n = 2 + Math.floor(rng() * 5); // 2..6 players
      const seats = [];
      for (let i = 0; i < 6; i++) {
        seats.push(i < n ? createSeat("p" + i, true, 100 + Math.floor(rng() * 900)) : null);
      }
      const before = seats.reduce((a, s) => a + (s ? s.stack : 0), 0);

      let st = createHand({
        seats,
        buttonIndex: seed % n,
        sb: 10,
        bb: 20,
        deck: shuffledDeck(seed),
        handNumber: 1,
      });

      let guard = 0;
      while (st.street !== "complete" && guard++ < 5000) {
        const i = st.toAct;
        if (i == null) throw new Error(`seed ${seed}: toAct null before complete`);
        st = applyAction(st, chooseRandom(legalActions(st, i), rng)).state;
      }
      expect(st.street).toBe("complete");
      if (totalChips(st) !== before) {
        throw new Error(`seed ${seed}: chips ${totalChips(st)} != ${before}`);
      }
    }
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run the gate**

Run: `npm test -- shared/src/engine/conservation.property.test.ts`
Expected: PASS. If it fails, STOP and use **superpowers:systematic-debugging**: reproduce the single
failing `seed`, replay the action sequence, and print pot/stack/`committedTotal` at the divergence.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "test(engine): GATE - chip conservation over 3000 randomized hands"
```

- [ ] **Step 4: Update `CLAUDE.md`** — confirm both gate file paths under "Release gates":
      `handEval/oracle.property.test.ts` and `engine/conservation.property.test.ts`.

```bash
git add -A && git commit -m "docs: record both release-gate paths in CLAUDE.md"
```

---

## Task 19: `selectors.ts` — `redactFor` anti-cheat boundary

**Files:**

- Create: `shared/src/engine/selectors.ts`
- Test: `shared/src/engine/selectors.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/engine/selectors.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createSeat, createHand } from "./state.js";
import { redactFor } from "./selectors.js";
import { fullDeck } from "../cards.js";

function sixMax() {
  const seats = Array.from({ length: 6 }, (_, i) => createSeat("p" + i, false, 1000));
  return createHand({ seats, buttonIndex: 0, sb: 10, bb: 20, deck: fullDeck(), handNumber: 1 });
}

describe("redactFor", () => {
  it("never exposes the deck or seed", () => {
    const view = redactFor("p0", sixMax()) as Record<string, unknown>;
    expect(view.deck).toBeUndefined();
    expect("deck" in view).toBe(false);
  });

  it("shows the requesting player's own hole cards only", () => {
    const st = sixMax();
    const view = redactFor("p0", st);
    expect(view.seats[0]!.holeCards).not.toBeNull();
    for (let i = 1; i < 6; i++) expect(view.seats[i]!.holeCards).toBeNull();
  });

  it("a spectator (null id) sees no hole cards mid-hand", () => {
    const view = redactFor(null, sixMax());
    for (const s of view.seats) if (s) expect(s.holeCards).toBeNull();
  });

  it("reveals contesting hands once the hand is complete", () => {
    const st = sixMax();
    st.street = "complete";
    st.seats[1]!.status = "folded";
    const view = redactFor(null, st);
    expect(view.seats[0]!.holeCards).not.toBeNull(); // still active -> revealed
    expect(view.seats[1]!.holeCards).toBeNull(); // folded -> hidden
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/engine/selectors.test.ts`
Expected: FAIL — cannot find module `./selectors.js`.

- [ ] **Step 3: Implement `shared/src/engine/selectors.ts`**

```ts
import type { Card } from "../cards.js";
import type { Pot, SeatStatus, Street, TableState } from "./types.js";

export interface PublicSeat {
  id: string;
  isBot: boolean;
  stack: number;
  committedThisStreet: number;
  committedTotal: number;
  status: SeatStatus;
  holeCards: [Card, Card] | null; // only own cards, or contesting hands at showdown
  group?: number;
}

export interface PublicView {
  seats: (PublicSeat | null)[];
  buttonIndex: number;
  street: Street;
  board: Card[];
  sb: number;
  bb: number;
  currentBet: number;
  lastRaiseSize: number;
  toAct: number | null;
  handNumber: number;
  pots: Pot[];
  // Deliberately omits: deck, deckPointer, rng seed, foreign hole cards.
}

/** Public, redacted view for one player (or a spectator when playerId is null). */
export function redactFor(playerId: string | null, state: TableState): PublicView {
  const showAll = state.street === "complete";
  return {
    buttonIndex: state.buttonIndex,
    street: state.street,
    board: [...state.board],
    sb: state.sb,
    bb: state.bb,
    currentBet: state.currentBet,
    lastRaiseSize: state.lastRaiseSize,
    toAct: state.toAct,
    handNumber: state.handNumber,
    pots: state.pots.map((p) => ({ amount: p.amount, eligible: [...p.eligible] })),
    seats: state.seats.map((s) => {
      if (!s) return null;
      const own = playerId != null && s.id === playerId;
      const reveal = own || (showAll && (s.status === "active" || s.status === "allin"));
      return {
        id: s.id,
        isBot: s.isBot,
        stack: s.stack,
        committedThisStreet: s.committedThisStreet,
        committedTotal: s.committedTotal,
        status: s.status,
        holeCards: reveal && s.holeCards ? [s.holeCards[0], s.holeCards[1]] : null,
        group: s.group,
      };
    }),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/engine/selectors.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(engine): redactFor public view (anti-cheat boundary)"
```

---

## Task 20: `elo/pairwise.ts`

**Files:**

- Create: `shared/src/elo/pairwise.ts`
- Test: `shared/src/elo/pairwise.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/elo/pairwise.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { pairwiseElo, type EloPlayer } from "./pairwise.js";

function players(ratings: number[]): EloPlayer[] {
  return ratings.map((r, i) => ({ id: "p" + i, rating: r }));
}

describe("pairwiseElo", () => {
  it("6 equal players: winner +60, loser -60, symmetric, K=24, no /(N-1)", () => {
    const ps = players([400, 400, 400, 400, 400, 400]);
    const place: Record<string, number> = { p0: 1, p1: 2, p2: 3, p3: 4, p4: 5, p5: 6 };
    const d = pairwiseElo(ps, place, 24);
    expect(d.p0).toBe(60); // beats 5 equals: 24*(5 - 2.5)
    expect(d.p5).toBe(-60);
    expect(Object.values(d).reduce((a, b) => a + b, 0)).toBe(0); // zero-sum among equals
  });

  it("beating a higher-rated player gains more than beating a lower-rated one", () => {
    const ps: EloPlayer[] = [
      { id: "me", rating: 400 },
      { id: "strong", rating: 800 },
      { id: "weak", rating: 100 },
    ];
    const beatStrong = pairwiseElo(ps, { me: 1, strong: 2, weak: 3 }, 24).me;
    const beatWeakOnly = pairwiseElo(ps, { me: 1, weak: 2, strong: 3 }, 24).me;
    expect(beatStrong).toBeGreaterThan(beatWeakOnly);
  });

  it("a chip tie (same finishing place) scores S=0.5 for that pair", () => {
    const ps = players([400, 400]);
    const d = pairwiseElo(ps, { p0: 1, p1: 1 }, 24); // tie
    expect(d.p0).toBe(0);
    expect(d.p1).toBe(0);
  });

  it("supports a per-player K (provisional players move faster)", () => {
    const ps = players([400, 400]);
    const k = (id: string) => (id === "p0" ? 48 : 24);
    const d = pairwiseElo(ps, { p0: 1, p1: 2 }, k);
    expect(d.p0).toBe(24); // 48 * (1 - 0.5)
    expect(d.p1).toBe(-12); // 24 * (0 - 0.5)
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/elo/pairwise.test.ts`
Expected: FAIL — cannot find module `./pairwise.js`.

- [ ] **Step 3: Implement `shared/src/elo/pairwise.ts`**

```ts
export interface EloPlayer {
  id: string;
  rating: number;
}

/**
 * Opponent-relative pairwise Elo. For each of the C(N,2) pairs, score S by finishing
 * place (1 better / 0 worse / 0.5 tie), expected E by the logistic, accumulate K*(S-E).
 * K is NOT divided by (N-1) — ranked is meant to feel meaningful. Returns rounded deltas.
 */
export function pairwiseElo(
  players: EloPlayer[],
  finishPlaceById: Record<string, number>,
  K: number | ((id: string) => number),
): Record<string, number> {
  const kOf = (id: string) => (typeof K === "function" ? K(id) : K);
  const raw: Record<string, number> = {};
  for (const p of players) raw[p.id] = 0;

  for (let a = 0; a < players.length; a++) {
    for (let b = a + 1; b < players.length; b++) {
      const pa = players[a]!;
      const pb = players[b]!;
      const placeA = finishPlaceById[pa.id]!;
      const placeB = finishPlaceById[pb.id]!;
      const sA = placeA < placeB ? 1 : placeA > placeB ? 0 : 0.5;
      const eA = 1 / (1 + Math.pow(10, (pb.rating - pa.rating) / 400));
      raw[pa.id] = raw[pa.id]! + kOf(pa.id) * (sA - eA);
      raw[pb.id] = raw[pb.id]! + kOf(pb.id) * (1 - sA - (1 - eA));
    }
  }

  const out: Record<string, number> = {};
  for (const id of Object.keys(raw)) out[id] = Math.round(raw[id]!);
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/elo/pairwise.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): opponent-relative pairwise Elo"
```

---

## Task 21: `bots/policy.ts` + bot-vs-bot integration

**Files:**

- Create: `shared/src/bots/policy.ts`
- Test: `shared/src/bots/policy.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/bots/policy.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { decide } from "./policy.js";
import { createSeat, createHand } from "../engine/state.js";
import { applyAction } from "../engine/reducer.js";
import { legalActions } from "../engine/legalActions.js";
import { redactFor } from "../engine/selectors.js";
import { shuffledDeck } from "../deck.js";
import { mulberry32 } from "../rng.js";
import { cardFromString as C } from "../cards.js";
import type { PublicView } from "../engine/selectors.js";

function viewWith(stack: number, currentBet: number): PublicView {
  return {
    seats: [
      {
        id: "me",
        isBot: true,
        stack,
        committedThisStreet: 0,
        committedTotal: 0,
        status: "active",
        holeCards: null,
      },
      {
        id: "x",
        isBot: true,
        stack: 1000,
        committedThisStreet: currentBet,
        committedTotal: currentBet,
        status: "active",
        holeCards: null,
      },
      null,
      null,
      null,
      null,
    ],
    buttonIndex: 0,
    street: "preflop",
    board: [],
    sb: 10,
    bb: 20,
    currentBet,
    lastRaiseSize: 20,
    toAct: 0,
    handNumber: 1,
    pots: [],
  };
}

describe("decide", () => {
  it("is deterministic for the same inputs and seed", () => {
    const v = viewWith(1000, 20);
    const mask = {
      seat: 0,
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 20,
      canRaise: true,
      minRaiseTo: 40,
      maxRaiseTo: 1000,
    };
    const a1 = decide(v, [C("Ah"), C("Ad")] as [number, number], mask, mulberry32(7));
    const a2 = decide(v, [C("Ah"), C("Ad")] as [number, number], mask, mulberry32(7));
    expect(a1).toEqual(a2);
  });

  it("always returns a legal action", () => {
    const v = viewWith(1000, 20);
    const mask = {
      seat: 0,
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 20,
      canRaise: true,
      minRaiseTo: 40,
      maxRaiseTo: 1000,
    };
    const a = decide(v, [C("7h"), C("2d")] as [number, number], mask, mulberry32(3));
    expect(["fold", "check", "call", "raise"]).toContain(a.type);
    if (a.type === "raise") {
      expect(a.amount!).toBeGreaterThanOrEqual(mask.minRaiseTo);
      expect(a.amount!).toBeLessThanOrEqual(mask.maxRaiseTo);
    }
  });

  it("shoves a premium hand when short-stacked", () => {
    const v = viewWith(100, 20); // 5bb
    const mask = {
      seat: 0,
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 20,
      canRaise: true,
      minRaiseTo: 40,
      maxRaiseTo: 100,
    };
    const a = decide(v, [C("Ah"), C("Ad")] as [number, number], mask, mulberry32(1));
    expect(a).toEqual({ seat: 0, type: "raise", amount: 100 });
  });

  it("folds trash facing a bet", () => {
    const v = viewWith(1000, 20);
    const mask = {
      seat: 0,
      canFold: true,
      canCheck: false,
      canCall: true,
      callAmount: 20,
      canRaise: true,
      minRaiseTo: 40,
      maxRaiseTo: 1000,
    };
    const a = decide(v, [C("7h"), C("2d")] as [number, number], mask, mulberry32(99));
    expect(a.type).toBe("fold");
  });
});

describe("bots play a full hand to completion", () => {
  it("6 bots reach a complete hand with chips conserved", () => {
    const seats = Array.from({ length: 6 }, (_, i) => createSeat("b" + i, true, 1000));
    let st = createHand({
      seats,
      buttonIndex: 0,
      sb: 10,
      bb: 20,
      deck: shuffledDeck(123),
      handNumber: 1,
    });
    const before = 6000;
    const rng = mulberry32(123);
    let guard = 0;
    while (st.street !== "complete" && guard++ < 5000) {
      const i = st.toAct!;
      const seat = st.seats[i]!;
      const mask = legalActions(st, i);
      const view = redactFor(seat.id, st);
      st = applyAction(st, decide(view, seat.holeCards!, mask, rng)).state;
    }
    expect(st.street).toBe("complete");
    expect(st.seats.reduce((a, s) => a + (s ? s.stack : 0), 0)).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/bots/policy.test.ts`
Expected: FAIL — cannot find module `./policy.js`.

- [ ] **Step 3: Implement `shared/src/bots/policy.ts`**

```ts
import { evaluate7, HandCategory } from "../handEval/index.js";
import { rankOf, suitOf, type Card } from "../cards.js";
import type { ActionMask } from "../engine/legalActions.js";
import type { PublicView } from "../engine/selectors.js";
import type { Action } from "../engine/types.js";

/** Pure tight-aggressive bot. Consumes only public info + its own hole cards. */
export function decide(
  view: PublicView,
  hole: [Card, Card],
  mask: ActionMask,
  rng: () => number,
): Action {
  const me = view.seats[mask.seat]!;
  const bb = view.bb;
  const stackBB = me.stack / bb;
  const pot = potSize(view);

  if (view.board.length === 0) {
    const tier = preflopTier(hole);
    if (stackBB <= 12) {
      return tier >= 2 ? raiseTo(mask, mask.maxRaiseTo) : foldOrCheck(mask);
    }
    if (tier >= 3) return raiseTo(mask, view.currentBet + bb * 3);
    if (tier >= 1) {
      if (mask.callAmount === 0) return rng() < 0.18 ? raiseTo(mask, bb * 3) : callOrCheck(mask);
      return mask.callAmount <= bb * 3 ? callOrCheck(mask) : foldOrCheck(mask);
    }
    return foldOrCheck(mask);
  }

  const cat = Math.floor(evaluate7([hole[0], hole[1], ...view.board]) / 16 ** 5);
  if (cat >= HandCategory.Trips) {
    return raiseTo(mask, view.currentBet + Math.round(pot * 0.6) + bb);
  }
  if (cat >= HandCategory.Pair) {
    if (mask.callAmount === 0) return rng() < 0.25 ? raiseTo(mask, bb * 2) : callOrCheck(mask);
    const potOdds = mask.callAmount / Math.max(1, pot + mask.callAmount);
    if (potOdds < 0.4) return callOrCheck(mask);
    return rng() < 0.1 ? callOrCheck(mask) : foldOrCheck(mask);
  }
  // weak / no made hand
  if (mask.callAmount === 0) return rng() < 0.12 ? raiseTo(mask, bb * 2) : foldOrCheck(mask);
  return foldOrCheck(mask);
}

function potSize(view: PublicView): number {
  let p = 0;
  for (const s of view.seats) if (s) p += s.committedTotal;
  return p;
}

function preflopTier(hole: [Card, Card]): number {
  const r1 = rankOf(hole[0]);
  const r2 = rankOf(hole[1]);
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  const pair = r1 === r2;
  const suited = suitOf(hole[0]) === suitOf(hole[1]);
  if (pair && hi >= 10) return 4; // QQ+
  if (hi === 12 && lo >= 10) return 4; // AK, AQ, AJ
  if (pair && hi >= 7) return 3; // 99-JJ
  if (pair) return 2; // small/mid pair
  if (hi === 12 && (suited || lo >= 8)) return 2; // strong ace
  if (hi >= 10 && lo >= 9 && suited) return 2; // suited broadway
  if (hi >= 9 && lo >= 7) return 1;
  if (suited && hi - lo <= 2 && lo >= 4) return 1; // suited connectors
  return 0;
}

function raiseTo(mask: ActionMask, to: number): Action {
  if (!mask.canRaise) return callOrCheck(mask);
  let t = Math.round(to);
  if (t < mask.minRaiseTo) t = mask.minRaiseTo;
  if (t > mask.maxRaiseTo) t = mask.maxRaiseTo;
  return { seat: mask.seat, type: "raise", amount: t };
}
function callOrCheck(mask: ActionMask): Action {
  if (mask.canCheck) return { seat: mask.seat, type: "check" };
  if (mask.canCall) return { seat: mask.seat, type: "call" };
  return { seat: mask.seat, type: "fold" };
}
function foldOrCheck(mask: ActionMask): Action {
  return mask.canCheck ? { seat: mask.seat, type: "check" } : { seat: mask.seat, type: "fold" };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/bots/policy.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): tight-aggressive bot policy + bot-vs-bot integration"
```

---

## Task 22: `protocol.ts` — encode/decode (tag-only validation)

**Files:**

- Create: `shared/src/protocol.ts`
- Test: `shared/src/protocol.test.ts`

- [ ] **Step 1: Write the failing test `shared/src/protocol.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { encode, decode, type ClientMsg, type ServerMsg } from "./protocol.js";

describe("protocol encode/decode", () => {
  it("round-trips a client action message", () => {
    const msg: ClientMsg = { t: "action", seat: 3, action: "raise", amount: 60 };
    expect(decode<ClientMsg>(encode(msg))).toEqual(msg);
  });

  it("round-trips a server snapshot message", () => {
    const msg: ServerMsg = { t: "snapshot", view: { board: [] } };
    expect(decode<ServerMsg>(encode(msg))).toEqual(msg);
  });

  it("validates the tag only and rejects a malformed envelope", () => {
    expect(() => decode("not json")).toThrow();
    expect(() => decode(JSON.stringify({ noTag: true }))).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- shared/src/protocol.test.ts`
Expected: FAIL — cannot find module `./protocol.js`.

- [ ] **Step 3: Implement `shared/src/protocol.ts`**

```ts
// Discriminated-union wire protocol. decode() validates the TAG ONLY; the server
// re-guards every payload (security-critical) in a later unit.

export type ClientMsg =
  | { t: "hello"; jwt: string }
  | { t: "action"; seat: number; action: "fold" | "check" | "call" | "raise"; amount?: number }
  | { t: "sitOut" }
  | { t: "ping"; ts: number };

export type ServerMsg =
  | { t: "seated"; seat: number }
  | { t: "dealPrivate"; seat: number; holeCards: [number, number] }
  | { t: "snapshot"; view: unknown }
  | { t: "event"; event: unknown }
  | { t: "yourTurn"; mask: unknown; deadline: number }
  | { t: "matchOver"; placements: unknown; eloDeltas?: unknown }
  | { t: "error"; message: string };

export function encode(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg);
}

export function decode<T extends { t: string }>(raw: string): T {
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    throw new Error("protocol: invalid JSON");
  }
  if (typeof o !== "object" || o === null || typeof (o as { t?: unknown }).t !== "string") {
    throw new Error("protocol: missing tag");
  }
  return o as T;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- shared/src/protocol.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): wire protocol encode/decode (tag-only validation)"
```

---

## Task 23: Package barrel export + full verification + CLAUDE.md finalize

**Files:**

- Modify: `shared/src/index.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace `shared/src/index.ts` with the public barrel**

```ts
export const PACKAGE_NAME = "@poker/shared";

export * from "./rng.js";
export * from "./roomCode.js";
export * from "./constants.js";
export * from "./cards.js";
export * from "./deck.js";
export * from "./protocol.js";
export * from "./handEval/index.js";
export * from "./engine/types.js";
export * from "./engine/state.js";
export * from "./engine/betting.js";
export * from "./engine/legalActions.js";
export * from "./engine/pots.js";
export * from "./engine/showdown.js";
export * from "./engine/reducer.js";
export * from "./engine/selectors.js";
export * from "./elo/pairwise.js";
export * from "./bots/policy.js";
```

- [ ] **Step 2: Run the FULL suite (all gates included)**

Run: `npm test`
Expected: every suite passes, including `oracle.property.test.ts` (100k) and
`conservation.property.test.ts` (3000 hands). If the property tests are slow, that is expected;
do not reduce their iteration counts to make them faster.

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck`
Expected: exits 0.
Run: `npm run lint`
Expected: exits 0 (warnings OK, no errors).

- [ ] **Step 4: Finalize `CLAUDE.md`**

Ensure `CLAUDE.md` lists: the full `shared/src` module map; the two golden rules; the raise-TO
convention; the card int encoding; the `.js` import rule; how to run tests/typecheck/lint; the two
release gates and their file paths; and a one-line status that Build Unit 1 (scaffold + pure engine)
is complete and the next unit is the PartyKit `MatchRoom` server.

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "feat(shared): public barrel export; Build Unit 1 complete (scaffold + pure engine)"
```

---

## Definition of Done (this build unit)

- [ ] `npm test` green, including both property-test gates at full iteration counts.
- [ ] `npm run typecheck` and `npm run lint` clean.
- [ ] `shared/` exports cards, deck, hand eval (oracle + fast), the betting reducer, pots/showdown,
      `redactFor`, pairwise Elo, bot policy, and the protocol shell.
- [ ] `CLAUDE.md` is current and documents conventions, gates, and next steps.
- [ ] Placeholder `client/` and `party/` workspaces and an empty `supabase/` dir exist for the
      next units to build into.

**Next unit (separate spec + plan):** PartyKit `MatchRoom` — server-authoritative deal → private
hole cards → action loop → redacted snapshots, then timers/timebank, match clock/blinds/bust
placement/end, and the bot runner.
