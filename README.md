# PokerElo

A ranked, real-money-free web poker platform where players compete in 6-max No-Limit Hold'em matches for ELO rating — not chips. Built as a full-stack TypeScript monorepo with a server-authoritative game engine, real-time multiplayer via Cloudflare's edge network, and a modern React client.

**Live app:** [poker-elo.vercel.app](https://poker-elo.vercel.app)

## Overview

PokerElo lets players queue into timed, skill-based poker matches and climb a global leaderboard. Every hand is dealt and resolved on a trusted server — clients only ever see their own hole cards and a fully redacted public view of the table, so there's no way to cheat by inspecting network traffic.

**Highlights:**
- Full No-Limit Hold'em engine: legal action masks, side-pot construction, multi-way showdowns, all built as pure, unit-tested functions
- Real-time 6-max tables over WebSockets, hosted on Cloudflare Durable Objects
- Matchmaking queue with expanding rating windows and automatic bot-fill
- Opponent-relative pairwise ELO rating with provisional K-factor for new players
- Spectator mode — watch any live match without a seat, with hole cards always hidden until showdown
- 8 distinct bot personalities (from a tight-aggressive "grinder" to a loose-aggressive "maniac"), each driving its own decision frequencies over a shared decision tree
- Persistent profiles, match history, and a top-100 leaderboard backed by Postgres

## Architecture

This is an npm-workspaces monorepo split into four packages, each with a single responsibility:

```
shared/     Pure game engine — hand evaluation, betting rules, pot math, ELO — zero I/O
party/      Cloudflare Durable Objects — the authoritative game server + matchmaking lobby
client/     React/Vite SPA — auth, lobby, felt-table game UI
supabase/   Postgres schema, RLS policies, and the match-reporting edge function
```

**Server-authoritative by design.** The `shared/` engine is a pure `(state, action) -> newState` reducer with no side effects, which makes it trivially testable and reusable. Only the `party/` game server runs it against the real, secret deck — clients send *intent* (an action) and receive a `redactFor(...)` view back, never the deck, RNG seed, or another player's hole cards.

| Layer | Tech |
|---|---|
| Game engine | TypeScript, pure functions, Vitest property-based testing |
| Game server | Cloudflare Workers + Durable Objects (`partyserver`), WebSockets |
| Client | React, Vite, Tailwind CSS v4, shadcn/ui, Framer Motion |
| Database | Supabase (Postgres, Row-Level Security, Edge Functions) |
| Auth | Supabase Auth (JWT, ES256/JWKS verification) |
| Hosting | Vercel (client) + Cloudflare Workers (game server, Free tier) |

## How a match works

1. Players queue up through the `lobby` Durable Object, which groups them by an expanding rating window and bot-fills open seats after a wait threshold.
2. A `MatchRoom` Durable Object is provisioned with the matched roster and deals the first hand using a CSPRNG-seeded shuffle (`crypto.getRandomValues`, never a predictable seed).
3. Each action a player takes is validated server-side against a legal-action mask before the engine's reducer applies it; illegal actions are rejected outright.
4. Blinds escalate on a timer, hands play to showdown or an early fold, and the match ends on a hard time cap (a hand already in progress plays out).
5. On match end, pairwise ELO deltas are computed per player (not zero-sum, since provisional and established players use different K-factors) and persisted to Postgres via an edge function.
6. Anyone signed in can spectate a live match in progress — spectators get a fully redacted view and never see hole cards before showdown.

## Testing

The engine is verified with property-based tests over thousands of randomized hands, not just example-based unit tests:

- **Hand-evaluator oracle gate** — a fast 7-card evaluator is checked against a naive reference implementation across 100k seeded hands
- **Chip-conservation gate** — side-pot construction and showdown distribution are checked to conserve chips exactly across 3,000 randomized multi-all-in hands

```bash
npm test              # run all Vitest suites
npm run typecheck      # tsc -b across the monorepo
npm run lint            # ESLint
```

The game-server Durable Objects (`MatchRoom`, `Lobby`) can't run under Vitest due to a Cloudflare-runtime import at module load time, so those are verified via scripted `wrangler dev` integration checks instead.

## Local development

```bash
npm install

# Game server (Cloudflare Workers, local)
cd party && npm run dev      # wrangler dev, needs a local .dev.vars with DEV_TOKENS=true

# Client (in a separate terminal)
cd client && npm run dev     # Vite dev server, needs client/.env (see .env.example)
```

## Project status

10 build units complete: pure engine → real-time game server → Postgres persistence → matchmaking + React client → leaderboard/profiles → production deployment → Cloudflare `partyserver` migration → deploy hygiene → spectator mode. See `CLAUDE.md` for the full build log and architectural conventions.
