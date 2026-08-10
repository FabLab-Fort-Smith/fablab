#!/usr/bin/env bash
# ============================================================================
# Off-box backup PULLER bootstrap — for prod-backup (fablab #90).
# EDIT the values in the "EDIT THESE" block, then copy-paste this WHOLE file
# into the web terminal on the backup box.
#
# Run this as root OR a sudo-capable user (it auto-detects; on bare root it uses no sudo). It:
#   1. Installs any missing dependencies and creates a dedicated, unprivileged
#      system user (fablab-offbox) to own and run everything at runtime.
#   2. Downloads keysetup + its sibling scripts from the public repo over HTTPS (curl only, no
#      git/gh needed), pinned to an immutable commit, into the service user's home.
#   3. Runs prod-backup-keysetup.sh AS that user, which:
#        - creates the ed25519 puller keypair in the service user's home (idempotent;
#          never overwrites) — NOT in /root,
#        - VAULTS it into Vaultwarden (verified round-trip),
#        - prints the BACKUP_PULL_PUBKEY line to add to the VPS ../.env,
#        - runs the read-only pre-flight (route/connectivity report).
# Then it prints the final steps to install a least-privileged systemd timer (User=).
#
# Least privilege: the puller needs no root — only to read its key, rsync over the
# overlay, and write its mirror/restic repo, all owned by the service user. The private
# key stays on this box (the timer needs it); the vault copy is the recovery backup. The
# key only grants read-only rsync of age-ENCRYPTED artifacts (forced rrsync -ro).
#
# The repo is PUBLIC, so the scripts are fetched over anonymous HTTPS — no token needed. Fill the
# VAULT_URL in the EDIT block and run. The only secret this touches is the vault master password,
# which bw prompts for at runtime and is never stored in this file.
# ============================================================================
set -euo pipefail
# Minimal Debian/root often omits /usr/local/{s,}bin from PATH — where bw and the puller install to.
# Put them on PATH so `command -v` finds freshly-installed tools (and hash -r after installs).
export PATH="/usr/local/sbin:/usr/local/bin:$PATH"

# ===================== EDIT THESE =====================
# Vaultwarden URL on the ZeroTier overlay, and your vault login email.
VAULT_URL='https://REPLACE_vault_zerotier_ip:8000'
VAULT_EMAIL='johnannis@fablabfortsmith.org'

# Pinned script version (immutable). Use a branch name only if you want latest.
REF='2a81d15'

# OPTIONAL: if bw is not already unlocked for the user that runs this (root, via
# sudo below), set ONE of these so keysetup can reach the vault non-interactively.
#   BW_SESSION='...'                 # from: bw unlock --raw
#   BW_PASSWORD_FILE='/root/.bwpw'   # a 0600 file holding the master password
BW_SESSION=''
BW_PASSWORD_FILE=''
# ======================================================

OWNER=FabLab-Fort-Smith
REPO=fablab
FILES=(_lib.sh secrets-push.sh prod-backup-preflight.sh prod-backup-pull.sh prod-backup-keysetup.sh)

# Least-privileged runtime: a dedicated system user owns the key, the scripts, the mirror and the
# restic repo. Nothing in steady state runs as root (the systemd unit uses User= — printed at the
# end). Run THIS script as root OR a sudo-capable user — it auto-detects which and drops to the
# service user with runuser/sudo. Privileged steps are only: dep install, user creation, and the
# final /usr/local/sbin install.
SVC_USER='fablab-offbox'
SVC_HOME='/var/lib/fablab-offbox'          # also the mirror/restic parent (pull.sh defaults live here)
SVC_SCRIPTS="$SVC_HOME/scripts"
PULL_KEY="$SVC_HOME/.ssh/backup_pull"      # key lives in the service user's home, NOT /root

# --- guard: refuse to run with the placeholder still in place ----------------
case "$VAULT_URL" in *REPLACE*) echo "ERROR: edit VAULT_URL first" >&2; exit 1 ;; esac

# --- privilege model: bare root (no sudo) OR a sudo-capable user -------------
# $SUDO is the prefix for privileged commands: empty when already root, "sudo" otherwise. This box
# may be plain root with sudo not even installed, so never assume sudo exists.
if [ "$(id -u)" -eq 0 ]; then
  SUDO=()
elif command -v sudo >/dev/null 2>&1; then
  SUDO=(sudo)
else
  echo "ERROR: not root and 'sudo' is not installed — run this as root, or install sudo." >&2
  exit 1
fi

# run_as_svc CMD... — run CMD as the unprivileged service user, without needing sudo when root.
run_as_svc() {
  if command -v runuser >/dev/null 2>&1; then
    "${SUDO[@]}" runuser -u "$SVC_USER" -- "$@"
  elif command -v setpriv >/dev/null 2>&1; then
    "${SUDO[@]}" setpriv --reuid "$SVC_USER" --regid "$SVC_USER" --init-groups "$@"
  elif [ "${#SUDO[@]}" -gt 0 ]; then
    "${SUDO[@]}" -H -u "$SVC_USER" "$@"
  else
    echo "ERROR: need runuser or setpriv to drop to $SVC_USER as root." >&2; exit 1
  fi
}

# Copy-paste prefixes for the printed NEXT STEPS, matching the same model.
if [ "${#SUDO[@]}" -gt 0 ]; then ELEV='sudo '; else ELEV=''; fi
if command -v runuser >/dev/null 2>&1; then AS_SVC="${ELEV}runuser -u $SVC_USER -- "
else AS_SVC="sudo -H -u $SVC_USER "; fi

# --- prerequisites: install any that are missing (root or sudo) --------------
# Distro-agnostic: detects the package manager and installs the missing tools. bw (Bitwarden CLI)
# is not a distro package, so it is special-cased: snap -> npm -> official standalone binary.
STD_TOOLS=(curl python3 openssl rsync restic ssh-keygen)

need_tool() { command -v "$1" >/dev/null 2>&1; }

detect_pm() {
  local m
  for m in apt-get dnf yum zypper apk pacman; do
    command -v "$m" >/dev/null 2>&1 && { printf '%s' "$m"; return 0; }
  done
  return 1
}

pkg_for() {  # map a tool name to its package under $PM (most share their name)
  case "$1:$PM" in
    ssh-keygen:apt-get)                     printf 'openssh-client'  ;;
    ssh-keygen:dnf|ssh-keygen:yum|ssh-keygen:zypper) printf 'openssh-clients' ;;
    ssh-keygen:apk)                         printf 'openssh-keygen'  ;;
    ssh-keygen:pacman)                      printf 'openssh'         ;;
    python3:pacman)                         printf 'python'         ;;
    *)                                      printf '%s' "$1"        ;;
  esac
}

pm_refresh() {
  case "$PM" in
    apt-get) "${SUDO[@]}" env DEBIAN_FRONTEND=noninteractive apt-get update -y ;;
    zypper)  "${SUDO[@]}" zypper --non-interactive refresh ;;
    apk)     "${SUDO[@]}" apk update ;;
    pacman)  "${SUDO[@]}" pacman -Sy --noconfirm ;;
    *)       : ;;   # dnf/yum refresh metadata on demand
  esac
}

pm_install() {  # pm_install pkg...
  case "$PM" in
    apt-get) "${SUDO[@]}" env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" ;;
    dnf)     "${SUDO[@]}" dnf install -y "$@" ;;
    yum)     "${SUDO[@]}" yum install -y "$@" ;;
    zypper)  "${SUDO[@]}" zypper --non-interactive install "$@" ;;
    apk)     "${SUDO[@]}" apk add "$@" ;;
    pacman)  "${SUDO[@]}" pacman -S --noconfirm "$@" ;;
  esac
}

install_bw() {
  if need_tool bw; then return 0; fi
  if command -v snap >/dev/null 2>&1; then "${SUDO[@]}" snap install bw && return 0; fi
  if command -v npm  >/dev/null 2>&1; then "${SUDO[@]}" npm install -g @bitwarden/cli && return 0; fi
  # Last resort: the official standalone binary over TLS from the vendor.
  need_tool unzip || pm_install "$(pkg_for unzip)"
  local tmp; tmp="$(mktemp -d)"
  echo "downloading Bitwarden CLI standalone binary ..."
  curl -fsSL 'https://vault.bitwarden.com/download/?app=cli&platform=linux' -o "$tmp/bw.zip"
  unzip -o "$tmp/bw.zip" -d "$tmp" >/dev/null
  "${SUDO[@]}" install -m 0755 "$tmp/bw" /usr/local/bin/bw
  rm -rf "$tmp"
}

PM="$(detect_pm || true)"
missing_pkgs=()
for t in "${STD_TOOLS[@]}"; do need_tool "$t" || missing_pkgs+=("$(pkg_for "$t")"); done

if [ "${#missing_pkgs[@]}" -gt 0 ] || ! need_tool bw; then
  if [ -z "$PM" ]; then
    echo "ERROR: no supported package manager (apt/dnf/yum/zypper/apk/pacman)." >&2
    echo "Install these manually, then re-run: ${STD_TOOLS[*]} bw" >&2
    exit 1
  fi
  echo "installing missing dependencies via $PM ..."
  pm_refresh
  if [ "${#missing_pkgs[@]}" -gt 0 ]; then pm_install "${missing_pkgs[@]}"; fi
  install_bw
fi

hash -r 2>/dev/null || true   # forget cached command lookups so just-installed tools are found
# re-verify; fail loud if anything is still missing after the install attempt
still=""
for t in "${STD_TOOLS[@]}" bw; do need_tool "$t" || still="$still $t"; done
[ -z "$still" ] || { echo "ERROR: still missing after install:$still — install manually and re-run" >&2; exit 1; }
echo "all prerequisites present"

# --- 1) create the least-privileged service user (idempotent) ---------------
if id "$SVC_USER" >/dev/null 2>&1; then
  echo "service user $SVC_USER already exists"
else
  echo "creating service user $SVC_USER (system, nologin, home $SVC_HOME) ..."
  "${SUDO[@]}" useradd --system --create-home --home-dir "$SVC_HOME" --shell /usr/sbin/nologin "$SVC_USER"
fi

# --- 2) download the scripts, then hand them to the service user -------------
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT
for f in "${FILES[@]}"; do
  echo "fetching $f ..."
  # Public repo -> anonymous raw fetch, no auth header, no token.
  curl -fsSL "https://raw.githubusercontent.com/$OWNER/$REPO/$REF/lab-stack/scripts/$f" -o "$TMPD/$f"
done

"${SUDO[@]}" install -d -o "$SVC_USER" -g "$SVC_USER" -m 0750 "$SVC_SCRIPTS"
for f in "${FILES[@]}"; do
  case "$f" in
    _lib.sh) m=0640 ;;     # sourced, not executed
    *)       m=0750 ;;     # executable scripts
  esac
  "${SUDO[@]}" install -o "$SVC_USER" -g "$SVC_USER" -m "$m" "$TMPD/$f" "$SVC_SCRIPTS/$f"
done
echo "installed ${#FILES[@]} scripts to $SVC_SCRIPTS (owned by $SVC_USER)"

# --- 3) run keysetup AS the service user (key in its home; NO root) ----------
# HOME is set explicitly so bw stores its config under the service user (runuser does not set it);
# env passes the vault config and the key path off-argv. Optional bw creds forwarded only if set.
KEYSETUP_ENV=(HOME="$SVC_HOME" VAULT_URL="$VAULT_URL" VAULT_EMAIL="$VAULT_EMAIL" PULL_KEY="$PULL_KEY")
[ -n "$BW_SESSION" ]       && KEYSETUP_ENV+=(BW_SESSION="$BW_SESSION")
[ -n "$BW_PASSWORD_FILE" ] && KEYSETUP_ENV+=(BW_PASSWORD_FILE="$BW_PASSWORD_FILE")

echo
echo ">>> running keysetup as $SVC_USER (creates + VAULTS $PULL_KEY, unlocks the vault) <<<"
run_as_svc env "${KEYSETUP_ENV[@]}" bash "$SVC_SCRIPTS/prod-backup-keysetup.sh"

# --- next steps (finish the least-privileged puller) ------------------------
cat <<EOF

============================ NEXT STEPS (still to do) ============================
Key created + vaulted; the BACKUP_PULL_PUBKEY line was printed above. To finish — all
as the unprivileged $SVC_USER, nothing as root at runtime:

1. On the VPS: put the printed BACKUP_PULL_PUBKEY line in lab-stack/../.env, then 'make converge'.

2. Re-check the route (as the service user):
     ${AS_SVC}env PULL_KEY=$PULL_KEY bash $SVC_SCRIPTS/prod-backup-preflight.sh
   It must report the key reached the VPS and was CONFINED (never a shell).

3. restic password file, owned by the service user, 0600 (value from the vault):
     ${ELEV}install -o $SVC_USER -g $SVC_USER -m600 /dev/null /etc/fablab-offbox.env
     # then add a line:  RESTIC_PASSWORD=<strong; store in Vaultwarden, >=2 custodians>

4. Install the puller + a LEAST-PRIVILEGED systemd unit (runs as $SVC_USER, not root):
     ${ELEV}install -o root -g root -m0755 $SVC_SCRIPTS/prod-backup-pull.sh /usr/local/sbin/fablab-pull-backups

     ${ELEV}tee /etc/systemd/system/fablab-pull-backups.service >/dev/null <<'UNIT'
[Unit]
Description=Pull age-encrypted backups from fablab-prod into the local restic repo
After=network-online.target zerotier-one.service

[Service]
Type=oneshot
User=$SVC_USER
Group=$SVC_USER
Environment=SSH_KEY=$PULL_KEY
EnvironmentFile=/etc/fablab-offbox.env
ExecStart=/usr/local/sbin/fablab-pull-backups
Nice=10
IOSchedulingClass=idle
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$SVC_HOME
UNIT

     ${ELEV}tee /etc/systemd/system/fablab-pull-backups.timer >/dev/null <<'UNIT'
[Unit]
Description=Nightly off-box backup pull
[Timer]
OnCalendar=*-*-* 05:00:00 UTC
RandomizedDelaySec=15m
Persistent=true
[Install]
WantedBy=timers.target
UNIT

     ${ELEV}systemctl daemon-reload
     ${ELEV}systemctl enable --now fablab-pull-backups.timer
     ${ELEV}systemctl start fablab-pull-backups.service    # first run by hand; check: journalctl -u fablab-pull-backups
================================================================================
EOF
