# FabLab Deploy Platform (`fablab`)

A self-hosted **"instant deploy"** platform — the developer experience of Vercel
(push to git → automatic build → atomic, zero-downtime deploy → live on HTTPS, with a
**preview URL for every branch/PR**) running on our own VPS — **plus** the FabLab website it
serves, consolidated into one monorepo.

This is effectively a **migration of the existing [`The-Lab`](https://github.com/FabLab-Fort-Smith/The-Lab)
Next.js app off Vercel** onto our own stack.

> Inherits the master SSDLC ruleset (`~/.claude/CLAUDE.md`); see [`CLAUDE.md`](./CLAUDE.md).

---

## Repository layout

```
fablab/                  ← monorepo: platform + site(s) + docs
├── README.md            ← project home (you are here)
├── CLAUDE.md            ← repo-wide SSDLC rules
├── SECURITY.md
├── docs/
│   ├── architecture/
│   │   ├── overview.md      ← system design + the "7 Vercel features" mapping
│   │   └── adr/             ← Architecture Decision Records (why we chose what)
│   ├── security/
│   │   └── threat-model.md  ← STRIDE over push→build→deploy + app data flows
│   └── runbooks/            ← operational procedures (populated once infra exists)
│
├── lab-stack/           ← THE DEPLOY PLATFORM (VPS): Coolify, Traefik, MongoDB, IaC
│   └── README.md
│
└── lab-site/            ← THE WEBSITE(S)
    ├── README.md
    ├── the-lab/         ← The-Lab (Next.js 16) consolidated here — ONE copy of the app
    └── <new-site>/      ← additional sites, added the same way
```

Environments (production / staging / preview) are **Coolify deployments built from git
branches**, *not* folders: `main`→production (`<domain>`), `dev`→staging (`dev.<domain>`), each
PR→ephemeral preview (`pr-<n>.preview.<domain>`).

**Conventions:** all **directories are lowercase `kebab-case`** (canonical root files like this
README keep standard casing); a component with sub-parts gets one folder per part; each site is
one folder with environments coming from branches. New top-level components (e.g. a future
`lab-api/`) are added the same way.

---

## What we're replicating (the decision in one line)

Vercel's "magic" is **seven** features bundled together. We re-create six on a single VPS and
bolt the seventh on with a free CDN in front:

| # | Vercel feature | How we do it |
|---|----------------|--------------|
| 1 | Git-push deploy | Coolify GitHub App / GitLab webhook |
| 2 | **Preview deployments** (per branch/PR) | Coolify native preview envs → `pr-N.preview.<domain>` |
| 3 | Atomic zero-downtime swap | Coolify container swap behind Traefik |
| 4 | Instant rollback | Coolify deployment history |
| 5 | Automatic HTTPS (incl. wildcard for previews) | Coolify Traefik + Let's Encrypt |
| 6 | Build detection | Coolify Nixpacks / the app's existing Dockerfile |
| 7 | Global edge CDN | **Cloudflare** (free) in front of the VPS |

Test-gating (Vercel's "Deployment Checks") is **not** a Coolify feature — we keep our
SSDLC merge-blocking gates in **GitHub Actions / GitLab CI** (`@rules/workflow-cicd.md`).

See [`docs/architecture/overview.md`](./docs/architecture/overview.md) and the
[ADRs](./docs/architecture/adr/) for the full design and rationale.

---

## The application being migrated (`lab-site/the-lab` = The-Lab)

A **Next.js 16 / React 19** dynamic web app, currently on Vercel. Notable dependencies that
shape security scope and the deploy stack:

| Capability | Tech | Implication |
|---|---|---|
| Auth | Auth.js / NextAuth v5, JWT, bcryptjs | personal data, session security (`topic-authn-authz`) |
| Database | **MongoDB** | self-hosted on the VPS (ADR 0007); NoSQL injection, backups |
| Payments | **Square** (Web Payments SDK + server SDK) | **PCI** scope — hosted/tokenized fields (SAQ-A); never store SAD |
| Object storage | S3-compatible (`s3.crittercodes.dev`) | **kept external** (ADR 0007) |
| Email | nodemailer (SMTP) | **kept external**; deliverability + no PII leakage |
| AI | `@google/genai` | **LLM** scope — untrusted output, prompt-injection tests |
| Other | reCAPTCHA, PWA (next-pwa) | abuse protection, offline caching |

> **Note:** The-Lab also contains a `vps/` folder — that is an in-app *learning/missions
> feature* (a simulated Linux shell), **not** deploy infrastructure. Do not confuse it with
> `lab-stack`.

---

## Stack summary

| Concern | Choice | ADR |
|---|---|---|
| Deploy engine | **Coolify** (self-hosted PaaS) + Cloudflare edge | [0002](./docs/architecture/adr/0002-use-coolify-as-deploy-engine.md) |
| Source forge | **GitHub + GitLab** (mirrored); org `FabLab-Fort-Smith` | [0003](./docs/architecture/adr/0003-source-forge-github-and-gitlab.md) |
| Host | **RackNerd 8 GB VPS**; provider-agnostic server, on-host config-as-code | [0004](./docs/architecture/adr/0004-vps-host-and-config-as-code.md) |
| Website stack | **Next.js 16 (SSR)** — consolidate The-Lab into `lab-site/the-lab` | [0005](./docs/architecture/adr/0005-website-stack-and-monorepo-consolidation.md) |
| Migration | **Vercel → Coolify**, parallel-run then cutover | [0006](./docs/architecture/adr/0006-migrate-from-vercel-to-coolify.md) |
| Data services | MongoDB **self-hosted**; S3 + SMTP **external** | [0007](./docs/architecture/adr/0007-data-services.md) |

---

## Status

🟡 **Planning & documentation.** No infrastructure provisioned; `The-Lab` source has **not**
been moved yet (that's an execution step — see Next steps).

## Open decisions

- [ ] **Primary domain** + the `*.preview.<domain>` wildcard for previews.
- [ ] **Which forge is primary vs. mirror** (ADR 0003 leans GitHub-primary).
- [ ] **Consolidation method** for The-Lab → `lab-site/the-lab`: `git subtree` (preserves history,
      recommended) vs. plain copy; and whether this monorepo becomes the new origin (with
      The-Lab archived) — see ADR 0005.
- [ ] **Licensing** — internal infra vs. the app may differ per folder; none asserted yet.
- [ ] **Monorepo tooling** if more sites arrive (npm/pnpm workspaces) — defer until needed.

## Next steps

1. Review this plan + ADRs.
2. (Gated) Initialize remote / push, then **consolidate** The-Lab into `lab-site/the-lab`.
3. Build `lab-stack`: cloud-init + Ansible host config, Coolify, MongoDB service, Cloudflare,
   forge webhooks — then **parallel-run** alongside Vercel before cutover (ADR 0006).

## Quickstart (for now)

Nothing to run yet. Read, in order:
[`docs/architecture/overview.md`](./docs/architecture/overview.md) →
[`docs/architecture/adr/`](./docs/architecture/adr/) →
[`docs/security/threat-model.md`](./docs/security/threat-model.md) →
[`lab-stack/README.md`](./lab-stack/README.md).
