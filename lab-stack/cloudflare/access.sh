#!/usr/bin/env bash
# Apply Cloudflare Access to the Coolify dashboard (config-as-code) — ADR 0012.
# Creates TWO path-scoped self-hosted Access applications on deploy.fablabfortsmith.org:
#   1. a /webhooks BYPASS app (so GitHub App webhooks reach Coolify — push-to-deploy),
#   2. a catch-all ALLOW app gated to the maintainer email(s) (the dashboard UI).
# Cloudflare matches the most-specific path first, so /webhooks/* bypasses while the rest is gated.
#
# Requires an ACCESS-scoped token (NOT the DNS token): Account > Access: Apps and Policies > Edit.
# Reads CF_ACCESS_TOKEN + (optional) CLOUDFLARE_ACCOUNT_ID from ../.env; resolves the account id
# from the zone via CLOUDFLARE_API_TOKEN if not set. Idempotent: skips apps whose name exists.
# Usage:  bash cloudflare/access.sh [--dry-run]
set -uo pipefail
IFS=$'\n\t'
cd "$(dirname "$0")/.." || exit 1   # -> lab-stack/
ENVF="../.env"
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1

info(){ printf '  %s\n' "$*"; }
die(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }
envval(){ [ -f "$ENVF" ] || return 0; sed -n "s/^$1=//p" "$ENVF" | head -1 | sed "s/^[\"']//; s/[\"']\$//"; }

# ===== desired state =====
APP_DOMAIN="deploy.fablabfortsmith.org"
WEBHOOK_PATH="/webhooks"                               # Coolify webhook base; bypassed (HMAC-verified)
ALLOWED_EMAILS="${ACCESS_ALLOWED_EMAILS:-john.annis@fablabfortsmith.org}"  # comma-sep maintainers
SESSION_DURATION="24h"
# =========================

CF_ACCESS_TOKEN="$(envval CF_ACCESS_TOKEN)"
[ -n "$CF_ACCESS_TOKEN" ] || die "CF_ACCESS_TOKEN not set in $ENVF (an Access:Apps-and-Policies:Edit token)"
CF="https://api.cloudflare.com/client/v4"

# token passed via -K stdin (off argv)
api(){ # api METHOD URL [JSON] ; TOKEN=CF_ACCESS_TOKEN unless $2 is 'dns'
  local method="$1" url="$2" json="${3:-}" tok="$CF_ACCESS_TOKEN" bf="" out
  local cfg; cfg="$(mktemp)"
  { printf 'url = "%s"\n' "$url"; printf 'request = "%s"\n' "$method"
    printf 'header = "Authorization: Bearer %s"\n' "$tok"
    printf 'header = "Content-Type: application/json"\n'; } > "$cfg"
  if [ -n "$json" ]; then bf="$(mktemp)"; printf '%s' "$json" > "$bf"
    out="$(curl -sS --max-time 30 -K "$cfg" --data-binary @"$bf")"
  else out="$(curl -sS --max-time 30 -K "$cfg")"; fi
  rm -f "$cfg" "$bf"; printf '%s' "$out"
}

# --- account id (from .env, else resolve from the zone with the DNS token) ---
ACCOUNT_ID="$(envval CLOUDFLARE_ACCOUNT_ID)"
if [ -z "$ACCOUNT_ID" ]; then
  ZID="$(envval CLOUDFLARE_ZONE_ID)"; DNSTOK="$(envval CLOUDFLARE_API_TOKEN)"
  if [ -z "$ZID" ] || [ -z "$DNSTOK" ]; then die "set CLOUDFLARE_ACCOUNT_ID in $ENVF (or CLOUDFLARE_ZONE_ID+CLOUDFLARE_API_TOKEN to auto-resolve)"; fi
  ACCOUNT_ID="$(curl -sS --max-time 20 -H "Authorization: Bearer $DNSTOK" "$CF/zones/$ZID" | jq -r '.result.account.id // empty')"
  [ -n "$ACCOUNT_ID" ] || die "could not resolve account id from zone $ZID"
fi
info "account=$ACCOUNT_ID  domain=$APP_DOMAIN  allow=$ALLOWED_EMAILS"

# existing apps (idempotency by name)
existing(){ api GET "$CF/accounts/$ACCOUNT_ID/access/apps?per_page=100" | jq -r --arg n "$1" '.result[]?|select(.name==$n)|.id' | head -1; }

# include rule: one {email:{email:..}} per address
email_include(){ printf '%s' "$ALLOWED_EMAILS" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | jq -R '{email:{email:.}}' | jq -s '.'; }

ensure_app(){ # ensure_app NAME DOMAIN DECISION [require_mfa]
  local name="$1" domain="$2" decision="$3" mfa="${4:-}" id inc pol body
  id="$(existing "$name")"
  if [ -n "$id" ]; then info "app '$name' exists ($id) — leaving as-is"; return 0; fi
  if [ "$decision" = bypass ]; then inc='[{"everyone":{}}]'; else inc="$(email_include)"; fi
  local req='[]'; [ "$mfa" = mfa ] && req='[{"auth_method":{"auth_method":"mfa"}}]'
  pol="$(jq -n --arg name "$name policy" --arg d "$decision" --argjson inc "$inc" --argjson req "$req" \
        '{name:$name, decision:$d, include:$inc, require:$req, precedence:1}')"
  body="$(jq -n --arg name "$name" --arg dom "$domain" --arg sd "$SESSION_DURATION" --argjson pol "[$pol]" \
        '{name:$name, domain:$dom, type:"self_hosted", session_duration:$sd, app_launcher_visible:false, policies:$pol}')"
  if [ "$DRY" -eq 1 ]; then info "would CREATE Access app '$name' (domain=$domain decision=$decision)"; return 0; fi
  local resp; resp="$(api POST "$CF/accounts/$ACCOUNT_ID/access/apps" "$body")"
  if printf '%s' "$resp" | jq -e '.success==true' >/dev/null 2>&1; then
    info "created Access app '$name' ($(printf '%s' "$resp" | jq -r '.result.id'))"
  else
    die "create '$name' failed: $(printf '%s' "$resp" | jq -rc '.errors // .')"
  fi
}

# webhook bypass app must be MORE specific (path) so it wins over the catch-all
ensure_app "coolify-webhooks (bypass)" "$APP_DOMAIN$WEBHOOK_PATH" bypass
ensure_app "coolify-dashboard" "$APP_DOMAIN" allow mfa

echo "== done =="
info "Verify: the dashboard prompts for Access login; $APP_DOMAIN$WEBHOOK_PATH is NOT challenged (push-to-deploy intact)."
info "Zero Trust must be enabled with an IdP (built-in one-time PIN works). Tune emails via ACCESS_ALLOWED_EMAILS."
