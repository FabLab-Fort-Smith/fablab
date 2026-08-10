#!/usr/bin/env bash
# Off-box backup puller KEY SETUP — RUN THIS ON prod-backup (fablab #90).
#
# One turnkey step to make the pull ready: create the puller's SSH keypair (if absent), VAULT it
# into Vaultwarden with read-back verification, print the public half to hand to the VPS operator,
# then run the read-only pre-flight so you see the route/connectivity report in the same pass.
#
# Run it AS the unprivileged service user that will own the key (least privilege — NOT root):
#   sudo -H -u fablab-offbox env VAULT_URL=… VAULT_EMAIL=… bash prod-backup-keysetup.sh
#   ...                                               (add --dry-run to preview, --no-preflight to skip the route check)
# The key defaults to that user's home (PULL_KEY below); override PULL_KEY to place it elsewhere.
#
# WHY VAULT THE PRIVATE KEY: it is the puller's identity into the VPS. It lives on THIS box so the
# unattended timer can use it — but if prod-backup is lost and it lived nowhere else, recovery would
# mean re-keying the VPS. Vaulting a verified copy makes recovery a download, not a re-key. The key
# is NOT a decryption secret: it only grants read-only rsync of the age-ENCRYPTED artifact directory
# (forced `rrsync -ro`) — it cannot get a shell and cannot decrypt anything (that needs the separate
# "FabLab backup age identity", which stays solely in the vault).
#
# NOT a lock-out-capable change: it touches no firewall/sshd/network on any host — it only writes a
# local keypair and a vault item. (The VPS authorises the public key later, via converge.)
set -euo pipefail
IFS=$'\n\t'
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."   # -> lab-stack/

# Config (none secret). Env-overridable to match prod-backup-preflight.sh / prod-backup-pull.sh.
PULL_KEY="${PULL_KEY:-/var/lib/fablab-offbox/.ssh/backup_pull}"   # service user's home, not /root
VPS_ZT="${VPS_ZT:-}"   # VPS overlay IP; supply via env (bootstrap / EDIT block). Only passed to preflight.
KEY_COMMENT="${KEY_COMMENT:-backup-pull@$(hostname -s 2>/dev/null || hostname)}"
VAULT_ITEM="${VAULT_ITEM:-FabLab off-box backup pull key}"
# Injectable for tests; default to the real tools / sibling scripts.
SSH_KEYGEN="${SSH_KEYGEN:-ssh-keygen}"
SECRETS_PUSH="${SECRETS_PUSH:-$HERE/secrets-push.sh}"
PREFLIGHT="${PREFLIGHT:-$HERE/prod-backup-preflight.sh}"

DRY=0; RUN_PREFLIGHT=1
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)      DRY=1; shift ;;
    --no-preflight) RUN_PREFLIGHT=0; shift ;;
    -h|--help)      sed -n '2,32p' "$0"; exit 0 ;;
    *) printf 'ERROR: unknown argument: %s (see --help)\n' "$1" >&2; exit 2 ;;
  esac
done

info() { printf '  %s\n' "$*"; }
sec()  { printf '\n== %s ==\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ -x "$SECRETS_PUSH" ] || die "secrets-push.sh not found/executable at $SECRETS_PUSH (need the repo present to vault the key)"
command -v "$SSH_KEYGEN" >/dev/null 2>&1 || die "$SSH_KEYGEN not found"

# --- 1) ensure the keypair exists (idempotent; NEVER overwrites) ---------------------------------
# Overwriting a live key would silently invalidate the VPS's authorized_keys entry, so an existing
# key is always reused, never regenerated.
sec "keypair"
KEY_DIR="$(dirname "$PULL_KEY")"
if [ -f "$PULL_KEY" ]; then
  info "private key already present: $PULL_KEY (reusing — will not overwrite)"
  # Derive the public half if it went missing, so downstream steps always have it.
  if [ ! -f "${PULL_KEY}.pub" ]; then
    if [ "$DRY" = 1 ]; then info "would regenerate missing ${PULL_KEY}.pub from the private key"
    else "$SSH_KEYGEN" -y -f "$PULL_KEY" > "${PULL_KEY}.pub" || die "could not derive ${PULL_KEY}.pub"
         info "regenerated missing public half: ${PULL_KEY}.pub"; fi
  fi
else
  [ "$DRY" = 1 ] && { info "would create an ed25519 keypair at $PULL_KEY (comment: $KEY_COMMENT)"; }
  if [ "$DRY" = 0 ]; then
    # Fail loud instead of prompting for a password if we cannot write the key dir (usually: not root).
    if [ ! -d "$KEY_DIR" ]; then mkdir -p "$KEY_DIR" 2>/dev/null || die "cannot create $KEY_DIR — run as the user that owns it (e.g. sudo -u fablab-offbox), or set PULL_KEY"; fi
    [ -w "$KEY_DIR" ] || die "cannot write $KEY_DIR — run as the user that owns it (e.g. sudo -u fablab-offbox), or set PULL_KEY"
    chmod 700 "$KEY_DIR" 2>/dev/null || true
    # -N '' : no passphrase — the puller runs unattended via a systemd timer; the key is protected by
    # file mode (below), root-only ownership, and the vaulted backup copy, not by a passphrase.
    "$SSH_KEYGEN" -t ed25519 -a 100 -N '' -f "$PULL_KEY" -C "$KEY_COMMENT" >/dev/null \
      || die "ssh-keygen failed"
    info "created ed25519 keypair: $PULL_KEY"
  fi
fi

# Perms: private 600, public 644 (public is not secret). Skipped in dry-run (nothing was created).
if [ "$DRY" = 0 ] && [ -f "$PULL_KEY" ]; then
  chmod 600 "$PULL_KEY" 2>/dev/null || true
  if [ -f "${PULL_KEY}.pub" ]; then chmod 644 "${PULL_KEY}.pub" 2>/dev/null || true; fi
  info "fingerprint: $("$SSH_KEYGEN" -lf "${PULL_KEY}.pub" 2>/dev/null || echo unknown)"
fi

# --- 2) vault the keypair (verified round-trip via secrets-push.sh) ------------------------------
sec "vault"
if [ "$DRY" = 0 ] && [ ! -f "${PULL_KEY}.pub" ]; then die "missing ${PULL_KEY}.pub — cannot vault"; fi

NOTE="$(mktemp)"; trap 'rm -f "$NOTE"' EXIT
{
  printf 'FabLab off-box backup PULLER SSH key (fablab #90).\n\n'
  printf 'Private key: %s (kept on this box — the unattended puller needs it).\n' "$PULL_KEY"
  printf 'Public key : authorised on the VPS as BACKUP_PULL_PUBKEY (forced rrsync -ro).\n'
  printf 'Fingerprint: %s\n' "$("$SSH_KEYGEN" -lf "${PULL_KEY}.pub" 2>/dev/null || echo unknown)"
  printf 'Generated  : %s on %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(hostname -f 2>/dev/null || hostname)"
  printf 'RECOVERY (prod-backup rebuilt / lost):\n'
  printf '  1. Download the attached private key to %s ; chmod 600 ; chown root:root.\n' "$PULL_KEY"
  printf '  2. The PUBLIC_KEY field already matches BACKUP_PULL_PUBKEY on the VPS — no re-key needed.\n'
  printf '  3. Reinstall the puller (scripts/prod-backup-pull.sh) + systemd timer.\n\n'
  printf 'This key grants ONLY read-only rsync of the age-ENCRYPTED artifact dir on the VPS: no\n'
  printf 'shell, no writes, and it cannot decrypt them (that needs "FabLab backup age identity").\n'
} > "$NOTE"

# Values go to the vault FROM FILES (never argv) and are read back + verified by secrets-push.sh.
if [ "$DRY" = 1 ] && [ ! -f "${PULL_KEY}.pub" ]; then
  # Nothing on disk to validate yet — secrets-push --dry-run checks the files exist, so describe
  # the intent and skip the call rather than fail on a not-yet-created key.
  info "would vault to item: $VAULT_ITEM — attachment $PULL_KEY, field PUBLIC_KEY=@${PULL_KEY}.pub"
else
  PUSH_ARGS=(--item "$VAULT_ITEM" --attach "$PULL_KEY" --field "PUBLIC_KEY=@${PULL_KEY}.pub" --note-file "$NOTE")
  [ "$DRY" = 1 ] && PUSH_ARGS+=(--dry-run)
  info "vaulting to item: $VAULT_ITEM (private key as attachment, public key as a field)"
  bash "$SECRETS_PUSH" "${PUSH_ARGS[@]}" || die "vaulting failed — the key is NOT safely stored yet"
fi
[ "$DRY" = 0 ] && info "keep $PULL_KEY on disk — do NOT shred it; the vault copy is the recovery backup, not a replacement"

# --- 3) hand-off: the public key line for the VPS ------------------------------------------------
sec "hand-off to the VPS operator"
if [ -f "${PULL_KEY}.pub" ]; then
  PUB="$(cat "${PULL_KEY}.pub")"
  info "Add this line to lab-stack/../.env on the VPS, then \`make converge\`:"
  printf "\n    BACKUP_PULL_PUBKEY='%s'\n\n" "$PUB"
  info "Until it is set + converged, the VPS creates no account and the pull cannot run."
else
  info "(dry-run: no public key on disk to print)"
fi

# --- 4) connectivity report (read-only pre-flight) -----------------------------------------------
if [ "$RUN_PREFLIGHT" = 1 ] && [ "$DRY" = 0 ]; then
  sec "connectivity report (prod-backup-preflight.sh — read-only)"
  if [ -f "$PREFLIGHT" ]; then bash "$PREFLIGHT" || true
  else info "pre-flight not found at $PREFLIGHT — run it yourself to prove the route to the VPS"; fi
else
  sec "next"
  info "run the connectivity check when ready:  sudo bash $PREFLIGHT"
fi

sec "done"
info "1) key created + vaulted (verified)  2) BACKUP_PULL_PUBKEY handed off  3) route checked"
info "Then on the VPS: set BACKUP_PULL_PUBKEY, \`make converge\`; re-run pre-flight — it must report"
info "the key reached the VPS and was CONFINED (never a shell). Then install the puller + timer."
exit 0
