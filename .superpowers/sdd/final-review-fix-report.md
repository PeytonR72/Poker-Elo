# Final-Review Fix Report

Date: 2026-06-25

## Fix 1 — Lobby: treat non-ok provisioning responses as failure

**File:** `party/src/lobby.ts` — `runMatchTick()`

**Bug:** `fetch()` against a cross-party PartyKit stub can resolve with a non-ok `Response`
(e.g. HTTP 400 from `onRequest`'s `bad_roster` path). The original code only handled thrown
exceptions, so a resolved non-ok response was treated as success — players were dequeued and
sent `matchFound` even though the MatchRoom was never provisioned.

**Fix:** Captured the resolved `Response` in `res`; added `if (!res.ok) continue;` immediately
after the try/catch block, before the loop that adds IDs to `provisioned` and sends `matchFound`.

**Regression test** (`party/src/lobby.test.ts`):
- Test: "keeps players queued when match provisioning returns non-ok response (fix 1)"
- Setup: cross-party fetch mock resolves with `new Response(..., { status: 400 })` (does NOT throw)
- One player enqueued; `runMatchTick()` called
- FAIL before fix: `lobby.waiterCount` was 0 (player wrongly dequeued) and `matchFound` was sent
- PASS after fix: `lobby.waiterCount === 1`, no `matchFound` sent

---

## Fix 2 — MatchRoom: grace timer must not start an all-bot phantom match

**File:** `party/src/matchRoom.ts` — `onRequest()` grace timer callback

**Bug:** The `connectGraceTimer` callback unconditionally called `this.startMatch()`. If no
expected human ever connected, the callback launched a full 6-bot match — producing a phantom
game with bogus ELO deltas and persistence writes for absent players.

**Fix:** Inside the callback, check whether at least one expected human is actually seated before
calling `startMatch()`. If `anyHumanSeated` is false, the callback does nothing (room stays idle
for PartyKit GC). Partial rosters (at least one but not all expected humans) still start and
bot-fill because the `onMessage` hello path cancels the grace timer and calls `startMatch()`
immediately when all expected humans are seated.

**Regression tests** (`party/src/matchRoom.test.ts`, inside "MatchRoom provisioning + matchInfo"):
- Nested describe: "connect-grace: no phantom match when zero humans connect (fix 2)"
- Test 1: "does NOT start a match when no human connects before grace expires"
  - Provision `{ format:"turbo", humanIds:["h1"] }`, connect no player
  - Advance `DISCONNECT_GRACE_MS + 10`
  - FAIL before fix: `currentTableState` was non-null (phantom match started)
  - PASS after fix: `currentTableState === null`
- Test 2: "DOES start a match when at least one expected human connects before grace expires"
  - Same provision, connect `h1`, advance past grace
  - PASS before and after fix (no regression): match still starts for seated humans

---

## Fix 3 — Lobby: validate enqueue format against MATCH_FORMATS

**File:** `party/src/lobby.ts` — `onMessage` enqueue branch

**Bug:** `format` was accepted as any non-empty string. An unknown format string like
`"not-a-format"` would be accepted, queuing the player with a format that can never match and
would be silently passed to `formMatches`/`makeRoomCode` without validation.

**Fix:** Changed the format check from `typeof msg.format === "string"` to
`typeof msg.format === "string" && msg.format in MATCH_FORMATS`.
Also imported `MATCH_FORMATS` from `@poker/shared` (added to existing import statement).

**Regression test** (`party/src/lobby.test.ts`):
- Test: "rejects unknown format string with bad_enqueue error (fix 3)"
- Enqueue with `{ t:"enqueue", rating: 400, format: "not-a-format" }`
- FAIL before fix: `lobby.waiterCount === 1`, no error sent
- PASS after fix: `lobby.waiterCount === 0`, `error` message `"bad_enqueue"` sent

---

## Full Suite + Typecheck + Lint Results

```
Test Files: 26 passed (26)
Tests:      218 passed (218)
```

`npm run typecheck` — clean (no output)
`npm run lint` — clean (no output)

Zero regressions. All three new tests fail-before / pass-after confirmed.

---

## Concerns

None. All fixes are minimal and surgical. The partial-roster path (at least one human seated,
grace fires later) still correctly starts the match because `onMessage` cancels the grace timer
and calls `startMatch()` synchronously when `seatedExpected >= expectedHumanIds.size`.
