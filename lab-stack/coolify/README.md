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
  0006). **Per-PR previews** are wired (see §6).
- Inject all app env/secrets (Mongo URI, AUTH_SECRET, S3, SMTP, Square **sandbox first**,
  GenAI, **Cloudflare Turnstile** — see `../../.env.example`). `NEXT_PUBLIC_*` keys (incl.
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) are synced as **build-time** vars so they're inlined into the
  client bundle. Preview envs get **no production secrets/data**.

## 6. Per-PR preview deployments (Vercel feature #2)
> **Status: live — verified end-to-end 2026-07-12.** A test PR produced
> `https://pr-<n>-preview.fablabfortsmith.org` serving the app over HTTPS through Cloudflare
> (Universal SSL edge cert), with the per-PR DNS record created on open and removed on close.

Coolify creates an ephemeral preview container for each PR (via the GitHub App) and routes it by
Host header, using the app's **preview URL template** — set it to
**`pr-{{pr_id}}-preview.fablabfortsmith.org`**. (Coolify v4.1.2's API rejects this field, so it's a
one-time **UI** step: app → *Preview Deployments* → URL template. `reconcile.sh` prints the exact
value to use and manages everything else.)
- **Why that hostname:** a *single* label under the apex, so Cloudflare **Universal SSL**
  (`*.fablabfortsmith.org`) covers the edge cert — no ACM/Enterprise. (A 2-level
  `*.preview.<domain>` would need a paid cert.)
- **Reachability + TLS without weakening the origin:** a GitHub Action
  (`.github/workflows/preview-dns.yml` → `../cloudflare/preview-dns.sh`) creates a **proxied** CF
  A record per PR and deletes it on close. Because the host is proxied, user traffic **and**
  Let's Encrypt HTTP-01 validation arrive via Cloudflare's IPs — so the Cloudflare-only origin
  firewall stays intact and Traefik still gets a valid origin cert (Full-strict holds).
- **Env / R8:** previews inherit the app's **staging (sandbox)** env — no production secrets exist
  on this app (prod is Vercel). Known caveat: auth callback / absolute-URL flows may misbehave on a
  preview host until a per-preview `NEXTAUTH_URL`/`APP_URL` is set (revisit at prod cutover).
- **Enable (deliberate, one-time):**
  1. In the Coolify UI (over the tailnet), set the app's **Preview Deployments → URL template** to
     `pr-{{pr_id}}-preview.fablabfortsmith.org` (the API can't set this on v4.1.2).
  2. Add GitHub **Actions secrets** on the repo: `CLOUDFLARE_API_TOKEN` (Zone > DNS > Edit) and
     `LAB_VPS_HOST` (VPS public IP). Fork PRs get neither (safe: no preview DNS for forks).
  3. Open a test PR → confirm the Action creates `pr-<n>-preview.fablabfortsmith.org`, Coolify
     deploys the preview, and the URL serves over HTTPS; close it → record is removed.
- **First deploy per PR is a UI click (Coolify v4.1.2).** When a PR is opened it appears in the
  app's **Previews** tab, but Coolify's API cannot *create* the preview resource — so the **first**
  deploy of each PR must be the **Deploy** button on its card. After that, pushes to the PR
  auto-redeploy, and the API `GET /deploy?uuid=<app>&pr=<n>` works (before the resource exists it
  returns *"Pull request N not found for this resource"*).
- **Hands-off auto-deploy on every PR is a GitHub App setting, not a Coolify toggle** (there is no
  such field in Coolify's API or app UI). On **github.com → Org → Settings → GitHub Apps →
  `fab-lab-fort-smith`**: grant **Pull requests: Read & write**, subscribe to the **Pull request**
  event, save, and accept the permission update on the installation. Then new PRs auto-deploy their
  preview (PRs opened *before* this need Coolify's **"Load Pull Requests"** + a manual Deploy). Keep
  Coolify **"Allow Public PR Deployments" off** — only members/collaborators trigger previews.
  Ref: coolify.io/docs/applications/ci-cd/github/preview-deploy.

## 4. Git source + webhooks (ADR 0003)
- Connect the **GitHub App** (richest: PR previews + commit status) for `FabLab-Fort-Smith`.
- Add **GitLab** as the mirror/source as needed.
- Webhooks must be **HMAC-verified** (Coolify does this with the per-source secret) — store
  each secret in the secret store; rotate per `docs/runbooks/secret-rotation.md`.

## 5. TLS & rollback
- Coolify/Traefik auto-provisions **Let's Encrypt** certs per host via HTTP-01 (validation
  arrives through Cloudflare, so the origin firewall stays Cloudflare-only). Previews get their
  own per-host cert the same way (§6). Verify HSTS is sent (the app also sets it).
- Note the **rollback** path: redeploy a previous deployment from history (during migration,
  DNS back to Vercel is also a rollback — ADR 0006).

> Back up Coolify config (export) alongside the MongoDB backups; both are needed to rebuild.

## Automated app config (config-as-code)
- **`reconcile.sh`** — idempotent, API-driven reconciliation of the `the-lab-staging` application
  (create/update, env sync, domains) over the tailnet API. `make coolify-plan` (dry-run) /
  `make coolify-apply` (+`ARGS=--deploy`). Desired state is declared at the top of the script.
- Runbooks: `docs/runbooks/deploy-app.md`, `redeploy-rollback.md`, `rebuild-coolify-from-code.md`.
- Tailnet-first admin + Cloudflare-gated webhooks: **ADR 0012** + `../cloudflare/access-policy.md`.
