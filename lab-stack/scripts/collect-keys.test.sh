#!/usr/bin/env bash
# Regression tests for collect-keys.sh — proves the merge is ADDITIVE and NEVER overwrites
# existing keys (the onboarding-a-new-dev safety guarantee). No network: uses throwaway keys.
# Run: bash scripts/collect-keys.test.sh   (or `make test` from lab-stack/).
set -euo pipefail
IFS=$'\n\t'

here="$(cd "$(dirname "$0")" && pwd)"
ck="$here/collect-keys.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

pass=0; fail=0
ok()   { printf '  ok   - %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  FAIL - %s\n' "$1" >&2; fail=$((fail+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (want '$3', got '$2')"; fi; }
# try DESC CMD... : run CMD, ok on success else bad (avoids the SC2015 && || pitfall).
try()  { desc="$1"; shift; if "$@"; then ok "$desc"; else bad "$desc"; fi; }

items() { awk -v v="$1" '$0~"^"v":"{f=1;next} f&&/^  - /{c++} f&&!/^[[:space:]]/&&!/^$/{f=0} END{print c+0}' "$2"; }
has()   { grep -qF "$(cut -d' ' -f2 "$1")" "$2"; }

for n in k1 k2 k3; do ssh-keygen -q -t ed25519 -f "$T/$n" -N "" -C "$n"; done

seed() {
  cat > "$T/all.yml" <<EOF
some_key: value
deploy_authorized_keys:
  - "$(cat "$T/k1.pub")"
  - "$(cat "$T/k2.pub")"

ssh_allow_users: []
EOF
}

echo "collect-keys.sh regression tests"

# 1. additive merge keeps existing + adds new
seed
"$ck" --into "$T/all.yml" file "$T/k3.pub" >/dev/null 2>&1
check "additive: 3 keys after adding k3" "$(items deploy_authorized_keys "$T/all.yml")" "3"
try "k1 preserved" has "$T/k1.pub" "$T/all.yml"
try "k2 preserved" has "$T/k2.pub" "$T/all.yml"
try "k3 added"     has "$T/k3.pub" "$T/all.yml"
try "content above intact" grep -q '^some_key: value' "$T/all.yml"
try "content below intact" grep -q '^ssh_allow_users: \[\]' "$T/all.yml"
try ".bak written" test -f "$T/all.yml.bak"

# 2. idempotent: re-adding the same key changes nothing
"$ck" --into "$T/all.yml" file "$T/k3.pub" >/dev/null 2>&1
check "idempotent re-run stays 3" "$(items deploy_authorized_keys "$T/all.yml")" "3"

# 3. adding an already-present key never drops others
"$ck" --into "$T/all.yml" file "$T/k1.pub" >/dev/null 2>&1
check "dup add stays 3 (nothing dropped)" "$(items deploy_authorized_keys "$T/all.yml")" "3"

# 4. a different var appends its own block, leaving deploy_* untouched
"$ck" -v automation_authorized_keys --into "$T/all.yml" file "$T/k2.pub" >/dev/null 2>&1
try "new var block appended" grep -q '^automation_authorized_keys:' "$T/all.yml"
check "deploy block untouched by other-var write" "$(items deploy_authorized_keys "$T/all.yml")" "3"

# 5. default stdout mode still emits a block
"$ck" file "$T/k1.pub" > "$T/out.txt" 2>/dev/null
try "stdout mode emits block" grep -q '^deploy_authorized_keys:' "$T/out.txt"

# 6. --merge previews the union without writing
before_ct="$(items deploy_authorized_keys "$T/all.yml")"
"$ck" --merge "$T/all.yml" file "$T/k3.pub" >/dev/null 2>&1
check "--merge does not write" "$(items deploy_authorized_keys "$T/all.yml")" "$before_ct"

echo "-------- $pass passed, $fail failed --------"
[ "$fail" -eq 0 ]
