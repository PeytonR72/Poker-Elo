# PokerElo — Handoff for Build Unit 7+

Read `CLAUDE.md` first (authoritative: golden rules, conventions, module maps, deployment URLs).

## Where things stand

Build Units 1–6 complete, merged to `master`, pushed to https://github.com/PeytonR72/Poker-Elo.
All gates green: `npm test` (231), `npm run typecheck`, `npm run lint`, `npm run build --workspace @poker/client`.

**What works live:**
- Client: https://client-coral-eight-91.vercel.app — auth, Home (Play/Leaderboard/Profile tabs), Leaderboard, Profile. All Supabase-backed screens verified against the live project (`wydnwnitnexifndwdsmg`, us-west-2).
- Supabase: both migrations applied, `report-match` edge function ACTIVE.
- PartyKit local dev: `npx partykit dev` works on Windows (patch-package fix in `patches/partykit+0.0.108.patch`).

**What doesn't work yet:**
- **Gameplay requires local PartyKit** (`npx partykit dev`, port 1999). The Play tab / matchmaking / game loop will not function for remote users until PartyKit is cloud-hosted. `VITE_PARTYKIT_HOST` on Vercel is currently `localhost:1999`.
- PartyKit cloud hosting was blocked by a platform-level Cloudflare domain limit on partykit.dev. The recommended path is **Cloudflare Workers Paid ($5/mo)** — `npx partykit deploy` is one command once a Cloudflare account is upgraded. All three required secrets (`SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) are already set in PartyKit Cloud via `partykit env add`. After deploy: update `VITE_PARTYKIT_HOST` in Vercel to the returned `*.partykit.dev` host and redeploy client.

## Environment facts

- `client/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PARTYKIT_HOST=localhost:1999` (local dev only, gitignored).
- Root `.env`: `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (for `npx partykit dev`, gitignored).
- Supabase CLI authenticated (token in Windows Credential Manager `Supabase CLI:supabase`).
- Vercel project: `peytonr7272-gmailcoms-projects/client`, linked at repo root (`.vercel/project.json`).
- PartyKit authenticated as `peytonr72` (clerk).
- `npx partykit dev` → http://localhost:1999. `npx partykit deploy` → blocked (see above).
- Email confirmation is **ON** in Supabase Auth. To test signup: PATCH `mailer_autoconfirm: true` via management API, test, revert to `false`, delete test rows.

## Known bugs

None outstanding. Unit 7 fixed all known bugs.

## Deferred minors

All previously listed minors resolved in Unit 7. One remaining item:
- Favicon is an SVG placeholder (`client/public/favicon.svg`). Drop the real PNG as `client/public/favicon.png` and update the `<link>` in `client/index.html` to `type="image/png" href="/favicon.png"`.

## Next options

1. **PartyKit cloud hosting** — upgrade Cloudflare account, run `npx partykit deploy`, update Vercel env. One-command deploy; all secrets already set.
2. **Client polish + reconnect/spectator** — reconnect indicator, spectator view (`redactFor(null, …)` already supports it), action-log/animations from `GameEvent`s.
3. **Burn down deferred minors** — small, isolated fixes listed above.

## Process

`superpowers` skills: `brainstorming` → `subagent-driven-development` (branch off `master` first) → `finishing-a-development-branch`. Scout TDD / systematic-debugging / verification-before-completion each turn. Keep `CLAUDE.md` updated as things land.
