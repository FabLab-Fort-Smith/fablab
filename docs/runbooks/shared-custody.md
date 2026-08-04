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
   must never block recovery. **The two copies must be INDEPENDENT** — different people, different
   media, not two devices of one person or the same cloud sync (else it's a quorum illusion). For
   the **crown jewels** (backup age identity, restic password, break-glass), prefer an **M-of-N
   split** (e.g. 2-of-3 Shamir) so no one custodian acts alone yet any 2 can recover; with 5
   custodians, hold **DR material with ≥3** so two simultaneous departures don't lose recovery.
2. **Per-person identities, never shared logins** — *with one exception.* Each custodian has their
   own SSH key, Coolify login+MFA, GitHub identity, and vault account — individually grantable,
   auditable, and **revocable** (offboarding removes one person without rotating everything).
   **Exception:** where a provider has no per-person RBAC (e.g. the RackNerd client area, the domain
   registrar, possibly Tailscale/the vault), use a **shared login stored in the vault** (≥2-custody),
   with the **TOTP seed shared** and MFA-recovery handled — documented, not a silent violation.
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
| **Coolify** (admin + API token) | admin login+MFA; `COOLIFY_TOKEN` in `.env` **and in the vault** (item `Coolify API token — fablab-prod`, rotated 2026-08-03 — `coolify-token-rotation.md`) | b007ab1e admin | Each custodian a Coolify team member (own login+MFA); ≥2 can retrieve the token from the vault |
| **MongoDB** (root + app pw) | `MONGO_ROOT/APP_PASSWORD` in `.env`; on box at `/opt/fablab/mongodb/mongo.env` (root) | b007ab1e / root | In vault; ≥2 can retrieve |
| **Backups / DR** (age key, restic pw) | age **private** key offline; `RESTIC_PASSWORD` in `.env` | whoever holds the age key | **≥2 custodians** hold age key + restic pw, or in vault — else only one person can restore |
| **App secrets — STAGING** (Square/S3/SMTP/GenAI/AUTH/JWT/ENCRYPTION) | `.env` | b007ab1e | Vault |
| **App secrets — PRODUCTION** | `.env.production` **and in the vault** as `PROD_*` fields (item `The-Lab PRODUCTION app secrets (Coolify)`, added 2026-08-03) | b007ab1e | ≥2 custodians can retrieve. **`PROD_ENCRYPTION_KEY` is irreplaceable** — it decrypts member emails; losing it is unrecoverable data loss, regenerating it is too |
| **GitHub org / repo** | org membership | org members | Ensure all custodians are org members with least-priv roles |
| **Commit signing** | SSH signing keys registered on GitHub | only `0xb007ab1e` | Register each custodian's signing key (CI verifies signatures) |
| **Tailscale** (`TAILSCALE_AUTHKEY`) | `.env`; tailnet ACLs | b007ab1e | Each custodian on the tailnet; authkey in vault |
| **Domain registrar + `fablabfortsmith.org` ownership** | registrar account (external) | ? | ≥2-custody registrar login+MFA+**billing**; transfer-lock ON, auto-renew ON; **registrant email must be OFF-domain** (not `@fablabfortsmith.org`) — losing the domain loses site+Access+email at once |
| **GitHub App private key + webhook secret** (deploy pipeline) | GitHub App config; webhook secret in Coolify/`.env` | b007ab1e | The `.pem` + HMAC secret ARE the push→build→deploy creds → vault; document re-mint (GitHub can regenerate the key) + pair webhook-secret rotation with Coolify |
| **Coolify `APP_KEY` + internal Postgres** | on box (Coolify install) | root | Coolify encrypts stored env/secrets with its Laravel `APP_KEY`; **without it off-box a rebuild can't decrypt anything** → back up `APP_KEY` + Coolify Postgres to vault (see `rebuild-coolify-from-code.md`) |
| **Email provider admin (PurelyMail)** | provider account (external) | ? | **Root-of-recovery** (receives password-reset + MFA-recovery mail for other services) → ≥2-custody, own MFA + recovery, off-box |
| **MFA recovery / backup codes** (every MFA'd service + the vault) | scattered / unaddressed | ? | Per-service recovery codes / TOTP seeds → ≥2-custody; **the vault's OWN recovery codes must live OUTSIDE the vault** (offline/paper) or the circular dependency returns |
| **Account owner / super-admin tier** (GitHub org, Cloudflare, Tailscale, Square, S3/object-store root, RackNerd billing) | mostly single owner | b007ab1e (likely) | For *recoverability* need **≥2 at owner/super-admin** (a member can't re-add an owner); **add the 2nd owner BEFORE removing the 1st** |
| **Traefik/ACME material** (`acme.json`, LE account key) | on box | — | Auto-recovered on converge/re-issue — no custody action (noted so a reader doesn't wonder) |
| **Alerting/notification channel** | TBD | — | If alerts hit one person's device, *detection* is single-custody → shared channel (defer to `on-call.md`) |

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
5. **Rotate what they could have read — but NOT with a blanket `--force` (two data-loss carve-outs):**
   treat shared secrets they had vault access to as exposed and rotate per `secret-rotation.md`
   (SSH-CA key, deploy/automation keys, provider tokens, Mongo passwords, RackNerd/Tailscale,
   Coolify/GitHub-App/webhook, PurelyMail). **Revoke-first on suspected compromise.** Exceptions:
   - **`ENCRYPTION_KEY` — do NOT rotate in a routine offboard.** `secret-rotation.md` §C: rotating it
     makes all data encrypted under the old key unreadable and needs an expand/contract re-encryption.
     Exclude it from `make secrets --force` (rotate only via the gated re-encryption procedure).
   - **Backup age recipient — re-key FORWARD, don't "rotate."** A new age recipient can't decrypt
     backups made to the old public key. So: generate a new recipient, encrypt *future* backups to it,
     and keep the **old age private key held by the REMAINING custodians (never the departed person)**
     so historical backups stay restorable. For restic, use `restic key add`/`key remove` (the repo
     supports multiple keys) — never a naive password regenerate that would orphan the repo. If the
     departed person actually held the age private key, this re-key is mandatory, not optional.
6. Update the roster.

## Verification
- Shared custody is real when a **second custodian** (not the primary) can, unaided: SSH to the host,
  retrieve every secret from the vault, log into Coolify + Cloudflare + RackNerd, console-break-glass
  in, and complete a **backup restore drill**. Schedule this as a periodic game-day.

## Circular dependencies (break-glass) — verify each has an out-of-band path
- **Vault lockout:** the vault's own recovery codes live **outside** the vault (offline/paper); its
  account ownership+billing is itself a ≥2-custody recovery credential.
- **Cloudflare Access lockout:** the admin UIs (Coolify) are reachable over the **tailnet**
  (`http://fablab-prod:8000`) which **bypasses** CF Access — that's the CF-Access break-glass (ADR 0012).
- **SSH/host lockout:** handled in `safe-remote-change.md` (SSH on both tailnet + public IP; RackNerd
  **console** break-glass rehearsed, `passwd -S` = `P`).
- **Domain↔email↔DNS triangle:** registrant email is OFF-domain (H1) so a domain/DNS problem can't also
  sever the recovery mailbox.
- **Coolify rebuild:** needs the `APP_KEY` off-box (else it can't decrypt its own stored secrets).

## Pending decisions (blocking P0)
- **Secret store:** choose an **off-box** shared vault — 1Password Teams / Bitwarden (cloud) /
  SOPS+age in-repo. Then wire `make secrets-pull` (render `.env` from the vault) so the vault is SoT.
- **Per-person keys:** collect SSH + signing pubkeys for Jacob, Fractum, Shyft (and CritterCodes'
  signing key).
- **Confirm account ownership:** who owns the domain registrar, Cloudflare account, RackNerd
  client-area/billing, GitHub org, Tailscale tailnet, Square, and S3 root — and get a 2nd owner on each.

## Tracked follow-ups (fold into the P0/P1 plan)
- Reconcile `backup-restore.md` (still says the age key stays with "the maintainer" (singular) and
  `RESTIC_PASSWORD` is "unrecoverable if lost") to the ≥2-custody / re-key-forward model here.
- **Current deviation (deliberate):** all 5 custodians are listed *infra* (max privilege) despite the
  least-privilege/tier principle — acceptable for a small trusted team now; revisit tiering as it grows.
- Decide ≥2 vs M-of-N split for the crown jewels (owner call).

## Related
- `secret-rotation.md`, `safe-remote-change.md`, `agent-ssh-access.md`, `backup-restore.md`,
  `bootstrap-vps.md`; ADRs 0008 (non-custodial deploy acct), 0009 (scoped automation), 0011 (SSH-CA),
  0012 (tailnet admin + CF Access).

---
_Last validated: not yet drilled — created 2026-07-15. Validate by having a **second custodian**
perform the Verification section unaided. Owner: platform custodians._
