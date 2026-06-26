# Unit 7 — Bug Fixes & Polish

Branch: `unit-7-bugs-and-polish`
Branch base: `15d0022ef8927facbcb81d8bc6eb9022660d1242`

## Global Constraints

- All poker numbers live in `shared/src/constants.ts`. Never hardcode poker-numeric values.
- Relative imports end in `.js` even though sources are `.ts`.
- TypeScript strict + `noUncheckedIndexedAccess`. Index access yields `T | undefined`; assert with `!` only when provably in-bounds.
- `Action.amount` is raise-TO (total chips committed this street), NOT raise-by.
- `import type React from "react"` is required wherever `React.CSSProperties`/`React.FormEvent` is referenced.
- Vite-only; do not `import` CSS from `.tsx` (breaks `tsc`) — link stylesheets from `index.html`.
- Dev mode gated on `isDevHost()` (exact hostname match for `localhost`/`127.0.0.1`). Never widen.
- Release gates must stay green: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build --workspace @poker/client`.
- All commits on the feature branch; no direct pushes to master.
- Pure cores (`matchReducer`, `lobbyReducer`, `viewHelpers`, data shapers) stay pure and tested.
- Each task: run relevant tests + typecheck before committing. Report test command + output.

## Task 1 — Fix auth_failed (party authenticate)

**Files:** `party/src/lobby.ts`, `party/src/matchRoom.ts`, root `.env`

**Problem:** Both files have an `authenticate` method that only tries `parseDevToken` when `SUPABASE_JWT_SECRET` is empty. Now that root `.env` has a real secret, `partykit dev` loads it and routes ALL tokens through `verifyJwt`, which rejects `dev:<id>` strings → `auth_failed`.

**Fix:**
1. Rewrite `authenticate` in BOTH files to always try `parseDevToken` first.
2. Only accept the parsed dev token when `process.env.DEV_TOKENS === "true"`.
3. If the token does NOT start with `dev:`, fall through to `verifyJwt`.
4. If the token starts with `dev:` but `DEV_TOKENS` is not `"true"`, reject with `auth_failed`.
5. Add `DEV_TOKENS=true` to the root `.env` (existing file, gitignored — just append).
6. Confirm cloud secrets do NOT have `DEV_TOKENS` (they don't — this is enforced by never setting it via `partykit env add`).

**Tests:** No unit tests for auth (it calls `partykit` internals). Run `npm run typecheck` to confirm types. Manually note the logic path in the commit message.

**Commit:** one commit covering both files + root `.env` note.

## Task 2 — Fix Profile crash (useProfile two-query split)

**Files:** `client/src/profile/useProfile.ts`

**Problem:** `useProfile` fetches the profile row with an embedded join to match history and calls `.single()`. When the user has match rows, PostgREST returns one row per match; `.single()` receives multiple rows and throws "Cannot coerce the result to a single JSON object".

**Fix:**
1. Split into two queries fired in `Promise.all`:
   - Query A: `supabase.from("profiles").select("...").eq("id", userId).single()` — profile row only, no join.
   - Query B: `supabase.from("match_results").select("..., matches(...)").eq("player_id", userId).order("created_at", { ascending: false })` — returns array.
2. Pass both results to `buildProfile` (or reshape inline if the signature changes).
3. Keep `buildProfile` in `client/src/data/profile.ts` pure and tested — if its signature needs to change, update the test too.
4. Handle errors from both queries independently; surface whichever fails.

**Tests:** Run `npm test -- client/src/data/profile` (or the full suite) + `npm run typecheck`. If `buildProfile` signature changes, update its unit test.

## Task 3 — Rating badge refresh after match

**Files:** `client/src/home/Home.tsx` (or wherever the rating/profile fetch lives), `client/src/game/useMatchSocket.ts`

**Problem:** Home's rating badge is fetched once on mount; after a match completes (and ELO updates in Supabase), the badge shows the stale pre-match rating.

**Fix:**
1. Expose a `refetchRating` callback from the profile/rating fetch in `Home` (or use a shared signal).
2. In `useMatchSocket`, when a `matchOver` server message is received, call `refetchRating` (passed as a prop or via a shared callback ref).
3. Alternatively: re-mount `Home` or re-run the rating query when navigating back from `GameScreen`. Check `App.tsx` to see how the screen transition works and pick the simplest approach that doesn't require prop-drilling through many layers.

**Tests:** `npm run typecheck`. No pure-core tests needed for this hook change.

## Task 4 — Profile "Back" tab memory

**Files:** `client/src/home/Home.tsx`, `client/src/profile/ProfileScreen.tsx`

**Problem:** Profile's "Back" button always returns to the Leaderboard tab regardless of which tab the user navigated from.

**Fix:**
1. When navigating from Home to ProfileScreen, pass the current active tab index.
2. ProfileScreen's "Back" button restores that tab index.
3. Simplest approach: pass `fromTab` as a prop through the existing navigation call, store it in ProfileScreen state.

**Tests:** `npm run typecheck`.

## Task 5 — Surface silent fetch errors

**Files:** `client/src/lobby/LobbyScreen.tsx`, `client/src/home/Home.tsx`

**Problem:** Supabase `error` field on profile/rating fetch is ignored; the UI silently defaults to 400 rating and no rank.

**Fix:**
1. Check `error` from both Supabase calls.
2. When non-null, show a minimal inline error message (e.g., "Could not load profile" in place of the rating badge or queue section).
3. No modal or toast needed — inline text is sufficient.

**Tests:** `npm run typecheck`. Keep component changes minimal (thin component principle).

## Task 6 — Clear stale error banners

**Files:** `client/src/game/matchReducer.ts`, `client/src/lobby/lobbyReducer.ts`, their test files

**Problem:** Neither reducer clears the `error` field when new messages arrive, so error banners persist across hands/transitions.

**Fix:**
1. In `matchReducer`: on any incoming server message that is not itself an error, clear `error` to `null`/`undefined`.
2. In `lobbyReducer`: same pattern.
3. Update the unit tests to cover: error is set, then a non-error message arrives, error is cleared.

**Tests:** `npm test -- client/src/game/matchReducer` and `npm test -- client/src/lobby/lobbyReducer` (or path equivalents). Both pure-core tests must pass.

## Task 7 — Raise slider reset on mask change

**Files:** `client/src/game/ActionBar.tsx`

**Problem:** The raise slider value is not reset when the `ActionMask` changes (new street, new hand). It re-clamps on send (functionally correct) but shows the wrong visual position.

**Fix:**
1. Watch `mask` (or the derived `minRaise`/`maxRaise`) in a `useEffect`.
2. On change, reset the slider's controlled value to `minRaise` (the legal minimum raise-TO).
3. Do not touch any logic outside `ActionBar.tsx`.

**Tests:** `npm run typecheck`.

## Task 8 — Favicon

**Files:** `client/public/favicon.png` (create directory), `client/index.html`

**Problem:** `favicon.ico` 404s (cosmetic but visible in browser dev tools).

**Fix:**
1. Create `client/public/` directory.
2. The user has provided a PNG favicon (spade logo). Copy/save it as `client/public/favicon.png`.
   - **If the file is not yet on disk:** create the directory and update `index.html` so everything is wired; note in the commit that the user should drop `favicon.png` into `client/public/`.
3. In `client/index.html`, replace or add `<link rel="icon" ...>` to point to `/favicon.png` with `type="image/png"`.

**Tests:** `npm run build --workspace @poker/client` to confirm Vite copies the file and no build errors.

## Task 9 — Password autocomplete attribute

**Files:** `client/src/auth/AuthScreen.tsx`

**Problem:** Password input missing `autocomplete` attribute — a11y hint from browsers/password managers.

**Fix:**
1. For the sign-in password field: `autoComplete="current-password"`.
2. For the sign-up password field (if separate): `autoComplete="new-password"`.
3. If sign-in and sign-up share one form/component, branch on the mode to pick the right value.

**Tests:** `npm run typecheck`.
