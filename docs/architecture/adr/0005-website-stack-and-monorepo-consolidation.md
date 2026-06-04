# ADR 0005 — Website stack (Next.js) and monorepo consolidation of The-Lab

- **Status:** Accepted
- **Date:** 2026-06-03
- **Supersedes:** the earlier "static SSG vs. SSR — undecided" open item.

## Context

The FabLab website already exists as [`The-Lab`](https://github.com/FabLab-Fort-Smith/The-Lab)
(private), a **Next.js 16 / React 19** dynamic app currently deployed on **Vercel**. It is not
a static site: it has Auth.js authentication, a MongoDB datastore, Square payments, S3 uploads,
SMTP email, Google GenAI, and a PWA. It is already SSDLC-mature (report-only CSP + hardened
headers, gitleaks, semgrep, Jest).

We must decide (a) the website stack — now moot, it's Next.js — and (b) how The-Lab relates to
this `fablab` platform repo.

## Decision

1. **Website stack = Next.js 16 (SSR)**, deployed as a Node `output: 'standalone'` container on
   Coolify (the app's existing Dockerfile is the build path).
2. **Consolidate The-Lab into this monorepo** as **one lowercase folder** `lab-site/the-lab/`
   (a single copy of the app). Bring it in via **`git subtree`** to **preserve its commit
   history** (preferred over a flat copy).
3. **Environments come from branches, not folders:** Coolify builds production from `main`,
   staging from `dev`, and a preview per PR — so there is no duplicated `main/`+`dev/` code.
   (All directories lowercase `kebab-case`; folders only — the GitHub repo/org casing is
   unchanged.)
4. The-Lab's existing root files come with it and live at `lab-site/the-lab/` — including its
   **own `CLAUDE.md`** (kept, loaded on demand for that subtree). `lab-site/CLAUDE.md` holds the
   shared frontend rules; the monorepo root holds repo-wide rules.

## Rationale

- The stack is a given (existing app); a static rewrite would throw away working auth/payments/
  DB/AI features.
- A monorepo keeps the platform (`lab-stack`) and the site(s) versioned and deployed together,
  matching the folder ⇄ Coolify-environment mapping (ADR 0002, overview §4).
- `git subtree` preserves authorship/history and keeps the move reversible/auditable
  (`@rules/topic-migration.md`).

## Consequences

- **Positive:** one source of truth; shared CI/docs/runbooks; clean prod/staging/preview model.
- **Negative / accepted:**
  - **Re-homing CI & history** — The-Lab's GitHub Actions/branch protection/secret scanning
    must be re-pointed at the monorepo (and paths updated). The monorepo likely becomes the new
    origin; **The-Lab gets archived** (open item — confirm).
  - **Set `output: 'standalone'`** in `next.config.mjs` for a lean self-hosted image (Vercel
    didn't require it) — a small, reviewed app change during migration.
  - Future multiple sites may want **npm/pnpm workspaces** — deferred until a second site exists.
  - Two `CLAUDE.md` layers over `lab-site/the-lab` (shared + The-Lab's own) — intentional; keep
    them non-conflicting (the more specific wins, master §6).
  - **Subdirectory build context:** the app moves from repo-root to `lab-site/the-lab/`, so set
    Coolify's **base directory** and update Dockerfile/CI working-dir/lockfile paths.
  - **GitHub Actions only run from the repo root `.github/workflows/`** — The-Lab's existing
    workflows under `lab-site/the-lab/.github/` will **not** auto-run; merge them into the root
    `.github/workflows/ci.yml` (path-scoped, `working-directory: lab-site/the-lab`) at
    consolidation. The root CI already guards app jobs on the app's presence.

## Alternatives considered

- **Deploy The-Lab from its own repo** (Coolify points at it; `fablab` = platform+docs only) —
  rejected by decision; would keep two repos and split the source of truth.
- **Static rewrite (Astro/Hugo)** — rejected; the site is a dynamic app, not brochureware.

## Open questions

- [ ] `git subtree` vs. plain copy (recommend subtree); does `fablab` become the new origin and
      The-Lab get archived?
- [ ] Monorepo task tooling (workspaces) — when a second site arrives.
