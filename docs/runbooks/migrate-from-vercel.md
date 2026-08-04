---
title: Migrate The-Lab from Vercel to Coolify
category: Deploy & Release
usage: Gated cutover (one-time)
order: 20
summary: The gated production cutover from Vercel to the self-hosted Coolify platform — do-not-break-Vercel guardrails.
---

# Runbook: Migrate The-Lab from Vercel to Coolify

> Parallel-run → migrate data → validate → DNS cutover → decommission. Rules:
> `@rules/topic-migration.md`, `@rules/workflow-data-lifecycle.md`, ADR 0006.
> **STATUS: draft — rehearse on staging first. Payment-handling app: be conservative.**
>
> **⛔ HOLD (owner directive, 2026-07-12): the production cutover is BLOCKED until the
> [Pre-cutover validation gate](#pre-cutover-validation-gate-hold) below is fully signed off —
> regardless of how ready the stack appears.** No apex/`www` DNS change, no Square sandbox→prod
> flip, no prod-traffic move until then.

> ## ✅ COMPLETED 2026-08-03 — this plan is now HISTORY
> The cutover happened on 2026-08-03: the apex + `www` are served by the `the-lab-production`
> Coolify app, and the **Vercel project was deleted**. For how production is deployed now, and the
> record of what was actually done, see **`promote-staging-to-prod.md`**.
>
> The guardrails and the pre-cutover gate below were written while Vercel was live and are kept for
> the audit trail. Several were **superseded rather than satisfied** — the owner deleted the Vercel
> project first, which removed both the live service to protect and the DNS-revert rollback. The
> resulting accepted risks are recorded in `promote-staging-to-prod.md` §Accepted risks.

## Guardrails — do NOT break the live Vercel pipeline (historical)

Until the deliberate, **gated DNS cutover**, **Vercel stays production**. The migration must run
fully in parallel and must not be able to affect it. Enforce all of these:

1. **Leave `The-Lab` + its Vercel project alone.** Don't change Vercel settings, env vars,
   domains, or builds. Consolidation **copies code into the `fablab` repo** (`git subtree`, a
   read of `The-Lab`); `The-Lab` keeps deploying to Vercel unchanged until decommission.
2. **Deploy-source isolation.** Coolify deploys from **`fablab`**, not `The-Lab`, so Vercel's
   repo-triggered deploys are unaffected. App-only changes (e.g. `output: 'standalone'`) go in
   the **`fablab` copy only** — never commit them to `The-Lab` (could alter Vercel's build).
3. **Separate database.** Self-hosted MongoDB is a **distinct DB seeded from a copy/restore** of
   prod — **never point the new stack at the production database**; no dual-writes to prod data.
4. **Square in sandbox.** New stack uses **Square sandbox** keys until cutover; do not reuse the
   production payment keys/webhook (no real charges; no interference with the prod webhook).
5. **Don't share mutable external state.** Use a **separate S3 bucket/prefix** and a
   test/limited SMTP sender for staging so the parallel stack can't write to / email from prod.
6. **No DNS changes until cutover.** `fablabfortsmith.org` keeps pointing at Vercel; Cloudflare
   records for the VPS use **non-production hostnames** (e.g. `staging.`/`pr-*.preview.`) only.
   Lower TTL **just before** the planned cutover, not now.
7. **Vercel = rollback.** Keep Vercel live through a defined post-cutover window; rollback =
   revert DNS to Vercel (and Square keys). **Decommission only after stable** (ADR 0006).

> If any step here would touch Vercel, production DNS, the prod DB, or real payments — **stop**;
> it's a gated action (`@rules/workflow-gated-actions.md`).

## Pre-cutover validation gate (HOLD)

**The cutover (step 7) MUST NOT proceed until every item below is checked AND the owner records an
explicit sign-off.** This is the gate the owner's HOLD refers to — treat an unchecked box as a hard
block, not a suggestion. Capture evidence (a link/PR/log) next to each as it's completed.

- [ ] **Staging soak** — The-Lab has run on the VPS (`staging.fablabfortsmith.org`) for a defined
      period with **no error-rate/latency regression vs. Vercel**; SLOs met (`@rules/topic-reliability.md`).
- [ ] **E2E on primary journeys (green)** — auth (login/session), the **Square sandbox** payment
      flow, MongoDB read/write, transactional email, and the GenAI path (`@rules/topic-testing.md`).
- [ ] **Data migration rehearsed** — source Mongo **export → restore into the VPS instance →
      reconcile counts/checksums**; dual-write/sync window planned so no writes are lost during
      cutover (`@rules/topic-database.md`, step 4).
- [ ] **Backups proven** — age at-rest + restic off-box **enabled** (currently pending —
      `backup-restore.md` §Enabling) **and a restore drill actually passed** on real backup data.
- [ ] **Rollback rehearsed** — DNS-revert-to-Vercel tested end-to-end; Coolify previous-deployment
      rollback confirmed; low TTL plan ready (`rollback.md`, steps 6/8).
- [ ] **Security review at the new prod boundary** — threat model re-reviewed for the cutover
      (`@rules/workflow-threat-model.md`, `docs/security/threat-model.md`); secrets/redaction, CSP,
      and security headers verified on the VPS path.
- [ ] **PCI / Square production check** — SAQ-A scope re-confirmed **before** flipping Square
      sandbox→production (`@rules/std-pci.md`): hosted/tokenized fields only, **no SAD stored**,
      webhook HMAC verified against the production signing key.
- [ ] **Owner sign-off** — explicit human go recorded here: `signed-off-by: ______  date: ______`.

> Until this gate is signed off, the platform stays in **parallel-run** (staging only); Vercel
> remains production. Re-open the gate if the design or scope changes materially.

## When to use
- Moving the live The-Lab app off Vercel onto the self-hosted Coolify stack.

## Severity / impact
- High — production app with auth + payments. Reversible by DNS revert until decommission.

## Prerequisites & access
- `bootstrap-vps.md` complete (Coolify + MongoDB + app configured, Square **sandbox**).
- Access to: Vercel project + env vars, the source MongoDB, Cloudflare DNS, the secret store.
- A maintenance/low-traffic window for the final cutover.

## Steps
1. **Consolidate source** (if not done): bring The-Lab into `lab-site/the-lab/` via `git subtree`
   (preserves history — ADR 0005); set `output: 'standalone'`; fix Dockerfile/CI paths.
2. **Recreate env/secrets** in Coolify/secret store for every integration (Mongo, AUTH_SECRET,
   S3, SMTP, Square **sandbox**, GenAI, reCAPTCHA — `.env.example`).
3. **Parallel deploy** to a staging hostname (`dev.<domain>` from `dev`), pointing at the new
   self-hosted MongoDB. Do **not** take production traffic yet.
4. **Migrate data:** export the source MongoDB → restore into the VPS instance →
   **reconcile counts/checksums**. Plan a dual-write/sync window if the source keeps changing
   (avoid data loss — `@rules/topic-database.md`).
5. **Validate** on staging: full E2E + security gates green; the seven features
   (`overview.md` §1); CSP/headers intact; payments in **Square sandbox**; backups + a
   **restore drill** pass.
6. **Lower DNS TTL** ahead of cutover (e.g. 5 min).
7. **(GATED — blocked until the [Pre-cutover validation gate](#pre-cutover-validation-gate-hold)
   is fully signed off) Cut over:** flip Coolify production to `main` on `<domain>`; switch
   Cloudflare DNS to the VPS; switch Square to **production** keys; smoke-test checkout + auth;
   watch SLOs/logs. **Do not start this step with any gate box unchecked.**
8. **Hold Vercel** as instant rollback for a defined window (DNS revert).
9. **Decommission** Vercel after a stable period; **archive** the old repo per ADR 0005
   (folders-only casing — org/repo name unchanged).

## Verification
- Production serves from the VPS over HTTPS; auth + a real (small) payment succeed; preview envs
  work on PRs; error rate/latency within budget; backups running + restore-tested.

## Rollback / abort
- Revert Cloudflare DNS to Vercel (fast, since TTL was lowered) and Square back to the prior
  keys; investigate before retrying. If data diverged post-cutover, reconcile from backups
  (`backup-restore.md`).

## Escalation
- Page `<on-call>` / incident commander; payment or data issues → `incident-response.md`.

## Related
- `bootstrap-vps.md`, `backup-restore.md`, `rollback.md`, `incident-response.md`;
  ADR 0006, ADR 0007.

---
_Last validated: never (draft). Owner: platform._
