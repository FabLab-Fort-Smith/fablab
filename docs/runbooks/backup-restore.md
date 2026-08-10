---
title: MongoDB backup & restore
category: Data & Backup
usage: Scheduled drill / on data loss
order: 40
summary: Back up the self-hosted MongoDB and run a strict, automated restore drill into a throwaway DB — fails loudly on a broken or empty backup.
---

# Runbook: MongoDB Backup & Restore

> Backup + restore for the self-hosted MongoDB on the VPS (ADR 0010).
> Rules: `@rules/workflow-data-lifecycle.md`, `@rules/topic-reliability.md`, `@rules/topic-database.md`.

## When to use
- Data loss/corruption or recovery during an incident (`incident-response.md`).
- A **scheduled restore drill** — run regularly; an untested backup is not a backup.

## Severity / impact
- Restoring live data is SEV2+ (touches restricted personal/payment-adjacent data — master §5).
- A drill is non-impacting: it restores into a **throwaway** DB and never touches live data.

## Prerequisites & access
- SSH to the VPS as a sudo-capable user (tailnet `fablab-prod` or `107.173.52.204`); the deploy
  key. Root reads `/opt/fablab/mongodb/mongo.env` (root creds) and `/etc/fablab/mongo.env` (app URI).
- MongoDB runs as container `fablab-mongo` (image **`mongo:8.0`**) on the private `fablab` docker
  network — **no published host port**; all access is via a container on that network.
- Backups: `/var/backups/fablab/mongo-<UTC>.archive.gz.age` — **age-encrypted since 2026-08-07**;
  cron 03:00 UTC, 7-day local retention, mode 0600. Script: `/usr/local/sbin/fablab-backup-mongo`.
- **Decrypting anything requires the age identity from the vault** (below). The VPS deliberately
  cannot decrypt its own backups.

## How the backup works
`/usr/local/sbin/fablab-backup-mongo` runs an ephemeral `mongo:7.0` container on the `fablab`
network, `mongodump --uri="$MONGODB_URI" --archive --gzip` (URI from `/etc/fablab/mongo.env`), to
a timestamped archive, then: (2) **encrypts at rest with `age`** to `<archive>.age` and shreds the
plaintext; (3) **ships off-box with `restic`** (its own repo encryption + dedup + integrity +
retention); (4) prunes local copies after `backup_local_retention_days` (7). **The app user must
authenticate** for the dump to contain data — a broken app user yields a valid-looking but empty
archive (see "Known failure" below).

Encryption/off-box are **opt-in** (config from `/etc/fablab/backup.env`, rendered from `../.env`).
With nothing set, the backup still runs but is **local-only and unencrypted at rest**, and the
script + a converge task **warn loudly**. Two independent controls, by design:
- **age** — the recipient on the box is a **public** key; the private identity stays **offline**
  and is held by **≥2 independent custodians** (never only on the box — it cannot decrypt its own
  backups; a box compromise never exposes backup contents). On offboarding, re-key **forward** (a
  new recipient for future backups) rather than rotating — old archives stay readable only via the
  retained old identity. Key-to-encrypt ≠ creds-to-access (master §5, `shared-custody.md`).
- **restic** — off-box copy (survives VPS loss), repo-level encryption, and retention
  (`--keep-daily/weekly/monthly --prune`).

### Enabling encryption + off-box (one-time, deliberate)
1. **age identity (generated OFF the box — never on the VPS):**
   `age-keygen -o fablab-backup.agekey` → note the `Public key: age1…` line. Put the **public** key
   in `../.env` as `BACKUP_AGE_RECIPIENT=age1…`, then store the private key in the vault
   **automatically, with read-back verification**:
   ```bash
   cd lab-stack
   BW_PASSWORD_FILE=<0600 file> bash scripts/secrets-push.sh \
     --item "FabLab backup age identity" \
     --attach fablab-backup.agekey --field AGE_PUBLIC_RECIPIENT=@recipient.pub
   shred -u fablab-backup.agekey     # only after it reports "verified attachment"
   ```
   **Current custody:** vault item **"FabLab backup age identity"** (Infrastructure collection),
   attachment `fablab-backup.agekey`. Lose it and every backup is permanently undecryptable, so it
   must never live on `fablab-prod` or inside the repo it protects.
2. **restic off-box repo:** create a **backup-only** S3 bucket + a least-privilege key pair (NOT
   the app's S3 creds). Set in `../.env`: `RESTIC_REPOSITORY=s3:<endpoint>/<bucket>/fablab-mongo`,
   `RESTIC_PASSWORD=<strong; store in the shared vault, held by ≥2 custodians — unrecoverable if lost>`,
   `BACKUP_S3_ACCESS_KEY_ID=…`, `BACKUP_S3_SECRET_ACCESS_KEY=…`.
3. `make converge` — installs `age`+`restic`, writes `/etc/fablab/backup.env` (0600), and
   **initializes the restic repo** (idempotent). Then run `sudo /usr/local/sbin/fablab-backup-mongo`
   once and confirm `encrypted (age)` + `shipped off-box (restic)` in the output.

### Decrypt / restore from off-box (restic) — applies on **prod-backup**, once pull is live
```bash
# On the box (or anywhere restic + the repo creds + the age identity are available):
export RESTIC_REPOSITORY=… RESTIC_PASSWORD=… AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=…
restic snapshots --tag mongo                 # list off-box backups
restic restore latest --tag mongo --target /tmp/restore   # pull the .age archive
age -d -i fablab-backup.key -o mongo.archive.gz /tmp/restore/**/mongo-*.archive.gz  # decrypt (OFFLINE key)
# …then mongorestore the .archive.gz as in "Real restore" below.
```

## Restore drills — TWO of them, they prove different things

### A. Database round-trip (on the box, scripted)
```bash
# from lab-stack/ with SSH + become:
ansible lab_vps -m script -a scripts/mongo-restore-drill.sh --become
# or on the box:  sudo /path/to/mongo-restore-drill.sh
```
Takes a fresh backup, restores into throwaway `thelab_restore_drill`, compares collection/doc
counts, drops it. Expect `== DRILL PASSED … ==`; non-zero exit or `DRILL FAILED` means the backup
does not round-trip.

**What it does NOT prove:** the encrypted-artifact chain. The identity is not on the box, so with
only `.age` artifacts present the script takes a **fresh transient dump** (shredded on exit) and
says so. To exercise decryption on the box, hand it an identity explicitly:
```bash
sudo AGE_IDENTITY_FILE=/path/to/fablab-backup.agekey /path/to/mongo-restore-drill.sh
```
Only do that with a temporary copy, and shred it afterwards.

### B. VPS-loss drill (off the box) — the one that proves recoverability
Simulates *"the VPS is gone; I have the vault and one artifact."* Nothing here runs on the VPS
except reading the ciphertext, and the identity never touches it.

```bash
# 1. baseline: live counts, for comparison afterwards
ssh fablab-prod 'sudo bash -c ". /etc/fablab/mongo.env; \
  docker run --rm --network fablab mongo:8.0 mongosh \"$MONGODB_URI\" --quiet --eval \
  \"db.getCollectionNames().sort().forEach(c=>print(c+\\\" \\\"+db.getCollection(c).countDocuments()))\""'

# 2. copy the newest ENCRYPTED artifact (ciphertext — safe to move). NOTE the sudo sh -c:
#    the glob must expand AS ROOT, or it silently returns nothing.
NEWEST=$(ssh fablab-prod 'sudo sh -c "ls -t /var/backups/fablab/*.age | head -1"')
ssh fablab-prod "sudo sh -c \"cat '$NEWEST'\"" > artifact.age

# 3. fetch the identity from the vault (one unlock), 0600
bw get attachment fablab-backup.agekey \
   --itemid "$(bw list items --search 'FabLab backup age identity' | jq -r '.[0].id')" \
   --output identity.agekey && chmod 600 identity.agekey

# 4. decrypt + restore into a THROWAWAY instance, never a live namespace
age -d -i identity.agekey -o restored.archive.gz artifact.age
docker run -d --name drill-mongo -e MONGO_INITDB_ROOT_USERNAME=drill \
  -e MONGO_INITDB_ROOT_PASSWORD=<temp> mongo:7.0      # see the kernel note below
docker cp restored.archive.gz drill-mongo:/tmp/r.gz
docker exec drill-mongo mongorestore -u drill -p <temp> --authenticationDatabase admin \
  --archive=/tmp/r.gz --gzip --nsFrom 'thelab.*' --nsTo 'drill.*'

# 5. verify COUNTS and CONTENT (counts alone can hide corruption)
#    digest both sides over users(_id, email) and compare — no PII is printed:
#    rows = db.users.find({},{_id:1,email:1}).sort({_id:1}) -> "id|email" lines | sha256sum

# 6. teardown: drop the db, remove the container, shred identity + decrypted dump
```

> **⚠ Kernel gotcha:** `mongo:8.0` **refuses to start on Linux kernel ≥ 6.19**
> (upstream guard, SERVER-121912) — which includes current Parrot/Debian workstations. Use
> **`mongo:7.0`** for the restore container; it reads an 8.0-produced archive fine (verified).
> The VPS itself is on 6.8, so `mongo:8.0` is correct *there*.

## What is backed up (three jobs, staggered)

| Job | Cron (UTC) | Covers | Artifact |
|---|---|---|---|
| `fablab-backup-mongo` | 03:00 | **every** application database, one artifact each | `mongo-<db>-<UTC>.archive.gz.age` |
| `fablab-backup-objstore` | 03:20 | SeaweedFS bucket objects, via the **S3 API** | `objstore-<bucket>-<UTC>.tar.gz.age` |
| `fablab-backup-coolify` | 03:40 | Coolify's Postgres DB + `/data/coolify` (config, `.env`, keys) | `coolify-<UTC>.tar.gz.age` |

Staggered 20 minutes apart: three dumps at once contend for CPU/disk on one small VPS. Each is a
separate cron entry, so one failing target cannot stop the others
(`backups_objstore_enabled` / `backups_coolify_enabled` toggle them).

**Which databases:** the list comes from `MONGO_BACKUP_DATABASES` in `/etc/fablab/mongo.env`,
derived from the `mongodb` role's `mongodb_databases` — so adding an environment automatically
extends both the backup and the drill. System databases (`admin`/`config`/`local`) are excluded
deliberately: restoring them is hazardous and they hold no application data. The dump uses the ROOT
credential (root-only file, root's cron) because the per-database app users deliberately cannot read
instance-wide.

**Per-database artifacts, not one blob:** a single database can be restored without touching the
others, and each `--db` dump is fenced so it can never contain another database (#109).

**The drill covers EVERY database** (`mongo-restore-drill.sh`), not just staging — it fails if any one
of them does not round-trip. Before this, a drill could report PASSED while production was never
verified, which was the exact state the day production moved onto this instance.

Shared plumbing (encrypt → off-box → prune) lives in **`/usr/local/lib/fablab-backup-lib.sh`**
(`finalize_artifact`), sourced by all three — one implementation to audit, and no chance of the
targets drifting apart on encryption or retention.

**Object storage uses a READ-ONLY S3 identity** (`fablab-backup`, `Read`+`List` on one bucket,
credentials in `/etc/fablab/objstore-backup.env`, 0600). Verified: it can list, and **PUT/DELETE are
denied** — a compromised backup cron cannot destroy the data it protects. Backing up over the S3 API
(rather than tarring the docker volume) means the artifact restores into **any** S3-compatible
target; the trade-off is that it captures **current object versions only**, not version history.

> `objstore` reporting **`synced 0 object(s)`** is ambiguous by nature — an empty bucket looks
> exactly like a broken credential or wrong endpoint, so the job warns. To tell them apart, put one
> object with the app key and re-run: it should report `synced 1 object(s)`.

**⚠ The Coolify artifact is the most sensitive one on the box:** `/data/coolify/source/.env` holds
its DB password and app key, and the tree can hold deploy keys. It is only safe because age
encryption is on — never disable `BACKUP_AGE_RECIPIENT` while this job is enabled.

**Not yet drilled:** the objstore and coolify artifacts have been *produced and verified encrypted*,
but a full restore drill for them (restore objects into a scratch bucket; restore the Coolify DB into
a throwaway Postgres) has NOT been run. Mongo is the only target with a proven restore path.

## Off-box copies: PULL, not push (decided 2026-08-07)

`RESTIC_REPOSITORY` on the VPS is intentionally **unset**, so the backup script's
`WARNING: RESTIC_REPOSITORY unset — backup is LOCAL-ONLY` is **expected** until the puller exists.

Off-box is done by **`prod-backup` (10.121.16.1) pulling** age-encrypted artifacts from the VPS into
its own restic repo, rather than the VPS pushing. Why: a push-based repo is deletable by the machine
it protects — ransomware on the VPS holds the restic password and can `restic forget --prune` the
only offsite copy. With pull, the VPS holds **no credential into the lab**, no route to the lab LAN
is needed, and the puller only ever sees ciphertext.

> The puller was retargeted from **meerkat** to **prod-backup** (a dedicated Debian 13 box already on
> the `10.121.16.0/24` overlay), which removes the original blocker — meerkat's LAN was never routed.

**VPS side (in code, inert until keyed).** The `backups` role creates a locked `backup-pull` system
account whose authorized_keys entry is
`restrict,from="10.121.16.0/24",command="/usr/bin/rrsync -ro /var/backups/fablab"` — that key can
only read-only-rsync one directory: no shell, no writes, no forwarding, and only from the overlay.
Artifacts become `640 root:fablab-backup-read`, which is safe because they are **ciphertext**; the
age identity stays solely in Vaultwarden. Everything stays inert until `BACKUP_PULL_PUBKEY` is set
in `../.env`, then `make converge`.

**Getting the scripts onto prod-backup (curl only — no git/gh on that box).** Easiest: copy the
template `lab-stack/scripts/prod-backup-bootstrap.sh` to the box, fill its EDIT block (PAT +
`VAULT_URL`), and run it — it installs deps, creates the `fablab-offbox` user, downloads the pinned
scripts, and runs keysetup as that user (works on bare root without `sudo`). `shred -u` the filled
copy afterwards. The manual curl-only equivalent (what the bootstrap automates): the repo is
private, so a plain `raw.githubusercontent.com` fetch 404s; use the Contents API with a
fine-grained PAT (**Contents: Read-only**, repo `fablab`, short expiry). Pinned to an immutable
commit so the download can't drift:

```bash
export GH_TOKEN='github_pat_...'                 # fine-grained, Contents:read, repo fablab
REF='2a81d15'                                    # pinned: least-privileged keysetup + siblings (branch feat/offbox-backup-pull)
OWNER=FabLab-Fort-Smith; REPO=fablab
mkdir -p ~/fablab-backup/scripts && cd ~/fablab-backup/scripts
for f in _lib.sh secrets-push.sh prod-backup-preflight.sh prod-backup-pull.sh prod-backup-keysetup.sh; do
  curl -fsSL -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.raw" \
    "https://api.github.com/repos/$OWNER/$REPO/contents/lab-stack/scripts/$f?ref=$REF" -o "$f"
done
chmod +x prod-backup-*.sh secrets-push.sh
unset GH_TOKEN                                    # do not leave the token in the environment
```

Then set the vault config via env (secrets-push reads env before `../.env`) and run keysetup:

```bash
export VAULT_URL='https://<vault-zt-ip>:8000' VAULT_EMAIL='john.annis@fablabfortsmith.org'
sudo -E bash prod-backup-keysetup.sh
```

Box prereqs: `bw` (Bitwarden CLI, authenticated), `python3`, `openssl`, `curl`, `rsync`, `restic`;
the vault reachable over ZeroTier.

**prod-backup side.** Two scripts in `lab-stack/scripts/`, both run **on prod-backup**, not the VPS:

- [ ] `prod-backup-keysetup.sh` — the turnkey first step. Creates the puller keypair (if absent),
      **vaults it** (private key + public key) into Vaultwarden with read-back verification, prints
      the `BACKUP_PULL_PUBKEY` line to hand off, then runs the read-only pre-flight. Idempotent;
      never overwrites an existing key. The private key stays on the box (the timer needs it) — the
      vault copy is the recovery backup, so a rebuilt prod-backup is a download, not a VPS re-key.
- [ ] `prod-backup-preflight.sh` — read-only. Identifies the host and proves the route (ZT address,
      path to the VPS on 22, path MTU, prerequisites, and whether the key is authorised **and
      correctly confined**). Output is safe to paste. (keysetup runs it for you; also runnable alone.)
- [ ] `prod-backup-pull.sh` — rsync → restic snapshot → `forget --prune` → `check --read-data-subset`.
      Install per the header comment; systemd service + timer are at the bottom of the file.

**Least privilege:** everything at runtime runs as a dedicated, unprivileged system user
(`fablab-offbox`, home `/var/lib/fablab-offbox`, `nologin`) — **never root**. It owns the key, the
mirror and the restic repo; the systemd unit sets `User=fablab-offbox`. `sudo` is used only to
install deps, create the user, and drop the puller into `/usr/local/sbin`. The
`prod-backup-bootstrap.sh` one-shot does the whole flow below for you.

**Order of operations:**
- [ ] Create the service user: `sudo useradd --system --create-home --home-dir /var/lib/fablab-offbox --shell /usr/sbin/nologin fablab-offbox`.
- [ ] As that user, create + **vault** the keypair (key lands in its home, not `/root`):
      `sudo -H -u fablab-offbox env VAULT_URL=… VAULT_EMAIL=… bash prod-backup-keysetup.sh` — also
      prints the pre-flight report (expect the key not-yet-authorised until the next step).
- [ ] Put the printed `BACKUP_PULL_PUBKEY='ssh-ed25519 …'` line in `../.env`; `make converge` on the VPS.
- [ ] Re-run `sudo -H -u fablab-offbox env PULL_KEY=/var/lib/fablab-offbox/.ssh/backup_pull bash prod-backup-preflight.sh`.
      It must report the key **reached the VPS and was confined** — if it ever reports
      `the key got a SHELL on the VPS`, stop: the forced command is not in place.
- [ ] Create the restic password file owned by the user:
      `sudo install -o fablab-offbox -g fablab-offbox -m600 /dev/null /etc/fablab-offbox.env`, then add
      `RESTIC_PASSWORD=…` (strong; store in Vaultwarden, ≥2 custodians).
- [ ] Install the puller + the `User=fablab-offbox` timer (unit at the bottom of `prod-backup-pull.sh`);
      run once by hand (`sudo systemctl start fablab-pull-backups.service`); confirm a restic snapshot exists.
- [ ] Drill it: restore an artifact **from the restic repo** and decrypt with the vaulted identity.

**Status: not live.** Until the pull runs, **every copy lives on one VPS** — and that VPS now also
holds production. A VPS loss loses all backup history. Tracked: #90.

## Real restore (recovery)
1. Pick the archive: `ls -t /var/backups/fablab/mongo-*.archive.gz` → choose the point-in-time.
2. Verify it is non-empty: `stat -c %s <archive>` (0 bytes ⇒ a failed dump — do not proceed).
3. **Restore into an isolated DB first** and verify, exactly as the drill does, before overwriting
   live data. Snapshot the current (damaged) state first if forensics may be needed.
4. Cut over only once verified. Restoring over live `thelab` uses `--drop`; confirm the app is
   drained/stopped in Coolify first to avoid partial-write races.

## Verification
- Drill prints matching source-vs-restored collection/doc counts and exits 0.
- After a real restore: app connects (`mongosh` app URI ping `ok=1`), spot-check critical records,
  app smoke test green.

## Rollback / abort
- The drill is side-effect-free (throwaway dropped). For a real restore, keep the pre-restore
  snapshot until the new state is confirmed healthy.

## Known failure — app user missing / auth fails
Symptom: the dump logs `AuthenticationFailed` for `thelab_app`; the archive is tiny/empty; the app
can't reach Mongo. Cause: the app user wasn't created (the container init script only runs on a
first, empty-volume boot). Fix: **re-converge** — the `mongodb` role now reconciles the app user
(create-or-update) on every run (`make converge`). This also propagates an app-password rotation.

## Escalation
- Page the operator; for data-loss incidents follow `incident-response.md`.

## Related
- `rebuild-coolify-from-code.md`, `redeploy-rollback.md`, `incident-response.md`;
  `lab-stack/ansible/roles/backups/`, `lab-stack/ansible/roles/mongodb/`.

---
_Last validated: **2026-08-07** — both drills passed; per-database drill covers thelab, thelab_production and thelab_staging. Owner: platform._

## Drill record

| Date | Drill | Result |
|---|---|---|
| 2026-08-07 | **B — VPS-loss (off-box)** | **PASSED.** Restored off the VPS using only the vaulted identity + one artifact: 1965 docs, 0 failures; **18/18 collections matched** live counts; `users` content digest **identical** (`44befb0d…`) — faithful, not just count-equal; emails still encrypted at rest. **Achieved RTO 4 min 01 s** (vault unlock → verified restore). |
| 2026-08-07 | **A — on-box round-trip** | **PASSED** (18 collections, 1965 docs). Enabling age encryption had **broken** this script — it looked for plaintext `mongo-*.archive.gz`, which no longer exists, and failed with `no backup archive`. Fixed to handle `.age` artifacts, plus its image bumped `mongo:7.0`→`mongo:8.0` to match the server. |
| 2026-07-12 | on-box round-trip | passed; caught + fixed a missing app user |

**One-time remediation, 2026-08-07:** 8 nightly dumps dating back to 2026-07-31 were sitting
**plaintext** on the VPS (staging's DB is seeded from a prod copy, so that was real member data at
rest unencrypted). All were encrypted in place, the plaintext shredded, and modes normalised to
0600. Verified afterwards: 0 plaintext dumps remain, 9 encrypted artifacts, and the newest cannot
be decrypted without the vaulted identity.

**Still not covered by any backup:** production MongoDB (external host — the real member data), the
SeaweedFS object bucket, and Coolify's own configuration. Tracked: #90.
