#!/usr/bin/env bash
# Off-box backup PULLER — runs on the off-box puller host, NOT on the VPS (fablab #90).
#
#   fablab-prod:/var/backups/fablab/*.age  --rsync over ZeroTier-->  local mirror  --> restic repo
#
# WHY PULL: a push-based repo is deletable by the machine it protects. If fablab-prod were
# ransomwared, an attacker holding its restic password could `restic forget --prune` the only
# off-site copy. With pull, the VPS holds NO credential into the lab, needs no route to the lab LAN,
# and this box only ever receives age-ENCRYPTED artifacts — the decryption identity lives solely in
# Vaultwarden ("FabLab backup age identity"), never here and never on the VPS.
#
# LEAST PRIVILEGE: this runs as a dedicated unprivileged system user (fablab-offbox), NOT root.
# It owns the key, the mirror and the restic repo (all under /var/lib/fablab-offbox); nothing here
# needs root. Install (prod-backup-bootstrap.sh does all of this for you):
#   sudo apt-get install -y rsync restic
#   sudo useradd --system --create-home --home-dir /var/lib/fablab-offbox --shell /usr/sbin/nologin fablab-offbox
#   sudo -H -u fablab-offbox env PULL_KEY=/var/lib/fablab-offbox/.ssh/backup_pull \
#        bash prod-backup-keysetup.sh    # creates + VAULTS the keypair, prints BACKUP_PULL_PUBKEY, checks route
#   # put the printed BACKUP_PULL_PUBKEY line in lab-stack/../.env on the VPS -> make converge
#   sudo install -o root -g root -m0755 prod-backup-pull.sh /usr/local/sbin/fablab-pull-backups
#   install -o fablab-offbox -g fablab-offbox -m600 /dev/null /etc/fablab-offbox.env
#   # then add:  RESTIC_PASSWORD=<strong, stored in Vaultwarden, >=2 custodians>
#   #      and:  VPS_HOST=<vps-overlay-ip>    (the address to pull from)
#   sudo systemctl enable --now fablab-pull-backups.timer     # see the unit at the end of this file
#
# The VPS key is restricted to `rrsync -ro`, so this script can ONLY read that one directory: it
# cannot get a shell, write to the VPS, or reach anything else there. Verify that yourself with:
#   sudo -u fablab-offbox ssh -i /var/lib/fablab-offbox/.ssh/backup_pull "$VPS_USER@$VPS_HOST" 'echo hi'  # must FAIL
set -euo pipefail
IFS=$'\n\t'

VPS_HOST="${VPS_HOST:-}"                      # VPS overlay IP — set in /etc/fablab-offbox.env (no default)
VPS_USER="${VPS_USER:-backup-pull}"          # forced-command account on the VPS
SSH_KEY="${SSH_KEY:-/var/lib/fablab-offbox/.ssh/backup_pull}"   # service user's key, not /root
MIRROR="${MIRROR:-/var/lib/fablab-offbox/mirror}"
RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-/var/lib/fablab-offbox/restic}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_WEEKLY="${KEEP_WEEKLY:-8}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"

# shellcheck source=/dev/null
[ -f /etc/fablab-offbox.env ] && . /etc/fablab-offbox.env
: "${RESTIC_PASSWORD:?RESTIC_PASSWORD must be set in /etc/fablab-offbox.env (0600)}"
: "${VPS_HOST:?VPS_HOST must be set (the VPS overlay IP) in /etc/fablab-offbox.env or the unit}"
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
# Runs unprivileged as the dedicated service user — never root (least privilege).
User=fablab-offbox
Group=fablab-offbox
Environment=SSH_KEY=/var/lib/fablab-offbox/.ssh/backup_pull
EnvironmentFile=/etc/fablab-offbox.env
ExecStart=/usr/local/sbin/fablab-pull-backups
# The VPS backup cron runs 03:00-03:40 UTC; pull afterwards.
Nice=10
IOSchedulingClass=idle
# Sandboxing: the puller only needs its own state dir writable.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/fablab-offbox

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
