# PokerElo Visual Overhaul — Design Spec

Date: 2026-07-14
Status: Approved approach (A — big-bang restyle in place)

## Goal

Full visual overhaul of the `client/` React SPA to match the approved art direction
(Google Stitch mockups + Dribbble inspiration + PokerElo spade branding): dark
charcoal fintech-style surfaces, emerald accent, mono-caps stat labels, persistent
sidebar shell, felt-table game screen, and smooth animations throughout.

**Reskin real features only.** No placeholder nav items (Hand History, Training,
Shop), no fake stats (bankroll $, win-rate %, achievements, session timer). Only
data we actually have (profiles, matches, match_results) is surfaced.

## Non-goals / invariants

- No changes to `shared/` engine, `party/` server, protocol, or Supabase schema.
- All pure cores (`matchReducer`, `lobbyReducer`, `viewHelpers`, `data/*`) and
  their tests remain untouched and green (138 tests).
- No router added; navigation stays local component state.
- Raise semantics stay raise-TO via existing `clampRaiseTo`/`maskToButtons`.
- Dev-host gating, auth flow, socket hooks unchanged.

## Stack changes (client workspace only)

- **Tailwind CSS** (v4) + **shadcn/ui** components (new `client/src/components/ui/`).
- **Framer Motion** (`motion`) for all animation.
- **lucide-react** icons (ships with shadcn).
- **DiceBear** (or equivalent free avatar API/library) for player avatars.
- Fonts: Inter (UI) + JetBrains Mono (numbers/labels) linked from `index.html`
  (never CSS imports from `.tsx`, per repo convention).

## Tooling / MCP setup (first implementation task, automated)

Claude installs the MCP servers for this project automatically at the start of
implementation:

1. **shadcn MCP** — `claude mcp add --transport http shadcn https://www.shadcn.io/api/mcp`
   or the official registry MCP per https://ui.shadcn.com/docs/mcp (use current
   docs at implementation time; project scope, `.mcp.json`).
2. **21st.dev Magic MCP** — per https://github.com/21st-dev/magic-mcp
   (`npx @21st-dev/cli@latest install claude` or `claude mcp add` equivalent;
   requires a 21st.dev API key — if no key is available, skip gracefully and
   proceed with the shadcn CLI/registry + ui-ux-pro-max plugin instead).

If either install fails or needs interactive auth, note it, fall back to the
shadcn CLI (`npx shadcn@latest add <component>`), and continue — MCP servers are
accelerators, not blockers.

Implementation is guided by the **frontend-design** skill and the
**ui-ux-pro-max** plugin (design tokens, styling, shadcn integration).

## Design language & tokens

- **Palette (CSS variables in `index.css`, mapped into Tailwind theme):**
  - Base `#0a0e12`; surfaces `#12181f` / `#1a222b`; hairline borders `#232d38`.
  - Primary emerald `#2fd987` (hover `#4ce3a0`) with glow shadow on CTAs.
  - Gold accent for winners / rank 1; red only for fold/danger.
  - Felt: radial deep-green gradient `#0d3326 → #071a13` with inner vignette.
- **Type:** Inter for UI; JetBrains Mono for chip counts, timers, ratings, and
  ALL-CAPS stat labels (`WIN RATE`-style card headers).
- **Branding:** spade-in-emerald-ring PNG → `client/public/favicon.png` +
  sidebar logo; update `index.html` favicon link (closes existing CLAUDE.md TODO).

## App shell

New `client/src/shell/AppShell.tsx`:

- Fixed left sidebar: logo + "Poker**Elo**" wordmark; mini profile card (avatar,
  username, tier | rating); glowing **Find Match** CTA; nav (Play / Leaderboard /
  Profile, lucide icons, active = emerald left rail + tint); footer Sign Out.
- Content area renders active screen. Nav state stays local (evolved `Home.tsx`).
- `GameScreen` renders full-bleed outside the shell with a slim top bar
  (logo, blinds chip, leave button).
- Mobile: sidebar collapses to top bar + shadcn `Sheet`.

## Screens

- **Auth:** centered card, dark radial-glow backdrop, spade logo, shadcn
  inputs/buttons, error shake, fade-up entrance.
- **Arena (Play/lobby):** big centered "Searching for match…" panel with pulsing
  radar ring while queued, online-count dot, glowing Find Match button + format
  chip, Cancel Search. Below: real stat cards only (rating, tier, matches played)
  in mono-caps card style.
- **Game table:** felt oval + vignette; seat cards with avatar, name, mono stack,
  dealer button; emerald pulse ring on actor; gold winner glow; action badges pop.
  Community cards flip per street; hole cards fly from center with flip; bet pills
  slide to pot at street end; pot pushes to winner. Bottom dock: raise panel
  (slider, −/+ steppers, Min/½ Pot/Pot/Max presets, mono readout) + Fold/Call/
  Raise-To buttons. All raise math via existing tested `viewHelpers`.
- **Leaderboard:** shadcn table, medal styling top 3, avatar + name, emerald mono
  ratings, own-row highlight, staggered row entrance. Search input filters the
  loaded top-100 client-side. Columns: rank, player, rating, tier only.
- **Profile:** hero (large avatar in tier-colored frame, username, global rank,
  tier chip); real stat cards (rating, matches played, best finish, avg finish
  from `match_results`); Recent Activity = restyled match history with delta
  arrows + relative times.
- **MatchOver:** modal overlay, staggered standings reveal, Elo delta count-up,
  gold treatment for 1st.

## Animation system

- Framer Motion: `AnimatePresence` screen transitions (fade + 8px rise),
  `layout` animations for pot/seat changes, spring chip/card flights keyed off
  `GameEvent`s already produced by `matchReducer` — no new server messages.
- Animation triggers derive from state diffs in thin presentation hooks
  (e.g. `useDealtCards`); reducers stay pure.
- `prefers-reduced-motion` degrades everything to simple fades.

## Verification

- `npm run typecheck` and `npm test` green throughout (no test changes expected).
- Playwright visual pass over every screen against local dev
  (`npm run dev` in `client/` + `party/`), including a full bot match to exercise
  table animations.

## Build order (for the implementation plan)

1. MCP server install + Tailwind/shadcn/Motion scaffolding + tokens + fonts + favicon.
2. AppShell + Auth.
3. Arena/queue.
4. Leaderboard + Profile.
5. Game table + action dock + animation suite.
6. MatchOver + final polish + full verification pass.
