#!/usr/bin/env bash
# Pull platform secrets from the shared Vaultwarden vault into ../.env, making the vault the
# SOURCE OF TRUTH (custody P0 — docs/runbooks/shared-custody.md). Reachable over the ZeroTier
# overlay (the zerotier role). Reads every env-style field (name matches ^[A-Z][A-Z0-9_]+$) from
# the configured collection's items and upserts it into ../.env. NON-DESTRUCTIVE: existing
# non-secret lines are preserved; a .env.bak backup is written first. Secret VALUES are NEVER
# printed — only key names. Uses the Bitwarden CLI (`bw`); override with BW_CLI for tests.
#
# Config (from ../.env or the environment; none are secret):
#   VAULT_URL         the ZeroTier-reachable Vaultwarden URL (e.g. https://10.121.16.224:8000)   [required]
#   VAULT_EMAIL       vault login email (needed only if `bw` isn't already authenticated)
#   VAULT_COLLECTION  collection name to pull (default: "Default collection/Infrastructure")
#   VAULT_CACERT      path to the server's TLS cert to trust (avoids TOFU cert fetch)            [optional]
# Auth: reuses $BW_SESSION if set; else `bw` logs in / unlocks, prompting for the master password
#   on the TTY (no echo, never handled by this script). Set BW_PASSWORD to run non-interactively.
# Usage:  bash scripts/secrets-pull.sh [--dry-run]
set -euo pipefail
IFS=$'\n\t'
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."   # -> lab-stack/
# shellcheck disable=SC1091  # _lib.sh is a sibling script, linted separately
. scripts/_lib.sh

ENVF="../.env"
BW="${BW_CLI:-bw}"
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1

info() { printf '  %s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
# shell-single-quote a value so `. ../.env` (Ansible converge sources it) is safe for ANY chars
# (the Coolify Sanctum `id|secret` token, passwords with $ " | spaces, etc.). Embedded ' -> '\''.
shq() { printf "'%s'" "${1//\'/\'\\\'\'}"; }

VAULT_URL="${VAULT_URL:-$(env_get "$ENVF" VAULT_URL)}"
VAULT_EMAIL="${VAULT_EMAIL:-$(env_get "$ENVF" VAULT_EMAIL)}"
VAULT_COLLECTION="${VAULT_COLLECTION:-$(env_get "$ENVF" VAULT_COLLECTION)}"
[ -n "$VAULT_COLLECTION" ] || VAULT_COLLECTION="Default collection/Infrastructure"
[ -n "$VAULT_URL" ] || die "VAULT_URL not set (the ZeroTier-reachable Vaultwarden URL) — add it to $ENVF or the environment."

command -v "$BW" >/dev/null 2>&1 || die "bw (Bitwarden CLI) not found — install with: npm i -g @bitwarden/cli"
command -v jq >/dev/null 2>&1 || die "jq is required."

# --- trust the self-signed cert (bw is node → NODE_EXTRA_CA_CERTS) ---
if [ -n "${VAULT_CACERT:-}" ] && [ -f "$VAULT_CACERT" ]; then
  export NODE_EXTRA_CA_CERTS="$VAULT_CACERT"
elif [ -z "${BW_SESSION:-}" ]; then
  hp="${VAULT_URL#*://}"; hp="${hp%%/*}"
  cf="$(mktemp)"
  { echo | openssl s_client -connect "$hp" 2>/dev/null | openssl x509 >"$cf"; } 2>/dev/null || true
  if [ -s "$cf" ]; then
    export NODE_EXTRA_CA_CERTS="$cf"
    info "pinned the server's TLS cert for this run (TOFU — set VAULT_CACERT to a trusted cert to avoid)"
  fi
fi

# --- authenticate (reuse an existing session, else config + login + unlock) ---
if [ -z "${BW_SESSION:-}" ]; then
  "$BW" config server "$VAULT_URL" >/dev/null 2>&1 || die "could not point bw at $VAULT_URL"
  st="$("$BW" status 2>/dev/null | jq -r '.status // "unauthenticated"')"
  if [ "$st" = "unauthenticated" ]; then
    [ -n "$VAULT_EMAIL" ] || die "VAULT_EMAIL not set (needed to log in) — add it to $ENVF or the environment."
    if [ -n "${BW_PASSWORD:-}" ]; then "$BW" login "$VAULT_EMAIL" --passwordenv BW_PASSWORD >/dev/null || die "bw login failed"
    else "$BW" login "$VAULT_EMAIL" >/dev/null || die "bw login failed"; fi
  fi
  if [ -n "${BW_PASSWORD:-}" ]; then BW_SESSION="$("$BW" unlock --passwordenv BW_PASSWORD --raw)"
  else BW_SESSION="$("$BW" unlock --raw)"; fi
  export BW_SESSION
fi
[ -n "${BW_SESSION:-}" ] || die "could not unlock the vault."
"$BW" sync --session "$BW_SESSION" >/dev/null 2>&1 || true

# --- resolve the collection id by name ---
CID="$("$BW" list collections --session "$BW_SESSION" 2>/dev/null \
  | jq -r --arg n "$VAULT_COLLECTION" '.[] | select(.name==$n) | .id' | head -n1)"
[ -n "$CID" ] || die "collection '$VAULT_COLLECTION' not found (or no access). Check VAULT_COLLECTION."

# --- collect env-style secret fields (NAME=^[A-Z][A-Z0-9_]+$); value base64'd so any chars survive ---
mapfile -t PAIRS < <("$BW" list items --collectionid "$CID" --session "$BW_SESSION" 2>/dev/null \
  | jq -r '.[].fields[]?
           | select(.name | test("^[A-Z][A-Z0-9_]+$"))
           | select(.value != null and .value != "")
           | .name + " " + (.value | @base64)')
[ "${#PAIRS[@]}" -gt 0 ] || die "no env-style secret fields found in '$VAULT_COLLECTION'."

# --- upsert into ../.env (or dry-run) ---
if [ "$DRY" -eq 0 ] && [ -f "$ENVF" ]; then cp -a "$ENVF" "$ENVF.bak"; chmod 600 "$ENVF.bak"; fi
n=0
for pair in "${PAIRS[@]}"; do
  k="${pair%% *}"
  v="$(printf '%s' "${pair#* }" | base64 -d)"
  if [ "$DRY" -eq 1 ]; then info "would set $k (${#v} chars)"; else env_set "$ENVF" "$k" "$(shq "$v")"; info "set $k"; fi
  n=$((n + 1))
done
unset v
if [ "$DRY" -eq 1 ]; then
  info "dry-run: $n secret(s) available in '$VAULT_COLLECTION' (nothing written)"
else
  info "pulled $n secret(s) from '$VAULT_COLLECTION' into $ENVF (backup: $ENVF.bak)"
fi
