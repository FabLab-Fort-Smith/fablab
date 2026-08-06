---
title: Rebuild Coolify config from code
category: Deploy & Release
usage: DR / new VPS / reset
order: 17
summary: Stand the whole platform + app back up from the repo after a wipe or on a new VPS — converge, reconnect the few manual UI bits, then reconcile the app from code.
---

# Runbook: Rebuild the platform + app from code

> The repeatable-redeploy / disaster-recovery story: reconstruct everything from the repo with a
> minimum of manual steps. Most is code (`ansible/` + `coolify/reconcile.sh`); only a few
> identity/OAuth bits are inherently manual. Rules: `@rules/workflow-bootstrap.md`,
> `@rules/topic-migration.md`, `@rules/topic-reliability.md`.

## When to use
- New/rebuilt VPS, a wiped Coolify, or validating DR. **Practice this** — an untested rebuild is a
  hypothesis.

## What is code vs. manual
| Reproduced from code | One-time manual (UI/OAuth) |
|---|---|
| Host hardening, Docker, MongoDB, backups, **tailnet** (`ansible/`) | Coolify admin account + MFA |
| DNS records (`cloudflare/dns.sh`) | GitHub App install/authorize |
| App: project/app/env/domains/branch/build (`coolify/reconcile.sh`) | Cloudflare Access policy (`access-policy.md`) |
| Local + app secrets (`make secrets`; provider keys in `.env`) | Coolify instance domain (Settings) |

## Steps
1. **Platform** (`bootstrap-vps.md`): order/rebuild VPS → `make setup` → `make converge` (harden,
   docker, mongodb, coolify, backups, tailscale). MongoDB app user/URI regenerate from `.env`.
2. **DNS**: `make dns` (idempotent). NOTE: the apex + `www` now point at this VPS (cutover
   2026-08-03) — a rebuild must restore those records too, not just the staging host.
3. **Coolify one-time UI** (`deploy-app.md` prereqs + ADR 0012):
   - Create admin + **MFA**; disable registration + telemetry; auto-update off.
   - Set **instance domain** = `https://deploy.fablabfortsmith.org`; Cloudflare **Full (strict)**.
   - Connect the **GitHub App** to `FabLab-Fort-Smith`.
   - Apply **Cloudflare Access** (`cloudflare/access-policy.md`).
4. **App from code**: fill provider secrets in `../.env`, then:
   ```bash
   cd lab-stack
   make coolify-plan                 # review
   make coolify-apply ARGS=--deploy  # create app + env + deploy
   ```
5. **Data**: restore MongoDB if recovering (`backup-restore.md`); otherwise a fresh DB is created by
   the `mongodb` role.

## Also back up (so this is truly reproducible)
- **Coolify's own config/DB**: export/back up Coolify (its Postgres + `/data/coolify`) — some UI
  state (the admin, the connected GitHub App install, Access) is **not** in `reconcile.sh`. Store
  the export off-box with the Mongo backups (`@rules/workflow-data-lifecycle.md`).
- Keep `../.env` (git-ignored) backed up in the secret store — it holds the tokens + generated
  secrets the rebuild needs.

## Verification
- `deploy-app.md` verification passes (staging serves; push-to-deploy works).
- Coolify reachable over the tailnet (`http://fablab-prod:8000`) and, via Access, at the public
  domain. **The apex + `www` are production on this VPS** — rebuild `the-lab-production` as well
  (`reconcile.sh --env production --confirm-production`); see promote-staging-to-prod.md.

## Related
- `bootstrap-vps.md`, `deploy-app.md`, `redeploy-rollback.md`, `backup-restore.md`,
  `secret-rotation.md`; ADR 0004/0006/0010/0012.

---
_Last validated: 2026-07-12 (reconcile.sh created the-lab-staging app + env from code against the live API). Owner: platform._
