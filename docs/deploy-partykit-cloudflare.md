# Deploying PartyKit to your own Cloudflare account (cloud-prem)

This is the runbook for hosting the `MatchRoom` + `lobby` parties on **your** Cloudflare zone,
bypassing the full shared `partykit.dev` zone (the "10000 custom domains" error).

Example domain used below: **`pokerelo.us`** (apex → Vercel client; `party.pokerelo.us` → PartyKit).
Substitute your real domain.

---

## Prerequisites (you must do these — they can't be scripted)

1. **Register the domain** (`pokerelo.us`). Cloudflare Registrar if it offers `.us`; otherwise any
   registrar (Porkbun/Namecheap) then add the domain to Cloudflare and switch nameservers.
2. **Add the domain as a zone in Cloudflare** and confirm it shows **Active** (nameservers
   propagated). The deploy needs the zone live.
3. **Account ID** — Cloudflare dashboard → your domain → Overview (right sidebar). Save it.
4. **API token** — dash.cloudflare.com/profile/api-tokens → Create Token → **"Edit Cloudflare
   Workers"** template. Scope it to your account + zone. Save it (shown once).
5. **Workers plan** — Durable Objects on the Free plan only support the SQLite backend. If the
   deploy fails citing Durable Objects / a paid requirement, enable **Workers Paid ($5/mo)** and
   re-run. (Expected, but try Free first — it costs nothing to find out.)

---

## The deploy command (secure — note what is and isn't passed)

> **CRITICAL:** Do **NOT** use `--with-vars`. That flag reads the whole root `.env`, which now
> contains `DEV_TOKENS=true` (added in Unit 7 for local `partykit dev`). Shipping `DEV_TOKENS=true`
> to production makes the server accept `dev:<any-id>` tokens — anyone could impersonate any user.
> Pass the three real secrets explicitly with `--var`, and never pass `DEV_TOKENS`.

Run from the repo root, with your secret values exported in the shell (do not hardcode them into a
committed file):

```bash
CLOUDFLARE_ACCOUNT_ID="<your account id>" \
CLOUDFLARE_API_TOKEN="<your workers token>" \
npx partykit deploy \
  --domain party.pokerelo.us \
  --var SUPABASE_URL="$SUPABASE_URL" \
  --var SUPABASE_JWT_SECRET="$SUPABASE_JWT_SECRET" \
  --var SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
```

- `--domain party.pokerelo.us` puts the worker on your zone; PartyKit creates the DNS record.
- The three `--var` flags fill the `vars` declared in `partykit.json` (currently empty defaults).
- `DEV_TOKENS` is intentionally absent → production rejects all `dev:` tokens.

On success PartyKit prints the deployed host (your `party.pokerelo.us`).

---

## Post-deploy verification (DO NOT skip — this proves the security guard held)

The whole point of the `DEV_TOKENS` care above is that production must reject dev tokens. Verify it
empirically rather than assuming:

**A. Dev token must be REJECTED in production.**
Connect a WebSocket to the deployed lobby and send a dev hello — expect `auth_failed`:

```
wss://party.pokerelo.us/parties/lobby/<anything>
→ send: {"t":"hello","jwt":"dev:smoketest"}
← expect: {"t":"error","message":"auth_failed"}  (connection closed)
```

If instead you get `queueStatus`/`seated`, **STOP — `DEV_TOKENS` leaked. Do not point users at this
deploy.** Re-check the deploy command (no `--with-vars`, no stray `DEV_TOKENS`), redeploy, re-verify.

**B. A real Supabase JWT must be ACCEPTED.**
Sign in on the client and confirm matchmaking connects (no `auth_failed`).

---

## Wire the client to the new backend

1. **Vercel env** — project `peytonr7272-gmailcoms-projects/client`:
   set `VITE_PARTYKIT_HOST=party.pokerelo.us` (host only, no scheme/port).
2. **Redeploy the client** so the new env bakes into the build:
   `npm run build --workspace @poker/client` via Vercel (or trigger a redeploy in the dashboard).
3. (Optional, recommended) Point the **apex/`www`** of `pokerelo.us` at Vercel and add it as a
   custom domain in the Vercel project, so users type `pokerelo.us` instead of the `*.vercel.app`
   URL. This is independent of the PartyKit subdomain.

---

## After it's verified live

- Update `CLAUDE.md` Deployment section: PartyKit now cloud-hosted at `party.pokerelo.us`; remove the
  "requires local `npx partykit dev`" caveat.
- Update `handoff.md`: PartyKit hosting resolved.
- Keep `DEV_TOKENS=true` in the **local** root `.env` only (it's gitignored) — never in any deployed
  var set.

---

## What I need from you to run the deploy

1. Confirmation `pokerelo.us` (or your chosen domain) is **Active** in your Cloudflare account.
2. Your `CLOUDFLARE_ACCOUNT_ID`.
3. A Workers-scoped `CLOUDFLARE_API_TOKEN`.

With those, the deploy + verification + Vercel update is ~15 minutes.
