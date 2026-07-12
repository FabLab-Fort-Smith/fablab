#!/usr/bin/env bash
# RackNerd SolusVM 1 CLIENT API helper (control-plane only).
# Commands:  ip | status | info | boot | reboot | shutdown
#   ip        print the VPS primary IPv4 (for inventory auto-discovery)
#   status    print power state (online/offline)
#   info      print ip/hostname/vmstat/hdd/mem/bw
#   boot|reboot|shutdown   POWER action — GATED; requires an explicit --yes
#
# Auth is a per-VPS key+hash from the panel API tab (nerdvm.racknerd.com). They are read from
# RACKNERD_API_KEY / RACKNERD_API_HASH (env first, else ../.env) and passed to curl via a stdin
# config file — NEVER on argv — so they don't appear in `ps`/shell history, and are never printed.
# This API is control-plane only: it CANNOT create or reinstall the box (panel/WHMCS only) and is
# not the config transport (Ansible still uses SSH). See docs/runbooks/bootstrap-vps.md, ADR 0004.
# @rules/topic-api-consumption.md · @rules/workflow-secrets.md · @rules/workflow-gated-actions.md
set -euo pipefail
IFS=$'\n\t'
cd "$(dirname "$0")/.." || exit 1   # -> lab-stack/

# shellcheck disable=SC1091  # sibling script, linted separately
. "scripts/_lib.sh"   # env_get

# Overridable hooks (prod defaults; the last two exist for hermetic tests — no network).
BASE="${RACKNERD_API_BASE:-https://nerdvm.racknerd.com/api/client/command.php}"
ENV_FILE="${RACKNERD_ENV_FILE:-../.env}"
FIXTURE="${RACKNERD_FIXTURE:-}"      # if set, read this file instead of calling the API

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

KEY="${RACKNERD_API_KEY:-$(env_get "$ENV_FILE" RACKNERD_API_KEY)}"
HASH="${RACKNERD_API_HASH:-$(env_get "$ENV_FILE" RACKNERD_API_HASH)}"

# call ACTION [EXTRA_QUERY] -> raw response body on stdout.
# The full URL (with secret key+hash) is fed to curl via `-K -` (stdin config), never argv.
call() {
  local action="$1" extra="${2:-}" url
  if [ -n "$FIXTURE" ]; then cat "$FIXTURE"; return 0; fi
  if [ -z "$KEY" ] || [ -z "$HASH" ]; then
    die "RACKNERD_API_KEY/RACKNERD_API_HASH not set (add to $ENV_FILE or export). Get them from the panel API tab (nerdvm.racknerd.com)."
  fi
  url="$BASE?key=$KEY&hash=$HASH&action=$action${extra:+&$extra}"
  curl -sS --connect-timeout 10 --max-time 30 -K - <<CURLCFG
url = "$url"
CURLCFG
}

# xmlval BODY TAG -> text inside the first <TAG>...</TAG> (response is concatenated XML-ish tags).
xmlval() { printf '%s' "$1" | grep -oE "<$2>[^<]*</$2>" | head -n1 | sed -E "s#</?$2>##g"; }

# The API signals call success with <status>success</status>; anything else is an error.
require_success() {
  local body="$1" st; st="$(xmlval "$body" status)"
  [ "$st" = success ] || die "RackNerd API call failed (status='${st:-?}', msg='$(xmlval "$body" statusmsg)')"
}

cmd="${1:-}"; if [ "$#" -gt 0 ]; then shift; fi
case "$cmd" in
  ip)
    body=""; body="$(call info ipaddr=true)" || die "network/API error"
    require_success "$body"
    ip="$(xmlval "$body" ipaddr | cut -d, -f1)"
    [ -n "$ip" ] || die "no <ipaddr> in response"
    printf '%s\n' "$ip"
    ;;
  status)
    body=""; body="$(call status)" || die "network/API error"
    require_success "$body"
    # power state is reported in <vmstat> (fallback <statusmsg>)
    s="$(xmlval "$body" vmstat)"; [ -n "$s" ] || s="$(xmlval "$body" statusmsg)"
    printf '%s\n' "${s:-unknown}"
    ;;
  info)
    body=""; body="$(call info "ipaddr=true&hdd=true&mem=true&bw=true&hostname=true")" || die "network/API error"
    require_success "$body"
    printf 'ip:       %s\n' "$(xmlval "$body" ipaddr)"
    printf 'hostname: %s\n' "$(xmlval "$body" hostname)"
    printf 'vmstat:   %s\n' "$(xmlval "$body" vmstat)"
    printf 'hdd:      %s\n' "$(xmlval "$body" hdd)"
    printf 'mem:      %s\n' "$(xmlval "$body" mem)"
    printf 'bw:       %s\n' "$(xmlval "$body" bw)"
    ;;
  boot|reboot|shutdown)
    # Power actions change VPS state — GATED. Refuse unless the caller passes --yes explicitly,
    # so this can never fire by accident from a script or a fat-fingered arg.
    case "${1:-}" in
      --yes) : ;;
      *) die "$cmd is a GATED power action — re-run deliberately: racknerd/api.sh $cmd --yes" ;;
    esac
    body=""; body="$(call "$cmd")" || die "network/API error"
    require_success "$body"
    printf '%s: ok\n' "$cmd"
    ;;
  ""|-h|--help) sed -n '2,14p' "$0" ;;
  *) die "unknown command: '$cmd' (use: ip|status|info|boot|reboot|shutdown)" ;;
esac
