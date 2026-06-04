# Security Engineering Standards — The-Lab

**Created:** 2026-05-29
**Status:** Canonical / binding. Every refactor and every touched code path must meet these standards. This is the **"industry best standards / encrypt everything / no data leakage"** baseline referenced by [`05-engineering-process.md`](./05-engineering-process.md) (delivery) and [`04-p0-remediation-plan.md`](./04-p0-remediation-plan.md) (P0 work). Change rules **here**, nowhere else, to avoid drift.

## Reference frameworks
The controls below map to recognized standards; cite the relevant one in PRs where useful.
- **OWASP ASVS v4.0.3** — V6 Cryptography, V7 Logging & Error Handling, V8 Data Protection, V9 Communications, V2 Authentication, V4 Access Control.
- **OWASP Top 10 (2021)** & **OWASP API Security Top 10 (2023)**.
- **NIST SP 800-52r2** (TLS), **SP 800-57** (key management), **SP 800-63B** (auth/secrets), **FIPS 140-3** (approved crypto).
- **PCI-DSS v4.0** — Req 3 (stored data), Req 4 (transmission), Req 8 (auth) — in scope because the app handles payment flows via Square.
- **CIS Benchmarks** — MongoDB, Docker, Linux (for `vps/`).
- **GDPR / CCPA** — member PII (data minimization, breach exposure).

> **Definition — "encrypt everything / no data leakage":** all sensitive data is encrypted **in transit** (§3) and **at rest** (§2); secrets are never in code or logs (§4, §6); responses and logs expose the minimum necessary (§6); and these are **verified by automated gates** (§8), not left to reviewer memory.

---

## 1. Cryptography & key management (ASVS V6 · NIST 800-57 · FIPS 140-3)

**Standard**
- Use only vetted, **authenticated** primitives: **AES-256-GCM** (or ChaCha20-Poly1305) for symmetric encryption; **never** unauthenticated modes (CBC/ECB) for new code.
- A unique random **IV/nonce per encryption** (never a static/zero IV). Never reuse a (key, nonce) pair.
- Hashing: passwords with **bcrypt cost ≥ 12** (or argon2id); tokens/HMAC with SHA-256+.
- For **searchable encryption** (equality lookup on encrypted fields), use a **keyed HMAC blind index** stored beside an AES-256-GCM ciphertext — do **not** make the ciphertext itself deterministic.
- **Keys:** sourced from a KMS / secret manager, **never** hardcoded and **never** with a fallback default; documented rotation; separate keys per purpose (field-encryption key ≠ JWT secret ≠ webhook key).
- Crypto operations **fail closed** (a decrypt error is an error, not "return the input").

**Current gaps:** SEC-23 (AES-256-CBC + zero IV + hardcoded fallback `ENCRYPTION_KEY` + fail-open decrypt — `auth/[...nextauth]/service.js:13,22-62`); SEC-07 (JWT fallback); bcrypt cost 10 (`service.js:81`).
**Acceptance:** no `createCipher`/CBC/ECB/static-IV/hardcoded-key in the diff (§8 lint); searchable PII uses blind index + GCM; keys from secret store with rotation noted.

## 2. Data at rest (ASVS V8 · PCI Req 3 · CIS MongoDB)

**Standard**
- **Database:** MongoDB **encryption at rest** enabled (WiredTiger encryption or full-disk/volume encryption); access over TLS only; least-privilege DB users (not `admin`).
- **PII fields** (email, phone, address, anything identifying): application-layer encryption per §1 in addition to storage encryption.
- **Object storage (S3):** server-side encryption (**SSE-KMS** preferred, SSE-S3 minimum) on every bucket; buckets private by default; no public ACLs; no auto-create of buckets.
- **Backups:** encrypted; access-controlled; retention defined.
- **Secrets:** in a secret manager, encrypted at rest; never in the repo or plaintext on shared disks.

**Current gaps:** SEC-01 (admin DB user, exposure), SEC-08 (S3 no enforced SSE, bucket auto-create), SEC-23 (field encryption).
**Acceptance:** DB-at-rest + TLS verified (E1/WI-1.3–1.4); every S3 PutObject sets SSE; PII encrypted via §1.

## 3. Data in transit (ASVS V9 · NIST 800-52r2 · PCI Req 4)

**Standard**
- **TLS 1.2+ (prefer 1.3) everywhere**, valid certs, no plaintext fallback:
  - Public app over HTTPS with **HSTS** (`max-age ≥ 1 year; includeSubDomains; preload`).
  - **MongoDB** connection uses TLS.
  - **S3** endpoint over HTTPS.
  - **Socket server** over **WSS/HTTPS** (no `ws://`/`http://` for control traffic).
  - **Internal service calls** (e.g. `access-control.js` → `localhost:3001`) authenticated and, off-host, TLS.
- No sensitive data in URLs/query strings (use bodies + POST); they end up in logs/history (relates to the `userID`-in-query IDOR pattern, SEC-14/15).
- Cookies: `Secure`, `HttpOnly`, `SameSite=Lax/Strict`.

**Current gaps:** SEC-25 (no HSTS/headers), `access-control.js:1` (`http://localhost:3001`), BND-06 (socket transport/trust).
**Acceptance:** HSTS + headers present (§8 header check); all outbound integrations HTTPS/WSS/TLS; no PII in query strings on new/changed routes.

## 4. Secrets management (ASVS V6/V2 · NIST 800-63B)

**Standard**
- **Zero secrets in source or config defaults.** No `process.env.X || '<literal>'` fallbacks for any secret/key/token/connection string.
- All secrets from a secret manager / injected env; **fail fast** at boot if a required secret is missing (no silent default).
- Distinct secrets per purpose; rotation documented; rotation on suspected exposure.
- **Secret scanning** in pre-commit and CI; block on hit.

**Current gaps:** SEC-04, SEC-06, SEC-07, SEC-13, SEC-23 (all hardcoded fallbacks). Centralized by E3 (env validation, WI-3.4) + E1/WI-1.5 scanning.
**Acceptance:** §8 secret-scan green; no literal-secret fallbacks in diff; boot-time env validation covers the secret.

## 5. AuthN / AuthZ (ASVS V2/V4 · API Top 10)

**Standard**
- Every non-public endpoint authenticates; authorization (role/ownership) enforced server-side; identity derived from the session, **never** from client-supplied `userID`.
- Signature/secret comparisons use constant-time (`crypto.timingSafeEqual`); webhooks fail closed.
- Short-lived tokens; least privilege.

**Current gaps:** SEC-02, SEC-03, SEC-04, SEC-05, SEC-11, SEC-14, SEC-15 — covered by E2/E3/E4.
**Acceptance:** the route's authn/authz + abuse case asserted by E2E tests (`05` §5).

## 6. Data minimization & no leakage (ASVS V7/V8 · GDPR)

**Standard**
- **Logging:** structured logger with redaction; **never** log secrets, tokens (verification/reset/session), passwords (even hashed), decrypted PII, or full request/profile objects. Production log level excludes debug dumps.
- **API responses:** return only required fields (projection); never return encrypted blobs, password hashes, internal IDs, or another user's data; default-deny field exposure.
- **Errors:** generic client messages; no stack traces / driver errors / internal hostnames to clients.
- **Outbound:** prevent SSRF (host allowlist, block private ranges) so internal data can't be exfiltrated via the server (SEC-09).
- **Docs/issues/changelogs:** redact secret values and exploit detail (already in `05` §9).

**Current gaps:** SEC-24 (token/PII logging), SEC-20 (profile dumps), SEC-09 (SSRF), SEC-02/12 (over-broad user responses).
**Acceptance:** §8 log-scan finds no banned tokens/PII patterns in changed code; responses field-projected; error handler sanitizes.

## 7. Dependencies & supply chain (ASVS V14)

**Standard:** `npm audit` clean of high/critical (or documented waivers); pinned/locked deps; no install scripts from untrusted sources; review new dependencies. Note `next-auth@5.0.0-beta` — track for GA before relying on beta security behavior.
**Acceptance:** dependency audit gate (§8) green or waived with justification.

---

## 8. How these become enforced gates (extends `05` §5)

Added to the required CI checks and the PR Definition of Done so standards are **verified, not remembered**:

| Gate | Enforces | Tooling |
|------|----------|---------|
| **crypto-lint** | §1 — no `createCipher`, CBC/ECB, static/zero IV, hardcoded keys | ESLint rule / `semgrep` ruleset on diff |
| **secret-scan** | §4 — no literal secrets/fallbacks | gitleaks/trufflehog (already in `05` §5) |
| **log-leak-scan** | §6 — no logging of tokens/PII/secrets | `semgrep` pattern: `console.*` with `token|password|email|secret|profile` |
| **headers-check** | §3 — HSTS/CSP/etc. present | E2E test asserting response headers |
| **tls-config-check** | §3 — Mongo/S3/socket use TLS/HTTPS/WSS | config assertion test |
| **response-shape test** | §6 — no PII/hashes/foreign data in responses | E2E assertions per route |
| **dep-audit** | §7 — no high/critical CVEs | `npm audit` |
| **boot-env-validation** | §1/§4 — required secrets present, no defaults | startup assertion (E3/WI-3.4) |

**PR Definition of Done addendum** (folds into `05` §7): the PR confirms the touched code meets §§1–7 applicable to it, and the gates above pass for the diff. A PR that introduces or touches crypto, transport, logging, or PII handling **must** cite the relevant standard section and show the gate result.

## 9. Relationship to the epics
- **E1–E4 (P0)** already implement large parts of §§2–6 for their findings.
- **E5 (this standard, cross-cutting, P1)** owns the remaining "encrypt everything / no leakage" work: field-encryption redesign (§1), log scrubbing (§6), security headers + TLS hardening (§3), data-at-rest enablement (§2), and data minimization (§6). Tracked as **Epic #23** with findings **SEC-23 → #24, SEC-24 → #25, SEC-25 → #26** (milestone-less P1).
- The **`ENCRYPTION_KEY` fallback removal** (part of SEC-23) also folds into **E3/WI-3.2** (#9) so it's contained with the other hardcoded-secret removals immediately.
