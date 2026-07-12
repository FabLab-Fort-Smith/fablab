# Coolify configuration

Coolify is installed by `ansible/roles/coolify`. The items below are configured **in the
Coolify dashboard** (its UI is a necessary source of truth — ADR 0002); record them here and
back up Coolify's own config/DB regularly so this is reproducible.

## 1. Secure the dashboard (do first) — non-custodial (ADR 0008)
- Create the admin account immediately after install; enable **MFA**.
- **Invite every maintainer as a team member with their own login + MFA** — do **not** share one
  dashboard password. Keep a documented break-glass owner.
- Create a dedicated **API token for CI/automation** (revocable; not a human's session) — that's
  what `coolify/bootstrap.sh` and any scheduled ops use. Never share or commit it.
- Put the dashboard (`deploy.<domain>`) behind **Cloudflare Access** or an IP allow-list; never
  expose it openly (threat model R3). *(Applied 2026-07-12 — `cloudflare/access.sh` gates the
  dashboard to maintainers+MFA with a bypass for `/webhooks`; primary admin path is the tailnet
  `http://fablab-prod:8000`, ADR 0012.)*

## 2. MongoDB (ADR 0010 — Ansible-managed, NOT a Coolify service)
- MongoDB is provisioned by `ansible/roles/mongodb` as a **standalone Docker container** on the
  private `fablab` network — **do not add a Coolify database service** (this supersedes the
  Coolify-managed service in ADR 0007). Root + a least-privilege app user/db are created and
  **reconciled every converge**.
- In Coolify, **attach the app to the `fablab` docker network** so it resolves `fablab-mongo`.
- `MONGODB_URI` is written root-only to `/etc/fablab/mongo.env` on the VPS and set on the app via
  the env sync (`reconcile.sh`) — not committed.
- `ansible/roles/backups` dumps nightly with a tested restore drill
  (`docs/runbooks/backup-restore.md`); age-at-rest + restic off-box are opt-in.

## 3. The app (`lab-site/the-lab`)
- Created/reconciled from code by **`reconcile.sh`** (`make coolify-apply`, §"Automated app
  config" below) — **Base Directory = `lab-site/the-lab`** (monorepo subdir — ADR 0005), built
  via the app's **Dockerfile** (Next.js `output: 'standalone'`), on port 3000.
- Environments → branches: **`dev` → staging is LIVE** (`https://staging.fablabfortsmith.org`,
  auto-deploy on push). **`main` → production** is the cutover target (apex still on Vercel — ADR
  0006). **PR preview deployments** (`*.preview.<domain>`) are the remaining feature to enable.
- Inject all app env/secrets (Mongo URI, AUTH_SECRET, S3, SMTP, Square **sandbox first**,
  GenAI, reCAPTCHA — see `../../.env.example`). Preview envs get **no production secrets/data**.

## 4. Git source + webhooks (ADR 0003)
- Connect the **GitHub App** (richest: PR previews + commit status) for `FabLab-Fort-Smith`.
- Add **GitLab** as the mirror/source as needed.
- Webhooks must be **HMAC-verified** (Coolify does this with the per-source secret) — store
  each secret in the secret store; rotate per `docs/runbooks/secret-rotation.md`.

## 5. TLS & rollback
- Coolify/Traefik auto-provisions **Let's Encrypt** certs (per-app + wildcard for previews via
  DNS-01). Verify HSTS is sent (the app also sets it).
- Note the **rollback** path: redeploy a previous deployment from history (during migration,
  DNS back to Vercel is also a rollback — ADR 0006).

> Back up Coolify config (export) alongside the MongoDB backups; both are needed to rebuild.

## Automated app config (config-as-code)
- **`reconcile.sh`** — idempotent, API-driven reconciliation of the `the-lab-staging` application
  (create/update, env sync, domains) over the tailnet API. `make coolify-plan` (dry-run) /
  `make coolify-apply` (+`ARGS=--deploy`). Desired state is declared at the top of the script.
- Runbooks: `docs/runbooks/deploy-app.md`, `redeploy-rollback.md`, `rebuild-coolify-from-code.md`.
- Tailnet-first admin + Cloudflare-gated webhooks: **ADR 0012** + `../cloudflare/access-policy.md`.
