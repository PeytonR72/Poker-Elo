# PokerElo Design Audit — Round 2 (2026-07-17)

Audited live at 1440×900 and 390×844 via Playwright against the running app
(local `wrangler dev` + Vite). Screenshots: `audit-*.png` at repo root (temporary,
delete after the overhaul). Status legend: ☐ open · ☑ resolved.

## Cross-cutting

- ☐ **No Space Grotesk.** Locked identity requires it for display/headings; app currently uses Inter for everything (JetBrains Mono for stats is present and good).
- ☐ **Token layer is minimal**: 3 surface levels (`base`/`surface`/`surface-2`) + 1 edge color. No overlay elevation, no emerald scale (single hex + hover), no glow/shadow tokens, no noise/texture assets.
- ☐ **Flat black voids.** Every page has large regions of untouched `#0a0e12`. No grain, no vignette discipline (auth has one radial gradient; nothing else does), no watermarks.
- ☐ **No page transitions, no toasts, no skeletons anywhere.** Async states are text sentences.
- ☐ **Console defect:** `Function components cannot be given refs` — `Button` lacks `forwardRef`, breaks `SheetTrigger asChild` (AppShell mobile sheet). Must fix when systematizing shadcn.
- ☐ **Stale lobby errors persist**: `auth_failed` / "Can't reach the game server" banners survive reconnect because the reducer only clears errors on the *next* message and a successful hello sends nothing. Reads as broken even when healthy.
- ☐ shadcn set incomplete: missing avatar, tabs, tooltip, skeleton, dropdown-menu, scroll-area, progress, sonner.

## Auth (audit-01)

- ☐ Competent but anonymous: default-looking card, placeholder-only inputs (no labels), no brand texture. The one screen with a vignette.
- ☐ No loading state styling on submit beyond `disabled`; error is a bare red sentence (does shake — good instinct).
- ☐ Sign-up success with email-confirmation pending gives **zero feedback** — the form just sits there (observed live; looks broken).

## Arena / Play Now (audit-03b, 06)

- ☐ ~70% of the viewport is empty black below the stat row.
- ☐ Hero card: flat `surface` rectangle — no felt texture, no animated emblem (static logo in a circle), format pills are unstyled chips with no blind/duration info, no tooltips.
- ☐ StatCards: no icons, no hover, no count-up; labels styled okay (mono + letter-spacing is the right instinct — systematize).
- ☐ Queue searching state: single thin pulse ring + three text lines; no radar animation, no elapsed timer, ETA buried in prose. Match-found has **no moment at all** — instant cut to the table.
- ☐ No Recent Matches strip, no rating sparkline, no tier-progress card.
- ☐ Mobile (audit-10): horizontal overflow scrollbar; "Arena" heading clipped at left edge.

## Leaderboard (audit-04)

- ☐ Empty state is a bare sentence on black — the exact anti-pattern. No watermark, no CTA.
- ☐ No table structure at all yet (no rank medallions, tier badges, deltas, win-rate columns, sticky header, pinned own-row).
- ☐ No filter tabs, no skeleton rows while loading.

## Profile (audit-05)

- ☐ Header is small; avatar ring exists (good) but no tier tooltip, no sparkline.
- ☐ Stat row: five flat StatCards, em-dashes for empty values, no icons, no Win Rate / Streak.
- ☐ Recent Activity empty state: bare sentence. No match-history cards, no tier-ladder visual. ~65% of page is void.

## Poker Table (audit-07, 08) — the money screen

- ☐ **Felt is a plain green radial ellipse** — no layered gradient, no fabric noise, no inner-shadow rail, no wood ring, no center watermark.
- ☐ **Cards are plain white rounded rects** with a letter + suit glyph; card backs are dark rects with a ring outline. No real SVG deck, no custom back design.
- ☐ Bets are tiny number pills; **no chips anywhere**. Pot is a text pill ("TOTAL POT: 70").
- ☐ Dealer button: plain white "D" circle.
- ☐ Seat pods: functional (position tag, action tag, stack, active glow, folded dim all exist) but boxy; **no timebank arc** around the player to act; stack changes don't animate.
- ☐ **No deal/flip/chip animations observed** — cards and board pop into place; street reveals are instant; no winner celebration or chip cascade.
- ☐ **Hero name renders the raw user-ID prefix** (`a557a10d (you)`) instead of the username — server roster knows only IDs; display bug, must resolve via profiles/displayName.
- ☐ Action bar: full-width dark strip with an always-visible raise slider — not a floating glass panel; presets exist (Min/½ Pot/Pot/Max — good) but no ⅓ preset, no large readout, no hotkey hints, no keyboard support; "Waiting…" idle bar wastes the whole strip.
- ☐ Header: blinds/timer pills exist but plain; no amber under-1:00 warning treatment observed.
- ☐ Showdown: opponent cards flip up with a glow (observed) but no hand-name banner, no muck animation, no winner highlight of the five cards.
- ☐ **Mobile (audit-09) is unusable**: seats clipped off both screen edges, header truncated, action-bar buttons cut off ("Cal"), overlapping pods.

## Match Over (from code, not screenshotted — match length gate)

- ☐ Restyled in Round 1; re-verify against new tokens in Phase 5; add rating count-up + toast.
