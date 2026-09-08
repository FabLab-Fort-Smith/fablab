#!/usr/bin/env bash
# Offline unit test for the DB-identity guard in coolify/reconcile.sh (no network, no Coolify, no
# mongod). Regression test for the #107 staging drift: reconcile pushes MONGODB_URI/MONGODB_NAME from
# the per-env .env VERBATIM, so a STALE .env silently pointed the staging app at the legacy `thelab`
# database long after the source of truth moved to per-env `thelab_staging`. The guard turns that
# silent drift into a hard, fail-closed stop.
#
# It proves:
#   1. FAIL-OLD  — the guard REJECTS the exact legacy `thelab`/`thelab_app` identity that drifted
#                  (it would have caught the real bug), REJECTS a production identity used for
#                  staging (and vice-versa), and REJECTS a correct URI paired with a stale
#                  MONGODB_NAME.
#   2. ACCEPT    — it ACCEPTS the correct per-env identity for staging AND production.
#   3. NO LEAK   — it never prints the password, on any path (parser + reject message).
#   4. SCOPE     — it is a no-op for socket-server (no Mongo identity) and for an empty URI.
#
# The REAL guard functions are extracted from the script text and eval'd against mock
# envval/die/info, so the test exercises the shipped code, not a copy.
set -euo pipefail
IFS=$'\n\t'

here="$(cd "$(dirname "$0")" && pwd)"
SUT="$here/reconcile.sh"
pass=0; fail=0
ok()  { printf '  ok   - %s\n' "$1"; pass=$((pass+1)); }
bad() { printf '  FAIL - %s\n' "$1" >&2; fail=$((fail+1)); }

[ -f "$SUT" ] || { echo "SUT not found: $SUT" >&2; exit 2; }

# --- extract the guard block (comments + the 6 functions) up to, but excluding, its invocation ---
guard_src="$(sed -n '/DB-identity guard/,/^check_db_identity$/p' "$SUT" | sed '$d')"
[ -n "$guard_src" ] || { echo "could not extract guard functions from $SUT" >&2; exit 2; }
# sanity: the block must define check_db_identity.
if ! printf '%s\n' "$guard_src" | grep -q 'check_db_identity()'; then
  echo "extracted block missing check_db_identity()" >&2; exit 2
fi

# --- mocks the guard depends on (dynamic scope: check_db_identity resolves these at call time) ---
# die() must EXIT so the reject path stops (mirrors the real script); command substitution runs it in
# a subshell, so its exit sets the captured status without killing the test.
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
info() { printf '  %s\n' "$*"; }
envval(){ case "$1" in MONGODB_URI) printf '%s' "${MOCK_URI:-}" ;; MONGODB_NAME) printf '%s' "${MOCK_NAME:-}" ;; *) : ;; esac; }
ENVF="mock.env"

eval "$guard_src"

# A password value that must NEVER appear in any guard output.
SECRET_PW='S3cr3t-PW-must-not-leak-9Q'

# run_guard APP ENV URI NAME -> sets $OUT (stdout+stderr) and $RC (exit status).
run_guard(){
  APP_TARGET="$1"; ENV_TARGET="$2"; MOCK_URI="$3"; MOCK_NAME="$4"
  export APP_TARGET ENV_TARGET MOCK_URI MOCK_NAME ENVF
  if OUT="$(check_db_identity 2>&1)"; then RC=0; else RC=$?; fi
}
# expect_reject / expect_accept DESC APP ENV URI NAME
expect_reject(){ local d="$1"; shift; run_guard "$@"; if [ "$RC" -ne 0 ]; then ok "$d"; else bad "$d (rc=$RC)"; fi; }
expect_accept(){ local d="$1"; shift; run_guard "$@"; if [ "$RC" -eq 0 ]; then ok "$d"; else bad "$d (rc=$RC): $OUT"; fi; }
out_has(){ if printf '%s' "$OUT" | grep -q "$1"; then ok "$2"; else bad "$2"; fi; }
out_lacks(){ if printf '%s' "$OUT" | grep -q "$1"; then bad "$2"; else ok "$2"; fi; }

echo "reject — the guard catches drift (prove-it-fails, non-zero exit):"

# 1. FAIL-OLD: the exact legacy identity that drifted on staging.
expect_reject "rejects the legacy thelab/thelab_app staging identity (#107 drift)" \
  the-lab staging "mongodb://thelab_app:${SECRET_PW}@fablab-mongo:27017/thelab?authSource=thelab" thelab
out_has "thelab_staging_app" "reject message names the EXPECTED staging user"
out_has "expected 'thelab_staging'" "reject message names the EXPECTED db identity"

# 2. prod identity used for staging (staging creds must never touch the prod db).
expect_reject "rejects a PRODUCTION identity used for staging" \
  the-lab staging "mongodb://thelab_production_app:${SECRET_PW}@fablab-mongo:27017/thelab_production?authSource=thelab_production" thelab_production

# 3. correct URI but a stale MONGODB_NAME (partial drift).
expect_reject "rejects a correct URI paired with a stale MONGODB_NAME=thelab" \
  the-lab staging "mongodb://thelab_staging_app:${SECRET_PW}@fablab-mongo:27017/thelab_staging?authSource=thelab_staging" thelab

# 4. staging identity mistakenly used for production.
expect_reject "rejects a STAGING identity used for production" \
  the-lab production "mongodb://thelab_staging_app:${SECRET_PW}@fablab-mongo:27017/thelab_staging?authSource=thelab_staging" thelab_staging

echo "accept — the correct per-env identity passes:"

expect_accept "accepts the correct staging identity" \
  the-lab staging "mongodb://thelab_staging_app:${SECRET_PW}@fablab-mongo:27017/thelab_staging?authSource=thelab_staging" thelab_staging
expect_accept "accepts the correct production identity" \
  the-lab production "mongodb://thelab_production_app:${SECRET_PW}@fablab-mongo:27017/thelab_production?authSource=thelab_production" thelab_production
expect_accept "empty MONGODB_URI is a no-op (handled by required-env check)" \
  the-lab staging "" ""

echo "scope — non-the-lab apps carry no Mongo identity:"
expect_accept "socket-server is skipped (no Mongo identity)" \
  socket-server staging "mongodb://someone:${SECRET_PW}@host/whatever?authSource=whatever" whatever

echo "no-leak — the password never appears in guard output:"
run_guard the-lab staging "mongodb://thelab_app:${SECRET_PW}@fablab-mongo:27017/thelab?authSource=thelab" thelab
out_lacks "$SECRET_PW" "reject output contains no password"

# Parser-level: extracting user/db/authSource must never surface the password.
u="mongodb://thelab_staging_app:${SECRET_PW}@fablab-mongo:27017/thelab_staging?authSource=thelab_staging"
parsed="$(uri_user "$u")|$(uri_dbpath "$u")|$(uri_authsource "$u")"
if [ "$parsed" = "thelab_staging_app|thelab_staging|thelab_staging" ]; then
  ok "parser extracts user/db/authSource correctly"
else
  bad "parser wrong: $parsed"
fi
if printf '%s' "$parsed" | grep -q "$SECRET_PW"; then bad "PASSWORD LEAKED via parser"; else ok "parser output contains no password"; fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
