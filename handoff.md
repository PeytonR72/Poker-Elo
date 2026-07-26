# PokerElo — Handoff

Read `CLAUDE.md` first (authoritative: golden rules, conventions, module maps, deployment URLs).

## Where things stand

Build Units 1–10 complete, plus two full client visual-overhaul rounds (round 1: design-system +
felt table + animation suite; round 2: phases 0–5, design-audit-driven polish). Unit 10 (this one)
is on branch `unit-10`, not yet merged to `master`. Gates green: `npm test` (245 tests / 41 files —
+21 tests / +2 files over Unit 9's 224 tests / 39 files), `npm run typecheck`, `npm run lint` (still literally clean), `npm run build
--workspace @poker/client` (main chunk 722.36 kB / 217.27 kB gz + a separate `GameScreen` chunk
49.94 kB / 17.78 kB gz — chunk-size warning persists on the main chunk, unchanged from Unit 9).

**What works, live in production (as of the Unit 9 merge — Unit 10 not yet deployed):**
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
  points here — gameplay works for remote users, not just local dev.
- Supabase: live project `wydnwnitnexifndwdsmg` (us-west-2), both migrations applied,
  `report-match` edge function ACTIVE.

**New in Unit 10 (spectator mode) — on the `unit-10` branch, not yet merged/deployed:**
- Anyone signed in can watch a live match without a seat. Spectators authenticate through the same
  JWT flow as players; the `spectate` flag rides on `hello` itself
  (`{ t: "hello", jwt, spectate?: boolean }`), decided atomically at auth time.
- Server (`party/src/matchRoom.ts`): a spectator connection never takes a seat, never affects
  matchmaking/bot-fill, holds no disconnect-grace timer or saved timebank. It always receives
  `redactFor(null, …)` views (never a seat-holder's) — see the new `spectator.ts` for the pure,
  unit-tested security-boundary logic. `spectatorCount` broadcasts to every connection on change.
- Lobby (`party/src/lobby.ts`): `MatchRoom` reports match start/end to an in-memory live-match
  registry (new `liveMatches.ts`, self-healing stale-entry expiry, unit-tested); clients request
  the current list via a `liveMatches` message.
- Client: `GameScreen` reuses one component for both roles via a `spectator?: boolean` prop (hides
  the action bar/waiting strip entirely, shows a SPECTATING pill + live count, never renders hero
  hole cards — already structurally guaranteed since the server never sends `seated`/`dealPrivate`
  to a spectator connection). New "Live Tables" module (`LiveTablesCard`) in the Arena's lower row
  lists live matches with a Watch button. `App.tsx`'s match state gained an optional `spectator`
  flag threaded through `Home` → `LobbyScreen` → `GameScreen`, preserving Unit 9's
  lazy/Suspense/PageTransition structure unchanged.
- Also fixed in this unit: a real seat-layout bug (mobile — and desktop — 6-max position arrays put
  3 opponents on the left and only 2 on the right, with two seats bunched at the top and no seat
  directly opposite the hero; `Table.tsx` now uses a proper symmetric hexagon), and the stale
  `client/.env` / `.env.example` `VITE_PARTYKIT_HOST` (was `localhost:1999`, now `localhost:8787` —
  see Unit 9's known-gaps note, now resolved).
- **A design lesson worth keeping:** the first spectator implementation deferred the role decision
  to a follow-up `{ t: "spectate" }` message, assuming `hello`'s auth step always yields to the
  event loop (`await verifyJwt`). That's false for dev tokens (`parseDevToken` is fully
  synchronous), so `hello` ran auth-through-seat-assignment in one tick with no window for the
  follow-up to land in time — the "spectator" got silently auto-seated as a real player, hole cards
  and all. The scripted `wrangler dev` integration check (2 players + 1 spectator) caught this
  immediately; a security boundary must never depend on message-arrival timing. Fixed by moving the
  decision onto `hello` itself, decided atomically regardless of whether auth happens to await
  anything.

**What doesn't work / known gaps:**
- Leaderboard's Friends and This Week tabs are UI-only (no backing data source) — intentionally
  scoped that way in round 2 rather than faking data.
- Local dev cannot exercise match persistence: `report-match` needs Supabase service-role secrets
  not present in `party/.dev.vars`, so ratings/history only accumulate against the production
  Supabase project. Read-side modules (leaderboard/profile) were verified locally against
  empty-state + unit tests only.
- No automated tests for `party/src/matchRoom.ts` / `lobby.ts` — `partyserver`'s `Server` class
  cannot load under plain Node/Vitest (see `CLAUDE.md` Unit 8 notes). Verified via `wrangler dev`
  integration checks + careful diff review instead; the new spectator/live-match *decision logic*
  is pulled into plain, unit-tested functions (`spectator.ts`, `liveMatches.ts`) specifically so it
  doesn't share that blind spot.
- The main JS chunk (~722 kB / 217 kB gz) is still above Vite's 500 kB warning threshold even after
  lazy-loading `GameScreen` in Unit 9 — the rest is framework/library weight (`motion`,
  `radix-ui`, `@supabase/supabase-js`, `lucide-react`) used across every screen. Further splitting
  would need `manualChunks` work across multiple screens.
- **Unit 10's manual two-browser spectate check is not done.** Even on `localhost`, reaching a
  signed-in session still requires real Supabase auth (only the JWT sent to the party server swaps
  to `dev:<id>`) — sign-up/sign-in itself always goes through production Supabase, and email
  confirmation is ON, so a throwaway signup can't get a session without confirming a real inbox.
  No existing test credentials were available in-session, so this was deferred to the user: open a
  bot match in one browser, spectate it from a second signed-in browser via Live Tables, after
  deploy. The security-critical behavior (no hole-card leak, correct spectator count both ways,
  disconnect-grace unaffected) was instead verified rigorously via the scripted `wrangler dev`
  integration check described above.
- `party/` (the Cloudflare Worker) has NOT been deployed with Unit 10's changes yet — deploying it
  requires `wrangler deploy` with either an interactive login or a `CLOUDFLARE_API_TOKEN`, neither
  of which was available in this non-interactive session. Run `npm run deploy` inside `party/`
  yourself (or provide a `CLOUDFLARE_API_TOKEN`) once this branch is merged.

## Environment facts

- `client/.env` (gitignored): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PARTYKIT_HOST`
  (now correctly `localhost:8787` for local `wrangler dev`, fixed in Unit 10; production Vercel env
  points at `party.pokerelo.us`).
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
  instead of going silent. This is also why the Unit 10 manual spectate check needs real
  credentials rather than a throwaway signup (see known gaps above).

## Known bugs

None outstanding beyond the deferred manual verification noted above. The round-2 close-out
(`31dfaf0`) fixed the last-found visual/UX issues (mobile sheet not closing on nav, unclickable
close button, stale lobby errors not clearing on reconnect, a stuck-blank-frame page-transition
bug, a spring-leak in stack CountUp animations, a `forwardRef` bug class across several shadcn
primitives); Unit 10 fixed the asymmetric 6-max seat layout (see above).

## Deferred minors

- Further bundle splitting (`manualChunks` for `motion`/`radix-ui`/`@supabase/supabase-js`) if the
  500 kB main-chunk warning needs to actually clear.
- Unit 10's manual two-browser spectate verification (needs real Supabase test accounts).
- Deploy `party/`'s Unit 10 changes (`npm run deploy` inside `party/`, needs Cloudflare
  credentials this session didn't have).

## Next options

1. **Leaderboard Friends tab** — needs a friends/social data model; currently just a branded
   coming-soon panel.
2. **Further bundle splitting** — `GameScreen` is already lazy-loaded (Unit 9); shrinking the
   remaining ~722 kB main chunk needs `manualChunks` across shared libraries.
3. **Private tables / room codes** — `shared/src/roomCode.ts` already exists for it; explicitly
   scoped out of Unit 10.
4. **Reconnect UX** beyond the existing disconnect-grace bot-fill; additional match formats;
   hand-history (`GameEvent`) persistence.

## Process

`superpowers` skills: `brainstorming` → `subagent-driven-development` (branch off `master` first)
→ `finishing-a-development-branch`. Scout TDD / systematic-debugging /
verification-before-completion each turn. Keep `CLAUDE.md` updated as things land.
