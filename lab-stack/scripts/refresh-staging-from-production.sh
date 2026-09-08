#!/usr/bin/env bash
# Refresh the STAGING database from PRODUCTION (fablab #107 phase 2; time-boxed real-data mode).
#
#   dump production (read-only)  ->  restore into thelab_staging  ->  ANONYMIZE (default)  ->  verify
#
# DEFAULT = anonymized (fail closed). Copying production into staging is forbidden unless the
# personal data is irreversibly replaced (master §5, the-lab CLAUDE.md §8). It is also BROKEN
# without anonymizing: production and staging use different ENCRYPTION_KEYs, so prod-encrypted
# emails cannot be decrypted or matched by staging and every email/login flow silently fails for
# copied users. The anonymizer rewrites emails/phones to synthetic values encrypted under STAGING's
# own key, and FAILS CLOSED if any real-looking personal data survives — this script propagates it.
#
# REAL-DATA MODE (--real-data) is an explicit, GATED action a human triggers per validation window.
# Instead of faking, the anonymizer RE-KEYS member email/phone: it DECRYPTS with the PRODUCTION
# ENCRYPTION_KEY and RE-ENCRYPTS under STAGING's key, so real data stays usable but readable by
# staging. The production key is read TRANSIENTLY from Coolify (like PROD_URI), passed to the
# container over STDIN (never argv, never disk, never logged), and shredded after use. Real mode is
# time-boxed (--until, capped at STAGING_REAL_MAX_WINDOW_HOURS, default 48h) and audited; an
# auto-revert (staging-data-mode-revert.sh + a scheduled task) re-anonymizes once the window passes.
# ANY malformed/expired/ambiguous real request falls back to ANONYMIZED — never real.
#
# Apps are resolved BY NAME through the Coolify API (never hardcoded uuids), matching reconcile.sh.
# Run from lab-stack/. Usage:
#   bash scripts/refresh-staging-from-production.sh --yes
#   bash scripts/refresh-staging-from-production.sh --yes --real-data \
#        --until 2026-09-09T18:00:00Z --reason "verify payment webhook" --operator "jane"
#
# Cadence: anonymized on demand + as a pre-release step (promote-staging-to-prod.md); real mode
# only for a specific, approved validation window.
set -euo pipefail
IFS=$'\n\t'
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."   # -> lab-stack/
# shellcheck disable=SC1091
. scripts/_lib.sh

ENVF="../.env"
PROD_APP="${PROD_APP:-the-lab-production}"
STAGING_APP="${STAGING_APP:-the-lab-staging}"
STAGING_DB="${STAGING_DB:-thelab_staging}"
SSH_HOST="${SSH_HOST:-fablab-prod}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/fablab_deploy}"
# Max real-data window (hours). A constant/env cap: real PII must never linger — keep it short.
MAX_REAL_WINDOW_HOURS="${STAGING_REAL_MAX_WINDOW_HOURS:-48}"

info() { printf '  %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# --- argument parsing -----------------------------------------------------------------------
# Default is anonymized. Real mode is opt-in and must carry a valid, unexpired, within-cap window
# plus audit fields; anything short of that degrades to anonymized (fail closed to safe).
YES=0; REAL=0; REAL_UNTIL=""; REAL_REASON=""; REAL_OPERATOR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --yes)             YES=1;;
    --real-data)       REAL=1;;
    --until)           REAL_UNTIL="${2:-}"; shift;;
    --reason)          REAL_REASON="${2:-}"; shift;;
    --operator)        REAL_OPERATOR="${2:-}"; shift;;
    --keep-notifications) : ;;  # accepted for backward compatibility (no-op here)
    *) die "unknown argument: $1";;
  esac
  shift
done
[ "$YES" = "1" ] || die "refusing to run without --yes (this DROPS and rebuilds $STAGING_DB)"

# Validate a real-mode request. On ANY problem, fall back to anonymized (never real) with a loud
# banner so the operator knows their real request was rejected. This is the fail-closed default.
REAL_REQUESTED=0
if [ "$REAL" = "1" ]; then
  REAL_REQUESTED=1
  reject_real() { warn "REAL-DATA MODE REJECTED: $1"; warn "proceeding ANONYMIZED (fail closed)."; REAL=0; }
  now_s="$(date -u +%s)"
  cap_s=$(( now_s + MAX_REAL_WINDOW_HOURS * 3600 ))
  if [ -z "$REAL_OPERATOR" ]; then reject_real "--operator is required (audit)"
  elif [ -z "$REAL_REASON" ]; then reject_real "--reason is required (audit)"
  elif [ -z "$REAL_UNTIL" ]; then reject_real "--until is required"
  elif ! until_s="$(date -u -d "$REAL_UNTIL" +%s 2>/dev/null)"; then reject_real "--until is not a parseable ISO-8601 timestamp: $REAL_UNTIL"
  elif [ "$until_s" -le "$now_s" ]; then reject_real "--until is in the past"
  elif [ "$until_s" -gt "$cap_s" ]; then reject_real "--until exceeds the ${MAX_REAL_WINDOW_HOURS}h window cap"
  # Injection defense (CWE-78): keep audit fields to a safe charset even though they travel via a
  # JSON stdin channel (not argv). Reject quotes/backticks/$/;/control chars outright.
  elif printf '%s' "$REAL_OPERATOR" | LC_ALL=C grep -q '[^A-Za-z0-9 ._@-]'; then reject_real "--operator has disallowed characters (allow: A-Za-z0-9 space . _ @ -)"
  elif printf '%s' "$REAL_REASON" | LC_ALL=C grep -q '[^A-Za-z0-9 ._,:#()/@-]'; then reject_real "--reason has disallowed characters"
  fi
fi

COOLIFY_URL="${COOLIFY_URL:-$(env_get "$ENVF" COOLIFY_URL)}"
COOLIFY_TOKEN="${COOLIFY_TOKEN:-$(env_get "$ENVF" COOLIFY_TOKEN)}"
STAGING_PW="$(env_get "$ENVF" MONGO_APP_PASSWORD_STAGING)"
if [ -z "$COOLIFY_URL" ] || [ -z "$COOLIFY_TOKEN" ]; then
  die "COOLIFY_URL / COOLIFY_TOKEN missing from $ENVF"
fi
[ -n "$STAGING_PW" ] || die "MONGO_APP_PASSWORD_STAGING missing from $ENVF (run make secrets)"
command -v jq >/dev/null || die "jq is required"

api() { curl -sS -H "Authorization: Bearer $COOLIFY_TOKEN" -H 'Content-Type: application/json' "$COOLIFY_URL/api/v1/$1"; }

# --- resolve both applications by NAME ------------------------------------------------------
apps="$(api applications)"
prod_uuid="$(printf '%s' "$apps" | jq -r --arg n "$PROD_APP" '.[]?|select(.name==$n)|.uuid' | head -1)"
stg_uuid="$(printf '%s' "$apps" | jq -r --arg n "$STAGING_APP" '.[]?|select(.name==$n)|.uuid' | head -1)"
[ -n "$prod_uuid" ] || die "application '$PROD_APP' not found in Coolify"
[ -n "$stg_uuid" ] || die "application '$STAGING_APP' not found in Coolify"
info "production app: $prod_uuid   staging app: $stg_uuid"

# Production's URI is read from Coolify rather than kept anywhere on disk, and is never printed.
PROD_URI="$(api "applications/$prod_uuid/envs" | jq -r '.[]?|select(.key=="MONGODB_URI")|(.real_value // .value)' | head -1)"
[ -n "$PROD_URI" ] || die "could not read MONGODB_URI from $PROD_APP"
case "$PROD_URI" in *"$STAGING_DB"*) die "production URI points at $STAGING_DB — refusing (would copy staging onto itself)";; esac
info "read production MONGODB_URI from Coolify (not printed, not written to disk)"

# Real mode only: read the PRODUCTION ENCRYPTION_KEY transiently, the same way as PROD_URI — from
# Coolify, never printed, never written to staging's env or to disk. It is used solely to DECRYPT
# prod PII in the container (re-key), passed over STDIN below, and shredded from memory after.
PROD_ENC_KEY=""
if [ "$REAL" = "1" ]; then
  PROD_ENC_KEY="$(api "applications/$prod_uuid/envs" | jq -r '.[]?|select(.key=="ENCRYPTION_KEY")|(.real_value // .value)' | head -1)"
  if [ -z "$PROD_ENC_KEY" ]; then
    warn "REAL-DATA MODE REJECTED: could not read production ENCRYPTION_KEY from Coolify"
    warn "proceeding ANONYMIZED (fail closed)."
    REAL=0
  else
    info "read production ENCRYPTION_KEY from Coolify (not printed, not written to disk)"
  fi
fi

# The container name is the staging app uuid prefix; resolve it live so a redeploy cannot stale it.
SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes "deploy@$SSH_HOST")
CN="$("${SSH[@]}" "docker ps --format '{{.Names}}' | grep '^$stg_uuid' | head -1" | tr -d '\r')"
[ -n "$CN" ] || die "no running container found for staging app $stg_uuid"
info "staging container: $CN"

STAGING_URI="mongodb://thelab_staging_app:${STAGING_PW}@fablab-mongo:27017/${STAGING_DB}?authSource=${STAGING_DB}"

# --- dump production, restore into staging --------------------------------------------------
# The archive is streamed through the VPS's /tmp and shredded; --nsInclude keeps a whole-instance
# archive from ever touching another database (the trap that bit mongo-restore-drill.sh).
info "dumping production and restoring into $STAGING_DB (this DROPS $STAGING_DB) ..."
# The production URI goes over STDIN into a root-only file, never in the remote command line:
# anything on argv is visible in `ps` to every user on the VPS (shellcheck SC2097/SC2098 pointed at
# the earlier version, which did exactly that). The remote script shreds it on exit.
printf '%s' "$PROD_URI" | "${SSH[@]}" 'sudo sh -c "umask 077; cat > /root/.refresh-uri"' \
  || die "could not stage the production URI on $SSH_HOST"
"${SSH[@]}" "sudo SDB='$STAGING_DB' bash -s" <<'REMOTE'
set -euo pipefail
umask 077
trap 'shred -u /root/.refresh-uri 2>/dev/null || rm -f /root/.refresh-uri' EXIT
PU="$(cat /root/.refresh-uri)"
. /opt/fablab/mongodb/mongo.env
RURI="$(RU="$MONGO_INITDB_ROOT_USERNAME" RP="$MONGO_INITDB_ROOT_PASSWORD" python3 -c '
import os, urllib.parse
print("mongodb://%s:%s@fablab-mongo:27017/?authSource=admin" % (os.environ["RU"], urllib.parse.quote(os.environ["RP"], safe="")))')"
SRC_DB="$(printf '%s' "$PU" | sed -n 's#.*/\([^/?]*\)?.*#\1#p')"
TMP="$(mktemp /tmp/refresh-XXXXXX.gz)"
trap 'shred -u "$TMP" 2>/dev/null || rm -f "$TMP"' EXIT
docker run --rm -e U="$PU" mongo:8.0 sh -c 'mongodump --uri="$U" --archive --gzip' > "$TMP" 2>/dev/null
[ -s "$TMP" ] || { echo "ERROR: production dump was empty" >&2; exit 1; }
echo "    dump: $(stat -c %s "$TMP") bytes from db '$SRC_DB'"
docker run --rm -i --network fablab -e U="$RURI" mongo:8.0 sh -c \
  "mongorestore --uri=\"\$U\" --archive --gzip --drop --nsInclude=\"$SRC_DB.*\" --nsFrom=\"$SRC_DB.*\" --nsTo=\"$SDB.*\"" \
  < "$TMP" 2>&1 | tail -1 | sed 's/^/    /'
shred -u /root/.refresh-uri 2>/dev/null || rm -f /root/.refresh-uri
REMOTE

# Do not trust the remote trap: verify the staged credential is really gone, and remove it if not.
if "${SSH[@]}" 'sudo test -f /root/.refresh-uri' 2>/dev/null; then
  "${SSH[@]}" 'sudo sh -c "shred -u /root/.refresh-uri 2>/dev/null || rm -f /root/.refresh-uri"' || true
  info "staged production URI removed (the remote trap had not fired)"
fi
"${SSH[@]}" 'sudo test ! -f /root/.refresh-uri' \
  || die "the production URI is STILL on $SSH_HOST at /root/.refresh-uri — remove it manually"
info "verified: no production credential left on $SSH_HOST"

# --- anonymize INSIDE the staging container (its ENCRYPTION_KEY, its crypto scheme) ----------
# Ship THIS checkout's anonymizer into the container rather than relying on the deployed image
# containing it: the image may predate the script, and even when it does contain it, running the
# repo copy guarantees the logic that just passed review is the logic that runs.
ANON_SRC="../lab-site/the-lab/scripts/anonymize-staging.js"
[ -f "$ANON_SRC" ] || die "anonymizer not found at $ANON_SRC"
info "copying the anonymizer into $CN ..."
scp -q -i "$SSH_KEY" -o BatchMode=yes "$ANON_SRC" "deploy@$SSH_HOST:/tmp/anonymize-staging.js" \
  || die "could not copy the anonymizer to $SSH_HOST"
# Must land in /app, not /tmp: node resolves bare imports (mongodb) from the script's directory
# upward, and only /app has node_modules. A dotted name avoids clobbering a deployed copy.
"${SSH[@]}" "docker cp /tmp/anonymize-staging.js $CN:/app/.anonymize-staging.run.js" >/dev/null \
  || die "could not copy the anonymizer into $CN"

if [ "$REAL" = "1" ]; then
  # REAL-DATA MODE: re-key member PII from prod ciphertext to staging ciphertext.
  # The prod ENCRYPTION_KEY + audit metadata go to the container over STDIN as one JSON line (jq
  # builds it with safe escaping). The key reaches jq via the ENVIRONMENT and reaches ssh via a
  # `printf` (a builtin) pipe — so it is never on any process argv (invisible in `ps`), never a
  # file, never a log. STAGING_URI (staging password) is still passed via -e (pre-existing, staging-only).
  info "RE-KEYING real production data into $STAGING_DB inside $CN (time-boxed, audited) ..."
  # The prod key goes to jq via the ENVIRONMENT (env.PRODKEY), never `--arg` — a `--arg` value is on
  # jq's argv and would be visible in `ps` on this host. Env vars are not shown in `ps` argv. Operator/
  # reason/until are non-secret audit metadata, so `--arg` is fine for them.
  REAL_STDIN="$(PRODKEY="$PROD_ENC_KEY" jq -cn --arg o "$REAL_OPERATOR" --arg r "$REAL_REASON" --arg u "$REAL_UNTIL" \
    '{prodKey: env.PRODKEY, operator:$o, reason:$r, until:$u}')"
  set +e
  out="$(printf '%s' "$REAL_STDIN" | "${SSH[@]}" "docker exec -i -e MONGODB_URI='$STAGING_URI' -e STAGING_REAL_MAX_WINDOW_HOURS='$MAX_REAL_WINDOW_HOURS' $CN node /app/.anonymize-staging.run.js --yes --real" 2>&1)"
  rc=$?
  set -e
  # Wipe the transient key material from this shell's memory as soon as it has been handed off.
  REAL_STDIN=""; PROD_ENC_KEY=""; unset REAL_STDIN PROD_ENC_KEY
  printf '%s\n' "$out" | sed 's/^/    /'
  [ "$rc" -eq 0 ] || die "REAL-DATA RUN FAILED — $STAGING_DB is unsafe. Do not use it (re-run to anonymize)."
  # The node script keeps staging SAFE on any real-mode failure by scrubbing to anonymized (exit 0
  # == verified-safe). But that means a wrong prod key silently downgrades — enforce operator INTENT
  # here: if the success marker is absent, real was NOT applied. Staging is anonymized (safe), but
  # the operator asked for real and must know.
  if ! printf '%s' "$out" | grep -q 'REAL-DATA MODE ACTIVE'; then
    die "REAL-DATA MODE WAS NOT APPLIED (see output above) — staging was left ANONYMIZED. Check the production ENCRYPTION_KEY / window and re-run."
  fi
  info "done: $STAGING_DB refreshed with REAL production data (re-keyed to staging)"
  info "This window auto-reverts to anonymized at $REAL_UNTIL (staging-data-mode-revert.sh + scheduled task)."
  info "Staging is internet-reachable — keep the window short and restrict access during it."
else
  info "anonymizing $STAGING_DB inside $CN ..."
  if ! "${SSH[@]}" "docker exec -e MONGODB_URI='$STAGING_URI' $CN node /app/.anonymize-staging.run.js --yes" 2>&1 | sed 's/^/    /'; then
    die "ANONYMIZATION FAILED — $STAGING_DB still contains production personal data. Do not use it."
  fi
  if [ "$REAL_REQUESTED" = "1" ]; then
    warn "real-data mode was requested but rejected earlier — staging is ANONYMIZED (see warnings above)."
  fi
  info "done: $STAGING_DB refreshed from production and anonymized"
  info "staging accounts: member<N>@staging.invalid / password 'staging-only-password'"
fi
