#!/usr/bin/env bash
# Off-box backup PULLER — runs on prod-backup (10.121.16.1), NOT on the VPS (fablab #90).
#
#   fablab-prod:/var/backups/fablab/*.age  --rsync over ZeroTier-->  local mirror  --> restic repo
#
# WHY PULL: a push-based repo is deletable by the machine it protects. If fablab-prod were
# ransomwared, an attacker holding its restic password could `restic forget --prune` the only
# off-site copy. With pull, the VPS holds NO credential into the lab, needs no route to the lab LAN,
# and this box only ever receives age-ENCRYPTED artifacts — the decryption identity lives solely in
# Vaultwarden ("FabLab backup age identity"), never here and never on the VPS.
#
# Install (as root on prod-backup):
#   apt-get install -y rsync restic
#   ssh-keygen -t ed25519 -N '' -f /root/.ssh/backup_pull -C 'backup-pull@prod-backup'
#   # give the .pub to the VPS operator -> BACKUP_PULL_PUBKEY in lab-stack/../.env -> make converge
#   install -m700 prod-backup-pull.sh /usr/local/sbin/fablab-pull-backups
#   printf 'RESTIC_PASSWORD=<strong, stored in Vaultwarden>\n' > /etc/fablab-offbox.env && chmod 600 /etc/fablab-offbox.env
#   systemctl enable --now fablab-pull-backups.timer     # see the unit at the end of this file
#
# The VPS key is restricted to `rrsync -ro`, so this script can ONLY read that one directory: it
# cannot get a shell, write to the VPS, or reach anything else there. Verify that yourself with:
#   ssh -i /root/.ssh/backup_pull backup-pull@10.121.16.235 'echo hi'   # must FAIL
set -euo pipefail
IFS=$'\n\t'

VPS_HOST="${VPS_HOST:-10.121.16.235}"        # fablab-prod on the ZeroTier overlay
VPS_USER="${VPS_USER:-backup-pull}"
SSH_KEY="${SSH_KEY:-/root/.ssh/backup_pull}"
MIRROR="${MIRROR:-/var/lib/fablab-offbox/mirror}"
RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-/var/lib/fablab-offbox/restic}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"

# shellcheck source=/dev/null
[ -f /etc/fablab-offbox.env ] && . /etc/fablab-offbox.env
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD must be set in /etc/fablab-offbox.env (0600)}"
export RESTIC_REPOSITORY RESTIC_PASSWORD

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

command -v rsync  >/dev/null || die "rsync is not installed"
command -v restic >/dev/null || die "restic is not installed"
[ -r "$SSH_KEY" ] || die "cannot read $SSH_KEY"

umask 077
mkdir -p "$MIRROR"

# 1) Mirror the artifacts. The remote side is a forced `rrsync -ro`, so the path is relative to the
#    restricted root and only reads are possible. --delete keeps the mirror honest about the VPS's
#    retention; restic below is what preserves history, so deletions here lose nothing.
log "pulling artifacts from ${VPS_USER}@${VPS_HOST}"
rsync -az --delete --timeout=300 \
  -e "ssh -i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15" \
  "${VPS_USER}@${VPS_HOST}:./" "$MIRROR/" \
  || die "rsync failed — check the key, the ZeroTier link, and the VPS forced command"

COUNT="$(find "$MIRROR" -name '*.age' -type f | wc -l)"
[ "$COUNT" -gt 0 ] || die "mirror contains no .age artifacts — refusing to snapshot an empty pull"
log "mirrored ${COUNT} encrypted artifact(s), $(du -sh "$MIRROR" | cut -f1)"

# A pull that silently returns nothing but stale files is the failure mode that matters, so require
# at least one artifact newer than 48h. Backups run nightly; two days of silence is a real problem.
if [ -z "$(find "$MIRROR" -name '*.age' -type f -mtime -2 -print -quit)" ]; then
  die "no artifact newer than 48h — the VPS may have stopped backing up (investigate before trusting this repo)"
fi

# 2) Snapshot into restic (its own encryption + dedup + integrity), then apply retention.
[ -d "$RESTIC_REPOSITORY" ] || { log "initialising restic repo"; restic init >/dev/null; }
restic backup --tag fablab --host prod-backup "$MIRROR" >/dev/null || die "restic backup failed"
restic forget --tag fablab --host prod-backup --prune \
  --keep-daily "$KEEP_DAILY" --keep-weekly "$KEEP_WEEKLY" --keep-monthly "$KEEP_MONTHLY" >/dev/null \
  || die "restic forget/prune failed"

# 3) Integrity check. A repo nobody verifies is a hope, not a backup; --read-data-subset keeps the
#    cost bounded while still actually reading bytes back.
restic check --read-data-subset=5% >/dev/null || die "restic check FAILED — the repository is damaged"

log "OK: $(restic snapshots --tag fablab --json | grep -o '"short_id"' | wc -l) snapshot(s) in $RESTIC_REPOSITORY"

: <<'SYSTEMD_UNITS'
# /etc/systemd/system/fablab-pull-backups.service
[Unit]
Description=Pull age-encrypted backups from fablab-prod into the local restic repo
After=network-online.target zerotier-one.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/fablab-pull-backups
# The VPS backup cron runs 03:00-03:40 UTC; pull afterwards.
Nice=10
IOSchedulingClass=idle

# /etc/systemd/system/fablab-pull-backups.timer
[Unit]
Description=Nightly off-box backup pull

[Timer]
OnCalendar=*-*-* 05:00:00 UTC
RandomizedDelaySec=15m
Persistent=true          # catch up if this box was off when the timer was due

[Install]
WantedBy=timers.target
SYSTEMD_UNITS
