---
title: Grant an agent SSH access (SSH CA)
category: Security
usage: As needed
order: 40
summary: Mint a short-lived, principal-scoped SSH certificate so an agent/CI gets time-boxed access — no long-lived keys.
---

# Runbook: Grant an agent SSH access (SSH CA)

> Give an agent (CI, cron, or an AI session) time-boxed, scoped access to a machine by minting a
> short-lived certificate — no long-lived keys. Rules: ADR 0011, `@rules/workflow-secrets.md`,
> `@rules/workflow-gated-actions.md`. Tooling: `lab-stack/ssh-ca/`.

## When to use
- An agent needs to configure/maintain the VPS on an ongoing basis and presents its own public key.
- NOT for granting standing admin — this grants a **short-lived** cert, re-issued as needed.

## Prerequisites & access
- The `ssh_ca` role is applied on the target (`ssh_ca_enabled: true`, `ssh_ca_public_key` set,
  converged — a GATED step). Access to the CA issuer: either the offline CA key (baseline) or a
  Vault token with the `ssh/sign/<role>` capability. NTP running on the host (cert validity is time-based).

## Steps (OpenSSH baseline)
1. Receive the agent's **public** key only (`agent_ed25519.pub`). Never accept a private key.
2. Choose the least role that fits: `ops` (→ `automation`, scoped) by default; `maintainer`
   (→ `deploy`, broad) only if full host ops are required.
3. Mint a short-lived cert with an attributable identity:
   `make ssh-ca-sign PUB=agent_ed25519.pub ROLE=ops ID=agent:<name> TTL=15m`
   → writes `agent_ed25519-cert.pub` and appends an audit line.
4. Return the cert to the agent. It connects:
   `ssh -i agent_ed25519 -o CertificateFile=agent_ed25519-cert.pub automation@<host>` → shell/command as `automation`.
5. Decision point: recurring access → prefer the **Vault** issuer so the agent self-serves
   (`vault write -field=signed_key ssh/sign/ops public_key=@agent_ed25519.pub`), rather than you signing each time.

## Verification
- `ssh-keygen -L -f agent_ed25519-cert.pub` → correct principal, short validity window, expected extensions.
- Test the login before handing off; confirm it lands on the intended account with only the
  intended privileges (`sudo -ln` for `automation` shows the allowlist only — ADR 0009).

## Revocation / abort
- **De-facto:** do nothing — the cert expires at its TTL.
- **Immediate:** add the serial/key to `ssh_ca_krl_content`, re-converge (deploys `RevokedKeys`),
  or (Vault) `vault write ssh/issue/... ` role disable / revoke the agent's Vault token.
- Rotate the **CA key** only on suspected CA compromise — it invalidates all certs; treat as an
  incident (`docs/runbooks/incident-response.md`, `secret-rotation.md`).

## Escalation
- Suspected CA-key exposure → incident response + CA rotation. Requests for `maintainer`/`deploy`
  scope → confirm with a maintainer (broad privilege).

## Related
- ADR 0011; `lab-stack/ssh-ca/README.md`; `docs/runbooks/bootstrap-vps.md`; ADR 0008/0009.

---
_Last validated: PENDING (scaffold — not yet drilled). Owner: platform._
