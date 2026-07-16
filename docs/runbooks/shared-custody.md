---
title: Shared custody of credentials & access
category: Security
usage: Onboarding/offboarding a custodian; eliminating key-person risk
order: 40
summary: No single person is a point of failure. Every recovery credential is held by ≥2 custodians, identities are per-person, secrets live in a shared off-box vault, and onboarding/offboarding is a repeatable checklist.
---

# Runbook: Shared custody of credentials & access

> This platform is operated by **multiple custodians** in shared custody. The goal of this
> runbook is that **no single person is a point of failure** — for day-to-day ops *or* disaster
> recovery. Rules: `@rules/workflow-secrets.md`, `@rules/std-zero-trust.md`,
> `@rules/workflow-gated-actions.md`, master §5. Pairs with `secret-rotation.md`,
> `safe-remote-change.md`, `agent-ssh-access.md`, `backup-restore.md`.

## Principles
1. **No single point of failure.** Every credential needed to *operate* or *recover* the platform
   is held by **≥2 custodians** (or in a shared vault ≥2 can reach). One person being unavailable
   must never block recovery.
2. **Per-person identities, never shared logins.** Each custodian has their own SSH key, Coolify
   login+MFA, GitHub identity, and vault account — so access is individually grantable, auditable,
   and **revocable** (offboarding removes one person without rotating everything).
3. **Least privilege + tiers.** Not everyone needs everything. Distinguish *infra custodians*
   (full: host, secrets, DR) from *app operators* (Coolify/app only).
4. **The recovery store is off-box.** The shared secret vault and break-glass creds must **not**
   live on the VPS they protect (circular dependency: you'd need the secrets to fix the box that
   holds them). Off-box/SaaS or on ≥2 custodian machines.
5. **Config-as-code where possible.** Access grants that can be code (SSH keys, firewall, Coolify
   reconcile) live in the repo and are applied by converge — not click-ops.

## Custodian roster
Shared custody is held by the following (the same set allow-listed on the Coolify dashboard).
Fill in each person's real SSH public key and GitHub signing key as they provide them.

| Custodian | GitHub | Email (Access) | Tier | SSH pubkey (`deploy`) | Signing key |
|---|---|---|---|---|---|
| John Annis | `0xb007ab1e` | john.annis@ / johnannis@ | infra | ✅ present | ✅ registered |
| CritterCodes | `CritterCodes` | — | infra | ✅ present | ❌ **needed** |
| Jacob Engel | `<gh?>` | jacob.engel@ | infra | ❌ **needed** | ❌ **needed** |
| Fractum | `FractumSeraph` | fractum@ | infra | ❌ **needed** | ❌ **needed** |
| Shyft | `ShyftXero` | shyft@ | infra | ❌ **needed** | ❌ **needed** |

> **Action:** collect each ❌ person's SSH public key (`ssh-ed25519 …`) and their GitHub-registered
> **signing** key. Onboard with the checklist below. `collect-keys.sh` can pull GitHub-published
> keys: `lab-stack/scripts/collect-keys.sh --into ansible/group_vars/all.yml gh <login>`.

## Credential & access inventory (custody status)
`SoT` = source of truth. Target for every secret is the **shared vault** (see Pending decisions).

| Surface | Where it lives now | Current holders | Gap → target |
|---|---|---|---|
| **SSH to host** (`deploy` acct) | `deploy_authorized_keys` in `group_vars/all.yml` (git-ignored) → converge | b007ab1e, CritterCodes | Add jacob/fractum/shyft keys → all infra custodians |
| **Sudo on host** | `b007ab1e` personal account password | b007ab1e only | Ops via `deploy`/`automation` accounts; document a shared elevation path; ≥2 can sudo |
| **Console break-glass** | RackNerd panel → Console/VNC, local Unix password | b007ab1e (`passwd -S` = P) | Each infra custodian has a console-capable account + password (set + store in vault) |
| **All platform secrets** | single `.env` on one laptop (~40 secrets) | b007ab1e only | **Shared vault**; `.env` = local projection pulled from vault |
| **RackNerd panel** (provider/power/console) | SolusVM login + `RACKNERD_API_KEY/HASH` in `.env` | b007ab1e | ≥2 custodians have panel login; API creds in vault |
| **Cloudflare** (DNS + Access tokens) | `CLOUDFLARE_API_TOKEN`, `CF_ACCESS_TOKEN` in `.env` | b007ab1e | Scoped tokens in vault; ≥2 CF account members |
| **Coolify** (admin + API token) | admin login+MFA; `COOLIFY_TOKEN` in `.env` | b007ab1e admin | Each custodian a Coolify team member (own login+MFA); token in vault |
| **MongoDB** (root + app pw) | `MONGO_ROOT/APP_PASSWORD` in `.env`; on box at `/opt/fablab/mongodb/mongo.env` (root) | b007ab1e / root | In vault; ≥2 can retrieve |
| **Backups / DR** (age key, restic pw) | age **private** key offline; `RESTIC_PASSWORD` in `.env` | whoever holds the age key | **≥2 custodians** hold age key + restic pw, or in vault — else only one person can restore |
| **App secrets** (Square/S3/SMTP/GenAI/AUTH/JWT/ENCRYPTION) | `.env` | b007ab1e | Vault |
| **GitHub org / repo** | org membership | org members | Ensure all custodians are org members with least-priv roles |
| **Commit signing** | SSH signing keys registered on GitHub | only `0xb007ab1e` | Register each custodian's signing key (CI verifies signatures) |
| **Tailscale** (`TAILSCALE_AUTHKEY`) | `.env`; tailnet ACLs | b007ab1e | Each custodian on the tailnet; authkey in vault |

## Gap remediation — priority order
- [ ] **P0 — Shared secret vault.** Pick a store (Pending decisions), migrate `.env` into it, make `.env` a pulled projection. Grant all infra custodians. *(Biggest single-custody risk.)*
- [ ] **P0 — DR is not single-custody.** Ensure **≥2** custodians hold: RackNerd panel login, backup **age private key**, restic password. Verify with a restore drill run by a *second* custodian (`backup-restore.md`).
- [ ] **P1 — Per-person SSH.** Add jacob/fractum/shyft keys to `deploy_authorized_keys`; `make converge`.
- [ ] **P1 — Coolify team.** Invite each custodian (own login + MFA) — UI: Team → Members (Coolify API has no invite endpoint).
- [ ] **P2 — Commit signing.** Each custodian registers an SSH signing key on GitHub.
- [ ] **P2 — Console/sudo.** Give each infra custodian a console-capable account + sudo path; store console passwords in the vault; re-drill `safe-remote-change.md` break-glass with a second custodian.
- [ ] **P3 — Consider SSH-CA** (`agent-ssh-access.md`, ADR 0011) for short-lived certs instead of long-lived `authorized_keys` as the custodian set grows.

## Onboarding a custodian
1. **SSH:** add their `ssh-ed25519 …` line to `deploy_authorized_keys` in `group_vars/all.yml`
   (or `collect-keys.sh --into … gh <login>`), then `cd lab-stack && make converge-check && make converge`.
2. **Coolify:** invite their email (Team → Members), assign the right team/role; they set password + MFA.
3. **Cloudflare Access:** add their email to `ACCESS_ALLOWED_EMAILS` in `.env`, `make access`.
4. **Commit signing:** they add their SSH signing key to GitHub (Settings → SSH and GPG keys → *Signing key*); confirm CI accepts a signed commit.
5. **Vault:** grant their vault account access to the shared collection(s) for their tier.
6. **DR (infra tier only):** give them the RackNerd panel login + the backup age key + restic password (from the vault); confirm they can console in and could run a restore.
7. Record them in the roster table above + the vault.

## Offboarding a custodian
1. **SSH:** remove their line from `deploy_authorized_keys`; `make converge` (access gone next converge).
   If SSH-CA is enabled, add their cert to the KRL (`secret-rotation.md`).
2. **Coolify:** remove the team member. **Cloudflare Access:** drop their email; `make access`.
3. **GitHub:** remove org access; revoke their signing key.
4. **Vault:** revoke their vault access.
5. **Rotate everything they could have read** — treat all shared secrets they had vault access to as
   exposed: rotate per `secret-rotation.md` (SSH-CA key, deploy/automation keys, app secrets via
   `make secrets --force`, provider tokens, Mongo passwords, RackNerd/Tailscale). **Revoke-first on
   suspected compromise.**
6. Update the roster.

## Verification
- Shared custody is real when a **second custodian** (not the primary) can, unaided: SSH to the host,
  retrieve every secret from the vault, log into Coolify + Cloudflare + RackNerd, console-break-glass
  in, and complete a **backup restore drill**. Schedule this as a periodic game-day.

## Pending decisions (blocking P0)
- **Secret store:** choose an **off-box** shared vault — 1Password Teams / Bitwarden (cloud) /
  SOPS+age in-repo. Then wire `make secrets-pull` (render `.env` from the vault) so the vault is SoT.
- **Per-person keys:** collect SSH + signing pubkeys for Jacob, Fractum, Shyft (and CritterCodes'
  signing key).

## Related
- `secret-rotation.md`, `safe-remote-change.md`, `agent-ssh-access.md`, `backup-restore.md`,
  `bootstrap-vps.md`; ADRs 0008 (non-custodial deploy acct), 0009 (scoped automation), 0011 (SSH-CA),
  0012 (tailnet admin + CF Access).

---
_Last validated: not yet drilled — created 2026-07-15. Validate by having a **second custodian**
perform the Verification section unaided. Owner: platform custodians._
