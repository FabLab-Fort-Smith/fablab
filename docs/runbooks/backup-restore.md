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
- MongoDB runs as container `fablab-mongo` (image `mongo:7.0`) on the private `fablab` docker
  network — **no published host port**; all access is via a container on that network.
- Backups: `/var/backups/fablab/mongo-<UTC>.archive.gz` (gzip `mongodump --archive`), cron 03:00 UTC,
  7-day local retention. Script: `/usr/local/sbin/fablab-backup-mongo`.

## How the backup works
`/usr/local/sbin/fablab-backup-mongo` runs an ephemeral `mongo:7.0` container on the `fablab`
network, `mongodump --uri="$MONGODB_URI" --archive --gzip` (URI from `/etc/fablab/mongo.env`), to
a timestamped archive. **The app user must authenticate** for the dump to contain data — a broken
app user yields a valid-looking but empty archive (see "Known failure" below).

> **TODO (tracked):** the archive is currently **unencrypted and on-box only**. Before production,
> add age/`restic` encryption + off-box shipping (the SPOF mitigation in `lab-stack/CLAUDE.md`).

## Restore drill (do this on a schedule)
Automated + strict — fails loudly on any auth/backup/restore error, restores into a throwaway DB,
verifies counts, and drops it:

```bash
# From lab-stack/ with SSH + become configured:
ansible lab_vps -m script -a scripts/mongo-restore-drill.sh --become
# …or on the box directly:
sudo /path/to/mongo-restore-drill.sh
```
Expect `== DRILL PASSED: 'thelab' backs up and restores correctly (…) ==`. A non-zero exit or
`DRILL FAILED` means the backup does not round-trip — investigate before relying on it.

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
_Last validated: 2026-07-12 (restore drill — passed; caught + fixed a missing app user). Owner: platform._
