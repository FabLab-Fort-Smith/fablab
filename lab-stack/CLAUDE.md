# lab-stack — infrastructure rules

> Inherits the master SSDLC ruleset and the repo-root `CLAUDE.md` (monorepo) automatically.
> This is the **deploy platform** — an infrastructure repo. Config as code; no click-ops.

## Applied rule modules
@~/.claude/rules/topic-iac-cloud.md
@~/.claude/rules/std-cis.md
@~/.claude/rules/std-zero-trust.md
@~/.claude/rules/topic-logging-observability.md
@~/.claude/rules/topic-webhooks.md
@~/.claude/rules/topic-reliability.md
@~/.claude/rules/topic-database.md
@~/.claude/rules/std-privacy.md
@~/.claude/rules/workflow-threat-model.md
@~/.claude/rules/workflow-incident-response.md
@~/.claude/rules/workflow-runbooks.md
@~/.claude/rules/workflow-data-lifecycle.md
@~/.claude/rules/lang-shell.md
# @~/.claude/rules/topic-container-k8s.md  # only if we ever move to K8s (we use Docker/Compose)

## Stack
- Host: RackNerd 8 GB KVM VPS, Ubuntu LTS (provider-agnostic config — ADR 0004).
- Config tooling: cloud-init + Ansible (idempotent). Docker + Coolify.
- Proxy/TLS: Traefik (Coolify-managed) + Let's Encrypt. Edge: Cloudflare.
- Data: **self-hosted MongoDB**, standalone Docker via the Ansible `mongodb` role on the private
  network (ADR 0010, superseding the Coolify-managed service in ADR 0007); holds
  personal/payment-adjacent data → *restricted* (master §5). S3/SMTP are external.

## Component-specific rules
- **No click-ops for what can be code.** Coolify's UI is a necessary source of truth for some
  app config; export/back it up and document it. Host + bootstrap stay as reviewed code.
- **Least privilege:** non-root `deploy` user; per-workload identities; scoped Cloudflare/forge
  tokens; no shared "god" creds (`@rules/workflow-secrets.md`).
- **Webhook = trust boundary:** verify HMAC on the raw body before acting; replay protection;
  per-forge secret (`@rules/topic-webhooks.md`, see `docs/security/threat-model.md`).
- **Builds are untrusted:** isolated, non-root, ephemeral; no prod secrets in build/preview envs.
- **Zero-trust origin:** firewall the VPS to accept web traffic only from Cloudflare; TLS
  everywhere; never trust the network (`@rules/std-zero-trust.md`).
- **MongoDB on the VPS:** private network only (never public), strong auth, TLS, at-rest
  encryption, least-privilege app user (`@rules/topic-database.md`); store **no PAN/SAD**
  (Square tokenized — `@rules/std-pci.md`, handled app-side).
- **Backups + tested restore** for Coolify config **and the MongoDB data** (personal data —
  encrypted, off-box, restore-drilled); single-VPS SPOF mitigated, not ignored
  (`@rules/workflow-data-lifecycle.md`, `@rules/topic-reliability.md`).
- **Never commit:** state files, `.tfvars`/secret-bearing vars, SSH/TLS keys, tokens (`.gitignore`).
