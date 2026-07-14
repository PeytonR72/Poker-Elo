# PokerElo Visual Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire `client/` SPA to the approved dark-charcoal + emerald design (spec: `docs/superpowers/specs/2026-07-14-visual-overhaul-design.md`) with a sidebar shell, felt game table, and Framer Motion animations — reskinning real features only.

**Architecture:** Approach A — big-bang restyle in place. Pure cores (`matchReducer`, `lobbyReducer`, `viewHelpers`, `data/*`) and everything outside `client/` are untouched. New presentation layers: Tailwind v4 design tokens, shadcn/ui components under `client/src/components/ui/`, an `AppShell` sidebar, and Motion-driven animation hooks that derive triggers from existing state (no protocol changes).

**Tech Stack:** Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui, `motion` (Framer Motion), `lucide-react`, DiceBear HTTP avatar API, Inter + JetBrains Mono via Google Fonts.

## Global Constraints

- Never modify `shared/`, `party/`, `supabase/`, or any `*.test.ts` that exists today. All 138 existing tests must stay green.
- Relative imports end in `.js` (repo convention) — shadcn's `@/` alias imports are the one sanctioned exception, confined to `client/src/components/` and `client/src/lib/utils.ts`.
- Never `import` CSS from `.tsx` (breaks `tsc -b`); stylesheets are linked from `client/index.html`. Tailwind directives live in `client/src/index.css`.
- `import type React from "react"` wherever `React.CSSProperties`/`React.FormEvent` is referenced.
- Raise semantics are raise-TO; all raise math goes through the existing `clampRaiseTo`/`maskToButtons`/`quickRaiseOptions` in `client/src/game/viewHelpers.ts`.
- Poker numbers only from `@poker/shared` constants — never hardcode.
- Reskin real features only: no Hand History/Training/Shop nav, no bankroll/win-rate/achievement placeholders.
- Design tokens (exact values from spec): base `#0a0e12`, surface `#12181f`, surface-2 `#1a222b`, border `#232d38`, emerald `#2fd987`, emerald-hover `#4ce3a0`, gold `#e8c35a`, danger `#ff6b6b`, felt gradient `#0d3326 → #071a13`.
- Every animation must degrade under `prefers-reduced-motion` (wrap app in `<MotionConfig reducedMotion="user">`).
- Verification loop per task: `npm run typecheck` + `npm test` from repo root, both green, then commit.

---

### Task 1: Install MCP servers (best-effort accelerators)

**Files:**
- Create: `.mcp.json` (project scope, via `claude mcp add`)

**Interfaces:**
- Produces: shadcn MCP + 21st.dev Magic MCP available to later tasks. These are accelerators, NOT blockers — if either fails, log it and move on; later tasks fall back to `npx shadcn@latest add <component>` and hand-written JSX.

- [ ] **Step 1: Add the shadcn MCP server (project scope)**

```bash
claude mcp add --scope project --transport http shadcn https://www.shadcn.io/api/mcp
```

If that URL is rejected, consult https://ui.shadcn.com/docs/mcp for the current invocation and use that instead.

- [ ] **Step 2: Attempt 21st.dev Magic MCP**

Magic MCP requires an API key from https://21st.dev/magic/console. Check for one:

```powershell
if ($env:TWENTYFIRST_API_KEY) { npx -y @21st-dev/cli@latest install claude --api-key $env:TWENTYFIRST_API_KEY } else { "No TWENTYFIRST_API_KEY set - skipping Magic MCP (fallback: shadcn CLI + hand-written JSX)" }
```

Do not prompt or block on the key; skip gracefully.

- [ ] **Step 3: Verify and commit**

Run: `claude mcp list`
Expected: `shadcn` listed (and `magic` if key was present).

```bash
git add .mcp.json
git commit -m "chore: add shadcn (and optionally magic) MCP servers"
```

---

### Task 2: Tailwind v4 + shadcn scaffolding, design tokens, fonts, branding

**Files:**
- Modify: `client/package.json`, `client/vite.config.ts`, `client/tsconfig.json`, `client/index.html`, `client/src/index.css`
- Create: `client/components.json`, `client/src/lib/utils.ts`, `client/src/components/ui/*` (button, input, card, table, slider, sheet, badge, dialog, separator), `client/src/shell/Logo.tsx`
- Create (if source PNG available): `client/public/favicon.png`

**Interfaces:**
- Produces: Tailwind theme tokens usable as classes (`bg-base`, `bg-surface`, `bg-surface-2`, `border-edge`, `text-emerald`, `text-gold`, `text-danger`, `font-mono-num`); shadcn components importable as `@/components/ui/<name>`; `Logo({ size?: number })` React component (spade in emerald ring, SVG).

- [ ] **Step 1: Install dependencies**

```bash
npm install tailwindcss @tailwindcss/vite motion lucide-react --workspace @poker/client
```

- [ ] **Step 2: Wire Vite + tsconfig aliases**

`client/vite.config.ts` — add the Tailwind plugin and `@/` alias:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

`client/tsconfig.json` — inside `compilerOptions` add:

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 3: Replace `client/src/index.css` with Tailwind + tokens**

```css
@import "tailwindcss";

@theme {
  --color-base: #0a0e12;
  --color-surface: #12181f;
  --color-surface-2: #1a222b;
  --color-edge: #232d38;
  --color-emerald: #2fd987;
  --color-emerald-hover: #4ce3a0;
  --color-gold: #e8c35a;
  --color-danger: #ff6b6b;
  --color-felt-1: #0d3326;
  --color-felt-2: #071a13;
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono-num: "JetBrains Mono", ui-monospace, monospace;
}

:root { color-scheme: dark; }
body { @apply bg-base text-neutral-200 font-sans m-0; }

/* shadcn semantic variables mapped onto our palette (dark-only app) */
:root {
  --background: var(--color-base);
  --foreground: #e6e6e6;
  --card: var(--color-surface);
  --card-foreground: #e6e6e6;
  --primary: var(--color-emerald);
  --primary-foreground: #05231a;
  --secondary: var(--color-surface-2);
  --secondary-foreground: #e6e6e6;
  --muted: var(--color-surface-2);
  --muted-foreground: #8b92a5;
  --border: var(--color-edge);
  --input: var(--color-edge);
  --ring: var(--color-emerald);
  --destructive: var(--color-danger);
  --radius: 0.75rem;
}
```

(Keep the existing `seatActionPop`/`seatWinnerGlow` keyframes at the end of the file — `SeatView` still references them until Task 7 replaces them.)

- [ ] **Step 4: Fonts + favicon in `client/index.html`**

Add to `<head>` (keep the existing stylesheet link):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
```

Favicon: if the user has placed the spade branding PNG anywhere in the repo or Desktop as `favicon.png`/`spade*.png`, copy it to `client/public/favicon.png` and change the icon link to `<link rel="icon" type="image/png" href="/favicon.png" />`. If no PNG is found, keep `favicon.svg` and note it in the final report (do not fabricate one).

- [ ] **Step 5: Initialize shadcn and add components**

```bash
cd client
npx shadcn@latest init -y
npx shadcn@latest add button input card table slider sheet badge dialog separator -y
```

If `init` asks questions non-interactively fails, hand-write `client/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/index.css", "baseColor": "neutral", "cssVariables": true },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" }
}
```

then re-run the `add` command. Prefer the shadcn MCP (from Task 1) to fetch component source if the CLI misbehaves.

- [ ] **Step 6: Create `client/src/shell/Logo.tsx`** (crisp SVG spade-in-ring per branding)

```tsx
export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="PokerElo">
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#12181f" stroke="#232d38" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="#2fd987" strokeWidth="5" />
      <path
        d="M32 20c4.5 6 10 9.5 10 15a6 6 0 0 1-9 5.2c.4 2.4 1.4 4 3 4.8h-8c1.6-.8 2.6-2.4 3-4.8a6 6 0 0 1-9-5.2c0-5.5 5.5-9 10-15z"
        fill="#eceff3"
      />
    </svg>
  );
}
```

- [ ] **Step 7: Verify and commit**

Run from repo root: `npm run typecheck` then `npm test`
Expected: both green (shadcn files compile; no behavior changed).
Run `npm run dev` in `client/` briefly and confirm the app still renders (fonts + dark base applied).

```bash
git add -A client .mcp.json
git commit -m "feat(client): tailwind v4 + shadcn scaffolding, design tokens, fonts, logo"
```

---

### Task 3: New pure helpers (TDD): avatars, pot presets, leaderboard search

**Files:**
- Create: `client/src/data/avatar.ts`, `client/src/data/avatar.test.ts`
- Create: `client/src/game/potPresets.ts`, `client/src/game/potPresets.test.ts`
- Create: `client/src/leaderboard/filterEntries.ts`, `client/src/leaderboard/filterEntries.test.ts`

**Interfaces:**
- Consumes: `ActionMask` from `@poker/shared`; `clampRaiseTo` from `./viewHelpers.js`; `LeaderboardEntry` from `../data/leaderboard.js`.
- Produces:
  - `avatarUrl(seed: string): string` — deterministic DiceBear URL.
  - `potPresets(mask: ActionMask, potTotal: number, currentBet: number): { label: string; raiseTo: number }[]` — Min / ½ Pot / Pot / Max raise-TO values, clamped legal, deduped.
  - `filterEntries(entries: LeaderboardEntry[], query: string): LeaderboardEntry[]` — case-insensitive name filter, empty query = all.

- [ ] **Step 1: Write failing tests**

`client/src/data/avatar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { avatarUrl } from "./avatar.js";

describe("avatarUrl", () => {
  it("is deterministic per seed and URL-encodes it", () => {
    expect(avatarUrl("abc")).toBe(avatarUrl("abc"));
    expect(avatarUrl("a b")).toContain("seed=a%20b");
    expect(avatarUrl("x")).toMatch(/^https:\/\/api\.dicebear\.com\/9\.x\/adventurer-neutral\/svg\?/);
  });
});
```

`client/src/game/potPresets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ActionMask } from "@poker/shared";
import { potPresets } from "./potPresets.js";

const mask = (over: Partial<ActionMask> = {}): ActionMask => ({
  canFold: true, canCheck: false, canCall: true, canRaise: true,
  callAmount: 100, minRaiseTo: 200, maxRaiseTo: 10_000, ...over,
});

describe("potPresets", () => {
  it("returns [] when raising is illegal", () => {
    expect(potPresets(mask({ canRaise: false }), 500, 100)).toEqual([]);
  });
  it("produces Min/half-pot/pot/Max raise-TO values, clamped", () => {
    const p = potPresets(mask(), 1000, 100);
    expect(p[0]).toEqual({ label: "Min", raiseTo: 200 });
    expect(p.at(-1)).toEqual({ label: "Max", raiseTo: 10_000 });
    // ½ Pot: call (100) + 0.5 * (pot 1000 + call 100) = 650
    expect(p.find((x) => x.label === "1/2 Pot")).toEqual({ label: "1/2 Pot", raiseTo: 650 });
    // Pot: call (100) + 1.0 * (pot 1000 + call 100) = 1200
    expect(p.find((x) => x.label === "Pot")).toEqual({ label: "Pot", raiseTo: 1200 });
  });
  it("dedupes when presets collapse to the same clamped value", () => {
    const p = potPresets(mask({ maxRaiseTo: 200 }), 1000, 100);
    expect(p).toEqual([{ label: "Min", raiseTo: 200 }]);
  });
});
```

`client/src/leaderboard/filterEntries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { LeaderboardEntry } from "../data/leaderboard.js";
import { filterEntries } from "./filterEntries.js";

const e = (name: string): LeaderboardEntry =>
  ({ id: name, username: name, rating: 400, rank: 1, tier: "Fish" }) as unknown as LeaderboardEntry;

describe("filterEntries", () => {
  it("empty query returns all", () => {
    expect(filterEntries([e("Alice"), e("Bob")], "  ")).toHaveLength(2);
  });
  it("filters case-insensitively on display name", () => {
    const out = filterEntries([e("Alice"), e("Bob")], "ali");
    expect(out).toHaveLength(1);
  });
});
```

**Note:** before writing `filterEntries`, read `client/src/data/leaderboard.ts` to get the real `LeaderboardEntry` shape and adjust the test factory `e()` to construct it honestly (it must display-name via the existing `displayName` helper in `client/src/data/displayName.ts`, not a raw field).

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test -- client/src` (from repo root)
Expected: the three new suites FAIL (modules not found).

- [ ] **Step 3: Implement**

`client/src/data/avatar.ts`:

```ts
/** Deterministic free avatar (DiceBear HTTP API) for a player id or bot name. */
export function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=${encodeURIComponent(seed)}&backgroundColor=1a222b`;
}
```

`client/src/game/potPresets.ts`:

```ts
import type { ActionMask } from "@poker/shared";
import { clampRaiseTo } from "./viewHelpers.js";

/** Min / ½ Pot / Pot / Max raise-TO presets, clamped legal and deduped. */
export function potPresets(
  mask: ActionMask,
  potTotal: number,
  currentBet: number,
): { label: string; raiseTo: number }[] {
  if (!mask.canRaise) return [];
  const call = mask.canCall ? mask.callAmount : 0;
  // Pot-fraction raise-TO: current bet matched, plus fraction of (pot + our call).
  const f = (frac: number) => clampRaiseTo(currentBet + Math.round(frac * (potTotal + call)), mask);
  const out = [
    { label: "Min", raiseTo: clampRaiseTo(mask.minRaiseTo, mask) },
    { label: "1/2 Pot", raiseTo: f(0.5) },
    { label: "Pot", raiseTo: f(1) },
    { label: "Max", raiseTo: clampRaiseTo(mask.maxRaiseTo, mask) },
  ];
  const seen = new Set<number>();
  return out.filter((o) => (seen.has(o.raiseTo) ? false : (seen.add(o.raiseTo), true)));
}
```

**Sanity check:** for pot 1000 / call 100 / currentBet 100: ½ Pot = 100 + 0.5×1100 = 650, Pot = 100 + 1100 = 1200 — matching the Step 1 test expectations exactly.

`client/src/leaderboard/filterEntries.ts`:

```ts
import type { LeaderboardEntry } from "../data/leaderboard.js";
import { displayName } from "../data/displayName.js";

/** Case-insensitive client-side name filter over the loaded top-100. */
export function filterEntries(entries: LeaderboardEntry[], query: string): LeaderboardEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((entry) => displayName(entry).toLowerCase().includes(q));
}
```

(Adjust the `displayName(entry)` call to the helper's real signature after reading `displayName.ts`.)

- [ ] **Step 4: Run tests, verify green, commit**

Run: `npm test` — all suites green (138 + new).

```bash
git add client/src/data/avatar.ts client/src/data/avatar.test.ts client/src/game/potPresets.ts client/src/game/potPresets.test.ts client/src/leaderboard/filterEntries.ts client/src/leaderboard/filterEntries.test.ts
git commit -m "feat(client): avatar, pot-preset, leaderboard-filter pure helpers (TDD)"
```

---

### Task 4: AppShell sidebar + restyled Auth + screen transitions

**Files:**
- Create: `client/src/shell/AppShell.tsx`
- Modify: `client/src/App.tsx`, `client/src/home/Home.tsx`, `client/src/auth/AuthScreen.tsx`, `client/src/main.tsx`, `client/src/home/RatingBadge.tsx`

**Interfaces:**
- Consumes: `Logo` (Task 2), `avatarUrl` (Task 3), shadcn `Button`/`Input`/`Card`/`Sheet`, `rankForRating` from `@poker/shared`.
- Produces: `AppShell({ tab, onTabChange, onFindMatch, rating, username, userId, onSignOut, children })` where `tab: "play" | "leaderboard" | "profile"`. `Home.tsx` keeps its existing props (`auth`, `onMatchFound`, `ratingRefreshKey`) and its rating-fetch/profile-navigation logic verbatim — only its render tree changes to wrap content in `AppShell`.

- [ ] **Step 1: Wrap the app in MotionConfig (reduced-motion) in `client/src/main.tsx`**

```tsx
import { MotionConfig } from "motion/react";
```

and wrap the rendered `<App />` in `<MotionConfig reducedMotion="user">…</MotionConfig>`.

- [ ] **Step 2: Build `client/src/shell/AppShell.tsx`**

```tsx
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Play, Trophy, User, LogOut, Menu } from "lucide-react";
import { rankForRating } from "@poker/shared";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import Logo from "./Logo.js";
import { avatarUrl } from "../data/avatar.js";

export type ShellTab = "play" | "leaderboard" | "profile";

const NAV: { tab: ShellTab; label: string; Icon: typeof Play }[] = [
  { tab: "play", label: "Play Now", Icon: Play },
  { tab: "leaderboard", label: "Leaderboards", Icon: Trophy },
  { tab: "profile", label: "Profile", Icon: User },
];

function SidebarBody(props: {
  tab: ShellTab; onTabChange: (t: ShellTab) => void; onFindMatch: () => void;
  rating: number; username: string; userId: string; onSignOut: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Logo size={30} />
        <span className="text-lg font-bold">Poker<span className="text-emerald">Elo</span></span>
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 border border-edge p-3">
        <img src={avatarUrl(props.userId)} alt="" className="h-10 w-10 rounded-lg" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{props.username}</div>
          <div className="font-mono-num text-xs text-muted-foreground">
            {rankForRating(props.rating)} | {props.rating}
          </div>
        </div>
      </div>
      <Button
        className="shadow-[0_0_18px_rgba(47,217,135,0.45)] font-semibold"
        onClick={props.onFindMatch}
      >
        Find Match
      </Button>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ tab, label, Icon }) => (
          <button
            key={tab}
            onClick={() => props.onTabChange(tab)}
            className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              props.tab === tab ? "bg-surface-2 text-emerald" : "text-neutral-400 hover:text-neutral-100"
            }`}
          >
            {props.tab === tab && (
              <motion.span layoutId="nav-rail" className="absolute left-0 top-1 bottom-1 w-0.5 rounded bg-emerald" />
            )}
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>
      <div className="mt-auto border-t border-edge pt-3">
        <button onClick={props.onSignOut} className="flex items-center gap-2 text-sm text-neutral-400 hover:text-danger">
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </div>
  );
}

export default function AppShell(props: Parameters<typeof SidebarBody>[0] & { children: ReactNode }) {
  const { children, ...side } = props;
  return (
    <div className="flex min-h-screen bg-base">
      <aside className="hidden w-60 shrink-0 border-r border-edge bg-surface md:block">
        <SidebarBody {...side} />
      </aside>
      <div className="flex-1">
        <div className="flex items-center gap-2 border-b border-edge p-3 md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary" size="icon" aria-label="Menu"><Menu size={18} /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-surface p-0">
              <SidebarBody {...side} />
            </SheetContent>
          </Sheet>
          <Logo size={24} />
          <span className="font-bold">Poker<span className="text-emerald">Elo</span></span>
        </div>
        <motion.main
          key={props.tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mx-auto max-w-4xl p-6"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewire `Home.tsx` to use AppShell**

Keep ALL existing state/effects (`tab`, `rating`, `ratingError`, `profileId`, `profileFromTab`, the debounced rating fetch, `openProfile`). Fetch `username` alongside `rating` (`select("rating, username")` on the same query). Replace the returned JSX: `AppShell` wraps the three screens; `onFindMatch` sets `tab` to `"play"`; `onTabChange` mirrors the old tab-button `onClick` (clearing `profileId` when tab is `"profile"`); `ratingError` renders as a small inline `text-danger` line above the content. `RatingBadge` moves inside the Play screen header (Task 5) — remove it from the shell header.

- [ ] **Step 4: Restyle `AuthScreen.tsx`**

Preserve the exact auth logic (sign-in/sign-up handlers, error states, `autoComplete` attributes). New render: full-screen `bg-base` with a radial emerald glow (`bg-[radial-gradient(ellipse_at_top,rgba(47,217,135,0.08),transparent_60%)]`), centered shadcn `Card` (max-w-sm) with `Logo`, title, shadcn `Input`s + primary `Button`, mode-toggle link. Entrance: `motion.div` fade-up. Error: text under the form in `text-danger`, with `animate={{ x: [0, -6, 6, -3, 3, 0] }}` shake keyed on the error message.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm test` — green.
Run `npm run dev` in `client/`: auth screen styled; after sign-in the sidebar shell renders, tabs switch with fade-up, mobile sheet works (narrow the window).

```bash
git add -A client/src
git commit -m "feat(client): AppShell sidebar, restyled auth, screen transitions"
```

---

### Task 5: Arena (lobby/queue) restyle

**Files:**
- Modify: `client/src/lobby/LobbyScreen.tsx`
- Reference (do not modify): `client/src/lobby/useLobbySocket.ts`, `client/src/lobby/lobbyReducer.ts`

**Interfaces:**
- Consumes: existing `useLobbySocket` API and `LobbyUiState` (read `lobbyReducer.ts` first for exact fields: queue status, online count, ETA, error). shadcn `Card`/`Button`/`Badge`; `DEFAULT_FORMAT`/`MATCH_FORMATS` from `@poker/shared`.
- Produces: same component signature `LobbyScreen({ auth, rating, onMatchFound })`.

- [ ] **Step 1: Read the current `LobbyScreen.tsx` + `lobbyReducer.ts`** and inventory every piece of real state rendered today (format picker, queue button, status line, online count, error). The restyle must keep 100% of that behavior.

- [ ] **Step 2: Rebuild the render tree**

Layout: `<h1 class="text-3xl font-bold">Arena</h1>` header row with `RatingBadge` on the right; centered `Card` (max-w-md, `bg-surface`, `border-edge`, generous padding) containing:

- Radar ring (queued only):

```tsx
<div className="relative mx-auto h-20 w-20">
  <motion.span
    className="absolute inset-0 rounded-full border-2 border-emerald"
    animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
  />
  <span className="absolute inset-3 rounded-full bg-surface-2 border border-edge grid place-items-center">
    <Logo size={28} />
  </span>
</div>
```

- Status heading: `Searching for match…` while queued, else `Ready to play`; live-dot + `N players online` line (only when the reducer actually exposes an online count — check first; if it doesn't, omit the line entirely, do not fake it).
- Primary CTA: glowing `Find Match` button with format chip (`Badge` showing e.g. `6-Max No-Limit · Turbo` derived from `MATCH_FORMATS[format]`), which calls the existing enqueue function; while queued it is replaced by a muted `Cancel Search` text button calling the existing leave function.
- Keep the existing format selector, restyled as a row of `Badge`-style toggle chips (one per key of `MATCH_FORMATS`).

Below the card, a 3-column grid (`grid grid-cols-1 sm:grid-cols-3 gap-4`) of real stat cards in mono-caps style — `RATING` (value), `RANK` (`rankForRating(rating)`), and queue ETA/state if the reducer exposes it. Each: `Card` with `text-[11px] tracking-widest text-muted-foreground font-mono-num` label + `text-2xl font-mono-num` value.

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm test` — green.
Manual: `npm run dev` in both `party/` and `client/`; queue up, see radar pulse + cancel; confirm a bot-filled match still starts and navigates to the game.

```bash
git add client/src/lobby/LobbyScreen.tsx
git commit -m "feat(client): arena queue screen restyle with radar animation"
```

---

### Task 6: Leaderboard + Profile restyle

**Files:**
- Modify: `client/src/leaderboard/LeaderboardScreen.tsx`, `client/src/profile/ProfileScreen.tsx`
- Reference (do not modify): `client/src/leaderboard/useLeaderboard.ts`, `client/src/profile/useProfile.ts`, `client/src/data/leaderboard.ts`, `client/src/data/profile.ts`, `client/src/data/displayName.ts`

**Interfaces:**
- Consumes: existing hooks unchanged; `filterEntries` + `avatarUrl` (Task 3); shadcn `Table`/`Card`/`Input`/`Badge`/`Separator`.
- Produces: same component signatures (`LeaderboardScreen({ ownId, onOpenProfile })`, `ProfileScreen({ playerId, onBack })`).

- [ ] **Step 1: Leaderboard restyle**

Header: `Global Leaderboard` (text-3xl font-bold) + subtitle `Top ranked players by Elo rating.` + right-aligned search `Input` (with `Search` lucide icon) feeding `filterEntries` over the loaded entries via local state. shadcn `Table` with mono-caps header row (`RANK / PLAYER / RATING / TIER`). Rows:

- Rank cell: gold `1`, silver-tinted `2`, bronze-tinted `3` (font-mono-num, colored `text-gold` / `text-neutral-300` / `text-[#c88a4b]`), plain thereafter.
- Player cell: `avatarUrl(entry.id)` 32px rounded + display name; clicking calls `onOpenProfile(entry.id)`.
- Rating: `text-emerald font-mono-num`. Tier: `Badge variant="secondary"`.
- Own row: `bg-emerald/10` highlight (keep the existing own-rank-outside-top-100 affordance the screen has today, restyled).
- Staggered entrance:

```tsx
<motion.tr initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.6) }} />
```

(Use shadcn `TableRow asChild` or apply classes to `motion.tr` directly.)
Keep existing loading/error states, restyled (`text-danger` inline error, skeleton rows with `animate-pulse bg-surface-2`).

- [ ] **Step 2: Profile restyle**

Read `data/profile.ts` first for the exact `ProfileData` fields. Hero: 96px avatar in a tier-colored ring (`ring-2 ring-emerald` default, `ring-gold` for top tier), username `text-4xl font-bold`, `Global Rank: #N` when available, tier `Badge`. Keep the existing Back button (chevron-left ghost `Button`, same `onBack` behavior). Stat card row (same mono-caps card pattern as Task 5) from real `ProfileData`/history fields only — rating, matches played, best finish, average finish; compute the latter two from the history entries if `data/profile.ts` doesn't already provide them (pure inline derivation from the loaded rows, no new fetches). Recent Activity: `Card` list of history entries — up/down arrow icon tinted emerald/danger by Elo delta sign, format + date line, `+N / −N` mono delta right-aligned, staggered entrance like the leaderboard.

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm test` — green.
Manual: dev server — leaderboard search filters live, own row highlighted, profile opens from a row click, Back returns to the originating tab (existing behavior).

```bash
git add client/src/leaderboard/LeaderboardScreen.tsx client/src/profile/ProfileScreen.tsx
git commit -m "feat(client): leaderboard and profile restyle"
```

---

### Task 7: Game table — felt, seats, cards, chips, action dock, animation suite

**Files:**
- Modify: `client/src/game/GameScreen.tsx`, `client/src/game/Table.tsx`, `client/src/game/SeatView.tsx`, `client/src/game/Board.tsx`, `client/src/game/CardView.tsx`, `client/src/game/ActionBar.tsx`, `client/src/game/MatchClock.tsx`
- Create: `client/src/game/useBoardReveal.ts`
- Modify: `client/src/index.css` (remove now-unused `seatActionPop`/`seatWinnerGlow` keyframes once SeatView is on Motion)
- Reference (do not modify): `client/src/game/matchReducer.ts`, `client/src/game/useMatchSocket.ts`

**Interfaces:**
- Consumes: `MatchUiState` from `matchReducer.ts` (read it first — seat action badges, winner info, and turn state all already exist there); `potPresets`, `avatarUrl`, `viewHelpers` (`clampRaiseTo`, `maskToButtons`, `quickRaiseOptions`, `formatChips`, `blindLevelLabel`, `positionLabel`, `formatCard`); shadcn `Slider`/`Button`/`Badge`.
- Produces: `useBoardReveal(board: number[], handNumber: number): { card: number; isNew: boolean }[]` — marks which board cards appeared since last render of this hand, so `Board` knows which to flip-animate; resets on `handNumber` change.

- [ ] **Step 1: Read `matchReducer.ts`, `Table.tsx`, `SeatView.tsx`, `ActionBar.tsx`, `Board.tsx`, `CardView.tsx`, `MatchClock.tsx` in full.** Inventory every rendered behavior (turn highlight, action badges, timebank display, sit-out state, dealer button, showdown reveals, waiting states). The restyle keeps all of it.

- [ ] **Step 2: `useBoardReveal` hook (small pure-ish presentation hook)**

```ts
import { useRef } from "react";

/** Marks board cards added since the previous render of the same hand (for flip animation). */
export function useBoardReveal(board: number[], handNumber: number) {
  const prev = useRef<{ hand: number; count: number }>({ hand: -1, count: 0 });
  const isNewHand = prev.current.hand !== handNumber;
  const prevCount = isNewHand ? 0 : prev.current.count;
  prev.current = { hand: handNumber, count: board.length };
  return board.map((card, i) => ({ card, isNew: i >= prevCount }));
}
```

- [ ] **Step 3: `GameScreen.tsx` — full-bleed layout with slim top bar**

Structure: `div.flex.h-screen.flex-col.bg-base` → top bar (`border-b border-edge bg-surface px-4 py-2 flex items-center gap-3`: `Logo size={22}` + wordmark, `Badge` with `Blinds: sb/bb` + `blindLevelLabel`, `MatchClock` inline, spacer, leave/`LogOut` icon button calling `onLeave`) → `Table` filling remaining space → bottom action dock (Step 6). `MatchOver` still short-circuits (Task 8 restyles it). Keep the `Waiting…` fallback and the error line (`text-danger`, centered).

- [ ] **Step 4: `Table.tsx` + `SeatView.tsx` — felt + seat cards**

Felt: centered ellipse `bg-[radial-gradient(ellipse_at_center,#0d3326,#071a13)]` with `rounded-[50%]`, inner shadow vignette (`shadow-[inset_0_0_80px_rgba(0,0,0,0.55)]`), thin `border border-emerald/15`. Seats absolutely positioned around it — keep the existing seat-position math if `Table.tsx` has it; otherwise position with a 6-entry percent table `[{left:"50%",top:"88%"} /* hero bottom-center */, {left:"18%",top:"75%"}, {left:"6%",top:"40%"}, {left:"35%",top:"8%"}, {left:"65%",top:"8%"}, {left:"94%",top:"40%"}]` rotated so the own seat is bottom-center (preserve however the current code identifies the hero seat).

`SeatView` card: `w-32 rounded-xl border bg-surface p-2 text-center` with `avatarUrl(seat.id)` (or bot glyph seed), name via existing `displayName` usage, `font-mono-num` stack. States, replacing the old CSS keyframes with Motion:

- Actor: emerald pulse ring — `motion.div` absolute inset ring `animate={{ boxShadow: ["0 0 0 0 rgba(47,217,135,0.5)", "0 0 0 8px rgba(47,217,135,0)"] }} transition={{ repeat: Infinity, duration: 1.2 }}` + `border-emerald`.
- Winner: gold glow (`shadow-[0_0_22px_rgba(232,195,90,0.7)] border-gold`) driven by whatever winner state `matchReducer` already exposes.
- Folded/sat-out: `opacity-50 grayscale`.
- Action badge (CHECK/CALL/RAISE/FOLD/ALL-IN pill above the seat, from existing reducer state): `motion.div initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}` — emerald pill for aggressive actions, neutral for check/call, danger for fold.
- Committed chips: pill between seat and pot (`font-mono-num text-xs bg-surface-2 border border-edge rounded-full px-2`), wrapped in `motion.div layoutId={"commit-" + seatIndex}`. When a street ends (`committedThisStreet` drops to 0), render the same `layoutId` element at the pot position so Motion animates the slide-to-pot.
- Dealer button: small white `D` chip on the seat corner, `motion.div layoutId="dealer-button"` so it glides between seats on hand change.

- [ ] **Step 5: `Board.tsx` + `CardView.tsx` — card flips and deals**

`CardView`: `h-20 w-14 rounded-lg bg-white text-black grid place-items-center border border-neutral-300 shadow-md`, rank large + suit symbol colored (hearts/diamonds red `#d33`, clubs/spades near-black), face-down variant `bg-surface-2 border-edge` with subtle ring emblem. Flip reveal (3D):

```tsx
<motion.div initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.35, ease: "easeOut" }} style={{ transformStyle: "preserve-3d" }}>
```

applied when `isNew` from `useBoardReveal`; existing cards render static. Board shows 5 slots (empty slots as dashed ghost outlines, as in the mockup). Hero hole cards: on new `handNumber`, `motion.div initial={{ y: -40, scale: 0.6, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }}` staggered 0.1s — the "dealt from the center" flight. Pot display: `TOTAL POT` mono-caps pill above the board, `motion.span` count animation on change (`key={potTotal}` fade-scale in is sufficient; no odometer dependency).

- [ ] **Step 6: `ActionBar.tsx` — bottom action dock**

Dock: fixed-height bar `border-t border-edge bg-surface/95 backdrop-blur px-4 py-3 flex items-end gap-4`, animated in with `motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}` whenever it mounts (it only renders on your turn — keep that).

Left panel (only when `buttons.raise`): label `Raise Amount` + mono readout of `raiseTo`; shadcn `Slider` `min={mask.minRaiseTo} max={mask.maxRaiseTo}` value clamped through `clampRaiseTo`; `−`/`+` stepper buttons adjusting by the big blind (from view `bb` prop — pass it in from `GameScreen`); preset row from `potPresets(mask, potTotal, currentBet)` (pass `potTotal` = sum of `view.pots` + street commitments, matching however the pot is totalled in Step 5 — compute once in `GameScreen` and pass down). Keep the existing new-hand/street slider-reset behavior.

Right: `Fold` (secondary/destructive-outline), `Check`/`Call {formatChips(callAmount)}` (secondary), `Raise / To {formatChips(raiseTo)}` (primary, emerald glow shadow) — enabled per `maskToButtons`, wired to the existing `onAction` payloads unchanged (raise sends raise-TO).

- [ ] **Step 7: Remove dead CSS, verify, commit**

Delete `seatActionPop`/`seatWinnerGlow` from `index.css` (now Motion-driven). Run: `npm run typecheck && npm test` — green.
Manual (required): `party/` + `client/` dev servers, play a full bot match. Verify: hole-card deal flight, flop/turn/river flips (and no flip on reconnect snapshot of an existing board — `useBoardReveal` treats first render of a hand's existing cards as new; acceptable, but confirm nothing visually breaks on mid-hand reload), chip slide at street end, dealer button glide, actor pulse, winner glow, action badges, raise slider + presets produce legal raises, timebank display intact.

```bash
git add -A client/src
git commit -m "feat(client): game table restyle with full animation suite"
```

---

### Task 8: MatchOver + final polish + full verification

**Files:**
- Modify: `client/src/game/MatchOver.tsx`, plus any straggler screens/components still on inline styles (`RatingBadge.tsx` if not already converted)
- Modify: `CLAUDE.md` (client conventions: Tailwind/shadcn/Motion stack note; clear the favicon TODO if the PNG landed)

**Interfaces:**
- Consumes: existing `MatchOver` props (`ownId`, `finishPlaceById`, `eloDeltas`, `onLeave`); shadcn `Dialog`/`Card`/`Button`.

- [ ] **Step 1: Restyle `MatchOver`**

Full-screen overlay (`fixed inset-0 bg-base/90 backdrop-blur grid place-items-center`), centered `Card` (max-w-md): `Match Over` title; standings list ordered by finish place with staggered entrance (`motion.div` per row, `delay: i * 0.12`), each row = place (gold `1st` with `text-gold` + subtle glow), avatar + display name (keep existing `displayName` usage), Elo delta right-aligned mono, tinted emerald/danger by sign, animated count-up:

```tsx
import { animate } from "motion";
// in an effect per row: animate(0, delta, { duration: 0.8, onUpdate: (v) => setShown(Math.round(v)) })
```

Own row highlighted `bg-emerald/10`. Primary `Button` `Back to Arena` → `onLeave`.

- [ ] **Step 2: Straggler sweep**

Grep `client/src` for `style={{` — every remaining inline-styled presentation block must either be converted to Tailwind classes or be a deliberate dynamic style (seat positioning percentages, motion transforms). Convert the rest (`RatingBadge`, loading screens in `App.tsx`, etc.).

- [ ] **Step 3: Update `CLAUDE.md`**

In the client conventions section add one line: client styling is Tailwind v4 tokens (`index.css @theme`) + shadcn/ui (`components/ui`, `@/` alias allowed there only) + `motion` with `MotionConfig reducedMotion="user"`. Update the favicon status in "Not yet done".

- [ ] **Step 4: Full verification (superpowers:verification-before-completion)**

- `npm run typecheck` — green.
- `npm test` — all suites green.
- `npm run lint` — green.
- `npm run build --workspace @poker/client` — builds.
- Playwright visual pass (via the playwright MCP tools) against local dev (`party/` wrangler dev + `client/` vite dev, dev token auth): screenshot auth, arena idle, arena queued, leaderboard (with a search query), profile, full-bot-match table mid-hand, raise panel open, match-over overlay. Check each screenshot against the spec's design language; fix regressions.
- Reduced-motion spot check: emulate `prefers-reduced-motion` in Playwright and confirm screens still render and transition.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(client): match-over restyle, polish sweep, CLAUDE.md update"
```

---

## Self-Review Notes

- Spec coverage: MCP install (T1), stack+tokens+fonts+favicon+branding (T2), pure helpers (T3), shell+auth (T4), arena (T5), leaderboard+profile (T6), table+dock+animations (T7), match-over+reduced-motion+verification (T8). Build order matches spec.
- Tasks 5–7 begin with "read the current file" steps because their existing render logic must be inventoried, not assumed — the plan mandates preserving all current behavior and names the behaviors to preserve.
- `potPresets` arithmetic in Task 3 is governed by its tests (650/1200 expectations); the implementation step explicitly tells the engineer to keep only the clean final version.
