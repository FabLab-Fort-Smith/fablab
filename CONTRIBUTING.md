# Contributing to `fablab`

The monorepo for the FabLab self-hosted deploy platform (`lab-stack`) and the site(s)
(`lab-site/`). Inherits the SSDLC ruleset in [`CLAUDE.md`](./CLAUDE.md). The consolidated app
has its own, more detailed rules at [`lab-site/the-lab/CLAUDE.md`](./lab-site/the-lab/CLAUDE.md)
and [`lab-site/the-lab/CONTRIBUTING.md`](./lab-site/the-lab/CONTRIBUTING.md) — follow those for
app changes.

## One-time setup

```bash
scripts/setup.sh                 # enables local git hooks (.githooks)
git config commit.gpgsign true   # commits MUST be signed (configure your signing key)
```

Optional local tools the hooks use (CI enforces these regardless): `gitleaks`, `yamllint`,
`ansible-lint`, and `npm --prefix lab-site/the-lab ci` for the app's eslint.

## Workflow (trunk-based, PR-only)

- **Never commit directly to `main`.** Branch off the latest `main`:
  `type/short-desc` — e.g. `feat/...`, `fix/...`, `chore/...`, `ci/...`, `docs/...`.
- **Atomic, signed commits**, Conventional Commits style (`type(scope): summary`).
- Open a **PR into `main`**; keep it small and single-purpose. Fill in what / why / risk /
  test evidence / security impact.
- **All CI gates must be green** before merge (secret-scan, IaC lint, SAST, app build/test).
  > Note: this repo is **private on the free plan**, so GitHub can't *enforce* branch
  > protection server-side yet (Pro/Team required). PR-only + green CI + signed commits are
  > enforced by **policy + local hooks** until the plan allows server-side rules.
- **Merge:** squash for normal changes (linear history); a **merge commit** only for
  history-preserving subtree syncs.

## Security-relevant changes

Auth, crypto, secrets, payments, PII, file upload, server-side fetch of user URLs, the device
tier (`vps/`), or infra/deploy config → treat as security-relevant: threat-model the change,
add abuse/negative tests, and get a security-focused review (see the app's `CLAUDE.md` §2–§7).

## Where things live

- `lab-stack/` — deploy platform IaC (cloud-init, Ansible, Coolify/Cloudflare config).
- `lab-site/the-lab/` — the Next.js app (its own `CLAUDE.md` governs).
- `docs/` — architecture (ADRs), security (threat model), runbooks.
- `.github/workflows/` — CI gates.

## Migration safety (until cutover)

The live site still deploys from `FabLab-Fort-Smith/The-Lab` on **Vercel**. Don't let changes
here affect it — see [`docs/runbooks/migrate-from-vercel.md`](./docs/runbooks/migrate-from-vercel.md)
(separate DB/Square-sandbox/S3/SMTP; no production DNS change until the gated cutover).
