#!/usr/bin/env bash
# Collect SSH PUBLIC keys into a ready-to-paste YAML block for group_vars/all.yml
# (deploy_authorized_keys / automation_authorized_keys). PUBLIC keys only — never private.
# Validates each key, dedups by key material, labels by source.
#
# Usage:
#   scripts/collect-keys.sh [-v VARNAME] gh   USER [USER...]   # fetch from github.com/<user>.keys
#   scripts/collect-keys.sh [-v VARNAME] box  [USER...]        # read authorized_keys ON THIS HOST
#                                                              #   (run on the VPS; default: critter b007ab1e)
#   scripts/collect-keys.sh [-v VARNAME] file PATH [PATH...]   # read .pub / authorized_keys files
#   -v VARNAME   YAML key name (default: deploy_authorized_keys)
#
# Examples:
#   scripts/collect-keys.sh gh critter b007ab1e
#   scripts/collect-keys.sh -v automation_authorized_keys file ~/.ssh/fablab_ci.pub
set -euo pipefail
IFS=$'\n\t'

var="deploy_authorized_keys"
if [ "${1:-}" = "-v" ]; then var="${2:?-v needs a name}"; shift 2; fi

mode="${1:-}"; shift || true
[ -n "$mode" ] || { sed -n '2,16p' "$0"; exit 2; }

# Read raw "type key [comment]" lines on stdin → validated, deduped YAML list items.
emit_keys() {
  awk 'NF>=2 && $1 ~ /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-)/' \
    | awk '!seen[$2]++' \
    | while IFS= read -r line; do
        if printf '%s\n' "$line" | ssh-keygen -lf /dev/stdin >/dev/null 2>&1; then
          printf '  - "%s"\n' "$line"
        else
          printf '  # skipped invalid key: %.30s...\n' "$line" >&2
        fi
      done
}

collect() {
  case "$mode" in
    gh)
      [ "$#" -gt 0 ] || { echo "gh mode needs at least one username" >&2; exit 2; }
      for u in "$@"; do
        { gh api "users/$u/keys" --jq '.[].key' 2>/dev/null \
            || curl -fsSL "https://github.com/$u.keys" 2>/dev/null \
            || true; } | sed "s/$/ $u/"
      done ;;
    box)
      local users=("$@")
      [ "${#users[@]}" -gt 0 ] || users=(critter b007ab1e)
      for u in "${users[@]}"; do
        f="/home/$u/.ssh/authorized_keys"
        if sudo test -f "$f"; then sudo cat "$f" | sed "s|$| $u@box|"; fi
      done ;;
    file)
      for p in "$@"; do
        if [ -f "$p" ]; then cat "$p"; else echo "no such file: $p" >&2; fi
      done ;;
    *) echo "unknown mode: $mode (use gh|box|file)" >&2; exit 2 ;;
  esac
}

echo "$var:"
collect "$@" | emit_keys
