# Runbook: Bootstrap the VPS

> Stand up the deploy platform on a fresh VPS. Rules: `@rules/workflow-bootstrap.md`,
> `@rules/std-cis.md`, ADRs 0002/0004/0007. **STATUS: draft — validate on first real run.**

## When to use
- Provisioning the platform for the first time, or rebuilding it on a new VPS.

## Severity / impact
- Build-time; no production traffic until DNS cutover (`migrate-from-vercel.md`).

## Prerequisites & access
- A fresh **Ubuntu LTS** VPS (RackNerd 8 GB — ordered manually; no Terraform provider, ADR 0004).
- Your SSH **public** key; `ansible` + `ansible-galaxy` locally; the secret store reachable.
- Cloudflare zone for `<domain>`; GitHub App / GitLab access (ADR 0003).

## Steps
1. **Order** the VPS (Ubuntu LTS). Note its IP.
2. **First boot:** apply `lab-stack/cloud-init/user-data.yaml` (replace the SSH key placeholder)
   → creates `deploy` user, disables root/password SSH, base UFW + fail2ban + auto-updates.
   Expected: you can `ssh deploy@<ip>` with your key; root/password login refused.
3. **Configure Ansible:** in `lab-stack/`, copy `ansible/inventory.example.ini` → `inventory.ini`
   (set host/IP) and `ansible/group_vars/all.example.yml` → `all.yml` (set `primary_domain`,
   `coolify_fqdn`, full Cloudflare IP ranges). `make deps`.
4. **Dry-run:** `make converge-check` → review the diff (no changes made).
5. **(GATED) Converge:** `make converge` → harden + Docker + Coolify + backups.
   Expected: Docker running; Coolify reachable at `https://<coolify_fqdn>`.
6. **Secure Coolify + add services** per `lab-stack/coolify/README.md` (admin+MFA behind
   Access; MongoDB on private net; app base dir `lab-site/the-lab`; webhooks; envs main/dev).
7. **DNS + origin lock** per `lab-stack/cloudflare/README.md` (proxied records incl.
   `*.preview`; SSL Full(strict); 80/443 limited to Cloudflare).
8. **Backups:** confirm the daily MongoDB dump runs and **do a restore drill**
   (`backup-restore.md`).

## Verification
- `make ping` succeeds; Coolify dashboard loads behind Access; a test app deploys and serves
  over HTTPS; a PR opens a `pr-N.preview.<domain>` env; direct-to-origin (non-Cloudflare) request
  is blocked. Verify the seven features (`docs/architecture/overview.md` §1).

## Rollback / abort
- Pre-cutover nothing is live — tear down and re-run. The VPS is reproducible from this repo.

## Escalation
- Page `<on-call>`; for any secret exposure follow `incident-response.md` + `secret-rotation.md`.

## Related
- `migrate-from-vercel.md`, `backup-restore.md`, `secret-rotation.md`;
  `lab-stack/coolify/README.md`, `lab-stack/cloudflare/README.md`.

---
_Last validated: never (draft). Owner: platform._
