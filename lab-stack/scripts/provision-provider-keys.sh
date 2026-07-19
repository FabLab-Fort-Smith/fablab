#!/usr/bin/env bash
# Provision provider credentials that CAN be created via a provider API (Tier 2 — ADR 0015),
# given a scoped ADMIN token, writing the results into ../.env (source-safe) for storage in the
# shared vault. Tier 1 (self-generated) is `gen-secrets.sh`; Tier 3 (console-only: Google/Discord/
# Square OAuth apps, classic reCAPTCHA) is the manual checklist in docs/runbooks/provider-provisioning.md.
#
# Usage:
#   provision-provider-keys.sh list                 # show the registry (what's automatable + token needed)
#   provision-provider-keys.sh turnstile [--dry-run] # create/ensure a Cloudflare Turnstile widget
#
# Config (from ../.env or env; admin tokens are least-privilege, vault-held, NEVER committed):
#   CLOUDFLARE_ACCOUNT_ID           the CF account
#   CF_TURNSTILE_TOKEN              a token with **Turnstile:Edit** (separate from the DNS/Access tokens)
#   TURNSTILE_DOMAINS              comma-sep domains for the widget (default: staging + preview + apex)
#   TURNSTILE_WIDGET_NAME         widget name (default: fablab)
# Secret VALUES are never printed (only key names). `curl` is overridable via PROVISION_CURL (tests).
set -euo pipefail
IFS=$'\n\t'
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."   # -> lab-stack/
# shellcheck disable=SC1091  # _lib.sh is a sibling script, linted separately
. scripts/_lib.sh

ENVF="../.env"
CURL="${PROVISION_CURL:-curl}"
CF="https://api.cloudflare.com/client/v4"
info(){ printf '  %s\n' "$*"; }
die(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }
# env_get (quote-tolerant read) + shq (source-safe single-quote write) come from _lib.sh.

# --- registry (documents every provider + tier; `list` prints it) ---
# name|tier|creates|output env keys|admin token env|status
REGISTRY='Cloudflare Turnstile|2|anti-bot widget|NEXT_PUBLIC_TURNSTILE_SITE_KEY,TURNSTILE_SECRET_KEY|CF_TURNSTILE_TOKEN|implemented
Cloudflare API token|2|scoped API token|(per use)|CF_TOKEN_ADMIN|planned
Tailscale auth key|2|tailnet auth key|TAILSCALE_AUTHKEY|TAILSCALE_API_KEY|planned
ZeroTier member auth|2|network member authorize|(node)|ZEROTIER_CENTRAL_TOKEN|planned
PurelyMail mailbox|2|member mailbox|(per user)|PURELYMAIL_API_TOKEN|via plugin adapter
S3/object-store key|2|access key pair|S3_ACCESS_KEY,S3_SECRET_KEY|(store admin)|planned
Google OAuth client|3|OAuth client|GOOGLE_CLIENT_ID/SECRET|— console-only|manual
Discord OAuth app|3|OAuth app|DISCORD_CLIENT_ID/SECRET|— console-only|manual
Square app|3|app + tokens|SQUARE_*|— console-only|manual
classic reCAPTCHA|3|keys (DEPRECATED)|→ replaced by Turnstile (ADR 0015)|— console-only|deprecated'

cmd_list(){
  printf '  %-24s %-4s %-22s %-24s %s\n' PROVIDER TIER CREATES "ADMIN TOKEN (env)" STATUS
  printf '  %s\n' "$(printf '%.0s-' {1..96})"
  printf '%s\n' "$REGISTRY" | while IFS='|' read -r name tier creates _out token status; do
    local present=""
    case "$token" in CF_*|TAILSCALE_*|ZEROTIER_*|PURELYMAIL_*)
      [ -n "$(env_get "$ENVF" "$token")" ] && present=" ✓token" || present=" (no token)";; esac
    printf '  %-24s T%-3s %-22s %-24s %s%s\n' "$name" "$tier" "$creates" "$token" "$status" "$present"
  done
  echo
  info "Tier 2 = run this tool (needs the admin token). Tier 3 = docs/runbooks/provider-provisioning.md."
}

# token via -K stdin (off argv); JSON body via a temp file (off argv)
cf_api(){ # cf_api TOKEN METHOD URL [JSON] -> body on stdout
  local tok="$1" method="$2" url="$3" json="${4:-}" cfg bf="" out
  cfg="$(mktemp)"
  # `|| true`: never abort under `set -e` on a curl transport error (timeout/DNS/connect) — the
  # temp cfg holds the token, so cleanup MUST run; the caller fails closed on the empty body.
  trap 'rm -f "$cfg" "${bf:-}"' RETURN
  { printf 'header = "Authorization: Bearer %s"\n' "$tok"
    printf 'header = "Content-Type: application/json"\n'; } > "$cfg"
  if [ -n "$json" ]; then bf="$(mktemp)"; printf '%s' "$json" > "$bf"
    out="$("$CURL" -sS --max-time 30 -K "$cfg" -X "$method" --data-binary @"$bf" "$url" || true)"
  else out="$("$CURL" -sS --max-time 30 -K "$cfg" -X "$method" "$url" || true)"; fi
  printf '%s' "$out"
}

cmd_turnstile(){
  local dry="${1:-}"
  local aid tok name domains
  aid="$(env_get "$ENVF" CLOUDFLARE_ACCOUNT_ID)"; [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && aid="$CLOUDFLARE_ACCOUNT_ID"
  tok="${CF_TURNSTILE_TOKEN:-$(env_get "$ENVF" CF_TURNSTILE_TOKEN)}"
  name="${TURNSTILE_WIDGET_NAME:-$(env_get "$ENVF" TURNSTILE_WIDGET_NAME)}"; [ -n "$name" ] || name="fablab"
  domains="${TURNSTILE_DOMAINS:-$(env_get "$ENVF" TURNSTILE_DOMAINS)}"
  [ -n "$domains" ] || domains="staging.fablabfortsmith.org,fablabfortsmith.org,www.fablabfortsmith.org"
  [ -n "$aid" ] || die "CLOUDFLARE_ACCOUNT_ID not set (needed for the Turnstile API)."
  local dj; dj="$(printf '%s' "$domains" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep . | jq -R . | jq -sc .)"

  if [ "$dry" = "--dry-run" ]; then
    info "would ensure Turnstile widget '$name' for domains: $domains"
    info "  -> writes NEXT_PUBLIC_TURNSTILE_SITE_KEY (build) + TURNSTILE_SECRET_KEY (runtime) to $ENVF"
    info "  (needs CF_TURNSTILE_TOKEN with Turnstile:Edit; token present: $([ -n "$tok" ] && echo yes || echo NO))"
    return 0
  fi
  [ -n "$tok" ] || die "CF_TURNSTILE_TOKEN not set — needs a Cloudflare token with Turnstile:Edit."

  # idempotent: reuse an existing widget of this name, else create
  local list sitekey
  list="$(cf_api "$tok" GET "$CF/accounts/$aid/challenges/widgets?per_page=100")"
  printf '%s' "$list" | jq -e '.success==true' >/dev/null 2>&1 \
    || die "listing Turnstile widgets failed: $(printf '%s' "$list" | jq -rc '.errors')"
  sitekey="$(printf '%s' "$list" | jq -r --arg n "$name" '.result[]?|select(.name==$n)|.sitekey' | head -1)"

  local resp secret
  if [ -n "$sitekey" ]; then
    # The widget exists. Cloudflare only returns the secret on create/rotate (never on GET), and a
    # rotate has a 2h grace window + forces an app redeploy with the new secret — so rotate ONLY if
    # we don't already hold it. Re-running when we do is a genuine no-op (no gratuitous rotation).
    if [ -n "$(env_get "$ENVF" TURNSTILE_SECRET_KEY)" ]; then
      info "widget '$name' exists (sitekey ${sitekey:0:8}…) and TURNSTILE_SECRET_KEY is already stored — nothing to do."
      return 0
    fi
    info "widget '$name' exists (sitekey ${sitekey:0:8}…) but no stored secret; rotating once to capture it (2h grace)"
    resp="$(cf_api "$tok" POST "$CF/accounts/$aid/challenges/widgets/$sitekey/rotate_secret" '{"invalidate_immediately":false}')"
  else
    info "creating Turnstile widget '$name'"
    resp="$(cf_api "$tok" POST "$CF/accounts/$aid/challenges/widgets" \
      "$(jq -n --arg n "$name" --argjson d "$dj" '{name:$n, domains:$d, mode:"managed"}')")"
    sitekey="$(printf '%s' "$resp" | jq -r '.result.sitekey // empty')"
  fi
  printf '%s' "$resp" | jq -e '.success==true' >/dev/null 2>&1 \
    || die "Turnstile create/rotate failed: $(printf '%s' "$resp" | jq -rc '.errors')"
  [ -n "$sitekey" ] || sitekey="$(printf '%s' "$resp" | jq -r '.result.sitekey // empty')"
  secret="$(printf '%s' "$resp" | jq -r '.result.secret // empty')"
  if [ -z "$sitekey" ] || [ -z "$secret" ]; then die "did not receive both sitekey and secret from Cloudflare."; fi

  [ -f "$ENVF" ] && { cp -a "$ENVF" "$ENVF.bak"; chmod 600 "$ENVF.bak"; }
  env_set "$ENVF" NEXT_PUBLIC_TURNSTILE_SITE_KEY "$(shq "$sitekey")"
  env_set "$ENVF" TURNSTILE_SECRET_KEY "$(shq "$secret")"
  unset resp secret
  info "wrote NEXT_PUBLIC_TURNSTILE_SITE_KEY (public, ${sitekey:0:8}…) + TURNSTILE_SECRET_KEY (hidden) to $ENVF"
  info "next: add both to the vault + the staging Coolify app (site key = BUILD var), rebuild; drop the reCAPTCHA vars."
}

case "${1:-list}" in
  list)      cmd_list ;;
  turnstile) shift; cmd_turnstile "${1:-}" ;;
  *)         die "unknown command '${1:-}'. Use: list | turnstile [--dry-run]" ;;
esac
