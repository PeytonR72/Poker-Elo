# PokerElo Visual Assets (Phase 3)

Every asset here is CC0 / public-domain / MIT, or built from scratch in this repo.
All card faces, chips, buttons, decor, and the tier ring are **authored in-repo as
parametric SVG React components** — no third-party binary or SVG files are shipped.

## Playing cards — BUILT (parametric), not fetched

**Source investigated:** [`notpeter/Vector-Playing-Cards`](https://github.com/notpeter/Vector-Playing-Cards)
— **License: Public Domain** (original art by Byron Knoll; repo offers WTFPL where
public domain isn't recognized). Deck lives in `cards-svg/` with names like `AS.svg`,
`KS.svg`, `10H.svg`.

**Decision: build faces programmatically instead of shipping the fetched deck.**
Investigated the raw files directly:

| File | Size |
|---|---|
| `AS.svg` (ace, mostly pips) | ~24 KB |
| `KS.svg` (king, full art) | ~410 KB |
| `QS.svg` (queen, full art) | ~436 KB |
| `JS.svg` (jack, full art) | ~702 KB |

The court cards are full antique illustrations (400–700 KB each → the full deck is
~15 MB of path data). That is far too heavy for the bundle even after SVGO, and the
ornate Victorian look is stylistically wrong for the dark, index-focused premium
aesthetic. So the deck was **rebuilt from scratch, data-driven**: one parametric
`<PlayingCard>` lays out every one of the 52 faces from a rank/suit + pip-layout
table. This adds ~0 per-card weight to the JS bundle (no 52 inline components).

Because nothing static is shipped, **SVGO does not apply** — the four suit path
strings were hand-authored compactly (`client/src/assets/cards/suits.ts`).

**Restyle applied (vs. any stock look):**
- Off-white face `#f2f0e9` (not pure white), unified 9px corner radius, thin warm
  border `#d7d2c4`.
- Near-black spades/clubs `#1a1f26`; deep-red hearts/diamonds `#c23b3b` (both chosen
  to read on the off-white face).
- Corner index = large rank (Space Grotesk) over a mini suit glyph, mirrored to the
  bottom-right — reads at ~64–90px.
- Number cards 2–10: traditional French-deck pip layouts (bottom-half pips rotated
  180°, like real decks). Ace: one large center pip. Courts J/Q/K: large typographic
  letter in a thin suit-tinted inner frame with framing suit glyphs.
- **Card back built from scratch:** surface-2 panel `#1a222b` with a crisp
  1.8px emerald-dim border, a fine emerald diagonal lattice (~18% opacity), and
  a centered ring-and-spade emblem (~40% opacity) on a darker puck so it stays
  identifiable at muck size (~56px). Matches `client/src/shell/Logo.tsx`.

## Chips / dealer button / decor / tier ring — BUILT from scratch

All authored as SVG React components in this repo; no external source. Colors come
from the Phase-1 palette (emerald `#2fd987`, gold `#e8c35a`, danger red, near-black).
Chip denomination colors are visual design constants (not poker game constants), so
they live in the component, not `@poker/shared`.

## Files added

| File | Role / API |
|---|---|
| `client/src/assets/cards/suits.ts` | Suit path data, colors, `suitColor`, `rankLabel`, `COURTS`; `Rank`/`Suit` types |
| `client/src/assets/cards/pips.ts` | `PIP_LAYOUTS` (2–10), `colX`, `Pip` type |
| `client/src/assets/cards/cardMap.ts` | `cardIntToProps(c)` — engine int `0..51` → `{rank,suit}`; `CardProps` |
| `client/src/assets/cards/cardMap.test.ts` | Unit tests (52-card round-trip, range guards) |
| `client/src/components/playing-card.tsx` | `<PlayingCard rank suit faceDown? className? />` (viewBox 100×140) |
| `client/src/components/chip-math.ts` | `chipBreakdown`, `visibleDiscs`, `CHIP_DENOMS` (pure) |
| `client/src/components/chip-math.test.ts` | Unit tests (greedy breakdown, value conservation, capping) |
| `client/src/components/poker-chip.tsx` | `<PokerChip value size? />`, `<ChipStack amount max? size? />` |
| `client/src/components/dealer-button.tsx` | `<DealerButton size? />` — off-white embossed "D" disc |
| `client/src/components/tier-avatar.tsx` | `<TierAvatar seed rating?|tier? name? size? />` + `ringForTier` |
| `client/src/assets/decor/SpadeWatermark.tsx` | `<SpadeWatermark size? opacity? />` — ring-and-spade watermark |
| `client/src/assets/decor/DotGrid.tsx` | `<DotGrid gap? radius? />` — tiling dot-pattern panel bg |
| `client/src/assets/decor/EmptyStates.tsx` | `<EmptyLeaderboard/>`, `<NoMatches/>`, `<GenericError/>` line icons |
| `client/src/assets/decor/index.ts` | Barrel re-export for the decor set |

## Integration notes for Phase 4

- Render engine cards directly: `<PlayingCard {...cardIntToProps(cardInt)} />`.
  Mapping honors `rank = c % 13`, `suit = (c/13)|0`, with `RANKS`/`SUITS` from
  `@poker/shared` — no hardcoded ordering.
- `<PlayingCard faceDown />` draws the custom emerald back.
- Chip colors: 5 = red, 25 = emerald, 100 = near-black w/ emerald edge, 500 = gold;
  any other value falls back to a neutral disc.
- `<TierAvatar>` derives the ring color from rating via `RANK_TIERS`/`rankForRating`
  (Fish → neutral … Final Tablist → gold) and falls back to initials on an emerald
  gradient (Phase-2 `Avatar`/`AvatarFallback` primitives) when the image fails.
- All components take `className` and merge via `cn`; SVGs use CSS palette vars
  (e.g. `var(--color-emerald)`) so they stay theme-consistent.

## Verification

- `npm run typecheck` — clean.
- `npm test` — 163 passed (adds `cardMap.test.ts` + `chip-math.test.ts`).
- `npm run lint` — 440 problems (unchanged party/ baseline); **0** from new files.
