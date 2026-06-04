# ADR 0006 — Migrate The-Lab from Vercel to self-hosted Coolify

- **Status:** Accepted
- **Date:** 2026-06-03

## Context

The-Lab runs on Vercel today. The goal of this project is to replicate Vercel's instant-deploy
UX on our own stack (ADR 0002) and run the app there for control and cost. This is a
**migration of a live, payment-handling app**, so it must be incremental and reversible, not
big-bang (`@rules/topic-migration.md`).

## Decision

Migrate using a **parallel-run then cutover** strategy:

1. **Stand up** `lab-stack` (Coolify + Traefik + MongoDB) on the VPS (ADRs 0004, 0007); wire
   GitHub/GitLab webhooks (ADR 0003) and Cloudflare DNS/edge.
2. **Deploy The-Lab to Coolify in parallel** with Vercel, on a non-production hostname (e.g.
   `staging.<domain>` / a preview), pointing at the same external services (S3, SMTP, Square
   **sandbox** first) and a fresh self-hosted MongoDB.
3. **Validate** on the Coolify deployment: full E2E + security gates green, the seven Vercel
   features verified (overview §1), CSP/headers intact, payments in **Square sandbox**, data
   migration of MongoDB rehearsed and reconciled.
4. **Cut over** DNS to the VPS (via Cloudflare) once confidence is high; keep Vercel as instant
   rollback for a defined window (feature-flag/DNS revert).
5. **Decommission** Vercel after a stable period; archive The-Lab repo per ADR 0005.

## Rationale

- A live app with auth/payments can't risk a hard switch — parallel-run lets us compare and
  revert via DNS instantly.
- Cloudflare in front makes cutover a DNS/proxy change, not a redeploy.
- Square **sandbox** during validation avoids touching real cardholder flows until verified
  (`@rules/std-pci.md`).

## Consequences

- **Positive:** low-risk, reversible cutover; Vercel remains a rollback during the window.
- **Negative / accepted:**
  - **Data migration** of MongoDB (Vercel-era store → self-hosted) must be planned: export,
    restore, reconcile counts/checksums, and a backfill/sync window to avoid data loss
    (`@rules/topic-database.md`, `@rules/workflow-data-lifecycle.md`).
  - **Env/secret re-creation** in Coolify/secret store for every integration (ADR 0007).
  - **DNS TTL / cert issuance** timing during cutover — lower TTLs ahead of time; pre-issue TLS.
  - Brief period running **two environments** (cost + drift) — time-boxed.

## Migration checklist (becomes `docs/runbooks/`)

- [ ] MongoDB data export + test restore on the VPS; reconciliation.
- [ ] Recreate all secrets/integrations in Coolify (Square sandbox→prod last).
- [ ] Parallel deploy on staging hostname; run E2E + security gates; verify 7 features.
- [ ] Lower DNS TTL; cut over via Cloudflare; smoke test; watch SLOs.
- [ ] Hold Vercel as rollback; then decommission + archive The-Lab.

## Alternatives considered

- **Big-bang cutover** — rejected: unacceptable risk for a payment-handling app.
- **Stay on Vercel** — rejected: the project's purpose is self-hosting for control/cost.
