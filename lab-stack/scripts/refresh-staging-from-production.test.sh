#!/usr/bin/env bash
# Remote-orchestration guard for refresh-staging-from-production.sh (offline; no VPS, no docker,
# no mongod). This is the regression test for the F7/F8 class of bug that a functional test missed:
# a same-line command-PREFIX assignment (RP=... docker exec -e RP mongosh -u "$RU") does NOT set the
# current shell's "$RU"/"$RP" — they expand EMPTY on the host, so mongosh gets no creds (auth fails
# and the temp-db cleanup silently no-ops), and any credential value placed directly on a
# docker exec/run argv is `ps`/proc-visible on the VPS.
#
# It proves two things:
#   1. STRUCTURAL — every mongo tool invocation in the script goes through `sh -c` (creds/URIs expand
#      INSIDE the container), and no credential (URI / RP / RU / AP) is ever a docker-layer argv VALUE.
#   2. BEHAVIOURAL — the shell semantics: the fixed pattern (prefix + bare `-e VAR` + `sh -c`)
#      forwards NON-EMPTY creds to the child, while the buggy same-line `"$RU"` expands EMPTY.
set -euo pipefail
IFS=$'\n\t'

here="$(cd "$(dirname "$0")" && pwd)"
SUT="$here/refresh-staging-from-production.sh"
pass=0; fail=0
ok()  { printf '  ok   - %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  FAIL - %s\n' "$1" >&2; fail=$((fail+1)); }
# assert/refute "desc" CMD... — CMD is ONE command (no &&/|| chains, so shellcheck stays clean).
assert() { local d="$1"; shift; if "$@"; then ok "$d"; else bad "$d"; fi; }
refute() { local d="$1"; shift; if "$@"; then bad "$d"; else ok "$d"; fi; }

# Join bash line-continuations so a multi-line `docker … \` invocation is one logical line to grep.
join_lines() { sed -e ':a' -e '/\\$/{N;s/\\\n//;ba}' "$1"; }

# --- predicates over a block of text (so we can check the real script AND crafted bad snippets) ---

# absent TEXT PATTERN -> 0 (pass) when PATTERN does NOT occur.
absent() { ! printf '%s\n' "$1" | grep -qE "$2"; }

# tools_via_shc TEXT -> 0 when EVERY docker exec/run line that runs a mongo tool also uses `sh -c`
# (i.e. the tool + its cred expansion happen inside the container, not on the host).
tools_via_shc() {
  local off
  off="$(printf '%s\n' "$1" | grep -E 'docker (exec|run)' | grep -E 'mongosh|mongodump|mongorestore' | grep -vE 'sh -c' || true)"
  [ -z "$off" ]
}

# creds_via_shc TEXT -> 0 when every `-u "$RU"` / `-p "$RP"` sits on an `sh -c` line (container env),
# never bare at the docker layer (where the host would expand them empty).
creds_via_shc() {
  local off
  # SC2016: the single-quoted regex intentionally matches a LITERAL `$RU`/`$RP` in the script text.
  # shellcheck disable=SC2016
  off="$(printf '%s\n' "$1" | grep -E '\-u "\$RU"|\-p "\$RP"' | grep -vE 'sh -c' || true)"
  [ -z "$off" ]
}

[ -f "$SUT" ] || { echo "SUT not found: $SUT" >&2; exit 2; }
JOINED="$(join_lines "$SUT")"

echo "structural — the real script:"
# F8: no credential-bearing VALUE on a docker-layer argv. TDB/SDB (db names) are allowed as values.
assert "no root/prod URI value on docker argv (-e U=…)"        absent "$JOINED" '\-e U="'
assert "no root password value on docker argv (-e RP=…)"       absent "$JOINED" '\-e RP="'
assert "no root user value on docker argv (-e RU=…)"           absent "$JOINED" '\-e RU="'
assert "no app password value on docker argv (-e AP=…)"        absent "$JOINED" '\-e AP="'
# F7: mongo tools + their cred/URI expansion run inside `sh -c` (container env).
assert "every mongo tool invocation goes through sh -c"        tools_via_shc "$JOINED"
assert "mongosh -u/-p only ever expand inside sh -c"           creds_via_shc "$JOINED"
# Positive: URIs are forwarded via the container env (bare -e U) and read with \$U inside sh -c.
assert "root/prod URIs forwarded via container env (-e U)"     grep -qE '\-e U( |$)' <<<"$JOINED"

echo "structural — the guard actually catches the bug (prove-it-fails):"
# SC2016: these fixtures deliberately contain the LITERAL buggy patterns (`$RU`, `-e U="$RURI"`).
# shellcheck disable=SC2016
BAD_TOOL='  RP="$P" RU="$U" docker exec -e RP -e RU fablab-mongo   mongosh --quiet -u "$RU" -p "$RP" --eval "x"'
# shellcheck disable=SC2016
BAD_ARGV='  docker run --rm -e U="$RURI" mongo:8.0 sh -c "mongodump --uri=\"\$U\""'
refute "catches mongosh NOT wrapped in sh -c"                 tools_via_shc "$BAD_TOOL"
refute "catches bare -u at the docker layer"                  creds_via_shc "$BAD_TOOL"
refute "catches a credential URI value on docker argv"        absent "$BAD_ARGV" '\-e U="'

echo "behavioural — the fix reaches the child NON-EMPTY:"
# A fake `docker` that honours `-e VAR` (bare) by inheriting VAR from its env, then runs the
# trailing `sh -c <script>` locally — proving prefix + `-e VAR` + `sh -c` reaches the child NON-EMPTY.
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
cat > "$T/docker" <<'DOCK'
#!/usr/bin/env bash
# Minimal stub: find the trailing `sh -c <script>` and run it locally. Bare `-e VAR` needs no action
# (the var is already in this process's env via the caller's prefix assignment — what docker does).
args=("$@")
i=0
while [ "$i" -lt "${#args[@]}" ]; do
  if [ "${args[i]}" = "sh" ] && [ "${args[i+1]:-}" = "-c" ]; then
    exec sh -c "${args[i+2]:-}"
  fi
  i=$((i+1))
done
echo "fake-docker: no 'sh -c' found" >&2; exit 2
DOCK
chmod +x "$T/docker"

fixed_pattern_reaches_child() {
  local out
  out="$(PATH="$T:$PATH" RP=secretpw RU=root TDB=thelab_staging_incoming \
    docker exec -e RP -e RU -e TDB fablab-mongo \
    sh -c 'printf "%s|%s|%s" "$RU" "$RP" "$TDB"')"
  [ "$out" = "root|secretpw|thelab_staging_incoming" ]
}
assert "prefix + bare -e VAR + sh -c forwards NON-EMPTY creds to the child" fixed_pattern_reaches_child

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
