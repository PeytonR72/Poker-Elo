# Deploying `party/` (partyserver + wrangler) to Cloudflare — cloud-prem

This supersedes `docs/deploy-partykit-cloudflare.md`. The `partykit` CLI/platform is gone from
this repo entirely — `party/` is now a plain Cloudflare Worker with two Durable Object classes
(`MatchRoom`, `Lobby`), built with Cloudflare's own [`partyserver`](https://github.com/cloudflare/partykit/tree/main/packages/partyserver)
library and deployed with `wrangler`. This runbook documents the actual sequence that worked,
including the real gotchas hit doing it for the first time.

Example domain used below: **`pokerelo.us`** (apex → Vercel client; `party.pokerelo.us` → this
Worker). Substitute your real domain.

---

## Why this replaced the `partykit deploy` path

The original cloud-prem plan (`partykit deploy --domain ...` to your own Cloudflare account)
hit a real, unfixable blocker: Cloudflare's **Workers Free plan requires Durable Objects to use
the SQLite storage backend**, declared via an explicit `new_sqlite_classes` migration — and the
`partykit` CLI (v0.0.108 at the time) does not generate that migration type for cloud-prem
deploys. The only way to get `partykit deploy` working was to pay for Workers Paid ($5/mo).

`wrangler` (Cloudflare's own CLI) lets you declare the SQLite migration explicitly, so the same
Free-plan deploy that failed via `partykit deploy` succeeds via `wrangler deploy` with zero
extra cost. `partyserver` is the library that makes writing PartyKit-style code (`onConnect`/
`onMessage`/room routing) against plain Durable Objects nearly identical to what `party/src`
already had — the actual code port was almost entirely mechanical.

---

## Prerequisites

1. **Cloudflare account**, with a **`workers.dev` subdomain provisioned** — this needs a one-time
   manual step: log into the Cloudflare dashboard and click "Workers & Pages" in the sidebar once.
   Visiting it for the first time auto-provisions the subdomain. Skipping this causes `wrangler
   deploy` to fail with `error code: 10063` ("You need a workers.dev subdomain") — unrelated to
   anything in this repo, a pure account-setup gap.
2. **Domain registered and Active in Cloudflare** (`pokerelo.us` or your domain) — you do NOT
   need to buy the domain through Cloudflare; buy it anywhere cheaper, then just switch that
   registrar's nameservers to Cloudflare's. The zone needs to show **Active**, not just "added."
3. **Account ID** — Cloudflare dashboard → Workers & Pages → Overview (right sidebar).
4. **API token** — dash.cloudflare.com/profile/api-tokens → Create Token. Needs Workers
   Scripts/Routes write permissions **plus Zone → DNS → Edit** for the target zone (the default
   "Edit Cloudflare Workers" template may not include DNS edit — add it explicitly if the deploy
   fails to create the custom-domain route).
5. Store `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` in a **git-ignored** file (this repo uses
   `.env.cloudflare` at the root) — never in the tracked root `.env` (see the `DEV_TOKENS` warning
   below), and never pass them via a flag that sweeps arbitrary env files.

---

## One-time setup already done in this repo

- `party/src/worker.ts` — the Worker `fetch` entrypoint, delegates to `partyserver`'s
  `routePartykitRequest`.
- `party/wrangler.jsonc` — Durable Object bindings (`MAIN` → `MatchRoom`, `LOBBY` → `Lobby`), the
  `new_sqlite_classes` migration, and the `party.pokerelo.us` custom-domain route.
- `party/package.json`'s `dev`/`deploy` scripts call `wrangler dev` / `wrangler deploy` directly.

If you're setting this up fresh in a different repo, these three files are the whole shape —
see them for the exact JSON/TS.

---

## The deploy sequence

**1. Set secrets** (from `party/`, with account credentials loaded as env vars — never as a
flag, never printed):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_JWT_SECRET
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Each prompts interactively — paste the value, don't pass it inline. **Do not set `DEV_TOKENS`
in production** — its absence is what makes `dev:<id>` tokens rejected. If you run these from
the wrong directory (not `party/`), `wrangler` won't find `wrangler.jsonc` and the secret may
silently apply to nothing or the wrong worker — always `cd party` first, and run
`npx wrangler secret list` afterward to confirm.

**2. Deploy:**

```bash
npx wrangler deploy
```

On success this prints the custom domain route as active and a Version ID.

**3. Smoke test — non-negotiable, every deploy:**

```js
const ws = new WebSocket("wss://party.pokerelo.us/parties/lobby/global");
ws.onopen = () => ws.send(JSON.stringify({ t: "hello", jwt: "dev:should-be-rejected" }));
ws.onmessage = (e) => { console.log(e.data); process.exit(0); };
```

Expect `{"t":"error","message":"auth_failed"}`. If a `dev:` token is ever accepted here,
`DEV_TOKENS` leaked to production — stop immediately.

**4. Repoint the client:** update `VITE_PARTYKIT_HOST` to `party.pokerelo.us` in the Vercel
project's environment variables (Production), then redeploy the client so the new env bakes
into the build.

**5. Verify with a real account:** sign in on the live client, click Find Match, confirm a
bot-filled match starts and a hand plays out.

---

## A real bug this deploy surfaced (read this even if your deploy looks clean)

The first real end-to-end login attempt against this deploy failed with `auth_failed` even
after the `SUPABASE_JWT_SECRET` was correctly set. Root cause: **this Supabase project signs
JWTs with an asymmetric `ES256` key, not the legacy shared `HS256` secret** —
`party/src/auth.ts`'s `verifyJwt` originally only supported `HS256`. This was a pre-existing,
latent bug unrelated to the `partyserver` migration itself (that file was never touched by the
migration's mechanical port) — it had simply never been exercised against real production
traffic before, because PartyKit was never cloud-deployed prior to this.

`verifyJwt` now checks the JWT's own (unverified) `alg` header and dispatches: `HS256` verifies
against the configured shared secret; anything else verifies against the project's published
JWKS (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`). **If you hit `auth_failed` with a
correctly-set secret on a fresh Supabase project, check whether your project uses the newer
asymmetric signing keys** — decode your session JWT's header at jwt.io and check the `alg`
field, or run:

```bash
curl -s "https://<your-project-ref>.supabase.co/auth/v1/.well-known/jwks.json"
```

A non-empty `keys` array with `"alg":"ES256"` confirms it.

---

## Post-deploy checklist

- [ ] `npx wrangler secret list` shows all three Supabase secrets, and NOT `DEV_TOKENS`.
- [ ] Dev-token smoke test rejects with `auth_failed`.
- [ ] A real signed-in account completes matchmaking and plays a hand.
- [ ] `VITE_PARTYKIT_HOST` on Vercel points at the new host, and the client has been redeployed.
- [ ] `.env.cloudflare` (or equivalent) stays git-ignored and out of any command that sweeps
      arbitrary env files into a deploy.
