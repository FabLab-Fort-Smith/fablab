# ADR 0014 — ZeroTier overlay + off-box shared secret vault (Vaultwarden)

- **Status:** Accepted
- **Date:** 2026-07-16

## Context

Platform custody had a key-person problem: ~40 secrets (Cloudflare/Coolify/Mongo/RackNerd/Square/
app keys) lived in a single git-ignored `.env` on one operator's laptop, and access to the host was
effectively single-path. `@rules/workflow-secrets.md` + master §5 call for a **shared secret store**
(vault/KMS), not a local file. We needed (a) a shared, auditable secret store multiple custodians can
reach, and (b) a private path for the VPS itself to read it — without exposing the vault publicly and
without a **circular dependency** (storing the box's own recovery secrets *on* the box you'd need them
to fix). ADR 0012 already put admin access on a **Tailscale** tailnet. The shared vault (a self-hosted
**Vaultwarden**) runs on a separate machine that is on a **ZeroTier** mesh.

## Decision

- Run the shared **Vaultwarden** vault **off** `fablab-prod` (separate host), reachable over a
  **ZeroTier** overlay — never the public internet. Off-box breaks the circular dependency (the vault
  that holds the platform's recovery secrets does not depend on the platform it protects).
- Join `fablab-prod` to the ZeroTier network via a **config-as-code `zerotier` Ansible role** that
  coexists with the `tailscale` role (both meshes run). The apt signing key is **vendored + fingerprint
  -pinned** (no runtime TOFU fetch); the same hardening was applied to the `tailscale` role.
- Make the vault the **source of truth** for secrets: `make secrets-pull` (`scripts/secrets-pull.sh`)
  pulls the `Default collection/Infrastructure` items into `.env` over ZeroTier, source-safe (values
  single-quoted so `. .env` at converge can't be injection'd) and non-destructive.
- Vault access is **per-person** (each custodian an account + MFA) under a least-privilege
  Infrastructure collection. DR crown-jewels (age key, SSH deploy key, Coolify `APP_KEY`) and
  account-owner logins are entered by humans directly, never through an agent.

## Consequences

- **+** Shared custody: platform secrets no longer live only in one operator's `.env`; an off-box
  store survives loss of the VPS or any single custodian (`docs/runbooks/shared-custody.md`).
- **+** The host reaches the vault privately over ZeroTier; admin now has two independent private
  overlays (Tailscale + ZeroTier).
- **−** Two overlays to operate; ZeroTier nodes must be **authorized on the controller** (my.zerotier.com)
  before they get an overlay IP. The vault, the ZeroTier controller, and the domain-registrar/owner
  accounts become custody items in their own right (tracked in the shared-custody runbook).
- **−** The vault's self-signed cert is trusted **TOFU** on first use unless `VAULT_CACERT` is pinned
  (mitigated by the private ZeroTier overlay). Threat-model row **R10** covers vault compromise.

## Alternatives considered

- **Vault on the VPS** — rejected: circular dependency (you'd need the box up to reach the secrets
  that fix the box).
- **Reuse Tailscale for the vault** instead of a second mesh — viable; ZeroTier chosen because the
  vault already lives on the operator's ZeroTier network. The meshes coexist, so this is additive.
- **SaaS 1Password / Bitwarden cloud** — a valid off-box option; deferred in favor of self-hosted
  Vaultwarden (matches the self-hosting ethos, no per-seat cost). Recorded as an option in
  `docs/runbooks/shared-custody.md`; revisit if operating the self-hosted vault becomes a burden.
- **Keep secrets in a single local `.env`** — rejected: key-person risk; violates
  `@rules/workflow-secrets.md`.

## Related

- ADR 0012 (tailnet-first admin + Cloudflare-gated webhooks); `docs/runbooks/shared-custody.md`;
  `lab-stack/ansible/roles/{zerotier,tailscale}`; `lab-stack/scripts/secrets-pull.sh`;
  threat-model R3 (overlay-only admin) + R10 (vault compromise).
