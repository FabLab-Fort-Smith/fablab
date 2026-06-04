# Runbooks

Operational procedures for the deploy platform, per `@rules/workflow-runbooks.md`. Each is
step-by-step and executable by someone who didn't write it.

> **Status:** to be written once `lab-stack` is provisioned. Copy from the SSDLC templates in
> `~/.claude/rules/runbooks/` and fill in real commands. An untested runbook is a hypothesis —
> validate each in a drill.

## Planned set (priority order for this platform)

- [ ] **bootstrap-vps.md** — order/prepare the RackNerd VPS, run cloud-init + Ansible, install
      Coolify + MongoDB service, point DNS + Cloudflare. (The out-of-band steps from ADR 0004.)
- [ ] **migrate-from-vercel.md** — the parallel-run → data-migrate → validate → DNS-cutover →
      decommission flow, incl. MongoDB export/restore/reconcile (ADR 0006).
- [ ] **deploy.md** — promote/release a site version (mostly automatic via Coolify; documents
      the manual/break-glass path).
- [ ] **rollback.md** — roll a site back to a previous Coolify deployment.
- [ ] **secret-rotation.md** — rotate webhook HMAC secrets, deploy tokens, Cloudflare/SSH keys.
- [ ] **backup-restore.md** — back up Coolify config + site data; **tested** restore drill.
- [ ] **incident-response.md** — triage/contain/recover (esp. compromised webhook or build).
- [ ] **add-new-site.md** — add a `lab-site/<new-site>/` and wire it as a Coolify application.
- [ ] **on-call.md** — alert response & escalation.

See `~/.claude/rules/runbooks/_TEMPLATE.md` for the structure.
