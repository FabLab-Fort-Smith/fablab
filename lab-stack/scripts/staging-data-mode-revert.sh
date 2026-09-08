#!/usr/bin/env bash
# Auto-revert the staging data mode (fablab #107 phase 2 — real-data mode safety net).
#
# Real production data in staging is time-boxed. This is the net that guarantees it cannot outlive
# its window EVEN IF the operator forgets: it reads the `_staging_data_mode` marker and, if the real
# window has passed (or the marker is missing/malformed/tampered), re-anonymizes staging and resets
# the marker. It is a NO-OP when staging is already anonymized or the window is still active — so it
# is safe to run at any time and on a schedule.
#
# This is the OPERATOR/ad-hoc form (run from lab-stack/, resolves the container via Coolify by name,
# ships THIS checkout's anonymizer into the container). The unattended, scheduled form runs ON the
# VPS from the mongodb ansible role (see lab-stack/ansible/roles/mongodb/templates/staging-data-mode-
# revert.sh.j2 + the cron entry) and does not need Coolify or a repo checkout.
#
# No secrets are handled here: the re-anonymize uses the STAGING container's own ENCRYPTION_KEY and
# the staging MONGODB_URI (from ../.env). It never needs the production key.
#
# Usage:  bash scripts/staging-data-mode-revert.sh          # revert if expired, else no-op
#         bash scripts/staging-data-mode-revert.sh --force  # anonymize regardless of the marker
set -euo pipefail
IFS=$'\n\t'
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."   # -> lab-stack/
# shellcheck disable=SC1091
. scripts/_lib.sh

ENVF="../.env"
STAGING_APP="${STAGING_APP:-the-lab-staging}"
STAGING_DB="${STAGING_DB:-thelab_staging}"
SSH_HOST="${SSH_HOST:-fablab-prod}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/fablab_deploy}"
MAX_REAL_WINDOW_HOURS="${STAGING_REAL_MAX_WINDOW_HOURS:-48}"

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

info() { printf '  %s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

COOLIFY_URL="${COOLIFY_URL:-$(env_get "$ENVF" COOLIFY_URL)}"
COOLIFY_TOKEN="${COOLIFY_TOKEN:-$(env_get "$ENVF" COOLIFY_TOKEN)}"
STAGING_PW="$(env_get "$ENVF" MONGO_APP_PASSWORD_STAGING)"
if [ -z "$COOLIFY_URL" ] || [ -z "$COOLIFY_TOKEN" ]; then die "COOLIFY_URL / COOLIFY_TOKEN missing from $ENVF"; fi
[ -n "$STAGING_PW" ] || die "MONGO_APP_PASSWORD_STAGING missing from $ENVF (run make secrets)"
command -v jq >/dev/null || die "jq is required"

api() { curl -sS -H "Authorization: Bearer $COOLIFY_TOKEN" -H 'Content-Type: application/json' "$COOLIFY_URL/api/v1/$1"; }

stg_uuid="$(api applications | jq -r --arg n "$STAGING_APP" '.[]?|select(.name==$n)|.uuid' | head -1)"
[ -n "$stg_uuid" ] || die "application '$STAGING_APP' not found in Coolify"

SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes "deploy@$SSH_HOST")
CN="$("${SSH[@]}" "docker ps --format '{{.Names}}' | grep '^$stg_uuid' | head -1" | tr -d '\r')"
[ -n "$CN" ] || die "no running container found for staging app $stg_uuid"
info "staging container: $CN"

STAGING_URI="mongodb://thelab_staging_app:${STAGING_PW}@fablab-mongo:27017/${STAGING_DB}?authSource=${STAGING_DB}"

ANON_SRC="../lab-site/the-lab/scripts/anonymize-staging.js"
[ -f "$ANON_SRC" ] || die "anonymizer not found at $ANON_SRC"
scp -q -i "$SSH_KEY" -o BatchMode=yes "$ANON_SRC" "deploy@$SSH_HOST:/tmp/staging-data-revert.js" \
  || die "could not copy the anonymizer to $SSH_HOST"
"${SSH[@]}" "docker cp /tmp/staging-data-revert.js $CN:/app/.staging-data-revert.js" >/dev/null \
  || die "could not copy the anonymizer into $CN"

# --force anonymizes unconditionally; otherwise the node script decides from the marker (idempotent).
MODE_FLAG="--revert-if-expired"
[ "$FORCE" = "1" ] && MODE_FLAG="--yes"

info "checking staging data mode in $CN ..."
if ! "${SSH[@]}" "docker exec -e MONGODB_URI='$STAGING_URI' -e STAGING_REAL_MAX_WINDOW_HOURS='$MAX_REAL_WINDOW_HOURS' $CN node /app/.staging-data-revert.js $MODE_FLAG" 2>&1 | sed 's/^/    /'; then
  die "staging data-mode revert FAILED — treat $STAGING_DB as unsafe and re-run."
fi
info "done: staging data-mode revert check complete"
