#!/usr/bin/env bash
# Create/update the Cloudflare DNS records for the VPS (dashboard + staging + preview).
# Does NOT touch the apex/www — production stays on Vercel until the gated cutover.
# Idempotent. Requires: curl, jq. Env (from ../.env or your shell):
#   CLOUDFLARE_API_TOKEN  (scoped Zone > DNS > Edit)
#   LAB_PRIMARY_DOMAIN    (e.g. fablabfortsmith.org)
#   LAB_VPS_HOST          (the VPS public IP)
#   [CLOUDFLARE_ZONE_ID]  (optional; auto-resolved from the domain otherwise)
set -euo pipefail
IFS=$'\n\t'

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (scoped Zone > DNS > Edit)}"
: "${LAB_PRIMARY_DOMAIN:?set LAB_PRIMARY_DOMAIN (e.g. fablabfortsmith.org)}"
: "${LAB_VPS_HOST:?set LAB_VPS_HOST (the VPS public IP)}"
command -v jq >/dev/null || { echo "jq is required"; exit 1; }

API="https://api.cloudflare.com/client/v4"
AUTH=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json")
cf() { curl -fsS "${AUTH[@]}" "$@"; }

zone_id="${CLOUDFLARE_ZONE_ID:-}"
if [ -z "${zone_id}" ]; then
  zone_id="$(cf "${API}/zones?name=${LAB_PRIMARY_DOMAIN}" | jq -r '.result[0].id // empty')"
fi
[ -n "${zone_id}" ] || { echo "✖ could not resolve zone id for ${LAB_PRIMARY_DOMAIN}"; exit 1; }
echo "• zone ${LAB_PRIMARY_DOMAIN} = ${zone_id}"

# upsert <fqdn> <ip> <proxied:true|false>
upsert() {
  local name="$1" ip="$2" proxied="$3" payload existing rec_id
  payload="$(jq -nc --arg n "$name" --arg c "$ip" --argjson p "$proxied" \
    '{type:"A",name:$n,content:$c,proxied:$p,ttl:1}')"
  existing="$(cf "${API}/zones/${zone_id}/dns_records?type=A&name=${name}")"
  rec_id="$(echo "$existing" | jq -r '.result[0].id // empty')"
  if [ -n "$rec_id" ]; then
    cf -X PUT "${API}/zones/${zone_id}/dns_records/${rec_id}" --data "$payload" >/dev/null
    echo "  ✓ updated ${name} → ${ip} (proxied=${proxied})"
  else
    cf -X POST "${API}/zones/${zone_id}/dns_records" --data "$payload" >/dev/null
    echo "  ✓ created ${name} → ${ip} (proxied=${proxied})"
  fi
}

echo "• upserting VPS records (apex/www left untouched — Vercel stays production):"
upsert "deploy.${LAB_PRIMARY_DOMAIN}"  "${LAB_VPS_HOST}" true
upsert "staging.${LAB_PRIMARY_DOMAIN}" "${LAB_VPS_HOST}" true
# NOTE: a *proxied* wildcard needs Cloudflare Enterprise. On Free/Pro this wildcard is created
# DNS-only (grey-cloud); Traefik still issues its TLS via DNS-01. PR previews therefore hit the
# origin directly — either accept that for non-prod, allow the preview host through the origin
# firewall, or have Coolify create a per-PR *proxied* record via the Cloudflare API.
upsert "*.preview.${LAB_PRIMARY_DOMAIN}" "${LAB_VPS_HOST}" "${PREVIEW_PROXIED:-false}"

echo "✓ DNS done. Set SSL/TLS mode = Full (strict). Apex/www still point at Vercel."
