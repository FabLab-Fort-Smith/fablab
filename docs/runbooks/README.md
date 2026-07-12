# Runbooks

Operational procedures for the deploy platform, per `@rules/workflow-runbooks.md`. Each is
step-by-step and executable by someone who didn't write it.

> **Interactive catalog:** these runbooks also render as an interactive, accessible **web
> checklist catalog** (grouped by category & usage, with per-runbook progress) — build it from
> `site/` (`cd site && npm ci && npm run build && npm run serve`, tailnet-only, never public).
> Source stays the markdown here; see `site/README.md`. Add front-matter (`category`, `usage`,
> `order`, `summary`) to a runbook to place it in the catalog.

> **Status:** to be written once `lab-stack` is provisioned. Copy from the SSDLC templates in
> `~/.claude/rules/runbooks/` and fill in real commands. An untested runbook is a hypothesis —
> validate each in a drill.

## Planned set (priority order for this platform)

- [x] **bootstrap-vps.md** — **full setup & configuration guide**: order VPS → first-boot
      hardening (cloud-init or `manual-bootstrap.sh`) → Cloudflare DNS (staging/preview only) →
      Ansible converge → Coolify (MongoDB, GitHub App, app, previews, TLS) → backups → verify.
      Parallel-run; apex stays on Vercel. *(validate on first run)*
- [x] **migrate-from-vercel.md** — the parallel-run → data-migrate → validate → DNS-cutover →
      decommission flow, incl. MongoDB export/restore/reconcile. *(drafted — rehearse on staging)*
- [ ] **deploy.md** — promote/release a site version (mostly automatic via Coolify; documents
      the manual/break-glass path).
- [ ] **rollback.md** — roll a site back to a previous Coolify deployment.
- [x] **secret-rotation.md** — rotate the SSH CA key + certs (KRL revoke), deploy/automation keys,
      app/local secrets, and provider tokens; zero-downtime, revoke-first on compromise.
- [ ] **backup-restore.md** — back up Coolify config + site data; **tested** restore drill.
- [ ] **incident-response.md** — triage/contain/recover (esp. compromised webhook or build).
- [ ] **add-new-site.md** — add a `lab-site/<new-site>/` and wire it as a Coolify application.
- [ ] **on-call.md** — alert response & escalation.

See `~/.claude/rules/runbooks/_TEMPLATE.md` for the structure.
