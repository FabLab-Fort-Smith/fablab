# SSH Certificate Authority — agent machine access

Give *other agents* (CI, cron, AI sessions) time-boxed, scoped, auditable access to configure
machines **when the appropriate key is presented** — without long-lived `authorized_keys` or a
resident broadly-privileged key. See **ADR 0011** for the decision and **`docs/runbooks/agent-ssh-access.md`**
for the operational procedure.

## How it works

```
agent's own keypair ──(present pubkey + a credential)──▶ ISSUER (holds CA key) ──▶ short-lived cert
                                                                                        │
machine trusts CA public key (ssh_ca Ansible role) ◀── cert principal maps to account ──┘
```

- **Machines trust a CA** (`TrustedUserCAKeys`) and map cert **principals → accounts** via
  `AuthorizedPrincipalsFile`, deny-by-default. This is the `ssh_ca` role and is the same
  regardless of which issuer you pick.
- **Access = a short-lived certificate** signed for the agent's *own* key. It expires (default 1h,
  cap 8h); no static grant is left behind.
- **Principals mirror the accounts:** `ops`→`automation` (scoped, ADR 0009), `maintainer`→`deploy`
  (broad human, ADR 0008). Forwarding/PTY are deny-by-default per role.
- **The CA private key never lives here or on an agent** — offline / secret store / inside Vault.

## COTS tooling (reusable across machines and agents)

| Tool | Use it when | Notes |
|---|---|---|
| **OpenSSH CA** (`sign-ssh-cert.sh`, in this dir) | now, low volume, air-gapped | zero new infra; a trusted broker/human holds the CA key and signs on request |
| **HashiCorp Vault — SSH secrets engine** (recommended scale path) | multiple agents, self-service | agent presents a **Vault token** ("the appropriate key"); Vault mints a role-scoped cert; CA key never leaves Vault; full audit + RBAC |
| **Smallstep `step-ca`** | want a small dedicated CA daemon | `step ssh certificate` with OIDC/JWT/one-time-token provisioners |
| **Teleport** | full access plane, session recording, RBAC | heaviest; great for a real fleet |

The machine-side `ssh_ca` role is identical for all of them — you only swap the issuer.

### Baseline (OpenSSH CA) — quick start

```bash
# 1. Create the CA keypair OFFLINE (private half is git-ignored: *_ed25519 / *.key). Guard it.
make ssh-ca-init                 # -> ssh-ca/fablab_ssh_ca(.pub)

# 2. Trust the CA on the machines: set in group_vars/all.yml, then converge (GATED):
#      ssh_ca_enabled: true
#      ssh_ca_public_key: "<contents of ssh-ca/fablab_ssh_ca.pub>"
make converge-check              # review, then `make converge`

# 3. An agent generates its OWN keypair and sends you only the .pub. Mint a 15-min ops cert:
make ssh-ca-sign PUB=agent_ed25519.pub ROLE=ops ID=agent:crittercodes-ci TTL=15m

# 4. The agent connects (cert + its own private key):
ssh -i agent_ed25519 -o CertificateFile=agent_ed25519-cert.pub automation@<host>
```

### Scale path (Vault) — outline

Enable the engine, configure a CA and a role, machines trust `vault read -field=public_key ssh/config/ca`:

```bash
vault secrets enable -path=ssh ssh
vault write ssh/config/ca generate_signing_key=true
vault write ssh/roles/ops key_type=ca allowed_users=automation \
      default_extensions='{"permit-pty":""}' ttl=1h max_ttl=8h allowed_user_key_lengths='ed25519="256"'
# Agent (holding a scoped Vault token) self-serves a cert:
vault write -field=signed_key ssh/sign/ops public_key=@agent_ed25519.pub > agent_ed25519-cert.pub
```

Put `ssh/config/ca`'s public key into `ssh_ca_public_key` and the machine side is unchanged.

## Security model (why this is the right shape)

- **Least privilege / short-lived** (`@rules/workflow-secrets.md`, `@rules/std-zero-trust.md`):
  certs expire; a leaked agent key is useless past its short TTL and only for its principal.
- **Auditable:** the baseline issuer appends a redacted line per issuance; Vault/Teleport log
  centrally. Per-agent attribution via the cert identity (`-I agent:<name>`).
- **Revocable:** short TTL is de-facto revocation; a KRL (`ssh_ca_krl_content`) is immediate.
- **CA key protection:** `sign-ssh-cert.sh` refuses a CA key that is group/world-readable and
  never passes it via argv. In production prefer Vault/HSM so the key is never on disk.
- **Reach ≠ autonomy:** a valid cert lets an agent *connect*; converge/deploy/destructive actions
  remain human-gated per action (`@rules/workflow-gated-actions.md`).

## Open decisions (confirm before enabling)

1. **Issuer backend** — OpenSSH baseline now, or stand up Vault immediately?
2. **Where the CA key lives** — offline laptop, the VPS itself (weaker), a separate broker host, or Vault.
3. **Scope** — just the RackNerd VPS, or a general "any machine" fleet (changes principal design).
4. **Who may request `maintainer` (→ `deploy`) certs** vs. only `ops` (→ `automation`).
