# Security & Architecture Audit — Executive Summary

**Project:** The-Lab (FabLab Fort Smith) — Next.js 16 App Router application
**Audit date:** 2026-05-29
**Type:** Static, read-only review. No source code was modified; no live or penetration testing was performed.
**Framework:** Security findings by severity (Critical/High/Medium/Low); architecture findings via the SOLID principles and module-boundary analysis.

## Companion reports
- [`01-security-findings.md`](./01-security-findings.md) — 22 security findings with `file:line` evidence and remediation.
- [`02-solid-violations.md`](./02-solid-violations.md) — SRP/OCP/LSP/ISP/DIP violations.
- [`03-boundary-violations.md`](./03-boundary-violations.md) — intended vs. actual layering, 8 boundary violations.
- [`04-p0-remediation-plan.md`](./04-p0-remediation-plan.md) — P0 work-breakdown (4 epics · 19 work items · 71 atomic tasks).
- [`05-engineering-process.md`](./05-engineering-process.md) — **binding** delivery governance: PR-only into `main`, one feature branch per work item (rollback unit), no downstream impact, full E2E testing on every touched file. All remediation follows this.
- [`06-security-standards.md`](./06-security-standards.md) — **binding** security baseline: encrypt everything (at rest + in transit), zero secrets in code/logs, no data leakage; mapped to OWASP ASVS / NIST / PCI-DSS / CIS and enforced as CI gates. Includes addendum findings SEC-23/24/25.

---

## Overall posture

The application is feature-rich (auth via Google/Discord/Credentials, MongoDB, Square payments + webhooks, S3 uploads, Discord integration, IoT door/equipment control, and a "Hack the Lab" CTF game). It also contains a **clean, correct reference pattern** in several features (`v1/bounties`, `v1/admin/plans`, `v1/transactions/award`) — auth at the edge, ownership checks in the service, thin routes.

The risk is concentrated where that discipline lapsed. The single most important systemic issue is that **`/api/*` is not covered by middleware** (`src/middleware.js:36-38`), so every API route must self-protect — and many do not. Layered on top are **hardcoded/committed secrets**, a **fail-open payment webhook**, and an **unauthenticated physical-access tier**. Several findings chain: no API auth + regex-based user lookup + client-controlled update fields = anonymous account takeover and privilege escalation.

**Headline risks**
- 🔴 Committed production database admin credentials.
- 🔴 Anonymous full CRUD over all users (read PII, set your own `role`/membership → admin).
- 🔴 Payment webhook and IoT access endpoints that trust by default / use hardcoded secrets.
- 🔴 Unauthenticated control of physical door/equipment via the VPS socket server.

> **CTF scoping:** the codebase intentionally plants fake secrets/flags as game content (e.g. `dashboard/activities/terminal/page.js:430`). Those were excluded from the findings; everything reported below is a real defect in the production application, not game content.

---

## Top findings (cross-referenced)

| # | Finding | Sev | Security | SOLID / Boundary |
|---|---------|:---:|----------|------------------|
| 1 | Hardcoded prod MongoDB admin creds in committed scripts | 🔴 | SEC-01 | BND-08 |
| 2 | Unauthenticated user CRUD → PII exposure + privilege escalation | 🔴 | SEC-02, SEC-12 | SRP-01, BND-02 |
| 3 | Square webhook signature verification fails open | 🔴 | SEC-03 (+16,17) | SRP-03, BND-05 |
| 4 | IoT access endpoints guarded by hardcoded fallback secret | 🔴 | SEC-04 | BND-06 |
| 5 | VPS socket-server: unauthenticated door/equipment control | 🔴 | SEC-05, SEC-06 | BND-06 |
| 6 | No middleware on `/api/*`; inconsistent self-protection | 🟠 | SEC-10 | BND-03 |
| 7 | JWT secret hardcoded fallback | 🟠 | SEC-07 | DIP-02 |
| 8 | Unauthenticated S3 upload, no validation, bucket auto-create | 🟠 | SEC-08 | SRP-02, BND-05 |
| 9 | SSRF in image proxy | 🟠 | SEC-09 | — |
| 10 | Admin role check commented out (card pairing) | 🟠 | SEC-11 | BND-06 |

The recurring theme: **structural shortcuts cause the security gaps.** A god-service (`UserService`, SRP-01) and a closed-for-extension `Database` singleton (OCP-01) pushed developers to bypass layers (`db` calls in routes, BND-02) and skip the auth seam, which is exactly where the Critical/High vulns live. Fixing the architecture and the vulnerabilities should be planned as one effort.

---

## Prioritized remediation roadmap

**P0 — contain now (hours–days)**
1. Rotate the leaked MongoDB credential; purge it from git history; restrict DB network exposure. *(SEC-01)*
2. Lock down `v1/users/*`: require auth, admin-gate list/update/delete, derive `userID` from session, whitelist mutable fields, escape regex. *(SEC-02, SEC-12)*
3. Fail **closed** on the Square webhook; remove the IoT/JWT/internal hardcoded fallback secrets; rotate all of them. *(SEC-03, SEC-04, SEC-06, SEC-07, SEC-13)*
4. Put authentication on the VPS socket-server control endpoints and on the app↔socket calls. *(SEC-05, BND-06)*

**P1 — close the systemic gap (1–2 weeks)**
5. Introduce a single enforced API auth seam — middleware coverage for `/api/(v1|admin|internal)` and/or a `withAuth(handler,{role})` wrapper applied to every route, with a CI check. *(SEC-10, BND-03)*
6. Lock the upload route (auth + type/size limits + server-side keys) and the image proxy (host allowlist + private-IP block). *(SEC-08, SEC-09)*
7. Restore the commented-out role check; fix IDOR / GET-mutation / idempotency / body-injection items. *(SEC-11, SEC-14–SEC-19)*

**P2 — structural hardening (ongoing)**
8. Generic `Database.collection(name)` accessor; forbid `import { db }` outside the persistence layer. *(OCP-01, BND-02)*
9. Break up `UserService`; move side-effects (email/Discord/wallet/notifications) behind events; wrap external SDKs behind adapters. *(SRP-01, DIP-01/02, BND-04/05)*
10. Move auth domain logic (merge/grace/tips) out of NextAuth callbacks into testable services behind a stable interface; fix the `updateUser` signature inconsistency. *(BND-01, BND-07, LSP-01)*
11. Remove dead/duplicate files and relocate ops scripts out of the deployed app. *(BND-08)*

---

## Method & confidence notes
- Every Critical and most High findings were confirmed by reading the relevant source directly (call chains traced route→controller→service→model). Citations are `file:line`.
- A small number of lower-severity items are flagged "verify" where a control appears present but the full sink set wasn't exhaustively traced (e.g. orchestrator input sanitization, SEC-22).
- This audit covers application source and the `vps/` tier as committed; it does not assess live infrastructure configuration, secrets actually set in the deployment environment, or third-party service settings.
- **Planner MCP note:** the audit was scoped via a `GoalContract` submitted to the planner MCP; the planner's own decomposition step was unavailable (its backend Anthropic account returned a billing error), so the decomposition and analysis were performed directly. The contract and structure are reusable if the planner is restored later.
