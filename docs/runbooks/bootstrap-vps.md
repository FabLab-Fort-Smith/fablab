# Runbook: Bootstrap the VPS (full setup & configuration)

> Stand up the deploy platform on a fresh VPS and run **The-Lab** on it **in parallel with
> Vercel** (no cutover yet). Rules: `@rules/workflow-bootstrap.md`, `@rules/std-cis.md`, ADRs
> 0002/0004/0007. **Production stays on Vercel** until the separate, gated cutover
> (`migrate-from-vercel.md`). **STATUS: validate on first real run.**

## When to use
- First-time provisioning of the platform (or rebuilding it on a new VPS).

## What you'll have at the end
- A hardened Ubuntu VPS running **Coolify** (deploy engine) + **Traefik** (TLS) + a **private
  MongoDB**, fronted by **Cloudflare**, deploying The-Lab to **staging/preview** URLs — while
  the apex domain still points at Vercel (production untouched).

---

## 0. Prerequisites & decisions (gather these first)

| Need | Value / decision | Notes |
|---|---|---|
| VPS | RackNerd 8 GB, **Ubuntu 24.04 LTS** | x86_64; ADR 0004 |
| Your SSH keypair | `~/.ssh/fablab_deploy(.pub)` | `ssh-keygen -t ed25519 -f ~/.ssh/fablab_deploy -C deploy@fablab` |
| Domain on Cloudflare | `fablabfortsmith.org` | zone already managed by Cloudflare |
| Staging hostname | e.g. `staging.fablabfortsmith.org` | the VPS app URL pre-cutover (NOT the apex) |
| Cloudflare API token | scope: **Zone › DNS › Edit** for the zone | for wildcard TLS (DNS-01) + DNS-as-code |
| Dashboard access control | Cloudflare Access (recommended) or IP allow-list | protects `deploy.fablabfortsmith.org` |
| GitHub App for Coolify | install on `FabLab-Fort-Smith` | richest integration (previews + commit status) |
| Local tools | `ansible`, `ssh`, `git`, `gh` | `ansible-galaxy` comes with ansible-core |

**Secrets to have ready** (generate or pull from your secret store — never commit; you'll paste
these into Coolify env at the app step). The app **fails to boot** if any required one is missing
(`src/lib/env.js`):

| Secret | Required | How to get / generate |
|---|---|---|
| `MONGODB_URI` | ✅ | produced when you create the Coolify Mongo service (step 4b) |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 48` |
| `JWT_SECRET` | ✅ | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | ✅ | **exactly 32 bytes** — `openssl rand -base64 24` (24 b64 → 32 chars) or a 32-char string |
| `INTERNAL_API_SECRET` | ✅ | `openssl rand -base64 32` |
| `SOCKET_API_SECRET` | ✅ | `openssl rand -base64 32` (now required — The-Lab PR #132) |
| `SQUARE_ACCESS_TOKEN` | ✅ | Square dashboard — **Sandbox** token first |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | ✅ | Square webhook config (sandbox) |
| `SQUARE_APPLICATION_ID` / `LOCATION_ID` | ✅ (app) | Square sandbox app |
| `S3_*` (endpoint/bucket/keys) | ✅ (app) | **separate** bucket/prefix for staging (don't reuse prod) |
| `SMTP_*` | ✅ (app) | a test/limited sender for staging |
| `GOOGLE_GENAI_API_KEY` | ✅ (app) | Google AI Studio |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` + secret | ✅ (app) | reCAPTCHA admin |
| `WS_SERVER_URL` / `ACCESS_CONTROL_API_URL` | if using IoT tier | the socket server URL |
| Cloudflare API token | ✅ | scoped DNS-edit (above) |

> ⚠️ **Migration guardrails** (`migrate-from-vercel.md`): use **Square sandbox**, a **separate
> MongoDB** (don't point at prod data), and **separate S3/SMTP** for staging. **Do not** change
> the apex DNS. Vercel stays production and is your rollback.

---

## 1. Order the VPS
1. RackNerd → order the 8 GB KVM VPS, OS = **Ubuntu 24.04**. Note the **public IP**.
2. (Optional) set reverse DNS / hostname `fablab-prod`.

## 2. First-boot hardening
RackNerd/SolusVM usually can't inject cloud-init, so use the manual script.

**Option A — manual (typical for RackNerd):** SSH in as root (creds from the panel), then:
```bash
# copy the script up (from your laptop, in the repo):
scp lab-stack/cloud-init/manual-bootstrap.sh root@<vps-ip>:/root/
# on the VPS:
DEPLOY_PUBKEY="$(cat ~/.ssh/fablab_deploy.pub)" bash /root/manual-bootstrap.sh   # paste your pubkey
```
**Option B — cloud-init (if your panel supports user-data):** paste `lab-stack/cloud-init/user-data.yaml`
(replace the SSH key placeholder) as the instance user-data.

**Verify (from your laptop):**
```bash
ssh -i ~/.ssh/fablab_deploy deploy@<vps-ip> 'echo ok'   # works
ssh root@<vps-ip>                                        # MUST be refused
```

## 3. DNS (Cloudflare) — staging/preview only (NOT the apex)
In the Cloudflare dashboard for `fablabfortsmith.org`, add **proxied** (orange-cloud) records → VPS IP:

| Name | Type | Value | Proxy |
|---|---|---|---|
| `deploy` | A | `<vps-ip>` | proxied (also behind Access) |
| `staging` | A | `<vps-ip>` | proxied |
| `*.preview` | A | `<vps-ip>` | proxied (PR previews) |

- **Leave the apex `@` / `www` pointing at Vercel.** (Apex cutover is a later, gated step.)
- SSL/TLS mode → **Full (strict)**. Enable **Always Use HTTPS** + **HSTS**.
- Create the scoped **Cloudflare API token** (Zone › DNS › Edit) — you'll give it to Coolify for
  wildcard ACME.

## 4. Converge the host with Ansible
From the repo on your laptop:
```bash
cd lab-stack/ansible
cp inventory.example.ini inventory.ini      # set: <vps-ip>, ansible_user=deploy, key path
cp group_vars/all.example.yml group_vars/all.yml
#   edit all.yml: primary_domain already fablabfortsmith.org; PASTE the FULL current
#   Cloudflare IP ranges from https://www.cloudflare.com/ips (v4 + v6).
cd ..            # back to lab-stack/
make deps        # installs Galaxy collections
make ping        # SSH reachability check
make converge-check   # DRY RUN — review the diff, no changes
make converge         # APPLY: hardening + Docker + Coolify + backups
```
**Expected:** Docker running; Coolify reachable at `https://deploy.fablabfortsmith.org`;
UFW allows 80/443 **only from Cloudflare ranges** + SSH.

## 5. Configure Coolify (dashboard) — see `lab-stack/coolify/README.md`
**a. Secure it first:** create the admin account, **enable MFA**, and put `deploy.fablabfortsmith.org`
behind **Cloudflare Access** (or the IP allow-list). Never expose it openly.

**b. MongoDB service:** add a **MongoDB** resource on Coolify's **private network** (not publicly
exposed). Set a strong root password; create a least-privilege **app user + database**. Copy the
resulting connection string → this is your `MONGODB_URI`.

**c. Cloudflare token for TLS:** add the scoped Cloudflare API token so Traefik can issue the
`*.preview.fablabfortsmith.org` wildcard cert via DNS-01.

**d. Connect Git:** install/connect the **GitHub App** to `FabLab-Fort-Smith`; select the
**`fablab`** repo.

**e. Create the application:**
- Source: `FabLab-Fort-Smith/fablab`, **Base Directory = `lab-site/the-lab`**, build via its
  **Dockerfile** (already added; Next.js `output: 'standalone'`).
- Environments → branches: **production = `main`**, **staging = `dev`**. For now map the app to
  **`staging.fablabfortsmith.org`** (the `dev` branch). **Do not** bind the apex yet.
- Enable **PR preview deployments** with domain `*.preview.fablabfortsmith.org`.
- **Env vars:** paste every secret from the §0 checklist (Square = **sandbox**). Preview envs get
  **no production secrets**.

## 6. Backups + restore drill (don't skip)
- Confirm the daily MongoDB dump runs (`/usr/local/sbin/fablab-backup-mongo`, cron at 03:00 UTC).
- Wire the **off-box** target (S3/restic) + encryption in `lab-stack/ansible/roles/backups`.
- **Do a restore drill** into a throwaway DB and verify counts (`backup-restore.md`). An untested
  backup is not a backup.

## 7. Verify (parallel-run)
- `https://staging.fablabfortsmith.org` serves The-Lab over HTTPS (valid cert).
- Open a PR in `fablab` → a `pr-<n>.preview.fablabfortsmith.org` env appears, then is cleaned up on close.
- A push to `dev` redeploys staging automatically (instant-deploy works).
- **Direct-to-origin is blocked:** `curl -I http://<vps-ip>` from off-Cloudflare should fail/refuse.
- Backups present + a successful restore drill.
- Apex still serves the **Vercel** production site (unchanged).

## Verification checklist
- [ ] `ssh deploy@ip` works; root/password refused.
- [ ] `make converge` clean; Coolify behind Access + MFA.
- [ ] MongoDB private-only; `MONGODB_URI` captured; least-priv app user.
- [ ] App live on `staging.`; PR previews + wildcard TLS work; push-to-deploy works.
- [ ] Origin firewalled to Cloudflare; TLS Full(strict) + HSTS.
- [ ] Backups running + restore-drilled.
- [ ] Apex unchanged (Vercel). Square in **sandbox**. Separate DB/S3/SMTP.

## What NOT to do here (it's the gated cutover, later)
- Don't point the **apex** at the VPS, don't switch **Square to production**, don't migrate
  production MongoDB data. That's `migrate-from-vercel.md` — a separate, human-approved step.

## Escalation
- Page `<on-call>`; any secret exposure → `incident-response.md` + `secret-rotation.md`.

## Related
- `migrate-from-vercel.md`, `backup-restore.md`, `secret-rotation.md`;
  `lab-stack/coolify/README.md`, `lab-stack/cloudflare/README.md`, `lab-stack/README.md`.

---
_Last validated: never (draft — validate on first run). Owner: platform._
