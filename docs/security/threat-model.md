# Threat Model — FabLab Deploy Platform + The-Lab app

STRIDE over the deploy pipeline **and** the migrated application's data flows, per
`@rules/workflow-threat-model.md`. Done at design time; revisit when the design changes.
Status: **initial draft** (pre-implementation/migration).

## Scope & assets

Two layers: the **platform** (turns git pushes into running sites) and the **app** (The-Lab,
which handles auth, payments, and personal data).

**Restricted assets** (master §5):
- Platform: git deploy tokens / GitHub App key / GitLab tokens; **webhook HMAC secrets**;
  **TLS private keys**; Coolify admin creds + DB; **Cloudflare API token**; VPS SSH keys; host
  root/sudo.
- App: **MongoDB** (accounts, sessions, order/payment metadata — personal data); `AUTH_SECRET`;
  Square access token; S3 keys; SMTP creds; Google GenAI key. **No cardholder PAN/SAD is ever
  stored** (Square hosted/tokenized — `@rules/std-pci.md`).

Public/low-value: website content and source (The-Lab is private today but intended public-facing).

## Data-flow diagram & trust boundaries

```
[Dev] -B1-> [GitHub/GitLab] -B2-> [Coolify webhook] -B3-> [Build] -B4-> [App container]
                                                                            |  \
[Visitor] -B5-> [Cloudflare] -B6-> [Traefik] ------------------------------+   \-B7-> [MongoDB (VPS)]
                                                                            \-B8-> [S3 / SMTP / Square / GenAI]
[Visitor browser] -B9-> [Square hosted payment fields]
```

- **B1** dev→forge · **B2** forge→webhook · **B3** repo→build · **B4** build→runtime
- **B5** internet→edge · **B6** edge→origin · **B7** app→MongoDB · **B8** app→external APIs
- **B9** browser→Square (cardholder data path — kept off our systems)

## STRIDE by boundary (top threats → mitigations)

### B2 — forge → Coolify webhook *(highest priority)*
- **S/T forged/tampered webhook → rogue deploy:** verify **HMAC on the raw body** before acting;
  per-forge secret; replay protection (timestamp/delivery-id) (`@rules/topic-webhooks.md`).
- **D build-flood DoS:** rate-limit; bounded build concurrency; build timeouts.
- **I exposed Coolify dashboard/API:** behind auth + MFA, ideally Cloudflare Access/IP allow-list;
  never expose the API token (`@rules/topic-authn-authz.md`).

### B3/B4 — build & runtime *(supply chain)*
- **E malicious repo escapes build → host:** isolated, **non-root, ephemeral** build containers;
  no prod secrets/data in build or **preview** envs; least-privilege build identity
  (`@rules/std-supplychain.md`, `@rules/workflow-cicd.md`).
- **T poisoned/typosquatted deps:** lockfile + hashes; SCA + image scan in CI; SBOM per build;
  the app already runs gitleaks + semgrep — keep them as gates (`@rules/workflow-cve-management.md`).

### B7 — app → MongoDB (self-hosted) *(now our responsibility — ADR 0007)*
- **T NoSQL injection (operator injection, `{$gt:""}`):** validate input types; never build
  queries from raw input; least-privilege DB user (`@rules/topic-nosql.md`).
- **I exposed DB:** bind to the **private Docker network only** (never public), strong auth, TLS,
  at-rest encryption.
- **D data loss (single VPS):** automated **encrypted, off-box backups + tested restore**
  (`@rules/workflow-data-lifecycle.md`).

### B8/B9 — external APIs & payments
- **PCI (B9):** Square **hosted/tokenized fields** so PAN/SAD never touch our servers (SAQ-A);
  store tokens/refs only; mask displayed identifiers; log access to payment data (`@rules/std-pci.md`).
- **B8 unsafe consumption (API10):** treat S3/SMTP/Square/GenAI responses as untrusted —
  timeouts, retries/backoff, schema-validate, SSRF-safe (no internal/metadata URLs)
  (`@rules/topic-api-consumption.md`, `@rules/std-owasp-api.md`).
- **LLM (Google GenAI):** prompt injection / insecure output — never eval/HTML-inject model
  output; cap tokens/cost; no secrets/PII in prompts; prompt-injection tests (`@rules/std-owasp-llm.md`).

### App-level (web/API — `@rules/std-owasp.md`, `@rules/std-owasp-api.md`)
- **Broken access control / BOLA:** server-side authZ on every route; ownership/tenant checks;
  no client-trust. **Auth (Auth.js):** PKCE, pinned JWT alg (reject `alg:none`), short TTLs,
  bcrypt/argon2; rate-limit + generic errors on auth endpoints (`@rules/topic-authn-authz.md`).
- **XSS / CSP:** promote the **Report-Only CSP to enforcing** with per-request nonces (remove
  `unsafe-inline`) after staging validation (`@rules/topic-web-frontend.md`).
- **Abuse-prone flows:** signup/purchase protected (reCAPTCHA + throttling — API6).

### B5/B6 — edge → origin
- **D DDoS / S direct-to-origin bypass:** Cloudflare WAF/DDoS; **firewall origin to Cloudflare
  ranges** (or Cloudflare Tunnel); TLS everywhere, HSTS (`@rules/std-zero-trust.md`).

### Host / B1 (cross-cutting)
- **E host priv-esc:** CIS hardening — SSH keys only, non-root deploy user, firewall, fail2ban,
  unattended-upgrades, minimal surface (`@rules/std-cis.md`).
- **S forge account takeover:** MFA; branch protection + required review + **signed commits** on
  `main`; deploy only from protected branch (`@rules/workflow-git.md`).
- **I secret leakage:** secret store / injected env at runtime; redact logs; never in images/git
  (`@rules/workflow-secrets.md`).

## Risk register (initial — rate up when unsure, master §7)

| ID | Threat | Boundary | Severity | Status |
|----|--------|----------|:--------:|--------|
| R1 | Forged/unauthenticated webhook triggers deploy | B2 | High | Planned (HMAC verify) |
| R2 | Malicious repo escapes build sandbox → host | B3/B4 | High | Planned (isolated builds) |
| R3 | Coolify dashboard/API exposed | B2 | High | Planned (auth + Access/allow-list) |
| R4 | NoSQL injection in app | B7 | High | Planned (typed validation) |
| R5 | MongoDB exposed / data loss on single VPS | B7/Host | High | Planned (private net + backups/restore) |
| R6 | Cardholder data mishandled | B9 | High | Mitigated by design (Square tokenized; no SAD stored) |
| R7 | Direct-to-origin bypass of Cloudflare | B6 | Medium | Planned (origin firewall) |
| R8 | Preview env reaches prod data/secrets | B3/B4 | Medium | Planned (isolation, no prod secrets) |
| R9 | Prompt injection / unsafe LLM output | B8 | Medium | Planned (untrusted output, injection tests) |
| R10 | Forge account takeover → malicious deploy | B1 | Medium | Planned (MFA, branch protection, signing) |
| R11 | Data migration loss/corruption (Vercel→VPS) | B7 | Medium | Planned (export+restore+reconcile — ADR 0006) |

## Follow-ups (become security tests / runbooks)

- Abuse tests: replayed/forged webhook rejected; build sandbox can't read prod secrets;
  NoSQL operator-injection blocked; direct-to-origin request blocked; prompt-injection contained;
  BOLA/authz-bypass attempts fail (`@rules/topic-testing.md`).
- Runbooks: secret-rotation, incident-response, backup-restore, dependency-patch, the migration
  cutover (`@rules/workflow-runbooks.md`, ADR 0006).
- Re-run this model after the network topology and migration cutover are finalized; revisit PCI
  scope before flipping Square to **production**.
