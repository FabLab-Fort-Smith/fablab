---
title: Deploy the app (Coolify, from code)
category: Deploy & Release
usage: First app setup + re-applying config
order: 15
summary: Create/update The-Lab's Coolify application from code (reconcile.sh over the tailnet API), sync env, and deploy staging — idempotent, no click-ops.
---

# Runbook: Deploy the app (Coolify) from code

> Repeatable, API-driven creation/update of the **the-lab-staging** application via
> `lab-stack/coolify/reconcile.sh`. Config-as-code — the desired state lives in the script; no
> dashboard clicking. Rules: `@rules/workflow-release.md`, `@rules/topic-config-environments.md`.
> Talks to the Coolify API **over the tailnet** (`COOLIFY_URL=http://fablab-prod:8000`) — no public
> exposure needed (ADR 0012).

## When to use
- First-time creation of the staging application, or
- Re-applying app/env config after a change (idempotent — safe to re-run).

## Prerequisites
- Platform converged (`make converge`) — Coolify + Docker + tailscale up.
- **GitHub App connected** in Coolify → Sources (source `fab-lab-fort-smith`). One-time, manual.
- `../.env` has `COOLIFY_URL` (tailnet) + `COOLIFY_TOKEN` (Sanctum `id|secret` — **single-quoted**
  in `.env` so `.` sourcing is safe), and the app secrets (below).
- `jq`, `curl` available where you run it (the tailnet host, or via `cot`).

## Secrets the app needs (in `../.env`)
- **Auto-generated** (already there): `AUTH_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY`,
  `INTERNAL_API_SECRET`, `SOCKET_API_SECRET`, `MONGODB_URI`.
- **You provide** (Square = sandbox first): `SQUARE_ACCESS_TOKEN`, `SQUARE_WEBHOOK_SIGNATURE_KEY`,
  `SQUARE_APPLICATION_ID`, `SQUARE_LOCATION_ID`, plus `S3_*`, `SMTP_*`, `GOOGLE_GENAI_API_KEY`,
  `RECAPTCHA_SITE_KEY`, `AUTH_URL` (= `https://staging.fablabfortsmith.org`). The script warns about
  any **required** key still empty (the app won't boot without them).

## Steps
1. **Plan (no changes):**
   ```bash
   cd lab-stack && make coolify-plan          # = reconcile.sh --dry-run
   ```
   Review: create-vs-update, and which env keys are `set` / `EMPTY`.
2. **Apply config + env (no deploy yet):**
   ```bash
   make coolify-apply                          # create/patch the app + bulk-sync env
   ```
   Expected: `created app <uuid>` (or `update …`), `synced N env var(s)`, `done`.
3. **Deploy:**
   ```bash
   make coolify-apply ARGS=--deploy            # triggers a build+deploy of the current ref
   ```
   (or in the UI: the app → **Deploy**.)

## Verification
- `https://staging.fablabfortsmith.org` serves The-Lab over HTTPS (valid cert).
- Coolify → the app → **Deployments**: latest is green; logs show the Docker build + `node server.js`.
- A push to **`dev`** auto-redeploys staging (GitHub App webhook — instant-deploy works).

## Gotchas
- **Traefik proxy `exited`:** if the app 502/503s, start Coolify's proxy — Coolify → **Servers →
  localhost → Proxy → Start** (it also starts on the first successful deploy). Then re-check.
- **Public domain vs tailnet:** the API tooling uses the tailnet URL; the *app* is served publicly
  via Cloudflare. Set Coolify's **instance domain** + Cloudflare **Full (strict)** so TLS is valid
  (ADR 0012, `cloudflare/access-policy.md`).
- **Wrong/empty env → app boot fails** (`src/lib/env.js`): fill the required keys in `.env` and
  re-run `make coolify-apply` (env re-syncs).

## Rollback / abort
- A bad deploy: see `redeploy-rollback.md` (redeploy a previous commit; DB migrations expand/contract).
- Ultimate migration rollback: DNS stays such that the apex is on **Vercel** (ADR 0006) — production
  is unaffected by staging.

## Related
- `redeploy-rollback.md`, `rebuild-coolify-from-code.md`, `bootstrap-vps.md`;
  `lab-stack/coolify/reconcile.sh`, `lab-stack/coolify/README.md`, ADR 0005/0006/0012.

---
_Last validated: 2026-07-12 (API deploy of the-lab-staging + verified push-to-deploy on `dev`). Owner: platform._
