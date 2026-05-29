# CLAUDE.md — Engineering & Secure-SDLC rules for The-Lab

**This file is the canonical, default ruleset for everyone and everything that writes code in this repo — human developers, Claude Code, and any other AI/codegen tool.** Follow it by default. It is read automatically by Claude Code; other agents should read it too (see `AGENTS.md`). Humans: start with `CONTRIBUTING.md`.

If anything here is unclear or seems to conflict with a task, **stop and ask** rather than guess. When in doubt, prefer the more secure and more conservative option.

> Authority chain (most binding first): `docs/audit/06-security-standards.md` (security) and `docs/audit/05-engineering-process.md` (delivery) are **binding**. This file summarizes them and adds the full secure-development lifecycle for everyday work; if this file and a binding doc disagree, the binding doc wins — and fix this file.

---

## 1. What this project is
- **Next.js 16 (App Router)** app under `src/`. JavaScript (not TS); path alias `@/*` → `src/*` (see `jsconfig.json`).
- **MongoDB** via a single connection (`src/lib/database.js`). **next-auth v5** (Google / Discord / Credentials). **Square** payments + webhooks. **AWS S3** uploads. **Discord** integration. A **VPS tier** (`vps/`: socket-server for IoT door/equipment, orchestrator for containers).
- Contains an intentional capture-the-flag game, **"Hack the Lab"** — see §14. Do **not** treat its planted vulnerabilities/secrets/flags as real defects.

## 2. Secure Software Development Lifecycle (SSDLC)
We apply security at **every** phase, not just coding. This maps to **NIST SSDF (SP 800-218)**, **OWASP SAMM**, and **Microsoft SDL**. The phases below (§3–§12) each carry mandatory rules.

```
 Design ─► Implement ─► Verify ─► Release ─► Operate ─► Respond ─► Retire
  §3        §4/§5       §6/§7      §8         §9         §10        §11
            (+§13 conventions, §12 org/supply-chain & access run across all phases)
```

**"Security-relevant change" (triggers the heavier controls — threat model in §3, security review in §6, SEC approval in §7).** A change is security-relevant if it touches any of: authentication/session, authorization/access control, cryptography/secrets, payments/webhooks, PII (member data), file upload/handling, any server-side `fetch` of a user-supplied URL, the IoT/device tier (`vps/`), or infrastructure/deploy config. **If in doubt, treat it as security-relevant.**

**Ownership.** A designated **security owner/reviewer (SEC)** approves security-relevant changes and owns the audit docs, `SECURITY.md`, and incident response. Code areas have owners via `CODEOWNERS` (§12). Everyone is responsible for following this file.

## 3. Design phase — threat modeling, data classification, privacy
Before building a feature or making a security-relevant change:
- **Capture security requirements as acceptance criteria** on the GitHub issue (authn, authz, validation, encryption, logging, abuse cases) — not just functional ones.
- **Lightweight threat model** for security-relevant work, recorded in the issue/PR: the data flow, the trust boundaries crossed, and a quick STRIDE pass (Spoofing, Tampering, Repudiation, Info-disclosure, DoS, Elevation). List the **abuse cases** to test (§7).
- **Classify the data** the change touches and apply the matching controls:
  - **Public** — no restriction.
  - **Internal** — authn required.
  - **Confidential** — authn + authz; encrypt in transit.
  - **Restricted / PII** (member email, phone, name, address, access-card codes) — encrypt at rest (§5) + in transit, minimum-necessary exposure, access logged.
  - **Payment** — Square handles card data; keep us out of PCI scope (never store PAN/CVV); treat tokens/customer IDs as Confidential.
- **Privacy by design & default:** collect the minimum data needed; define its retention (§11); prefer not collecting over protecting.
- **Least privilege & secure defaults:** new endpoints deny by default; new DB users/scopes are least-privilege; new external calls are authenticated.

## 4. Architecture & layering (match the good pattern)
API features are layered: **`route.js` → `controller.js` → `service.js` → `model.js` → `class.js`**, with persistence behind `src/lib/database.js`.

**Reference implementations to copy** (these do it right): `src/app/api/v1/bounties/*`, `src/app/api/v1/admin/plans/route.js`, `src/app/api/v1/transactions/award/route.js` — auth at the edge, ownership/role checks in the service, thin routes.

Rules:
- **Persistence stays in the model layer.** Do **not** `import { db }` or write raw Mongo queries in `route.js`/`controller.js`. (Anti-pattern seen in `internal/check-access`, `memberships/confirm`.)
- **Don't reach across features.** A feature must not import another feature's `model`. Call its published service, or emit/handle an event. (Anti-pattern: `users/service.js` importing Badge/Bounty/Portfolio models.)
- **Keep cross-cutting config out of feature internals.** Root config (`auth.js`) should depend on a stable service interface, not deep `@/app/api/v1/*` internals.
- **Wrap external SDKs** (S3, Square, Discord) behind `src/lib`/`src/utils` adapters; don't instantiate SDK clients inside route handlers.
- **One signature per function.** Don't overload a function to accept "a string OR an object" (see the `updateUser` issue). Pick one contract.
- New code should not deepen the issues catalogued in `docs/audit/02-solid-violations.md` and `03-boundary-violations.md`.

## 5. Secure implementation — non-negotiable coding defaults (full standard: `docs/audit/06-security-standards.md`)
Generated code must satisfy these **by default**:
- **Authenticate every non-public route**; enforce authorization (role/ownership) **server-side**. Derive identity from the **session**, never from a client-supplied `userID`/body field. (`/api/*` is **not** covered by middleware — the route must protect itself.)
- **No secrets in code.** Never write `process.env.X || '<literal>'` fallbacks for secrets/keys/tokens/connection strings. Required secrets must be present or the app fails fast.
- **Encrypt everything.** In transit: HTTPS/TLS/WSS only, HSTS on. At rest: DB encryption + S3 SSE; PII fields encrypted with **AES-256-GCM + random IV** (never CBC/ECB/static-IV). For searchable encrypted fields use a **keyed HMAC blind index**, not deterministic ciphertext. Crypto **fails closed**.
- **Verify signatures/secrets in constant time** (`crypto.timingSafeEqual`); webhooks fail closed if the key is unset.
- **Validate & sanitize input.** Whitelist mutable fields (never let clients set `role`/`membership.*`). Reject `$`-prefixed keys reaching Mongo. Escape user input before any `RegExp`. Allowlist/deny private IPs on any server-side `fetch` of a user-supplied URL (SSRF).
- **No data leakage.** Never `console.log` secrets, tokens (verification/reset/session), passwords (even hashed), decrypted PII, or full request/profile objects. API responses return only needed fields — never password hashes, encrypted blobs, or another user's data. Client errors are generic (no stack traces / internal hostnames).
- **Emit security audit events** (§9) for security-relevant actions instead of dumping data to `console`.
- **Files/uploads:** require auth, allowlist MIME + size, server-generated keys.

## 6. Delivery & secure implementation process (full process: `docs/audit/05-engineering-process.md`)
- **PRs into `main` only** — no direct commits/pushes to `main`.
- **One feature branch per unit of work** (the rollback unit): `remediation/<area>-<slug>` for audit fixes, `feat|fix|chore/<slug>` otherwise. Cut from latest `main`, rebase before opening.
- **No downstream impact:** preserve public contracts, or update every consumer **in the same PR** with a documented consumer audit; existing tests still pass.
- **Full end-to-end tests** for every touched/refactored file — exercise the real request→logic→datastore→response path, including the security/abuse case from §3.
- **Every bug fix / security remediation ships a regression test** — one that reproduces the specific issue, *fails against the old (buggy/vulnerable) code*, and *passes after the fix*. Name the finding in the test (e.g. `SEC-03`) so the regression can never silently return. No remediation merges without it.
- **Every fix has a tracked GitHub issue first.** Audit findings live in `docs/audit/`; PRs `Refs #<issue>` (and `Closes #` only when fully satisfied). See `05` §9.
- **Code review is mandatory.** ≥1 reviewer; **security-relevant changes (§2) also require SEC approval** and reference the threat model from §3.
- PRs use the template in `05` §6, pass all CI gates (§7) before merge; squash-merge.

## 7. Verification & testing — automated gates + human review
**A PR cannot merge until all CI gates pass** (configured per `05` §5 + `06` §8). Gates, in plain terms:
- `lint` · `npm test` (unit/integration) · `e2e` (real request→DB→response) · `coverage` (touched files must be exercised).
- `secret-scan` — no secrets/keys committed.
- `sast` — static analysis of **our** code for vulnerable patterns (Semgrep/CodeQL), incl. `crypto-lint` (no CBC/ECB/static-IV/`createCipher`/hardcoded keys) and `log-leak-scan` (no tokens/PII/secrets in `console.*`).
- `sca` + `SBOM` — scan **third-party** dependencies for known CVEs (`npm audit`) and generate a software bill of materials.
- `headers-check` · `tls-config-check` · `response-shape` (no PII/hashes/foreign data in responses) · `boot-env-validation` (required secrets present, no defaults).
- `container-iac-scan` — scan `vps/` Dockerfiles/compose & infra config (e.g. Trivy/hadolint) for misconfig/CVEs.
- `license-check` — dependency licenses are acceptable.

**Beyond CI:**
- **Security test cases are required**: every security-relevant change ships tests for its abuse cases (e.g. anonymous request → 401, tampered amount rejected, forged webhook rejected, `?field=.*` returns nothing).
- **DAST** (dynamic scan) runs against **staging**, not production.
- **Independent security review** for Critical/High changes before merge; **periodic penetration test** (at least annually and before major releases) tracked as issues.

## 8. Release & deployment
- **Separate environments — dev / staging / production.** **Never** use production data or production secrets in dev/staging. Generate/seed synthetic test data instead.
- **Seed / migration / test endpoints must not be reachable in production** (see SEC-18); gate or strip them.
- **Change management:** deploys to production require the merged PR + approval; keep a rollback plan (revert the squashed PR). Record what shipped (changelog per `05` §9).
- **Build provenance & artifacts:** no secrets baked into builds, images, or client bundles; verify lockfile integrity; prefer reproducible builds and signed images where available.
- **Config hardening** per `06` §2/§3 (TLS, HSTS, headers, encryption at rest) is verified in staging before promotion.

## 9. Operations — logging, monitoring, vulnerability & patch management, backups
- **Security audit logging (detective control):** record security-relevant events with actor, timestamp, and source IP — **without** sensitive values: authentication success/failure, authorization denials, admin actions, payment/webhook events, **device unlock & card-pairing** (§ E4), and secret/signature validation failures. Logs are centralized, access-controlled, tamper-evident, and retained per policy.
- **Monitoring & alerting** on anomalies: auth brute-force, unusual unlock frequency, webhook signature failures, error spikes, dependency CVE alerts.
- **Vulnerability management with SLAs** (triage + fix): Critical ≤ 48h, High ≤ 7d, Medium ≤ 30d, Low ≤ 90d — tracked as GitHub issues with the matching severity label.
- **Patch & dependency management:** automated dependency updates (Dependabot/Renovate, reviewed weekly); apply security patches within the SLA; no unmaintained or critical-CVE dependencies.
- **Dependabot alerts are always remediated (mandate).** Every Dependabot/security alert is triaged and fixed within its severity SLA (§9) — never dismissed or left to age. **Pin dependencies to known-good versions** (exact versions in the lockfile; prefer exact or tightly-ranged versions in `package.json`) and upgrade only to a version confirmed to clear the alert without regressing CI. **Each remediation lands on its own branch + PR** (`fix/deps-<slug>` or `remediation/<area>-deps`), one rollback unit per advisory or per Dependabot group — never mixed into an unrelated feature branch. Verify the fix locally (`npm audit`, lint, tests, build) before opening the PR.
- **Backups & recovery:** backups are encrypted and access-controlled; **recovery is tested** periodically against a defined RPO/RTO.

## 10. Incident response & vulnerability disclosure
- **Incident response runbook** (`docs/security/INCIDENT-RESPONSE.md`, to be created): detect → contain → eradicate → recover → review, with on-call contacts and a severity scale. Preserve evidence/logs. Run a blameless post-incident review and file follow-up issues.
- **Breach notification:** notify affected members and authorities per applicable law (e.g. GDPR's 72-hour rule, state breach laws) when personal data is exposed.
- **Suspected-exposure rule:** treat any secret that reached source control or logs as compromised — **rotate immediately** (see SEC-01).
- **Vulnerability disclosure policy** (`SECURITY.md`, to be created): how to report a vulnerability privately, expected response time, scope, and safe-harbor for good-faith research. **Note:** the "Hack the Lab" game (§14) is intentionally vulnerable and is **out of scope** for disclosure.

## 11. Data lifecycle & decommissioning
- **Retention schedule:** define how long each data class (§3) is kept; delete or anonymize past it. Don't keep PII "just in case."
- **Secure deletion / right to erasure:** support member data deletion/export requests (GDPR/CCPA); deletion removes data from primary store **and** backups per policy.
- **Decommissioning:** when retiring a service/key/host — revoke credentials, securely wipe data, rotate shared secrets, and remove DNS/firewall exposure.

## 12. Access, identity & supply chain (run across all phases)
- **Repository controls:** branch protection on `main` (require PR + passing checks + reviews, no force-push); **`CODEOWNERS`** routes auth/crypto/payments/IoT/infra paths to SEC for required review; **2FA required** for all contributors; **signed commits/tags** where feasible; collaborators get least-privilege access. _Note: server-enforced branch protection needs repo admin + GitHub Pro/Team for this private repo — see `docs/audit/05-engineering-process.md` "Enforcement status". Until enabled, these are policy-enforced + soft controls (CODEOWNERS, visible CI checks)._
- **Secrets governance:** secrets live in a secret manager (never in repo); one secret per purpose; documented **rotation cadence** and an owner; rotate on suspected exposure.
- **Supply chain:** pin the lockfile; **review every new dependency** (maintenance, popularity, license, transitive risk) before adding; keep an SBOM; block install scripts from untrusted sources. Track `next-auth@5.0.0-beta` toward a GA release.

## 13. Coding conventions
- Lint clean: `npm run lint` (ESLint `next/core-web-vitals`). Build: `npm run build`. Tests: `npm test`.
- Use the `@/` path alias for `src` imports. Match the surrounding file's style (naming, structure, comment density).
- No new top-level scripts with embedded credentials (see the `list-dbs.js`/`debug-leaderboard.js` lesson). Operational scripts read config from env.
- Remove dead/`* copy.js` files rather than adding more.
- **Labels & contributor-facing writing use plain language**, not codes/jargon — many contributors are not full-time developers (e.g. `goal: secure user accounts`, `priority: urgent`, not `epic:E1`/`P0`). Internal codes (Epic E#, SEC-##) stay in docs/issue titles, not labels.

## 14. "Hack the Lab" CTF — intentional vulnerabilities (do NOT fix)
This repo ships a security game with **deliberately** planted weaknesses, fake secrets, and flags. They are game content, not defects. Do **not** "harden", remove, or report them as findings, and do **not** copy their patterns into real code.

Game/CTF zones (treat as intentional):
- `vps/missions/**` (mission environments, planted files/creds)
- `src/app/dashboard/activities/terminal/**` (e.g. the planted `mongodb://admin:secure_password_2025@…` + `flag{…}` string)
- `src/app/api/v1/holodeck/**`, `src/app/api/v1/arcade/**`, `src/app/components/holodeck/**`
- design docs: `GAME_DESIGN.md`, `HACK_THE_LAB_V2_*.md`, `ARCADE_*.md`, `MISSION_HINTS.md`

**Real infrastructure and member data must still be fully secure** even where it neighbors game code. If unsure whether something is game content or a real defect, **ask** before changing it.

## 15. Supporting artifacts & pointers
Created / canonical:
- Security findings & severities: `docs/audit/01-security-findings.md`
- SOLID / boundary issues: `docs/audit/02-…` / `03-…`
- P0 remediation plan & GitHub issue map: `docs/audit/04-p0-remediation-plan.md`
- Binding process / standards: `docs/audit/05-…` / `06-…`
- Human on-ramp: `CONTRIBUTING.md` · Cross-agent pointer: `AGENTS.md`

To be created (tracked for the bootstrap PR — these are referenced by the rules above):
- `.github/pull_request_template.md`, `.github/workflows/ci.yml` (the §7 gates), Dependabot/Renovate config, `CODEOWNERS`
- `SECURITY.md` (vulnerability disclosure policy) · `docs/security/INCIDENT-RESPONSE.md` (IR runbook)
- `.editorconfig`
