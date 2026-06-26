# PokerElo — Handoff for Build Unit 6

Read `CLAUDE.md` first (authoritative: golden rules, conventions, module maps). This file is the
orientation layer: where things stand and how to start Unit 6.

## Where things stand

Build Units 1–5 complete, merged to `master`, pushed to `origin`
(https://github.com/PeytonR72/Poker-Elo). All gates green: `npm test` (231), `npm run typecheck`,
`npm run lint`, `npm run build --workspace @poker/client`.

The app is **functionally complete end-to-end** (auth → Home tabs → matchmaking → server-authoritative
game → ELO persistence → leaderboard/profile) but **NOT deployed**. Unit 5 (read-side UI) was verified
in-browser against the live Supabase — all features work, no open defects.

## Environment facts (not in CLAUDE.md — you need these)

- **Live Supabase project** exists & linked: ref `wydnwnitnexifndwdsmg` (org `tpoxzdpfmcmismgbmqvc`),
  region us-west-2. Both migrations (`..._init.sql`, `20260625000001_usernames.sql`) are **already
  applied** to it. `client/.env` has real `VITE_SUPABASE_URL` + anon key.
- **Email confirmation is ON** in that project's Auth settings → a fresh signup returns no session.
- **`partykit.json` vars are empty placeholders** (`SUPABASE_JWT_SECRET`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`) — fine for local dev (empty JWT secret → accepts `dev:<id>` tokens),
  must be set for production.
- **`npx partykit dev` crashes on this Windows machine** (`ERR_INVALID_URL` on `generated.js`). This
  blocks local Play/matchmaking/game testing only; the Supabase-backed screens (auth, Home,
  Leaderboard, Profile) work without PartyKit. Resolve this (or test on a non-Windows env / deploy)
  before validating gameplay.
- Supabase CLI is authenticated (token in Windows Credential Manager, target `Supabase CLI:supabase`).
  `report-match` edge function is in `supabase/functions/` but deploy status unknown.

## Unit 6 — pick ONE (brainstorm scope with the user first)

1. **Production deployment + live wiring** ← recommended. Deploy client (Vercel — `vercel` plugin +
   skills available), both PartyKit parties (`main` + `lobby`) to PartyKit Cloud (set the 3 vars),
   ensure the Supabase project's edge function + JWT auth (non-dev path) are wired, then a real
   end-to-end smoke test. Also fix/verify the PartyKit Windows-dev crash or move to a CI/cloud test.
2. **Client polish + reconnect/spectator/replay.** Reconnect indicator, spectator view
   (`redactFor(null, …)` already supports it), action-log/animations from `GameEvent`s. Replay needs
   per-hand event persistence which does NOT exist yet (only final standings are stored) → expands scope.
3. **Burn down deferred minors** (below).

## Deferred minors (non-blocking; fold into whichever unit touches the area)

- `Home` rating badge is fetched once on mount → shows login-time value, not post-match.
- `Profile` "Back" always returns to the Leaderboard tab (even when reached via the Profile tab).
- `LobbyScreen` profile fetch + `Home` rating fetch ignore the Supabase `error` field (graceful-degrade
  to default 400).
- `ActionBar` raise slider not reset on mask change between streets (re-clamps on send, so correct).
- reducers (`matchReducer`/`lobbyReducer`) never clear `error` → stale banner persists.
- `useProfile` history `.order(referencedTable:"matches")` worked live but is unverified under load.

## Testing with Playwright (required for any UI-touching unit)

Drive the real app with the `playwright` MCP plugin (snapshot > screenshot). Servers:
`cd client && npm run dev` (→ http://localhost:5173). PartyKit via `npx partykit dev` (currently
crashes on Windows — see above).

To reach authed screens past the email-confirmation gate **for testing only**: use the Supabase
Management API with the CLI token (read from Windows Credential Manager target `Supabase CLI:supabase`
via Win32 `CredRead`), `PATCH /v1/projects/<ref>/config/auth {"mailer_autoconfirm": true}`, sign up,
test, then **revert to `false`**. Seed/clean test rows via `POST /v1/projects/<ref>/database/query`.
Always restore the project (delete seeded rows, re-enable email confirmation) when done.

## Process

`superpowers` skills: `brainstorming` (agree deliverable, write spec to `docs/superpowers/specs/`) →
`writing-plans` (`docs/superpowers/plans/`) → `subagent-driven-development` (branch off `master`
first; fresh implementer + spec/quality review per task; broad final review) →
`finishing-a-development-branch`. Scout TDD / systematic-debugging / verification-before-completion
each turn. Keep `CLAUDE.md` updated as modules land.
