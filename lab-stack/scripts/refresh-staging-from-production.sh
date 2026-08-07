#!/usr/bin/env bash
# Refresh the STAGING database from PRODUCTION, anonymized (fablab #107 phase 2).
#
#   dump production (read-only)  ->  restore into thelab_staging  ->  ANONYMIZE  ->  verify
#
# Copying production into staging is forbidden unless the personal data is irreversibly replaced
# (master §5, the-lab CLAUDE.md §8). It is also BROKEN without anonymizing: production and staging
# use different ENCRYPTION_KEYs, so prod-encrypted emails cannot be decrypted or matched by staging
# and every email/login flow silently fails for copied users. The anonymizer rewrites emails/phones
# to synthetic values encrypted under STAGING's own key, and FAILS CLOSED if any real-looking
# personal data survives — this script propagates that failure.
#
# Apps are resolved BY NAME through the Coolify API (never hardcoded uuids), matching reconcile.sh.
# Run from lab-stack/. Usage:
#   bash scripts/refresh-staging-from-production.sh --yes [--keep-notifications]
#
# Cadence: on demand, and as a pre-release step in docs/runbooks/promote-staging-to-prod.md.
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

info() { printf '  %s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ "${1:-}" = "--yes" ] || die "refusing to run without --yes (this DROPS and rebuilds $STAGING_DB)"

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
ANON_SRC="../lab-site/the-lab/scripts/anonymize-staging.mjs"
[ -f "$ANON_SRC" ] || die "anonymizer not found at $ANON_SRC"
info "copying the anonymizer into $CN ..."
scp -q -i "$SSH_KEY" -o BatchMode=yes "$ANON_SRC" "deploy@$SSH_HOST:/tmp/anonymize-staging.mjs" \
  || die "could not copy the anonymizer to $SSH_HOST"
# Must land in /app, not /tmp: node resolves bare imports (mongodb) from the script's directory
# upward, and only /app has node_modules. A dotted name avoids clobbering a deployed copy.
"${SSH[@]}" "docker cp /tmp/anonymize-staging.mjs $CN:/app/.anonymize-staging.run.mjs" >/dev/null \
  || die "could not copy the anonymizer into $CN"

info "anonymizing $STAGING_DB inside $CN ..."
if ! "${SSH[@]}" "docker exec -e MONGODB_URI='$STAGING_URI' $CN node /app/.anonymize-staging.run.mjs --yes" 2>&1 | sed 's/^/    /'; then
  die "ANONYMIZATION FAILED — $STAGING_DB still contains production personal data. Do not use it."
fi

info "done: $STAGING_DB refreshed from production and anonymized"
info "staging accounts: member<N>@staging.invalid / password 'staging-only-password'"
