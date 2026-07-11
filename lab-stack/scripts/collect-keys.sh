#!/usr/bin/env bash
# Collect SSH PUBLIC keys into a YAML list for group_vars/all.yml
# (deploy_authorized_keys / automation_authorized_keys). PUBLIC keys only — never private.
# Validates each key, dedups by key material, labels by source.
#
# Safe to re-run when onboarding new maintainers: with --into (or --merge) it MERGES with the
# existing list (union, deduped) and NEVER drops a key already present — a superset check aborts
# the run if a merge would lose any existing key, and --into writes a .bak first.
#
# Usage:
#   collect-keys.sh [-v VAR] [--merge FILE | --into FILE] <gh|box|file> [ARG...]
#     gh   USER [USER...]   fetch from github.com/<user>.keys
#     box  [USER...]        read authorized_keys ON THIS HOST (run on the VPS; default: critter b007ab1e)
#     file PATH [PATH...]   read .pub / authorized_keys files
#   -v VAR        YAML key name (default: deploy_authorized_keys)
#   --merge FILE  union collected keys with the existing VAR list in FILE; print to stdout (no write)
#   --into  FILE  same union, but WRITE it back into FILE in place (additive; keeps existing keys)
#
# Examples:
#   collect-keys.sh gh 0xb007ab1e CritterCodes                        # print a fresh block
#   collect-keys.sh --into ansible/group_vars/all.yml gh newdev       # ADD newdev, keep everyone
#   collect-keys.sh -v automation_authorized_keys --into ansible/group_vars/all.yml file ~/.ssh/ci.pub
#
# NOTE: use the exact GitHub logins (maintainers: 0xb007ab1e, CritterCodes). Do NOT use the
# unrelated 'critter'/'b007ab1e' accounts. Always eyeball the result before converge.
set -euo pipefail
IFS=$'\n\t'

usage() { awk 'NR==1{next} /^set -/{exit} {sub(/^# ?/,"");print}' "$0"; }

var="deploy_authorized_keys"
into=""
merge_file=""

while [ "${1:-}" ]; do
  case "$1" in
    -v)        var="${2:?-v needs a name}"; shift 2 ;;
    --into)    into="${2:?--into needs a FILE}"; shift 2 ;;
    --merge)   merge_file="${2:?--merge needs a FILE}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    --)        shift; break ;;
    -*)        echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)         break ;;
  esac
done

mode="${1:-}"; shift || true
[ -n "$mode" ] || { usage >&2; exit 2; }

# --- helpers ------------------------------------------------------------------

# stdin: raw "type key [comment]" lines -> validated, deduped `  - "..."` items on stdout.
emit_items() {
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

# stdin: `  - "..."` item lines -> deduped by key material (2nd token), order preserved.
dedup_items() {
  awk '{
    s=$0; sub(/^[[:space:]]*-[[:space:]]*"/,"",s); sub(/"[[:space:]]*$/,"",s)
    if (split(s,a," ")>=2 && !(a[2] in seen)) { seen[a[2]]=1; print $0 }
  }'
}

# args: FILE VAR -> the `  - "..."` item lines already in that var's block (empty if none).
existing_items() {
  local f="$1" v="$2"
  [ -f "$f" ] || return 0
  awk -v v="$v" '
    $0 ~ "^"v"[[:space:]]*:" { inblk=1; next }
    inblk==1 {
      if ($0 ~ /^[[:space:]]/) { if ($0 ~ /^[[:space:]]*-[[:space:]]*"/) print $0; next }
      inblk=0
    }
  ' "$f"
}

# stdin: item lines -> just the key material (2nd token), one per line.
key_material() {
  awk '{s=$0;sub(/^[[:space:]]*-[[:space:]]*"/,"",s);sub(/"[[:space:]]*$/,"",s);
        if(split(s,a," ")>=2) print a[2]}'
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

# --- build the (possibly merged) list -----------------------------------------

new_items="$(collect "$@" | emit_items || true)"

src_file="${into:-$merge_file}"
before=""
if [ -n "$src_file" ]; then
  before="$(existing_items "$src_file" "$var" | dedup_items || true)"
  # union: existing FIRST (proves nothing is dropped), then new; dedup by key material.
  merged="$(printf '%s\n%s\n' "$before" "$new_items" \
            | grep -E '^[[:space:]]*-[[:space:]]*"' | dedup_items || true)"
else
  merged="$(printf '%s\n' "$new_items" \
            | grep -E '^[[:space:]]*-[[:space:]]*"' | dedup_items || true)"
fi

[ -n "$merged" ] || { echo "no valid keys collected; refusing to emit an empty list" >&2; exit 1; }

# --- superset guard: every EXISTING key MUST still be present (never overwrite) ---
if [ -n "$src_file" ] && [ -n "$before" ]; then
  missing="$(comm -23 \
              <(printf '%s\n' "$before"  | key_material | sort -u) \
              <(printf '%s\n' "$merged"  | key_material | sort -u) || true)"
  if [ -n "$missing" ]; then
    echo "ABORT: merge would drop existing key(s) — refusing to overwrite:" >&2
    printf '%s\n' "$missing" | sed 's/^/  - /' >&2
    exit 1
  fi
fi

# --- output -------------------------------------------------------------------
if [ -n "$into" ]; then
  [ -f "$into" ] || { echo "--into: no such file: $into" >&2; exit 2; }
  cp -p "$into" "$into.bak"
  itemsf="$(mktemp)"; printf '%s\n' "$merged" > "$itemsf"
  tmp="$(mktemp)"
  awk -v v="$var" -v itemsf="$itemsf" '
    function emit(){ while ((getline il < itemsf) > 0) print il; close(itemsf) }
    $0 ~ "^"v"[[:space:]]*:" { print v":"; emit(); found=1; skip=1; next }
    skip==1 { if ($0 ~ /^[[:space:]]/) next; skip=0 }
    { print }
    END { if (!found) { print ""; print v":"; emit() } }
  ' "$into" > "$tmp"
  mv "$tmp" "$into"
  rm -f "$itemsf"
  n_new=$(printf '%s\n' "$new_items" | grep -c '^  - ' || true)
  n_tot=$(printf '%s\n' "$merged"    | grep -c '^  - ' || true)
  echo "✓ merged into '$var' in $into (backup: $into.bak)." >&2
  echo "  collected=$n_new  total keys now=$n_tot  (existing keys preserved). Review the diff before commit/converge." >&2
else
  printf '%s:\n%s\n' "$var" "$merged"
fi
