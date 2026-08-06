# lab-stack — the deploy platform (VPS content)

This is **the platform itself**: everything that turns a git push into a live, HTTPS site with
preview deployments — the self-hosted equivalent of "Vercel's infrastructure" — plus the
**self-hosted MongoDB** the app needs.

> Treated as an **infrastructure repo** (`@rules/templates/infrastructure-repo.md`). Config as
> code, no click-ops, PR-reviewed. See `CLAUDE.md` here.

## What runs here

| Layer | Component | Role |
|---|---|---|
| Deploy engine | **Coolify** | git-push deploy, preview envs, build, rollback (ADR 0002) |
| Reverse proxy | **Traefik** (Coolify-managed) | routing + Let's Encrypt TLS (incl. wildcard) |
| App runtime | **Next.js** containers (`main`/`dev`/`pr-N`) | The-Lab, `output: 'standalone'` |
| Database | **MongoDB** (standalone, Ansible-managed Docker; private network) | the app's datastore (ADR 0007/0010) |
| Edge | **Cloudflare** (free) | CDN cache, edge TLS, WAF/DDoS, DNS |
| Host config | **cloud-init + Ansible** | OS hardening, Docker, Coolify install (ADR 0004) |
| Source | **GitHub + GitLab** (mirrored) | webhooks → Coolify (ADR 0003) |

**External (not hosted here, ADR 0007):** S3-compatible object storage (`s3.crittercodes.dev`),
SMTP email, Square payments, Google GenAI — the app connects out; treated as untrusted upstreams.

## Directory layout (applied — provisioned on the VPS, 2026-07-12)

```
lab-stack/
├── README.md
├── CLAUDE.md
├── Makefile              # task runner: setup / secrets / secrets-pull / lint / test / ping / converge / dns / access / coolify-*
├── scripts/              # setup.sh, gen-secrets.sh, secrets-pull.sh, collect-keys.sh, mongo-restore-drill.sh (+ *.test.sh)
├── cloud-init/           # first-boot: users, SSH hardening, UFW, fail2ban, auto-updates (+ manual-bootstrap.sh)
├── ansible/              # idempotent host convergence
│   ├── ansible.cfg
│   ├── requirements.yml  # galaxy collections (community.general, ansible.posix)
│   ├── inventory.example.ini
│   ├── group_vars/all.example.yml
│   ├── playbook.yml      # harden → tailscale → zerotier → ssh_ca → deploy_account → automation_account → docker → mongodb → coolify → backups
│   └── roles/{harden,deploy_account,automation_account,docker,mongodb,coolify,backups,tailscale,zerotier,ssh_ca}/
├── coolify/              # reconcile.sh (API-driven app reconcile) + README (dashboard config)
├── cloudflare/           # dns.sh, access.sh (Cloudflare Access as code) + README, access-policy.md
├── racknerd/             # SolusVM control-plane API helper (api.sh)
└── ssh-ca/               # offline SSH CA + sign-ssh-cert.sh (ADR 0011; present, not enabled)
```

> **Provisioned + validated.** The VPS is converged from this code (`make converge`; `ok=60
> changed=0` idempotent), MongoDB + nightly restore-drilled backups are live, and The-Lab serves
> on staging. Applying changes to the real VPS is still a **gated** action. `coolify/` and
> `cloudflare/` also carry step-by-step guides for the dashboard config that isn't pure code.

## Build sequence (high level — becomes `docs/runbooks/bootstrap-vps.md`)

1. **Order** RackNerd 8 GB VPS, Ubuntu LTS (manual — ADR 0004); record IP in `.env`.
2. **cloud-init** first boot: non-root `deploy` user, SSH keys only, disable root/password login,
   base firewall, unattended-upgrades.
3. **Ansible** converge: Docker, host hardening (CIS — `@rules/std-cis.md`), `fail2ban`, firewall
   (allow Cloudflare ranges → 80/443; SSH restricted), backup agent.
4. **Install Coolify**; secure the dashboard (auth + MFA, behind Cloudflare Access/allow-list).
5. **MongoDB** — standalone Docker via the Ansible `mongodb` role (ADR 0010, not a Coolify
   service) on the **private network** (not public): strong auth, least-privilege app user
   (reconciled each converge); **automated backups + a tested restore drill**, with opt-in
   age-at-rest + restic off-box (`roles/backups`, `@rules/workflow-data-lifecycle.md`).
6. **Connect forges:** GitHub App + GitLab; webhook HMAC secrets in the secret store (ADR 0003).
7. **Secrets:** recreate all app integrations in Coolify/secret store (Mongo URI, AUTH_SECRET,
   S3, SMTP, Square **sandbox first**, GenAI, reCAPTCHA — see `.env.example`).
8. **DNS + Cloudflare:** point `<domain>`, `deploy.<domain>`, and `*.preview.<domain>` (wildcard)
   at the VPS; enable proxy; restrict origin to Cloudflare ranges.
9. **Deploy the app** (`lab-site/the-lab`, Coolify base directory): production from `main`
   branch, staging from `dev` branch; enable PR preview deployments.
10. **Migration:** run in **parallel with Vercel**, migrate MongoDB data + reconcile, validate
    (E2E + gates + 7 features), then **cut over DNS**; hold Vercel as rollback (ADR 0006).
11. **Verify** the seven features (`../docs/architecture/overview.md`) and write the runbooks.

## Security must-haves (from the threat model)

- Verify **webhook HMAC** before any deploy; per-forge secret; replay protection.
- **Isolated, non-root, ephemeral builds**; preview envs get **no production secrets/data**.
- **MongoDB private-network only**, authenticated, encrypted, backed up + restore-tested.
- **Origin firewalled** to Cloudflare; TLS everywhere; HSTS.
- **No PAN/SAD stored** anywhere (Square tokenized — `@rules/std-pci.md`).
- Secrets from the secret store/injected env — **never** in git, images, or logs.
- See [`../docs/security/threat-model.md`](../docs/security/threat-model.md).

## Status

🟢 **Provisioned + live.** The VPS is converged from this code (idempotent `make converge`),
self-hosted MongoDB + nightly restore-drilled backups run, and The-Lab serves on **staging** with
push-to-deploy + per-PR previews. The host is on **both** the Tailscale and ZeroTier meshes
(admin + shared-vault access is overlay-only, never public); platform secrets live in a shared
**Vaultwarden** vault, pulled into `.env` with `make secrets-pull`. Applying changes to the real
VPS remains a **gated** action. Prod (apex) cutover from Vercel **completed 2026-08-03** — apex + www are
served by `the-lab-production` (branch `main`); promote with `reconcile.sh --env production`
(docs/runbooks/promote-staging-to-prod.md).
