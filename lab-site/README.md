# lab-site — the website(s)

The FabLab website(s), served by the platform in [`../lab-stack`](../lab-stack).

## Naming & structure convention

> **All directories are lowercase `kebab-case`** (`[a-z0-9-]`). Each **site** is one folder
> holding a single source of truth; **environments** (production / staging / preview) are
> **Coolify deployments built from git branches**, *not* separate folders — so there's no
> duplicated app code (ADR 0005).

```
lab-site/
├── README.md
├── the-lab/        # the FabLab app (Next.js 16) — single copy, consolidated from The-Lab
└── <new-site>/     # additional sites, same lowercase rule (e.g. events-site/)
```

Environments for each site (Coolify):

| Environment | Built from | URL |
|---|---|---|
| production | `main` branch | `<domain>` |
| staging | `dev` branch | `dev.<domain>` |
| preview | each PR (ephemeral, auto-cleanup) | `pr-<n>.preview.<domain>` |

> **Add a new site:** create `lab-site/<new-site>/` (lowercase) with its own `README.md` (and
> `CLAUDE.md` if its stack differs), then register it as a Coolify application with the same
> branch→environment mapping (future `docs/runbooks/add-new-site.md`).

## `the-lab/` — the FabLab app (Next.js 16), migrating from Vercel

A dynamic **Next.js 16 / React 19** app (`package.json` name: `the-lab`). Stack and the
security scope it pulls in:

| Capability | Tech | Rules it triggers |
|---|---|---|
| Framework | Next.js 16, React 19, PWA (next-pwa) | `lang-typescript`, `topic-web-frontend`, `topic-performance` |
| Auth | Auth.js/NextAuth v5, JWT, bcryptjs | `topic-authn-authz`, `std-privacy` |
| API routes | Next.js route handlers | `std-owasp-api` |
| Database | MongoDB (self-hosted on VPS — ADR 0007) | `topic-nosql` (NoSQL injection, backups) |
| Payments | Square (Web Payments + server SDK) | `std-pci` (hosted/tokenized fields, SAQ-A; **never store SAD**) |
| Object storage | S3-compatible (`s3.crittercodes.dev`, external) | `topic-api-consumption` |
| Email | nodemailer / SMTP (external) | `topic-notifications` |
| AI | `@google/genai` | `std-owasp-llm`, `topic-token-optimization` |
| Abuse | reCAPTCHA | `std-owasp-api` (abuse-prone flows) |

**Existing maturity to preserve:** report-only CSP + hardened headers (`next.config.mjs`,
`SEC-##` controls), gitleaks + semgrep, Jest tests, its own `CLAUDE.md`/`AGENTS.md`.

### Consolidation plan (execution step — not done yet)

- Bring the app in under `lab-site/the-lab/` via **`git subtree`** to **preserve its history**
  (preferred over a flat copy). Its root files (`package.json`, `next.config.mjs`, `CLAUDE.md`,
  CI, gitleaks/semgrep) come with it and live at `lab-site/the-lab/`.
- The GitHub repo/org casing is **unchanged** (`FabLab-Fort-Smith/The-Lab`) — only the in-repo
  *folder* is lowercase (decision: folders-only).
- The-Lab's existing `CLAUDE.md` stays at `lab-site/the-lab/CLAUDE.md` (loaded on demand for that
  subtree); **this folder's `CLAUDE.md`** holds shared frontend rules for all sites.
- Moving to a subdirectory changes build context — set Coolify's **base directory** to
  `lab-site/the-lab`, and update Dockerfile/CI working-dir/lockfile paths accordingly.
- For self-hosted Docker, set Next.js **`output: 'standalone'`** for a lean image (Vercel didn't
  need it). The app's existing Dockerfile is the build path.
- See [migration ADR 0006](../docs/architecture/adr/0006-migrate-from-vercel-to-coolify.md).

## Rules

Each site is a web frontend **and** (for `the-lab`) a full app with auth/payments/DB/AI — the
client is untrusted, all security is enforced server-side, secrets never ship in the bundle,
and personal/payment data is classified and protected (master §5). See `CLAUDE.md` here.

## Status

🟢 `the-lab/` **consolidated** from `FabLab-Fort-Smith/The-Lab` via `git subtree` (history
preserved). `The-Lab` remains the live Vercel source and is **unchanged** — Coolify will deploy
this monorepo copy in parallel until the gated cutover (migration guardrails in
`docs/runbooks/migrate-from-vercel.md`). Next: wire it for Coolify (base dir `lab-site/the-lab`,
`output: 'standalone'`) — in this copy only, never in `The-Lab`.
