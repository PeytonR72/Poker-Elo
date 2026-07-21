# PokerElo — Handoff

Read `CLAUDE.md` first (authoritative: golden rules, conventions, module maps, deployment URLs).

## Where things stand

Build Units 1–9 complete, plus two full client visual-overhaul rounds (round 1: design-system +
felt table + animation suite; round 2: phases 0–5, design-audit-driven polish). All merged to
`master`. Gates green: `npm test` (224 tests / 39 files — +3 over the prior 221 from Unit 9's
`verifyJwt` ES256/JWKS offline success-path tests), `npm run typecheck`, `npm run build
--workspace @poker/client` (main chunk 719.75 kB / 216.52 kB gz + a separate `GameScreen` chunk
49.91 kB / 17.90 kB gz — chunk-size warning persists on the main chunk, see Unit 9 notes below).
`npm run lint` is now **literally clean** — zero errors, zero warnings (`eslint.config.js` now
ignores `**/.wrangler/**`, so the `party/.wrangler/tmp/` generated-bundle noise no longer shows
up at all).

**What works, live in production:**
- Client: https://poker-elo.vercel.app (Vercel). Full app: auth (sign-in/up, "check your email"
  confirmation panel, error shake), sidebar shell (`AppShell`) with mobile sheet nav, Play/Arena
  (queue with radar animation, match-found ceremony, recent matches / rating sparkline / tier
  progress modules), Leaderboard (real top-3 medallions, Games/Win% columns, Global/Friends/This
  Week tabs — Friends + This Week are branded coming-soon panels, no data source), Profile
  (tier-ringed avatar, sparkline, 6 stat cards, expandable match history, tier ladder), the felt
  game table (parametric SVG deck, deal/flip/muck animations, chip-to-pot glide, timebank ring,
  glass action bar with hotkeys + pot presets, mobile bottom-sheet action bar), Match Over
  (standings, Elo-delta toast). Design: Tailwind v4 tokens (5 surface elevations, emerald scale,
  felt trio) + shadcn/ui + Space Grotesk/Inter/JetBrains Mono (self-hosted via fontsource) +
  Framer Motion, `MotionConfig reducedMotion="user"` verified end to end.
- Game server: `party.pokerelo.us`, cloud-prem on the user's own Cloudflare account (Workers Free
  plan, `partyserver` + `wrangler`, SQLite-backed Durable Objects). `VITE_PARTYKIT_HOST` on Vercel
  points here — **gameplay works for remote users, not just local dev.**
- Supabase: live project `wydnwnitnexifndwdsmg` (us-west-2), both migrations applied,
  `report-match` edge function ACTIVE.

**What doesn't work / known gaps:**
- Leaderboard's Friends and This Week tabs are UI-only (no backing data source) — intentionally
  scoped that way in round 2 rather than faking data.
- Local dev cannot exercise match persistence: `report-match` needs Supabase service-role secrets
  not present in `party/.dev.vars`, so ratings/history only accumulate against the production
  Supabase project. Read-side modules (leaderboard/profile) were verified locally against
  empty-state + unit tests only.
- No automated tests for `party/src/matchRoom.ts` / `lobby.ts` — `partyserver`'s `Server` class
  cannot load under plain Node/Vitest (see `CLAUDE.md` Unit 8 notes). Verified via `wrangler dev`
  integration checks + careful diff review instead.
- The main JS chunk (719.75 kB / 216.52 kB gz) is still above Vite's 500 kB warning threshold even
  after lazy-loading `GameScreen` in Unit 9 — `GameScreen`'s own code was only ~50 kB of the
  original 767 kB bundle; the rest is framework/library weight (`motion`, `radix-ui`,
  `@supabase/supabase-js`, `lucide-react`) used across every screen, not attributable to the game
  screen specifically. Further splitting would need `manualChunks` work across multiple screens,
  out of Unit 9's scope.
- `client/.env`'s `VITE_PARTYKIT_HOST` (and `.env.example`) still say `localhost:1999`, a
  leftover from the pre-Unit-8 `partykit` CLI era. Local `wrangler dev` (party's actual dev
  server since Unit 8) listens on `localhost:8787` by default — the env value needs updating to
  `localhost:8787` for local dev to actually reach the party server. Discovered during Unit 9's
  manual browser verification of the `GameScreen` code-split; not fixed as it's outside that
  task's scope.

## Environment facts

- `client/.env` (gitignored): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PARTYKIT_HOST`
  (should be `localhost:8787` for local `wrangler dev`, see known-gaps note on the stale `:1999`
  value; production Vercel env points at `party.pokerelo.us`).
- `party/.dev.vars` (gitignored): `DEV_TOKENS=true` + Supabase vars for local `wrangler dev`.
  `DEV_TOKENS` is intentionally never set in the deployed production secrets.
- Supabase CLI authenticated (linked project; `npx supabase db push/db query --linked` reach the
  live DB — see memory `project-supabase-cli`).
- Vercel project: `peytonr7272-gmailcoms-projects/client`, linked at repo root
  (`.vercel/project.json`). Client build command from repo root:
  `npm run build --workspace @poker/client`, output `client/dist`.
- `party/` secrets (`SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) set via
  `wrangler secret put` against the live Cloudflare Worker.
- Email confirmation is **ON** in Supabase Auth; signup now surfaces a "check your email" panel
  instead of going silent.

## Known bugs

None outstanding as of the round-2 close-out (`31dfaf0` — QA fix batch + audit close-out fixed the
last-found issues: mobile sheet not closing on nav, unclickable close button, stale lobby errors
not clearing on reconnect, a stuck-blank-frame page-transition bug, a spring-leak in stack CountUp
animations, and a `forwardRef` bug class across several shadcn primitives).

## Deferred minors

- Fix `client/.env` / `.env.example`'s stale `VITE_PARTYKIT_HOST=localhost:1999` to
  `localhost:8787` (see known gaps above).
- Further bundle splitting (`manualChunks` for `motion`/`radix-ui`/`@supabase/supabase-js`) if the
  500 kB main-chunk warning needs to actually clear.

## Next options

1. **Leaderboard Friends tab** — needs a friends/social data model; currently just a branded
   coming-soon panel.
2. **Further bundle splitting** — `GameScreen` is already lazy-loaded (Unit 9); shrinking the
   remaining ~720 kB main chunk needs `manualChunks` across shared libraries.
3. **New gameplay features** — spectator mode (`redactFor(null, …)` already supports the shape),
   reconnect UX beyond the existing disconnect-grace bot-fill, additional match formats.

## Process

`superpowers` skills: `brainstorming` → `subagent-driven-development` (branch off `master` first)
→ `finishing-a-development-branch`. Scout TDD / systematic-debugging /
verification-before-completion each turn. Keep `CLAUDE.md` updated as things land.
