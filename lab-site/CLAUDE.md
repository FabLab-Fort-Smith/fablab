# lab-site — website rules

> Inherits the master SSDLC ruleset and the repo-root `CLAUDE.md` (monorepo) automatically.
> **One lowercase folder per site** (`the-lab`, `<new-site>`); environments (production/staging/
> preview) are Coolify deployments from branches, not folders (ADR 0005). `the-lab/` = the
> **FabLab Next.js 16 app**, which carries its **own** `lab-site/the-lab/CLAUDE.md` (loaded on
> demand). This file holds shared rules for all sites.

## Applied rule modules
@~/.claude/rules/lang-typescript.md
@~/.claude/rules/std-owasp.md
@~/.claude/rules/std-owasp-api.md
@~/.claude/rules/std-owasp-llm.md
@~/.claude/rules/topic-authn-authz.md
@~/.claude/rules/topic-web-frontend.md
@~/.claude/rules/topic-accessibility.md
@~/.claude/rules/topic-performance.md
@~/.claude/rules/topic-nosql.md
@~/.claude/rules/std-privacy.md
@~/.claude/rules/std-pci.md
@~/.claude/rules/topic-notifications.md
@~/.claude/rules/topic-api-consumption.md
@~/.claude/rules/topic-token-optimization.md
@~/.claude/rules/topic-logging-observability.md
@~/.claude/rules/topic-testing.md

> Repo-wide rules (std-owasp-proactive, std-cwe, std-supplychain, topic-config-environments,
> topic-documentation, workflow-cicd/release/code-review/vuln-mgmt/cve, license-compliance) are
> imported by the root `CLAUDE.md` — not repeated here.

## Stack
- **Next.js 16 / React 19** (SSR), PWA (next-pwa). Auth.js v5, MongoDB, Square payments,
  S3-compatible storage (external), SMTP (external), Google GenAI. Deployed as a Node
  `output: 'standalone'` container on Coolify.

## Component-specific rules
- **Client is untrusted; enforce server-side.** No secrets/API keys in the client bundle
  (it's public). Strip source maps from prod.
- **CSP:** the app ships a **Report-Only** CSP today (`next.config.mjs`) with `unsafe-inline`
  pending per-request nonces — goal is to validate against staging (DAST) and **promote to an
  enforcing `Content-Security-Policy`** with nonces (`@rules/topic-web-frontend.md`).
- **Payments / PCI (`@rules/std-pci.md`):** use Square **hosted/tokenized fields** so PAN never
  enters our systems (SAQ-A scope); store tokens/order refs only; **never store SAD**
  (CVV/track/PIN); mask any displayed identifiers; log access to payment data.
- **Personal data (`@rules/std-privacy.md`):** accounts, email, payment metadata = personal
  data — classify, minimize, redact from logs; support deletion/export; no real PII in non-prod.
- **NoSQL (`@rules/topic-nosql.md`):** never build Mongo queries/filters from unsanitized input
  (operator injection, e.g. `{$gt:""}`); validate input types; least-privilege DB user.
- **AI (`@rules/std-owasp-llm.md`):** treat `@google/genai` output + any retrieved content as
  untrusted (no eval/HTML-inject); cap tokens/cost; prompt-injection tests in the security
  suite; no secrets/PII in prompts.
- **External APIs (`@rules/topic-api-consumption.md`):** Square, Google, S3, SMTP are untrusted
  upstreams — timeouts, retries/backoff, schema-validate responses, SSRF-safe URLs.
- **Auth (`@rules/topic-authn-authz.md`):** Auth.js + PKCE; bcrypt/argon2 for any passwords;
  short-lived JWTs, pinned alg (reject `alg:none`); deny-by-default authZ, ownership checks.
- **Per-site overrides:** a site whose stack differs gets its own `lab-site/<name>/CLAUDE.md`;
  The-Lab keeps its existing one at `lab-site/the-lab/CLAUDE.md`.
