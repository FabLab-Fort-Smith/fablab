#!/usr/bin/env bash
# Regression tests for secrets-pull.sh — offline, no network, no real vault (bw is mocked via
# BW_CLI). Proves: only env-style fields (^[A-Z][A-Z0-9_]+$) are pulled; empty + lowercase fields
# are skipped; items without fields (login/notes) are ignored; the written .env is SOURCE-SAFE for
# values with metacharacters (| $ " ' space); pre-existing non-secret lines are preserved; a .bak
# backup is made; --dry-run writes nothing; and secret VALUES are never echoed.
set -euo pipefail
IFS=$'\n\t'

here="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok()  { printf '  ok   - %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  FAIL - %s\n' "$1" >&2; fail=$((fail+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (want '$3' got '$2')"; fi; }

mkdir -p "$T/lab-stack/scripts"
cp "$here/secrets-pull.sh" "$here/_lib.sh" "$T/lab-stack/scripts/"

# --- mock bw: only the calls secrets-pull makes with a pre-set BW_SESSION (sync/list) ---
cat > "$T/bw" <<'MOCK'
#!/usr/bin/env bash
case "$1" in
  sync|config|status|login|unlock) exit 0 ;;
  list)
    case "$2" in
      collections) printf '%s' '[{"id":"C0","name":"Default collection"},{"id":"C1","name":"Default collection/Infrastructure"}]' ;;
      items)        cat "$MOCK_ITEMS" ;;
    esac ;;
esac
MOCK
chmod +x "$T/bw"

# canned items: env-style hidden/text fields + a lowercase field + an empty field + fieldless items
cat > "$T/items.json" <<'JSON'
[
 {"name":"Cloudflare","type":2,"fields":[
   {"name":"CLOUDFLARE_API_TOKEN","value":"cf-tok-123","type":1},
   {"name":"CF_ACCESS_TOKEN","value":"cf|acc$456","type":1},
   {"name":"CLOUDFLARE_ACCOUNT_ID","value":"acct789","type":0}]},
 {"name":"Platform config","type":2,"fields":[
   {"name":"primary_domain","value":"example.org","type":0}]},
 {"name":"App","type":2,"fields":[
   {"name":"EMPTY_KEY","value":"","type":1},
   {"name":"WEIRD_SECRET","value":"a=b c\"d it's $x","type":1}]},
 {"name":"OWNER login","type":1,"login":{"username":null,"password":null}},
 {"name":"REF note","type":2}
]
JSON

env="$T/.env"
run() { ( cd "$T/lab-stack" \
  && BW_CLI="$T/bw" BW_SESSION="fake-session" VAULT_URL="https://10.0.0.1:8000" \
     VAULT_COLLECTION="Default collection/Infrastructure" MOCK_ITEMS="$T/items.json" \
     bash scripts/secrets-pull.sh "$@" ); }
# read a var the way the real consumer does: SOURCE the .env (proves source-safety)
sourced() { ( set -a; # shellcheck disable=SC1090
  . "$env"; set +a; printf '%s' "${!1-}" ); }

echo "secrets-pull.sh regression tests"

# 1. pull into an .env that has a pre-existing non-secret line
printf 'EXISTING_CONFIG=keepme\n' > "$env"
out="$(run 2>&1)"
check "pulled the 4 env-style secrets"        "$(printf '%s' "$out" | grep -c '  set ')" "4"
check "CLOUDFLARE_API_TOKEN via sourcing"      "$(sourced CLOUDFLARE_API_TOKEN)" "cf-tok-123"
check "CLOUDFLARE_ACCOUNT_ID (text field)"     "$(sourced CLOUDFLARE_ACCOUNT_ID)" "acct789"
# shellcheck disable=SC2016  # single quotes are intentional — assert the LITERAL $456, no expansion
check "metachar token survives sourcing"       "$(sourced CF_ACCESS_TOKEN)" 'cf|acc$456'
check "quote/space/dollar value survives"      "$(sourced WEIRD_SECRET)" "a=b c\"d it's \$x"
check "pre-existing non-secret line preserved" "$(sourced EXISTING_CONFIG)" "keepme"
check "lowercase field NOT pulled"             "$(sourced primary_domain)" ""
check "empty-value field NOT pulled"           "$(sourced EMPTY_KEY)" ""
if [ -f "$env.bak" ]; then ok "backup .env.bak written"; else bad "backup .env.bak written"; fi

# 2. secret VALUES never appear in output
if printf '%s' "$out" | grep -qF 'cf-tok-123'; then bad "value not echoed"; else ok "secret values never echoed"; fi

# 3. --dry-run writes nothing
printf 'ONLY=me\n' > "$env"; rm -f "$env.bak"
out2="$(run --dry-run 2>&1)"
check "dry-run reports availability"           "$(printf '%s' "$out2" | grep -c 'would set ')" "4"
check "dry-run did NOT write secrets"          "$(sourced CLOUDFLARE_API_TOKEN)" ""
check "dry-run left .env untouched"            "$(sourced ONLY)" "me"
if [ -f "$env.bak" ]; then bad "dry-run made no backup"; else ok "dry-run made no backup"; fi

# 4. missing collection fails closed
printf '' > "$env"
if ( cd "$T/lab-stack" && BW_CLI="$T/bw" BW_SESSION="x" VAULT_URL="https://10.0.0.1:8000" \
       VAULT_COLLECTION="Nope" MOCK_ITEMS="$T/items.json" bash scripts/secrets-pull.sh >/dev/null 2>&1 ); then
  bad "unknown collection should fail"
else ok "unknown collection fails closed"; fi

echo "secrets-pull: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
