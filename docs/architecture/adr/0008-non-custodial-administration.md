# ADR 0008 — Non-custodial administration (no single-owner accounts)

- **Status:** Accepted
- **Date:** 2026-06-04

## Context

FabLab is a community space with **multiple, rotating maintainers**, and we foresee
**automated CI / scheduled ops**. Administration must not be *custodial* — i.e., not tied to any
one person's account, credentials, or machine. When a volunteer leaves, access is removed without
breaking automation; no shared "god" password; every identity is revocable and auditable
(`@rules/workflow-secrets.md` least privilege / one-identity-per-workload; `@rules/std-soc2.md`
access management).

## Decision

Make every administration layer **role-based and multi-principal**:

1. **OS / SSH — a shared `deploy` role account, Ansible-managed.**
   - Created and owned by the `deploy_account` role (not a personal user). It owns the docker
     group + backup files, so host ops aren't tied to `b007ab1e`/`critter`.
   - `deploy_authorized_keys` (in `group_vars`, version-controlled) is the **single source of
     truth**: one key per maintainer + one **CI/automation** key. Adding a key grants access;
     removing it + re-running **offboards** that principal (`exclusive` authorized_keys).
   - Passwordless sudo for unattended automation; SSH stays key-only / no-root / no-password.
   - **Bootstrap:** the first converge connects as an existing sudo user to create `deploy`;
     thereafter `ansible_user=deploy` and CI uses the deploy account + its own key.

2. **Coolify (app layer) — a team, not a personal login.**
   - Invite **every maintainer** as a Coolify team member with their **own login + MFA** (no
     shared dashboard password). Use a dedicated **API token** for CI/automation (revocable,
     not a human's session). Keep a documented break-glass owner.

3. **Cloudflare / external — scoped tokens, not personal global keys.**
   - DNS/edge automation uses a **scoped API token** (Zone › DNS › Edit), owned by the project,
     stored in the secret store — never a personal Global API Key.

4. **Secrets — in the shared secret store / Coolify**, never on one maintainer's laptop; rotation
   has an owner and a cadence (`@rules/workflow-secrets.md`).

## Consequences

- **Positive:** survives personnel changes (bus-factor); clear audit trail (who/what did an
  action); least privilege; CI gets a first-class, revocable identity; offboarding is a one-line
  git change + re-run.
- **Negative / accepted:**
  - `deploy` has `NOPASSWD:ALL` sudo (needed for unattended Ansible) — broad; mitigated by
    key-per-principal revocability + audit logging. Can be scoped later, or split a narrower
    `automation` account if CI needs less than full ops.
  - Maintainer/CI **public** keys live in `group_vars` (public keys aren't secret) — fine; the
    private keys stay with each holder / the CI secret store.
  - One-time UI steps remain (Coolify team invites + MFA, GitHub App) — inherent.

## Alternatives considered

- **Use existing personal sudo accounts (`critter`/`b007ab1e`) directly** — simplest, but
  custodial: ties ops + docker/backup ownership to individuals and breaks on offboarding.
  Rejected for a multi-maintainer space (kept as a non-default option:
  `manage_deploy_account: false`).
- **A separate dedicated `automation` account distinct from `deploy`** — cleaner separation for
  CI; **now adopted in ADR 0009** (scoped allowlist sudo). CI no longer rides on `deploy`.
