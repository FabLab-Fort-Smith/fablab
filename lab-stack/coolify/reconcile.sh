#!/usr/bin/env bash
# Idempotent, API-driven reconciliation of the Coolify application for The-Lab.
# Config-as-code: the DESIRED STATE is declared below; connection + secrets come from ../.env.
# Talks to the Coolify API over the tailnet (COOLIFY_URL). Re-runnable. Prints the API response on
# any failure. Deploys are GATED behind --deploy (an action); config/env changes run by default.
#
# Usage:  bash coolify/reconcile.sh [--dry-run] [--deploy]
#   --dry-run  show what WOULD change (discover + plan); make no writes
#   --deploy   after reconciling, trigger a deployment of the app
# Requires: jq, curl. Reads COOLIFY_URL + COOLIFY_TOKEN from ../.env (token is Sanctum id|secret).
set -uo pipefail
IFS=$'\n\t'
cd "$(dirname "$0")/.." || exit 1   # -> lab-stack/
ENVF="../.env"
umask 077

DRY=0; DEPLOY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --deploy)  DEPLOY=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) printf 'unknown arg: %s\n' "$a" >&2; exit 2 ;;
  esac
done

info(){ printf '  %s\n' "$*"; }
warn(){ printf 'WARN: %s\n' "$*" >&2; }
die(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }

command -v jq >/dev/null || die "jq is required"
command -v curl >/dev/null || die "curl is required"

# --- connection (quote-safe read; token contains a shell metachar '|') ---
envval(){ [ -f "$ENVF" ] || return 0; sed -n "s/^$1=//p" "$ENVF" | head -1 | sed "s/^[\"']//; s/[\"']\$//"; }
COOLIFY_URL="$(envval COOLIFY_URL)"; COOLIFY_TOKEN="$(envval COOLIFY_TOKEN)"
if [ -z "$COOLIFY_URL" ] || [ -z "$COOLIFY_TOKEN" ]; then die "COOLIFY_URL and COOLIFY_TOKEN must be set in $ENVF"; fi

# ============================ DESIRED STATE (config-as-code) ============================
PROJECT_NAME="the-lab"                 # existing Coolify project
GITHUB_APP_NAME="fab-lab-fort-smith"   # connected GitHub App source
APP_NAME="the-lab-staging"             # the application to manage (staging: dev -> staging.)
GIT_REPOSITORY="FabLab-Fort-Smith/fablab"
GIT_BRANCH="dev"                       # staging tracks dev (prod=main added at cutover)
BUILD_PACK="dockerfile"
BASE_DIRECTORY="/lab-site/the-lab"     # monorepo subdir (ADR 0005)
DOCKERFILE_LOCATION="/Dockerfile"      # relative to BASE_DIRECTORY
PORTS_EXPOSES="3000"                   # Next.js standalone (Dockerfile EXPOSE 3000)
DOMAINS="https://staging.fablabfortsmith.org"
PRIMARY_DOMAIN="fablabfortsmith.org"
# Per-PR preview URL. SINGLE-label host under the apex so Cloudflare Universal SSL's
# *.fablabfortsmith.org edge cert covers it (a 2-level *.preview.<domain> would need ACM/Enterprise).
# A GitHub Action (.github/workflows/preview-dns.yml) creates a matching PROXIED CF record per PR,
# so previews flow through Cloudflare (origin firewall stays Cloudflare-only) and Traefik gets an
# LE cert via HTTP-01 through CF. {{pr_id}} is Coolify's PR-number token.
# NOTE: Coolify v4.1.2's API does NOT accept this field on create/update (it's response-only), so
# it is a one-time UI step — set it in the app's Preview Deployments settings to the value below.
# See coolify/README.md §6. We print it here for reference and to keep the desired value declared.
PREVIEW_URL_TEMPLATE="pr-{{pr_id}}-preview.${PRIMARY_DOMAIN}"
# App env keys to sync into Coolify (VALUES read from ../.env; empty ones are skipped + warned).
# REQUIRED mirrors The-Lab's src/lib/env.js REQUIRED_ENV (the boot gate); keep in sync with it.
APP_ENV_REQUIRED=(MONGODB_URI AUTH_SECRET JWT_SECRET ENCRYPTION_KEY INTERNAL_API_SECRET SOCKET_API_SECRET SQUARE_ACCESS_TOKEN SQUARE_WEBHOOK_SIGNATURE_KEY)
# Feature/provider keys — synced if present, not boot-blocking. Names match The-Lab's actual
# process.env usage (verified by grep of src/), NOT the older drifted .env.example names.
APP_ENV_OPTIONAL=(SQUARE_ENVIRONMENT SQUARE_LOCATION_ID SQUARE_SDK_VERSION NEXT_PUBLIC_SQUARE_APP_ID NEXT_PUBLIC_SQUARE_LOCATION_ID MONGODB_NAME NEXTAUTH_URL APP_URL NEXT_PUBLIC_APP_URL NEXT_PUBLIC_BASE_URL NEXT_PUBLIC_URL ADMIN_EMAIL LOG_LEVEL S3_ENDPOINT S3_REGION S3_BUCKET_NAME S3_ACCESS_KEY S3_SECRET_KEY EMAIL_USER EMAIL_PASS GEMINI_API_KEY NEXT_PUBLIC_TURNSTILE_SITE_KEY TURNSTILE_SECRET_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET DISCORD_CLIENT_ID DISCORD_CLIENT_SECRET)
# Managed CONSTANTS — fixed for the self-hosted deployment, NOT read from ../.env. Auth.js v5
# auto-trusts the host only on Vercel; off-Vercel behind Cloudflare/Traefik, AUTH_TRUST_HOST=true
# alone was NOT sufficient — Auth.js still resolved its base URL to the container bind
# (`https://0.0.0.0:3000`, from the Dockerfile HOSTNAME=0.0.0.0 healthcheck fix), so every OAuth
# signin/callback URL was wrong and SSO could not complete. Pin AUTH_URL to the public staging
# domain so callbacks/redirects are correct (@rules/topic-authn-authz.md). Each entry is "KEY=value".
# NOTE: single-env API validation wants `is_buildtime`/`is_runtime` (not `is_build_time`).
APP_ENV_FIXED=(AUTH_TRUST_HOST=true AUTH_URL=https://staging.fablabfortsmith.org)
# =======================================================================================

# --- API helper: token via -K stdin (off argv); body via a 0600 temp file (off argv).
# The HTTP status is written to a FILE (not a var) so it survives command substitution. ---
API_CODE_FILE="$(mktemp)"
trap 'rm -f "$API_CODE_FILE"' EXIT
api(){  # api METHOD PATH [JSON_STRING] -> body on stdout; HTTP code -> $API_CODE_FILE
  local method="$1" path="$2" json="${3:-}" cfg bf out
  cfg="$(mktemp)"; bf=""
  {
    printf 'url = "%s/api/v1/%s"\n' "$COOLIFY_URL" "$path"
    printf 'request = "%s"\n' "$method"
    printf 'header = "Authorization: Bearer %s"\n' "$COOLIFY_TOKEN"
    printf 'header = "Accept: application/json"\n'
  } > "$cfg"
  if [ -n "$json" ]; then
    bf="$(mktemp)"; printf '%s' "$json" > "$bf"
    printf 'header = "Content-Type: application/json"\n' >> "$cfg"
    out="$(curl -sS --max-time 60 -K "$cfg" --data-binary @"$bf" -w '\n%{http_code}')"
  else
    out="$(curl -sS --max-time 30 -K "$cfg" -w '\n%{http_code}')"
  fi
  rm -f "$cfg" "$bf"
  printf '%s' "${out##*$'\n'}" > "$API_CODE_FILE"
  printf '%s' "${out%$'\n'*}"
}
ok2xx(){ case "$(cat "$API_CODE_FILE" 2>/dev/null)" in 2*) return 0 ;; *) return 1 ;; esac; }
code(){ cat "$API_CODE_FILE" 2>/dev/null; }

# --- discover UUIDs by name (portable + idempotent) ---
echo "== discover =="
PROJECT_UUID="$(api GET projects | jq -r --arg n "$PROJECT_NAME" '.[]?|select(.name==$n)|.uuid' | head -1)"
[ -n "$PROJECT_UUID" ] || die "project '$PROJECT_NAME' not found (HTTP $(code)) — create it in Coolify first"
SERVER_UUID="$(api GET servers | jq -r '.[]?|select(.is_coolify_host==true)|.uuid' | head -1)"
[ -n "$SERVER_UUID" ] || die "could not find the Coolify host server (HTTP $(code))"
GITHUB_APP_UUID="$(api GET github-apps | jq -r --arg n "$GITHUB_APP_NAME" '.[]?|select(.name==$n)|.uuid' | head -1)"
[ -n "$GITHUB_APP_UUID" ] || die "GitHub App '$GITHUB_APP_NAME' not found (HTTP $(code)) — connect it in Coolify → Sources"
ENVIRONMENT_NAME="$(api GET "projects/$PROJECT_UUID" | jq -r '.environments[0].name // "production"')"
info "project=$PROJECT_UUID  server=$SERVER_UUID  github_app=$GITHUB_APP_UUID  env=$ENVIRONMENT_NAME"

APP_UUID="$(api GET applications | jq -r --arg n "$APP_NAME" '.[]?|select(.name==$n)|.uuid' | head -1)"
if [ -n "$APP_UUID" ]; then info "application '$APP_NAME' exists: $APP_UUID (will update)"; else info "application '$APP_NAME' absent (will create)"; fi

# required env still missing? (computed in the parent shell, not a subshell)
missing=()
for k in "${APP_ENV_REQUIRED[@]}"; do [ -n "$(envval "$k")" ] || missing+=("$k"); done

# --- desired create/update payload ---
app_payload(){
  jq -n \
    --arg project_uuid "$PROJECT_UUID" --arg server_uuid "$SERVER_UUID" \
    --arg environment_name "$ENVIRONMENT_NAME" --arg github_app_uuid "$GITHUB_APP_UUID" \
    --arg git_repository "$GIT_REPOSITORY" --arg git_branch "$GIT_BRANCH" \
    --arg build_pack "$BUILD_PACK" --arg base_directory "$BASE_DIRECTORY" \
    --arg dockerfile_location "$DOCKERFILE_LOCATION" --arg ports_exposes "$PORTS_EXPOSES" \
    --arg domains "$DOMAINS" --arg name "$APP_NAME" \
    '{project_uuid:$project_uuid, server_uuid:$server_uuid, environment_name:$environment_name,
      github_app_uuid:$github_app_uuid, git_repository:$git_repository, git_branch:$git_branch,
      build_pack:$build_pack, base_directory:$base_directory, dockerfile_location:$dockerfile_location,
      ports_exposes:$ports_exposes, domains:$domains, name:$name, instant_deploy:false,
      is_auto_deploy_enabled:true}'
}

if [ "$DRY" -eq 1 ]; then
  echo "== DRY-RUN plan =="
  info "would $( [ -n "$APP_UUID" ] && echo PATCH || echo CREATE ) '$APP_NAME' (branch $GIT_BRANCH, base $BASE_DIRECTORY, port $PORTS_EXPOSES, domain $DOMAINS)"
  info "env keys to sync (values from $ENVF; secrets not shown):"
  for k in "${APP_ENV_REQUIRED[@]}" "${APP_ENV_OPTIONAL[@]}"; do
    printf '      %-28s %s\n' "$k" "$([ -n "$(envval "$k")" ] && echo set || echo EMPTY)"
  done
  for kv in "${APP_ENV_FIXED[@]}"; do printf '      %-28s %s\n' "${kv%%=*}" "fixed=${kv#*=}"; done
  [ "${#missing[@]}" -gt 0 ] && warn "required env EMPTY: ${missing[*]}"
  [ "$DEPLOY" -eq 1 ] && info "would then trigger a deploy"
  echo "== dry-run only; no changes made =="
  exit 0
fi

# --- create or update the application ---
if [ -z "$APP_UUID" ]; then
  echo "== create application =="
  resp="$(api POST applications/private-github-app "$(app_payload)")"
  ok2xx || die "create failed (HTTP $(code)): $resp"
  APP_UUID="$(printf '%s' "$resp" | jq -r '.uuid // empty')"
  [ -n "$APP_UUID" ] || die "create returned no uuid: $resp"
  info "created app $APP_UUID"
else
  echo "== update application settings =="
  # PATCH rejects create-only fields (project/server/environment/github_app) with 422 — omit them.
  resp="$(api PATCH "applications/$APP_UUID" "$(app_payload | jq 'del(.project_uuid,.server_uuid,.environment_name,.github_app_uuid)')")"
  ok2xx || warn "update returned HTTP $(code): $resp"
fi

# --- sync env (bulk upsert; values from ../.env) ---
echo "== sync env vars =="
# NEXT_PUBLIC_* are read in the browser and must be INLINED at BUILD → they are build-time vars
# (e.g. NEXT_PUBLIC_TURNSTILE_SITE_KEY: if it's runtime-only the Turnstile widget renders with no
# key). Everything else is runtime-only. (Coolify's bulk endpoint takes is_build_time; the
# single-env endpoint takes is_buildtime — different spellings, same concept.)
bt_for(){ case "$1" in NEXT_PUBLIC_*) printf true ;; *) printf false ;; esac; }
env_items="$(
  { for k in "${APP_ENV_REQUIRED[@]}" "${APP_ENV_OPTIONAL[@]}"; do
      v="$(envval "$k")"; [ -n "$v" ] || continue
      jq -n --arg key "$k" --arg value "$v" --argjson bt "$(bt_for "$k")" \
        '{key:$key, value:$value, is_preview:false, is_build_time:$bt}'
    done
    for kv in "${APP_ENV_FIXED[@]}"; do
      jq -n --arg key "${kv%%=*}" --arg value "${kv#*=}" --argjson bt "$(bt_for "${kv%%=*}")" \
        '{key:$key, value:$value, is_preview:false, is_build_time:$bt}'
    done
  } | jq -s '{data: .}'
)"
n="$(printf '%s' "$env_items" | jq '.data|length')"
resp="$(api PATCH "applications/$APP_UUID/envs/bulk" "$env_items")"
if ok2xx; then info "synced $n env var(s)"; else warn "env bulk sync HTTP $(code): $resp"; fi
[ "${#missing[@]}" -gt 0 ] && warn "required env still EMPTY in $ENVF (app won't boot until set): ${missing[*]}"

# --- optional deploy (gated) ---
if [ "$DEPLOY" -eq 1 ]; then
  echo "== deploy =="
  resp="$(api GET "deploy?uuid=$APP_UUID&force=false")"
  if ok2xx; then info "deploy triggered: $(printf '%s' "$resp" | jq -rc '.deployments // .message // .')"; else warn "deploy HTTP $(code): $resp"; fi
fi

echo "== done =="
info "app: $APP_NAME ($APP_UUID)  env: $ENVIRONMENT_NAME  branch: $GIT_BRANCH  domain: $DOMAINS"
info "preview URL template (set ONCE in Coolify UI — API won't accept it): $PREVIEW_URL_TEMPLATE"
info "  per-PR DNS handled by .github/workflows/preview-dns.yml (coolify/README.md §6)"
[ "$DEPLOY" -eq 1 ] || info "(no deploy; re-run with --deploy, or use docs/runbooks/redeploy-rollback.md)"
