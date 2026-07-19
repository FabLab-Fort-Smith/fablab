#!/usr/bin/env bash
# shellcheck disable=SC2016  # intentional literal '$' in secret fixtures + the generated mock curl
# Regression tests for provision-provider-keys.sh — offline, no network (curl mocked via
# PROVISION_CURL). Proves: `list` shows the registry; `turnstile --dry-run` writes nothing;
# a create writes source-safe NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY; an existing
# widget takes the rotate path; the secret VALUE is never echoed; missing token fails closed.
set -euo pipefail
IFS=$'\n\t'
here="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
pass=0; fail=0
ok(){ printf '  ok   - %s\n' "$1"; pass=$((pass+1)); }
bad(){ printf '  FAIL - %s\n' "$1" >&2; fail=$((fail+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (want '$3' got '$2')"; fi; }

mkdir -p "$T/lab-stack/scripts"
cp "$here/provision-provider-keys.sh" "$here/_lib.sh" "$T/lab-stack/scripts/"
env="$T/.env"
printf 'CLOUDFLARE_ACCOUNT_ID=acc123\nCF_TURNSTILE_TOKEN=tok-scoped\nEXISTING=keep\n' > "$env"
sourced(){ ( set -a; # shellcheck disable=SC1090
  . "$env"; set +a; printf '%s' "${!1-}" ); }

# secrets carry | $ and spaces to exercise source-safe single-quoting
NEWSECRET='NEW-s3cret|x$y z'
ROTSECRET='ROT-s3cret|x$y z'
# mock curl: GET widgets -> $1 (list json, default empty); POST create -> sitekey+secret; rotate -> secret
mkcurl(){
  local listjson="${1:-{\"success\":true,\"result\":[]\}}"
  { echo '#!/usr/bin/env bash'
    echo 'a="$*"'
    echo 'if printf "%s" "$a" | grep -q rotate_secret; then'
    printf '  printf %%s %s\n' "'{\"success\":true,\"result\":{\"secret\":\"$ROTSECRET\"}}'"
    echo 'elif printf "%s" "$a" | grep -q -- "-X POST"; then'
    printf '  printf %%s %s\n' "'{\"success\":true,\"result\":{\"sitekey\":\"0xSITEKEY123\",\"secret\":\"$NEWSECRET\"}}'"
    echo 'else'
    printf '  printf %%s %s\n' "'$listjson'"
    echo 'fi'
  } > "$T/curl"
  chmod +x "$T/curl"
}
run(){ ( cd "$T/lab-stack" && PROVISION_CURL="$T/curl" bash scripts/provision-provider-keys.sh "$@" ); }

echo "provision-provider-keys.sh regression tests"

# 1. list
out="$(run list 2>&1)"
check "list shows Turnstile (implemented)"  "$(printf '%s' "$out" | grep -c 'Cloudflare Turnstile.*implemented')" "1"
check "list flags console-only Tier 3"      "$(printf '%s' "$out" | grep -c 'Google OAuth client.*manual')" "1"

# 2. dry-run writes nothing
mkcurl
run turnstile --dry-run >/dev/null 2>&1
check "dry-run leaves EXISTING intact"      "$(sourced EXISTING)" "keep"
check "dry-run wrote no site key"           "$(sourced NEXT_PUBLIC_TURNSTILE_SITE_KEY)" ""
if [ -f "$env.bak" ]; then bad "dry-run made no backup"; else ok "dry-run made no backup"; fi

# 3. create path (empty list -> create)
mkcurl
out="$(run turnstile 2>&1)"
check "site key written (public)"           "$(sourced NEXT_PUBLIC_TURNSTILE_SITE_KEY)" "0xSITEKEY123"
check "secret written + source-safe"        "$(sourced TURNSTILE_SECRET_KEY)" "$NEWSECRET"
check "pre-existing line preserved"         "$(sourced EXISTING)" "keep"
if [ -f "$env.bak" ]; then ok "backup written"; else bad "backup written"; fi
if printf '%s' "$out" | grep -qF "$NEWSECRET"; then bad "secret value not echoed"; else ok "secret value never echoed"; fi

# 4. existing widget -> rotate path
mkcurl '{"success":true,"result":[{"name":"fablab","sitekey":"0xEXISTING"}]}'
out="$(run turnstile 2>&1)"
check "rotate path used for existing widget" "$(printf '%s' "$out" | grep -c 'rotating its secret')" "1"
check "rotated secret stored (source-safe)"  "$(sourced TURNSTILE_SECRET_KEY)" "$ROTSECRET"

# 5. missing token fails closed
printf 'CLOUDFLARE_ACCOUNT_ID=acc123\n' > "$env"
if run turnstile >/dev/null 2>&1; then bad "missing token should fail"; else ok "missing token fails closed"; fi

echo "provision-provider-keys: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
