#!/usr/bin/env bash
# Pre-flight for the off-box backup puller — RUN THIS ON prod-backup (fablab #90).
#
# Read-only: it changes nothing, installs nothing, and starts nothing. It answers one question —
# "can this machine identify itself and reach the VPS well enough to pull backups?" — and prints a
# report you can paste back verbatim.
#
#   sudo bash prod-backup-preflight.sh              # sudo gives fuller output (zerotier-cli, routes)
#   sudo bash prod-backup-preflight.sh --json       # machine-readable summary as well
#
# SAFE TO PASTE: it prints public keys, IPs and versions only. Private keys are never read, the
# machine-id is hashed rather than shown, and any value that looks like a secret is redacted.
set -uo pipefail          # deliberately NOT -e: a failing probe must not abort the report
IFS=$'\n\t'

VPS_ZT="${VPS_ZT:-10.121.16.235}"          # fablab-prod on the ZeroTier overlay
VPS_PUBLIC="${VPS_PUBLIC:-107.173.52.204}" # its public address (fallback path only)
VPS_USER="${VPS_USER:-backup-pull}"
PULL_KEY="${PULL_KEY:-/var/lib/fablab-offbox/.ssh/backup_pull}"   # service user's key, not /root
WANT_SPACE_GB="${WANT_SPACE_GB:-5}"
JSON=0; [ "${1:-}" = "--json" ] && JSON=1

ok=0; warn=0; bad=0
sec()  { printf '\n== %s ==\n' "$*"; }
line() { printf '  %-26s %s\n' "$1" "$2"; }
pass() { printf '  [ OK ]   %s\n' "$*"; ok=$((ok+1)); }
note() { printf '  [warn]   %s\n' "$*"; warn=$((warn+1)); }
fail() { printf '  [FAIL]   %s\n' "$*"; bad=$((bad+1)); }
have() { command -v "$1" >/dev/null 2>&1; }

sec "identity"
line "hostname"        "$(hostname -f 2>/dev/null || hostname)"
line "os"              "$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release 2>/dev/null | tr -d '"')"
line "kernel"          "$(uname -sr)"
line "uptime"          "$(uptime -p 2>/dev/null || true)"
# systemd-detect-virt exits 1 when it finds nothing, so `|| echo` would print BOTH "none" and the
# fallback. Capture first, substitute only when genuinely empty.
virt="$(systemd-detect-virt 2>/dev/null)"
line "virtualisation"  "${virt:-unknown}"
# Hashed, not raw: machine-id is a stable unique identifier and does not belong in a pasted report.
line "machine-id"      "sha256:$(sha256sum /etc/machine-id 2>/dev/null | cut -c1-16)…"
line "time (UTC)"      "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
line "clock synced"    "$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo unknown)"

sec "network interfaces"
if have ip; then
  ip -4 -o addr show scope global 2>/dev/null | awk '{printf "  %-26s %s\n", $2, $4}'
  line "default route" "$(ip route show default 2>/dev/null | head -1)"
else
  note "iproute2 not installed — cannot enumerate interfaces"
fi
line "dns servers" "$(awk '/^nameserver/{printf "%s ", $2}' /etc/resolv.conf 2>/dev/null)"

sec "zerotier"
# The overlay address is read from the interface FIRST, because that is ground truth and works
# unprivileged; zerotier-cli needs root to read authtoken.secret and would otherwise report a
# missing-token error as "not a member" — a false alarm that sends you debugging the wrong thing.
ZT_IP="$(ip -4 -o addr show 2>/dev/null | awk '$2 ~ /^zt/ {print $4}' | cut -d/ -f1 | head -1)"
ZT_IF="$(ip -4 -o addr show 2>/dev/null | awk '$2 ~ /^zt/ {print $2}' | head -1)"
line "zt interface" "${ZT_IF:-none}"
line "this host on ZT" "${ZT_IP:-none}"
case "$ZT_IP" in
  10.121.16.*) pass "has an address on the expected 10.121.16.0/24 overlay" ;;
  "")          fail "no ZeroTier address on any interface (is this member authorised in ZT Central?)" ;;
  *)           note "ZT address $ZT_IP is outside the expected 10.121.16.0/24" ;;
esac
if have zerotier-cli; then
  zt_info="$(zerotier-cli info 2>&1)"
  case "$zt_info" in
    *ONLINE*)
      line "node" "$zt_info"
      pass "zerotier daemon reports ONLINE"
      zerotier-cli listnetworks 2>/dev/null | awk 'NR>1 {printf "  %-26s %s %s %s\n", "network", $3, $6, $NF}'
      line "peers" "$(zerotier-cli peers 2>/dev/null | grep -c LEAF) leaf peer(s)"
      ;;
    *authtoken*)
      note "zerotier-cli needs root — re-run with sudo for daemon detail (the interface check above still stands)" ;;
    *)
      fail "zerotier daemon not healthy: $zt_info" ;;
  esac
else
  note "zerotier-cli not installed (interface check above is what actually matters)"
fi

sec "route + reachability to the VPS"
for target in "$VPS_ZT:overlay" "$VPS_PUBLIC:public"; do
  ip_addr="${target%%:*}"; label="${target##*:}"
  if have ip; then line "route to $ip_addr ($label)" "$(ip route get "$ip_addr" 2>/dev/null | head -1)"; fi
  if ping -c2 -W2 "$ip_addr" >/dev/null 2>&1; then
    rtt="$(ping -c3 -W2 "$ip_addr" 2>/dev/null | awk -F'/' '/rtt|round-trip/{print $5" ms avg"}')"
    pass "$label $ip_addr reachable (${rtt:-rtt unknown})"
  elif [ "$label" = overlay ]; then
    fail "$label $ip_addr does NOT respond to ping"
  else
    note "$label $ip_addr does not respond to ping (may be filtered — not fatal)"
  fi
  if timeout 5 bash -c "exec 3<>/dev/tcp/$ip_addr/22" 2>/dev/null; then
    pass "$label $ip_addr:22 accepts TCP"
  elif [ "$label" = overlay ]; then
    fail "$label $ip_addr:22 refused/filtered — the pull cannot work"
  else
    note "$label $ip_addr:22 not reachable"
  fi
done
if have ssh-keyscan; then
  hk="$(timeout 8 ssh-keyscan -T 5 -t ed25519 "$VPS_ZT" 2>/dev/null | ssh-keygen -lf - 2>/dev/null | awk '{print $2}')"
  line "VPS ssh host key" "${hk:-unavailable}"
fi
# MTU matters on an overlay: ZeroTier defaults to 2800/1400-ish and a black-holed path shows up as
# rsync hanging on large files rather than as a failed ping.
if have ping; then
  # -M 'do' = set DF, do not fragment. Quoted because an unquoted `do` reads as the shell keyword.
  if ping -c1 -W2 -M 'do' -s 1372 "$VPS_ZT" >/dev/null 2>&1; then
    pass "1400-byte path MTU to the VPS is clean"
  else
    note "1400-byte packets do not pass — possible MTU/fragmentation issue (large transfers may stall)"
  fi
fi

sec "puller prerequisites"
for t in rsync restic ssh; do
  if have "$t"; then
    # ssh has no --version; it prints its banner to stderr under -V.
    case "$t" in ssh) v="$(ssh -V 2>&1 | head -1)" ;; *) v="$("$t" --version 2>&1 | head -1)" ;; esac
    line "$t" "$(printf '%s' "$v" | cut -c1-58)"
  elif [ "$t" = restic ]; then
    fail "$t is NOT installed (apt-get install -y restic)"
  else
    fail "$t is NOT installed"
  fi
done
line "systemd" "$(have systemctl && systemctl --version 2>/dev/null | head -1 || echo absent)"
avail_gb="$(df -BG --output=avail /var 2>/dev/null | tail -1 | tr -dc '0-9')"
line "/var free space" "${avail_gb:-?} GB"
if [ -n "${avail_gb:-}" ] && [ "$avail_gb" -ge "$WANT_SPACE_GB" ] 2>/dev/null; then
  pass "enough space for the restic repository (>= ${WANT_SPACE_GB} GB)"
else
  note "less than ${WANT_SPACE_GB} GB free on /var — the repo grows with every snapshot"
fi

sec "pull key + access test"
if [ -f "${PULL_KEY}.pub" ]; then
  line "public key" "$(cat "${PULL_KEY}.pub")"
  pass "pull keypair exists (give the PUBLIC key above to the VPS operator)"
elif [ -f "$PULL_KEY" ]; then
  note "private key exists but ${PULL_KEY}.pub is missing — regenerate the public half with: ssh-keygen -y -f $PULL_KEY"
else
  note "no pull keypair yet. Create AND vault one in a single step with:
             sudo bash prod-backup-keysetup.sh
         (that generates the key, stores a verified copy in Vaultwarden, and re-runs this check)."
fi
if [ -r "$PULL_KEY" ]; then
  out="$(timeout 15 ssh -i "$PULL_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
        -o ConnectTimeout=10 "${VPS_USER}@${VPS_ZT}" 'echo SHELL_GRANTED' 2>&1)"
  case "$out" in
    *SHELL_GRANTED*) fail "the key got a SHELL on the VPS — the forced command is NOT in place" ;;
    *"Permission denied"*) note "VPS rejected the key (expected until the operator authorises it)" ;;
    *) pass "key reached the VPS and was confined (no shell): $(printf '%s' "$out" | head -1 | cut -c1-60)" ;;
  esac
  if timeout 20 rsync -n -e "ssh -i $PULL_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new" \
        "${VPS_USER}@${VPS_ZT}:./" /tmp >/dev/null 2>&1; then
    pass "read-only rsync from the VPS works — the pull path is ready"
  else
    note "rsync pull not working yet (expected until the key is authorised)"
  fi
fi

sec "summary"
printf '  %d passed, %d warning(s), %d failure(s)\n' "$ok" "$warn" "$bad"
[ "$bad" -eq 0 ] && printf '  No blocking problems.\n' || printf '  Blocking problems above must be fixed before the puller will work.\n'
if [ "$JSON" = 1 ]; then
  printf '\n{"hostname":"%s","zt_ip":"%s","os":"%s","pass":%d,"warn":%d,"fail":%d}\n' \
    "$(hostname -f 2>/dev/null || hostname)" "${ZT_IP:-}" \
    "$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release 2>/dev/null | tr -d '"')" "$ok" "$warn" "$bad"
fi
exit 0
