# ADR 0011 — SSH certificate authority for agent machine access

- **Status:** Proposed
- **Date:** 2026-07-12
- **Builds on:** ADR 0004 (SSH-only transport), ADR 0008 (non-custodial `deploy`), ADR 0009
  (scoped `automation` account). Realizes the "short-lived credentials over long-lived keys"
  mandate (`@rules/workflow-secrets.md`, `@rules/std-zero-trust.md`).

## Context

We want *other agents* (CI, scheduled jobs, and interactive AI sessions) to be able to configure
machines **when the appropriate key is presented**, on an ongoing basis, without:

- pasting an ever-growing pile of long-lived public keys into `authorized_keys` (hard to audit,
  easy to forget to revoke), or
- handing an agent a resident, broadly-privileged private key (violates least privilege; a leak
  is a full compromise).

The existing model (ADR 0008/0009) already separates a broad human `deploy` account from a scoped
`automation` account. What's missing is a *credential-issuance* mechanism so access is granted
per-request, time-boxed, principal-scoped, revocable, and auditable.

## Decision

Adopt an **SSH certificate authority (CA)** for user authentication:

- Each machine **trusts a CA public key** (`TrustedUserCAKeys`) and maps certificate **principals**
  to login accounts via `AuthorizedPrincipalsFile` (deny by default). Implemented by the new
  `ssh_ca` Ansible role, opt-in via `ssh_ca_enabled`, running right after `harden`.
- Access is granted by **minting a short-lived certificate** (default TTL 1h, cap 8h) for the
  requester's own key. The requester never receives a static long-lived grant; the cert expires.
- **Principals mirror the account model:** an `ops` cert carries principal `automation` → the
  scoped account (ADR 0009); a `maintainer` cert carries principal `deploy` → the broad human
  account (ADR 0008). Certificate extensions are deny-by-default (no port/agent/X11 forwarding
  unless the role grants it).
- **The CA private key is the crown jewel** and is never in the repo, never on an agent. It lives
  offline / in the secret store, or inside a networked issuer that authenticates requesters.

**Issuer backends (the trust model on machines is identical; only the issuer changes):**

| Backend | When | "Appropriate key presented" means |
|---|---|---|
| `ssh-ca/sign-ssh-cert.sh` (OpenSSH baseline) | now / low volume / air-gapped | a human/broker holding the CA key signs the agent's pubkey for a role |
| **HashiCorp Vault SSH secrets engine** (COTS, recommended scale path) | many agents / self-service | the agent presents a **Vault token** (its "appropriate key") and Vault signs a role-scoped cert — the CA key stays inside Vault |
| Smallstep `step-ca` (COTS, lighter) | want a small dedicated CA service | agent presents an OIDC/JWT/one-time token to `step ssh certificate` |
| Teleport (COTS, heavyweight) | full access plane + session recording + RBAC | agent authenticates to Teleport; certs are issued transparently |

We start with the **OpenSSH baseline** (zero new infra, works over the tailnet) and upgrade to the
**Vault SSH secrets engine** when more than a couple of agents need self-service issuance.

## Consequences

- **Positive:** no long-lived keys accumulate; revocation is automatic (TTL) or immediate (KRL);
  every issuance is audited (who/role/principal/serial/ttl); blast radius of a leaked agent key is
  ≤ its cert's remaining TTL and scoped principal; the model is COTS-portable (baseline → Vault)
  without touching the machines.
- **Negative / accepted:**
  - The **CA private key** must be protected like a root credential — compromise mints access to
    the whole fleet. Mitigate: offline/HSM/Vault storage, `600/400` mode enforced by the issuer,
    short TTLs, and a KRL for emergency revocation.
  - Clock skew matters — cert validity is time-based; hosts must run NTP (already true).
  - Another concept to operate; documented here + in `docs/runbooks/agent-ssh-access.md`.
- **Unchanged:** gated actions stay gated — holding a valid cert grants *reach*, not autonomy;
  converge/deploy/destructive ops still require per-action human approval
  (`@rules/workflow-gated-actions.md`).

## Alternatives considered

- **Keep appending to `authorized_keys`** — simplest, but unbounded, poorly auditable, and
  revocation depends on remembering to remove a line; rejected for "ongoing agent access."
- **One shared automation private key handed to agents** — a single leak = full automation
  compromise, no per-agent attribution; rejected.
- **Tailscale SSH** — attractive (identity from the tailnet, no key management); viable
  complement for tailnet-only access, but couples auth to Tailscale and doesn't cover
  non-tailnet issuance; revisit as an alternative issuer. The CA model is transport-agnostic.
