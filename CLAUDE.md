# fablab — Deploy Platform monorepo rules

> Inherits the master SSDLC ruleset (`~/.claude/CLAUDE.md`) automatically.
> This repo is a **monorepo**: each top-level folder is a component with its own `CLAUDE.md`
> importing its stack-specific modules. This root file holds only repo-wide rules.

## Repo-wide modules (apply to all components)
@~/.claude/rules/std-owasp-proactive.md
@~/.claude/rules/std-cwe.md
@~/.claude/rules/std-supplychain.md
@~/.claude/rules/topic-config-environments.md
@~/.claude/rules/topic-documentation.md
@~/.claude/rules/workflow-code-review.md
@~/.claude/rules/workflow-cicd.md
@~/.claude/rules/workflow-release.md
@~/.claude/rules/workflow-vuln-mgmt.md
@~/.claude/rules/workflow-cve-management.md
@~/.claude/rules/topic-license-compliance.md

> `workflow-git` and `workflow-secrets` are imported globally by the master — already active.

## Components & their stack
- **`lab-stack/`** — the deploy platform (Coolify + Traefik + self-hosted MongoDB + on-host
  config-as-code). Treated as an **infrastructure repo**; see `lab-stack/CLAUDE.md`.
- **`lab-site/`** — the website(s); **one lowercase folder per site** (`the-lab`, `<new-site>`).
  `the-lab/` = the **FabLab Next.js 16 app** (migrated from Vercel — ADR 0005/0006), which
  carries its **own** `lab-site/the-lab/CLAUDE.md`. Environments (production/staging/preview) are
  Coolify deployments from branches, not folders. See `lab-site/CLAUDE.md`.

## Monorepo rules
- **Naming convention:** all **directories are lowercase `kebab-case`** (`[a-z0-9-]`; no
  uppercase, spaces, or underscores). Canonical root **files** keep standard casing
  (`README.md`, `CLAUDE.md`, `SECURITY.md`, `CODEOWNERS`, `LICENSE`). Each site = one folder;
  environments come from branches, not folders. *(Folders only — the GitHub org/repo casing
  `FabLab-Fort-Smith/The-Lab` is intentionally left unchanged.)*
- **Clear ownership & boundaries:** `CODEOWNERS` per path; a component is reviewed by its owner.
  No forbidden cross-component imports (`lab-site` does not import `lab-stack` internals).
- **Affected-only CI, graph-wide security scans:** build/test only what a change touches, but
  run SAST/SCA/secret/IaC scans across the whole repo (`@rules/workflow-cicd.md`).
- **Per-component `CLAUDE.md`** imports that component's language/standard modules; this root
  holds only shared rules.
- **Config-as-code, no click-ops** for the platform: changes to `lab-stack` go through PR +
  review like application code (`@rules/topic-iac-cloud.md`).

## Project-specific rules
- **Data classification:** platform **secrets** (deploy tokens, TLS keys, webhook HMAC) and the
  app's **MongoDB** (accounts, payment metadata) → *restricted*; website content → *public*.
  Secrets from a secret store / injected env, never committed (`@rules/workflow-secrets.md`, §5).
- **Compliance scope (the app, `lab-site`):** **PCI** (Square — hosted/tokenized fields, SAQ-A,
  never store SAD), **privacy** (GDPR/CCPA personal data), and **LLM** (Google GenAI — untrusted
  output, prompt-injection tests). Applied in `lab-site/CLAUDE.md`.
- **The deploy pipeline is a trust boundary.** Push → build → deploy is threat-modeled in
  `docs/security/threat-model.md`; verify webhook authenticity (HMAC) and pin build inputs.
- **This is a migration**, not greenfield — The-Lab moves off Vercel via parallel-run/cutover
  (`@rules/topic-migration.md`, ADR 0006). Keep changes incremental and reversible.
- **Goal:** replicate Vercel's instant-deploy + preview-deployment UX self-hosted (see README).
