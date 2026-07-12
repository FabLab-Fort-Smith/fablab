#!/usr/bin/env bash
# Per-PR preview DNS: create/delete a PROXIED Cloudflare A record for one pull request so
# Coolify's per-PR preview deployment is reachable through Cloudflare (origin firewall stays
# Cloudflare-only; TLS is issued by the origin via HTTP-01 THROUGH Cloudflare, and the CF edge
# cert is Universal SSL's *.<domain>). Idempotent. Driven by .github/workflows/preview-dns.yml,
# and runnable by hand. Requires: curl, jq.
#
# Usage:
#   preview-dns.sh upsert <pr-number>   # create/update pr-<n>-preview.<domain> (proxied) -> VPS IP
#   preview-dns.sh delete <pr-number>   # remove it (on PR close)
#
# Env (from ../.env or the shell / CI secrets):
#   CLOUDFLARE_API_TOKEN   scoped Zone > DNS > Edit
#   LAB_PRIMARY_DOMAIN     e.g. fablabfortsmith.org
#   LAB_VPS_HOST           the VPS public IP (upsert only)
#   [CLOUDFLARE_ZONE_ID]   optional; auto-resolved from the domain otherwise
set -euo pipefail
IFS=$'\n\t'

action="${1:-}"; pr="${2:-}"
case "$action" in upsert|delete) ;; *) echo "usage: $0 {upsert|delete} <pr-number>" >&2; exit 2 ;; esac
case "$pr" in ''|*[!0-9]*) echo "✖ PR number must be a positive integer, got: '${pr}'" >&2; exit 2 ;; esac

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (scoped Zone > DNS > Edit)}"
: "${LAB_PRIMARY_DOMAIN:?set LAB_PRIMARY_DOMAIN (e.g. fablabfortsmith.org)}"
command -v jq >/dev/null || { echo "jq is required"; exit 1; }

API="https://api.cloudflare.com/client/v4"
AUTH=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json")
cf() { curl -fsS "${AUTH[@]}" "$@"; }

# SINGLE-label host under the apex so Universal SSL (*.<domain>) covers the CF edge cert.
name="pr-${pr}-preview.${LAB_PRIMARY_DOMAIN}"

zone_id="${CLOUDFLARE_ZONE_ID:-}"
if [ -z "${zone_id}" ]; then
  zone_id="$(cf "${API}/zones?name=${LAB_PRIMARY_DOMAIN}" | jq -r '.result[0].id // empty')"
fi
[ -n "${zone_id}" ] || { echo "✖ could not resolve zone id for ${LAB_PRIMARY_DOMAIN}"; exit 1; }

rec_id="$(cf "${API}/zones/${zone_id}/dns_records?type=A&name=${name}" | jq -r '.result[0].id // empty')"

if [ "$action" = "delete" ]; then
  if [ -n "$rec_id" ]; then
    cf -X DELETE "${API}/zones/${zone_id}/dns_records/${rec_id}" >/dev/null
    echo "✓ deleted ${name}"
  else
    echo "· ${name} already absent"
  fi
  exit 0
fi

# upsert (proxied so it flows through Cloudflare — origin firewall unchanged)
: "${LAB_VPS_HOST:?set LAB_VPS_HOST (the VPS public IP) for upsert}"
payload="$(jq -nc --arg n "$name" --arg c "$LAB_VPS_HOST" '{type:"A",name:$n,content:$c,proxied:true,ttl:1}')"
if [ -n "$rec_id" ]; then
  cf -X PUT "${API}/zones/${zone_id}/dns_records/${rec_id}" --data "$payload" >/dev/null
  echo "✓ updated ${name} → ${LAB_VPS_HOST} (proxied)"
else
  cf -X POST "${API}/zones/${zone_id}/dns_records" --data "$payload" >/dev/null
  echo "✓ created ${name} → ${LAB_VPS_HOST} (proxied)"
fi
