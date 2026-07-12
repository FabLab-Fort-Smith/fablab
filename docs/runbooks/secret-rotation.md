---
title: Rotate secrets & SSH keys/certs
category: Security
usage: Scheduled + on exposure/offboard
order: 30
summary: Rotate the SSH CA key, revoke certs, roll deploy/automation keys, and rotate app/provider secrets — zero-downtime, revoke-first on compromise.
---

# Runbook: Secret & SSH key/cert rotation

> Honors the key-lifecycle mandates (`@rules/workflow-secrets.md`, `@rules/topic-cryptography.md`,
> `@rules/std-zero-trust.md`, master §5). Principle: **prefer short-lived, auto-expiring credentials;
> no key is valid forever; rotate on a schedule and on exposure/personnel change; add-new-before-
> revoke-old for zero downtime, but REVOKE FIRST on confirmed compromise.**

## When to use
- **Scheduled:** the cadences in the table below.
- **On demand:** suspected/confirmed exposure (treat any key that hit VCS or a log as compromised),
  or a maintainer/contributor leaving.

## Rotation cadence (defined intervals — the mandate)
| Credential | Interval | Mechanism |
|---|---|---|
| **SSH certificates** (agent/maintainer) | **1h default, 8h cap** (auto-expire) | short TTL — nothing to rotate; re-sign as needed |
| **SSH CA private key** | **≤ 12 months**, and on maintainer departure / suspected exposure | §A below (dual-trust overlap) |
| **`deploy` / `automation` `authorized_keys`** | review **quarterly**, rotate **≤ 12 months** and on offboard/exposure | §B below |
| **App/local secrets** (AUTH_SECRET, JWT_SECRET, ENCRYPTION_KEY, MONGO_*) | on exposure; else ≤ 12 months | §C (`make secrets --force`) |
| **Provider tokens** (Cloudflare, Coolify, Square, S3, SMTP, GenAI) | per provider; on exposure | §D (rotate in provider → `.env` → converge/restart) |

## Prerequisites & access
- The offline CA private key (maintainer machine, passphrase-protected) for §A/cert ops.
- Ability to `make converge` (gated) to push host trust/authorized-key changes.
- The secret store / provider consoles for §C/§D.

---

## A. Rotate / revoke SSH CA key & certificates

**A1 — Revoke a single cert or key early (before its TTL).** Immediate revocation via a KRL:
```bash
cd lab-stack
# Build/append a KRL from the serial(s) in ssh-ca's audit log, or from the pubkey/cert:
ssh-keygen -k -f ssh-ca/revoked.krl -s ssh-ca/fablab_ssh_ca.pub -z <serial>   # or: <compromised.pub>
# Publish it to the hosts: paste the KRL into group_vars/all.yml -> ssh_ca_krl_content, then:
make converge      # GATED — hosts reject any cert in the KRL immediately
```
(Short TTLs are the baseline defense; the KRL is for revoking *before* expiry.)

**A2 — Rotate the CA key (scheduled, zero-downtime — add-new-before-revoke-old):**
1. Generate the NEW CA offline: `cd lab-stack && make ssh-ca-init` (writes `ssh-ca/fablab_ssh_ca`).
2. **Dual-trust:** set BOTH old + new CA public keys in `group_vars/all.yml` (`ssh_ca_public_key`
   supports multiple lines / a trusted-CAs file) → `make converge`. Hosts now accept certs from either.
3. Re-issue active certs with the NEW CA (`make ssh-ca-sign … --ca ssh-ca/fablab_ssh_ca`); consumers
   switch as their old certs expire (≤ 8h).
4. After the overlap window (≥ max cert TTL), **remove the OLD CA** from `group_vars` → `make converge`.
5. Destroy the old CA private key (secure wipe) and record the rotation.

**A3 — Confirmed CA-key compromise (REVOKE FIRST):** do NOT wait for overlap — remove the old CA
from `ssh_ca_public_key`, converge immediately (all its certs stop working), then generate + trust a
new CA (steps A2.1–2) and re-issue. Escalate via `incident-response.md` and rotate any secret the
attacker could have reached.

## B. Rotate `deploy` / `automation` authorized_keys (ADR 0008/0009)
The key lists in `group_vars/all.yml` are the single source of truth (managed by the roles).
- **Add/rotate (zero-downtime):** add the new public key line (`scripts/collect-keys.sh --into …`
  is additive and never drops existing keys), `make converge`, verify the new key works, then remove
  the old line and `make converge` again.
- **Offboard / exposure:** delete that person's key line and `make converge` — access is gone on the
  next converge. On exposure, do this immediately (revoke-first), then rotate anything else exposed.

## C. Rotate app/local secrets
```bash
cd lab-stack
make secrets ARGS=--force      # rotates AUTH_SECRET/JWT_SECRET/ENCRYPTION_KEY/INTERNAL_/SOCKET_/MONGO_* (typed ROTATE confirm)
make converge                  # GATED — pushes new MONGO_* to the DB config
# then redeploy the app in Coolify with the new values; note: rotating ENCRYPTION_KEY makes data
# encrypted under the old key unreadable — plan a re-encryption/expand-contract if PII is stored.
```

## D. Rotate provider tokens
Rotate in the provider console (Cloudflare API token, Coolify API token, Square, S3, SMTP, GenAI) →
update `../.env` (git-ignored) → `make converge` (DNS/Coolify checks) and/or restart the consuming
service. Add-new-before-revoke-old where the provider supports overlapping tokens.

## Verification
- `ssh -i <key> -o CertificateFile=<cert> <principal>@<host> true` works with the NEW cert/key and
  is **refused** for a revoked/removed one.
- Auth logs show no errors post-rotation (`@rules/topic-logging-observability.md`); the ssh-ca audit
  log records the new issuance.

## Rollback / abort
- CA rotation: during the dual-trust overlap the OLD CA is still trusted — re-issue from it and
  investigate before removing. authorized_keys: the old key stays valid until you converge its
  removal, so re-add and re-converge if a consumer breaks.

## Escalation
- Confirmed exposure → run under `incident-response.md`; page the security owner.

## Related
- `agent-ssh-access.md`, `bootstrap-vps.md`; `lab-stack/ssh-ca/`; ADR 0008/0009/0011;
  `@rules/workflow-secrets.md`, `@rules/std-zero-trust.md`.

---
_Last validated: never (draft — rehearse the CA-rotation drill before relying on it). Owner: platform._
