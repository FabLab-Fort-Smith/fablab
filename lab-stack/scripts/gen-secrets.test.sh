#!/usr/bin/env bash
# Regression tests for gen-secrets.sh — offline, no network. Proves: local secrets are generated
# when missing, existing values are NOT overwritten (non-destructive), provider keys are never
# generated, secret VALUES are never echoed, ENCRYPTION_KEY is exactly 32 bytes, and rotation
# (--force) is gated (refused without --yes in non-interactive mode).
set -euo pipefail
IFS=$'\n\t'

here="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

pass=0; fail=0
ok()  { printf '  ok   - %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  FAIL - %s\n' "$1" >&2; fail=$((fail+1)); }
try() { desc="$1"; shift; if "$@"; then ok "$desc"; else bad "$desc"; fi; }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (want '$3' got '$2')"; fi; }

mkdir -p "$T/lab-stack/scripts"
cp "$here/gen-secrets.sh" "$here/_lib.sh" "$T/lab-stack/scripts/"
printf 'LAB_VPS_HOST=\nCOOLIFY_URL=\n' > "$T/.env.example"
env="$T/.env"
val() { sed -n "s/^$1=//p" "$env" | head -n1; }
run() { ( cd "$T/lab-stack" && bash scripts/gen-secrets.sh "$@" ); }

echo "gen-secrets.sh regression tests"

# 1. fresh: generates all local secrets, non-empty; provider keys NOT created
: > "$env"
run >/dev/null 2>&1
for k in AUTH_SECRET JWT_SECRET ENCRYPTION_KEY INTERNAL_API_SECRET SOCKET_API_SECRET MONGO_ROOT_PASSWORD MONGO_APP_PASSWORD; do
  if [ -n "$(val "$k")" ]; then ok "generated $k"; else bad "generated $k"; fi
done
if grep -q '^SQUARE_ACCESS_TOKEN=' "$env"; then bad "provider key not created"; else ok "provider key not created"; fi

# 2. ENCRYPTION_KEY is exactly 32 bytes (env.js requirement)
check "ENCRYPTION_KEY is 32 bytes" "$(printf '%s' "$(val ENCRYPTION_KEY)" | wc -c | tr -d ' ')" "32"
# Mongo password is URI-safe 32 alnum
if printf '%s' "$(val MONGO_ROOT_PASSWORD)" | grep -qE '^[A-Za-z0-9]{32}$'; then ok "mongo pw is 32 URI-safe chars"; else bad "mongo pw is 32 URI-safe chars"; fi

# 3. non-destructive: a pre-set value is kept; a provider key is untouched
printf 'AUTH_SECRET=KNOWN_DO_NOT_CHANGE\nCLOUDFLARE_API_TOKEN=cf_provider\n' > "$env"
out="$(run 2>&1)"
check "existing AUTH_SECRET kept" "$(val AUTH_SECRET)" "KNOWN_DO_NOT_CHANGE"
check "provider CLOUDFLARE_API_TOKEN untouched" "$(val CLOUDFLARE_API_TOKEN)" "cf_provider"
if [ -n "$(val JWT_SECRET)" ]; then ok "missing JWT_SECRET filled alongside"; else bad "missing JWT_SECRET filled alongside"; fi

# 4. secret VALUES are never echoed to stdout
if printf '%s' "$out" | grep -q 'KNOWN_DO_NOT_CHANGE'; then bad "secret value not echoed"; else ok "secret value not echoed"; fi

# 5. idempotent default re-run: kept value stable
run >/dev/null 2>&1
check "idempotent: AUTH_SECRET stable" "$(val AUTH_SECRET)" "KNOWN_DO_NOT_CHANGE"

# 6. --force rotation gate: refused without --yes in non-interactive mode (no change)
printf 'AUTH_SECRET=KEEP_ME\n' > "$env"
rc=0; ( cd "$T/lab-stack" && SETUP_NONINTERACTIVE=1 bash scripts/gen-secrets.sh --force ) >/dev/null 2>&1 || rc=$?
if [ "$rc" -ne 0 ]; then ok "--force refused without --yes (non-interactive)"; else bad "--force refused without --yes (non-interactive)"; fi
check "aborted rotation left value intact" "$(val AUTH_SECRET)" "KEEP_ME"

# 7. --force --yes actually rotates
run --force --yes >/dev/null 2>&1
if [ "$(val AUTH_SECRET)" != "KEEP_ME" ] && [ -n "$(val AUTH_SECRET)" ]; then ok "--force --yes rotated AUTH_SECRET"; else bad "--force --yes rotated AUTH_SECRET"; fi

echo "-------- $pass passed, $fail failed --------"
[ "$fail" -eq 0 ]
