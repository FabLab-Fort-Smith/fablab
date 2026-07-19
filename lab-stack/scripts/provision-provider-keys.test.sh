#!/usr/bin/env bash
# shellcheck disable=SC2016  # intentional literal '$' in secret fixtures + the generated mock curl
# Regression tests for provision-provider-keys.sh — offline, no network (curl mocked via
# PROVISION_CURL). Proves: `list` shows the registry; `turnstile --dry-run` writes nothing;
# a create writes source-safe NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY; an existing
# widget with NO stored secret takes the rotate path; an existing widget WITH a stored secret is a
# no-op; the SINGLE-QUOTED vault-shaped config (acc id + token) is read without its quotes so the
# API URL/Bearer header are clean; the secret VALUE is never echoed; missing token fails closed.
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
reqlog="$T/reqlog"
# vault-shaped .env: secrets-pull writes EVERY value single-quoted (shq), so the account id and
# token arrive quoted — the script must strip the quotes before building the URL / Bearer header.
seed_env(){ printf "CLOUDFLARE_ACCOUNT_ID='acc123'\nCF_TURNSTILE_TOKEN='tok-scoped'\nEXISTING=keep\n" > "$env"; }
seed_env
sourced(){ ( set -a; # shellcheck disable=SC1090
  . "$env"; set +a; printf '%s' "${!1-}" ); }

# secrets carry | $ and spaces to exercise source-safe single-quoting
NEWSECRET='NEW-s3cret|x$y z'
ROTSECRET='ROT-s3cret|x$y z'
# mock curl: logs each request (parsed URL + Bearer token from the -K config, off-argv) to $reqlog,
# then answers by intent — GET widgets -> $1 (list json, default empty); POST create -> sitekey+
# secret; rotate -> secret.
mkcurl(){
  local listjson="${1:-{\"success\":true,\"result\":[]\}}"
  { echo '#!/usr/bin/env bash'
    printf 'log=%s\n' "'$reqlog'"
    echo 'cfg=""; url=""; prev=""'
    echo 'for x in "$@"; do [ "$prev" = "-K" ] && cfg="$x"; case "$x" in https://*) url="$x";; esac; prev="$x"; done'
    printf '%s\n' 'auth=""; [ -n "$cfg" ] && auth="$(sed -n '"'"'s/^header = "Authorization: Bearer \(.*\)"$/\1/p'"'"' "$cfg")"'
    printf '%s\n' 'printf "URL=%s AUTH=%s\n" "$url" "$auth" >> "$log"'
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
: > "$reqlog"
out="$(run turnstile 2>&1)"
check "site key written (public)"           "$(sourced NEXT_PUBLIC_TURNSTILE_SITE_KEY)" "0xSITEKEY123"
check "secret written + source-safe"        "$(sourced TURNSTILE_SECRET_KEY)" "$NEWSECRET"
check "pre-existing line preserved"         "$(sourced EXISTING)" "keep"
if [ -f "$env.bak" ]; then ok "backup written"; else bad "backup written"; fi
if printf '%s' "$out" | grep -qF "$NEWSECRET"; then bad "secret value not echoed"; else ok "secret value never echoed"; fi
# the HIGH regression: quoted vault values must be stripped before the URL / Bearer header
if grep -q "accounts/acc123/challenges" "$reqlog"; then ok "account id unquoted in API URL"; else bad "account id unquoted in API URL"; fi
if grep -q "acc123'" "$reqlog"; then bad "account id has NO stray quote in URL"; else ok "account id has NO stray quote in URL"; fi
if grep -q 'AUTH=tok-scoped$' "$reqlog"; then ok "token unquoted in Bearer header"; else bad "token unquoted in Bearer header"; fi

# 4. existing widget WITH secret already stored -> no-op (do NOT rotate; avoid 2h-grace foot-gun)
mkcurl '{"success":true,"result":[{"name":"fablab","sitekey":"0xEXISTING"}]}'
: > "$reqlog"
out="$(run turnstile 2>&1)"
check "existing+stored is a no-op"           "$(printf '%s' "$out" | grep -c 'nothing to do')" "1"
if grep -q rotate_secret "$reqlog"; then bad "no rotate when secret already stored"; else ok "no rotate when secret already stored"; fi

# 5. existing widget, NO stored secret -> rotate path (capture it once)
seed_env; mkcurl '{"success":true,"result":[{"name":"fablab","sitekey":"0xEXISTING"}]}'
: > "$reqlog"
out="$(run turnstile 2>&1)"
check "rotate path used to capture secret"   "$(printf '%s' "$out" | grep -c 'rotating once')" "1"
check "rotated secret stored (source-safe)"  "$(sourced TURNSTILE_SECRET_KEY)" "$ROTSECRET"

# 6. missing token fails closed
printf "CLOUDFLARE_ACCOUNT_ID='acc123'\n" > "$env"
if run turnstile >/dev/null 2>&1; then bad "missing token should fail"; else ok "missing token fails closed"; fi

echo "provision-provider-keys: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
