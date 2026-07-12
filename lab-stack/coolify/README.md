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
  expose it openly (threat model R3).

## 2. MongoDB service (ADR 0007)
- Add a **MongoDB** resource on Coolify's **private network only** (not publicly exposed).
- Strong root credential + a **least-privilege app user/db**; enable TLS + at-rest encryption.
- The app reads `MONGODB_URI` from the secret store — not committed.
- Confirm `ansible/roles/backups` can reach it (dump + restore drill — `docs/runbooks/backup-restore.md`).

## 3. The app (`lab-site/the-lab`)
- New application from the Git source (see step 4). Set **Base Directory = `lab-site/the-lab`**
  (monorepo subdir — ADR 0005). Build via the app's **Dockerfile** (Next.js `output: 'standalone'`).
- Environments → branches: **production = `main`**, **staging = `dev`**. Enable **PR preview
  deployments** with wildcard domain `*.preview.<domain>` (step in ../cloudflare).
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
