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
| Database | **MongoDB** (Coolify service, private network) | the app's datastore (ADR 0007) |
| Edge | **Cloudflare** (free) | CDN cache, edge TLS, WAF/DDoS, DNS |
| Host config | **cloud-init + Ansible** | OS hardening, Docker, Coolify install (ADR 0004) |
| Source | **GitHub + GitLab** (mirrored) | webhooks → Coolify (ADR 0003) |

**External (not hosted here, ADR 0007):** S3-compatible object storage (`s3.crittercodes.dev`),
SMTP email, Square payments, Google GenAI — the app connects out; treated as untrusted upstreams.

## Directory layout (scaffolded — drafted, not yet applied)

```
lab-stack/
├── README.md
├── CLAUDE.md
├── Makefile              # task runner: deps / lint / ping / converge-check / converge
├── cloud-init/
│   └── user-data.yaml    # first-boot: deploy user, SSH hardening, UFW, fail2ban, auto-updates
├── ansible/              # idempotent host convergence
│   ├── ansible.cfg
│   ├── requirements.yml  # galaxy collections (community.general, ansible.posix)
│   ├── inventory.example.ini
│   ├── group_vars/all.example.yml
│   ├── playbook.yml      # harden → docker → coolify → backups
│   └── roles/{harden,docker,coolify,backups}/
├── coolify/README.md     # dashboard config: MongoDB service, app base-dir, webhooks, TLS
└── cloudflare/README.md  # DNS (+ *.preview wildcard), origin lockdown, cache/WAF
```

> **Drafted, not validated.** The Ansible roles and scripts are starter IaC to review and test
> on the real VPS — applying them (`make converge`) is a **gated** action. `coolify/` and
> `cloudflare/` are step-by-step guides for the dashboard config that isn't pure code.

## Build sequence (high level — becomes `docs/runbooks/bootstrap-vps.md`)

1. **Order** RackNerd 8 GB VPS, Ubuntu LTS (manual — ADR 0004); record IP in `.env`.
2. **cloud-init** first boot: non-root `deploy` user, SSH keys only, disable root/password login,
   base firewall, unattended-upgrades.
3. **Ansible** converge: Docker, host hardening (CIS — `@rules/std-cis.md`), `fail2ban`, firewall
   (allow Cloudflare ranges → 80/443; SSH restricted), backup agent.
4. **Install Coolify**; secure the dashboard (auth + MFA, behind Cloudflare Access/allow-list).
5. **MongoDB service** in Coolify on the **private network** (not public): strong auth, TLS,
   at-rest encryption, least-privilege app user; wire **automated encrypted off-box backups +
   a tested restore** (ADR 0007, `@rules/workflow-data-lifecycle.md`).
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

🟡 **IaC scaffolded, not applied.** cloud-init + Ansible roles + Coolify/Cloudflare guides +
runbooks exist as drafts. Nothing provisioned — `make converge` and DNS cutover are **gated**
and need the VPS, secrets, and the open decisions (domain, primary forge) settled first.
