# ADR 0009 — Scoped automation account (least-privilege CI / scheduled ops)

- **Status:** Accepted
- **Date:** 2026-06-05
- **Builds on:** ADR 0008 (non-custodial administration) — realizes the deferred "separate
  `automation` account" option.

## Context

ADR 0008 introduced a shared `deploy` role account with `NOPASSWD:ALL` for human-run full
converge, and let CI ride on it. That's too broad for unattended **CI / scheduled ops**: an
automation credential should be able to do **only** what it needs (least privilege /
`@rules/std-zero-trust.md`, master §2), so a leaked or misused CI key can't take the whole host.

## Decision

Add a dedicated, **scoped** `automation` account, separate from `deploy`:

- **Not** a member of the `sudo` group, and **not** in the `docker` group (docker group ==
  root-equivalent — being in it would defeat the scoping).
- May run as root **only** an explicit **command allowlist** (`automation_sudo_commands`) via a
  validated `sudoers.d` drop-in (`NOPASSWD` for exactly those absolute paths). **Empty list ⇒ no
  sudo at all** (pure unprivileged automation).
- Its own keys (`automation_authorized_keys`) are the single source of truth; revoke by removing
  a key and re-running. **CI/automation uses this account, not `deploy`.**
- Implemented by the `automation_account` Ansible role, gated by `manage_automation_account`.

**Division of duties:**
| Identity | Privilege | Used by |
|---|---|---|
| `deploy` (ADR 0008) | broad (`NOPASSWD:ALL`) | maintainers running full `converge`/host ops |
| `automation` (this ADR) | scoped allowlist only | CI + cron/scheduled ops |
| Coolify API token | app-layer deploys/config | app CI (no SSH) |
| Cloudflare scoped token | DNS edit for the zone | DNS automation |

## Consequences

- **Positive:** a compromised/over-eager CI key can run only the allow-listed commands as root —
  blast radius is bounded and auditable; clean separation of human ops vs. machine ops.
- **Negative / accepted:**
  - The allowlist must be **maintained**: a new scheduled-ops task that needs root requires adding
    its exact command (deliberately — that's the point). Keep entries to absolute paths with no
    shell wildcards to avoid privilege-escalation via argument injection.
  - Tasks needing broad/unpredictable root (e.g. a full `ansible-playbook` converge) are **not**
    for this account — those stay with `deploy` (human-run) or a separately-authorized pipeline.
  - Two accounts to understand instead of one (documented here + in the runbook).

## Alternatives considered

- **CI on the `deploy` account** (ADR 0008 interim) — simplest, but full root for automation;
  rejected (the whole reason for this ADR).
- **Docker group for automation** — convenient but root-equivalent; rejected.
- **Per-task accounts** — maximal isolation, more overhead; revisit only if a task needs a
  materially different trust level.
