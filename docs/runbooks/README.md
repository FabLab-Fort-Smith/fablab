# Runbooks

Operational procedures for the deploy platform, per `@rules/workflow-runbooks.md`. Each is
step-by-step and executable by someone who didn't write it.

> **Interactive catalog:** these runbooks also render as an interactive, accessible **web
> checklist catalog** (grouped by category & usage, with per-runbook progress) — build it from
> `site/` (`cd site && npm ci && npm run build && npm run serve`, tailnet-only, never public).
> Source stays the markdown here; see `site/README.md`. Add front-matter (`category`, `usage`,
> `order`, `summary`) to a runbook to place it in the catalog.

> **Status:** the platform is provisioned and staging is live — the core runbooks below are
> written and several are validated. An untested runbook is a hypothesis; each carries its own
> `Last validated` line.

## Planned set (priority order for this platform)

- [x] **bootstrap-vps.md** — **full setup & configuration guide**: order VPS → first-boot
      hardening (cloud-init or `manual-bootstrap.sh`) → Cloudflare DNS (staging/preview only) →
      Ansible converge → Coolify (MongoDB, GitHub App, app, previews, TLS) → backups → verify.
      Parallel-run; apex stays on Vercel. *(validated 2026-07-12 on the real VPS)*
- [x] **migrate-from-vercel.md** — the parallel-run → data-migrate → validate → DNS-cutover →
      decommission flow, incl. MongoDB export/restore/reconcile. *(drafted — rehearse before cutover)*
- [x] **promote-staging-to-prod.md** — promote `main` to the apex via `reconcile.sh --env
      production`, plus the **record of the 2026-08-03 Vercel→Coolify cutover** and the accepted
      risks taken with it. *(validated 2026-08-03 — it is the cutover as executed)*
- [x] **deploy-app.md** — deploy/promote a site version via the Coolify API (push-to-deploy is
      automatic; documents the manual/break-glass path).
- [x] **redeploy-rollback.md** — redeploy the current ref, force a clean rebuild, or roll back to a
      previous Coolify deployment (with DB-migration + Vercel-rollback caveats).
- [x] **rebuild-coolify-from-code.md** — recreate the Coolify app + env from code (`reconcile.sh`).
- [x] **agent-ssh-access.md** — short-lived SSH certs for agents via the SSH CA (ADR 0011;
      feature present, not yet enabled). *(scaffold — not yet drilled)*
- [x] **secret-rotation.md** — rotate the SSH CA key + certs (KRL revoke), deploy/automation keys,
      app/local secrets, and provider tokens; zero-downtime, revoke-first on compromise.
- [x] **coolify-token-rotation.md** — mint/validate/store/revoke the Coolify API token. A dead
      token fails with a bare HTTP 401 and stops **all** deploys + config-as-code while the
      platform still looks healthy. *(validated 2026-08-03 — real rotation after an OOB reset)*
- [x] **backup-restore.md** — back up the self-hosted MongoDB; **tested** restore drill (strict,
      automated: `lab-stack/scripts/mongo-restore-drill.sh`). *(validated 2026-07-12 — caught + fixed
      a missing app user)*
- [x] **safe-remote-change.md** — safeguards before any lock-out-capable remote change
      (firewall/sshd/network): keep a 2nd session, test before reload, arm a dead-man's-switch
      auto-revert, and use the RackNerd console as break-glass. *(scaffold — rehearse the revert)*
- [x] **shared-custody.md** — eliminate key-person risk: per-person identities, ≥2 custodians per
      recovery credential, shared off-box secret vault, onboarding/offboarding checklist.
      *(created — not yet drilled; validate via a second custodian)*
- [x] **provider-provisioning.md** — provision provider keys/tokens: Tier-2 API-automated
      (`make provision-keys`, incl. Cloudflare Turnstile) vs. Tier-3 console-only checklist (ADR 0015).
- [x] **door-fleet-rekey.md** — rotate the door master index key (`DOOR_CARD_INDEX_KEY`) and re-key the
      whole door fleet: re-derive every broker/edge index key, switch the cloud to new-keyed envelopes,
      re-provision recipients; online stays up (offline fails secure) throughout. *(scaffold — drill on
      the bench fleet before a real rotation)*
- [ ] **incident-response.md** — triage/contain/recover (esp. compromised webhook or build).
- [ ] **add-new-site.md** — add a `lab-site/<new-site>/` and wire it as a Coolify application.
- [ ] **on-call.md** — alert response & escalation.

See `~/.claude/rules/runbooks/_TEMPLATE.md` for the structure.
