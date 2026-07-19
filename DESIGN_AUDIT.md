# PokerElo Design Audit — Round 2 (2026-07-17, resolved 2026-07-18)

Audited live at 1440×900 and 390×844 via Playwright against the running app.
Round-2 overhaul executed on branch `visual-overhaul-r2` (phases 0–5). Status
legend: ☑ resolved · ◐ partially/deferred (noted).

## Cross-cutting

- ☑ **Space Grotesk** self-hosted via fontsource, driving `.text-display/h1/h2` + card indices.
- ☑ **Token layer**: 5 surface elevations, emerald scale (tint/dim/hover), glow + elevation shadow tokens, semantic dims, felt trio, radius scale.
- ☑ **Flat black voids** killed: noise + vignette on shell/auth, watermarks + dot grids on panels, module grids fill lower regions.
- ☑ Page transitions (enter-only keyed remounts — a `mode="wait"` variant shipped a stuck-enter blank frame and was replaced), sonner toasts, skeletons on all async surfaces.
- ☑ `forwardRef` bug class eliminated: Button (P1), Badge (P4c), SheetOverlay/DialogOverlay (P5 sweep).
- ☑ Stale lobby errors cleared on reconnect + any subsequent server message (`connected` action; reducer tested).
- ☑ shadcn set completed (avatar/tabs/tooltip/skeleton/dropdown-menu/scroll-area/progress/sonner), all restyled to tokens.

## Auth

- ☑ Labeled inputs, password show/hide, submit spinner, error shake retained.
- ☑ Confirmation-pending signup now shows a "Check your email" success panel (was silent). Advisory: Supabase's anti-enumeration response makes "existing confirmed email" indistinguishable without inspecting `identities` — documented trade-off in `useSession.ts`.

## Arena / Play Now

- ☑ Felt-textured hero card, animated ring-and-spade emblem (idle/queueing states), segmented format control with sliding indicator + MATCH_FORMATS tooltips.
- ☑ Queue state machine: Idle → Searching (radar rings, elapsed clock, position, bot ETA, cancel) → match-found takeover ceremony (~2s, skipped under reduced motion) → table.
- ☑ Lower modules: Recent Matches strip, Rating Progress sparkline, Current Tier progress card; StatCards got icons + CountUp.
- ☑ Mobile overflow fixed (`overflow-hidden` on hero; normal-flow heading).

## Leaderboard

- ☑ Real table: top-3 medallions (shine, reduced-motion aware), tier avatars, tier badges, mono ratings, Games/Win% columns (real `match_results` wins — no fabricated deltas), sticky header, hover wash, own-row pin.
- ☑ Global/Friends/This Week tabs (Friends + This Week are branded coming-soon panels; no data source yet).
- ☑ Empty state: illustration + copy + "Find a Match" CTA (wired to Play tab); skeleton rows; error + retry.

## Profile

- ☑ 96px tier-ringed avatar, display-type name, rating CountUp, tier tooltip, rating sparkline.
- ☑ Six icon StatCards incl. Win Rate + Current Streak (pure `buildProfile` extensions, tested).
- ☑ Expandable match-history cards (placement/delta/format/duration detail — final-hand data isn't stored server-side, so no fake hand rows).
- ☑ Tier-ladder visual of all RANK_TIERS with current highlighted.

## Poker Table

- ☑ Layered felt (wood rail ring, radial felt-hi→felt-2 gradient, rim inner shadow, fabric noise, centered watermark), seats on a true ellipse, hero bottom-center.
- ☑ Parametric SVG deck everywhere; deal fly-in + hero flip, staggered street flips, muck slide on fold, showdown hand-name banner (client-side `evaluate7`).
- ☑ Chip stacks for bets gliding to a CountUp pot pill; winner glow pulse; no confetti.
- ☑ Seat pods: tier avatars, CountUp stacks (integer-rounded at every animation frame — spring leak fixed), position/action tags, draining timebank ring (true duration fraction — reconnect renders partial), fold desaturation, all-in gold.
- ☑ Glass action bar: Fold/Call/Raise with F/C/R/Enter hotkeys + kbd chips, Min/⅓/½/Pot/Max presets (⅓ dedupes into Min when pot is small), compact slider, slim waiting strip when idle.
- ☑ Amber match clock pulse under 1:00; hero username via profiles lookup (was raw UUID).
- ☑ **Mobile fully usable**: portrait ellipse, compact pods, bottom-sheet action bar (44px targets, safe-area inset), no clipping/overflow at 390px.

## Match Over

- ☑ Standings with trophy/deltas/own-row highlight verified live at end of a real rapid match; rating-delta toast wired (fires once).

## QA notes (Phase 5)

- Production build passes; bundle 767 kB (231 kB gz) — chunk-size warning; code-splitting (lazy-load GameScreen) is a reasonable follow-up, not blocking.
- Reduced motion verified via emulation: zero long-running animations on the shell.
- Local-dev caveat: match persistence (`report-match`) requires Supabase service secrets not present in local `.dev.vars`, so ratings/history only accumulate in production — the read-side modules were verified against empty states + unit tests locally.
- Mobile sheet defects (didn't close on nav; X unclickable) found in QA and fixed in the Phase 5 batch.
