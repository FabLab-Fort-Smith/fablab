#!/usr/bin/env bash
# Shared helpers for lab-stack scripts. SOURCE this ( . scripts/_lib.sh ), don't execute.
# No secret VALUES are ever printed by these helpers.

# env_get FILE KEY -> prints the value (empty if file/key absent).
env_get() { [ -f "$1" ] || return 0; sed -n "s/^$2=//p" "$1" | head -n1; }

# env_set FILE KEY VAL -> upsert KEY=VAL. VAL is passed to awk via the environment (not argv,
# not a sed pattern) so arbitrary secret characters are safe and never appear in `ps`. Keeps the
# file mode at 0600.
env_set() {
  local f="$1" k="$2" v="$3" tmp; tmp="$(mktemp)"
  if [ -f "$f" ] && grep -q "^$k=" "$f"; then
    KVAL="$v" awk -v k="$k" 'BEGIN{FS="="} $1==k{print k"="ENVIRON["KVAL"];d=1;next} {print} END{if(!d)print k"="ENVIRON["KVAL"]}' "$f" > "$tmp"
  else
    [ -f "$f" ] && cat "$f" > "$tmp"
    printf '%s=%s\n' "$k" "$v" >> "$tmp"
  fi
  mv "$tmp" "$f"; chmod 600 "$f"
}

# rand_b64 NBYTES -> base64 of N cryptographically-random bytes (ASCII, no newline).
rand_b64() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -base64 "$1" | tr -d '\n'
  else head -c "$1" /dev/urandom | base64 | tr -d '\n'; fi
}

# rand_alnum NCHARS -> N URI-safe [A-Za-z0-9] chars (for passwords embedded in connection strings).
rand_alnum() { LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$1"; }
