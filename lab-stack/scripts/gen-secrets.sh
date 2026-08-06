#!/usr/bin/env bash
# Generate/ensure strong LOCAL secrets in ../.env for the self-hosted services + the app.
# NON-DESTRUCTIVE by default: fills only empty/missing values; existing ones are kept.
# PROVIDER keys (Cloudflare/Coolify/Square/S3/SMTP/GenAI/reCAPTCHA and MONGODB_URI) are never
# generated — set those via `make setup` (interactive) or by editing ../.env.
#
# Usage: gen-secrets.sh [--force] [--yes]
#   --force  ROTATE local secrets even if already set. DESTRUCTIVE: an already-provisioned host
#            breaks until you redeploy with the new values (and data encrypted with the old
#            ENCRYPTION_KEY becomes unreadable). Requires a typed confirmation.
#   --yes    skip the confirmation (automation); only meaningful with --force.
set -euo pipefail
IFS=$'\n\t'
cd "$(dirname "$0")/.." || exit 1        # -> lab-stack/
# shellcheck disable=SC1091  # _lib.sh is a sibling script, linted separately
. "scripts/_lib.sh"

ENV_FILE="../.env"; ENV_EXAMPLE="../.env.example"
force=""; assume_yes=""
for a in "$@"; do
  case "$a" in
    --force|-f) force=1 ;;
    --yes|-y)   assume_yes=1 ;;
    -h|--help)  sed -n '2,12p' "$0"; exit 0 ;;
    *) printf 'unknown arg: %s\n' "$a" >&2; exit 2 ;;
  esac
done
interactive=1; [ -n "${SETUP_NONINTERACTIVE:-}" ] && interactive=""

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then cp "$ENV_EXAMPLE" "$ENV_FILE"; else : > "$ENV_FILE"; fi
  chmod 600 "$ENV_FILE"
fi

# Local, self-generatable secrets come from LOCAL_SECRET_KEYS (defined in _lib.sh).

gen() {  # gen KEY -> a fresh value suited to KEY
  case "$1" in
    AUTH_SECRET|JWT_SECRET)                 rand_b64 48 ;;
    INTERNAL_API_SECRET|SOCKET_API_SECRET)  rand_b64 32 ;;
    ENCRYPTION_KEY)                         rand_b64 24 ;;   # 24 bytes -> 32 base64 chars == 32 bytes (env.js)
    MONGO_ROOT_PASSWORD|MONGO_APP_PASSWORD) rand_alnum 32 ;; # URI-safe for MONGODB_URI
    MINIO_ROOT_PASSWORD|MINIO_APP_PASSWORD) rand_alnum 40 ;; # S3 secret keys: alnum only (they
                                                             # appear in MC_HOST URLs + app env)
    *)                                      rand_b64 32 ;;
  esac
}

# how many local secrets already exist (drives the clobber-confirmation gate)
existing=0
for k in "${LOCAL_SECRET_KEYS[@]}"; do
  if [ -n "$(env_get "$ENV_FILE" "$k")" ]; then existing=$((existing+1)); fi
done

# confirmation gate: only the DESTRUCTIVE override (rotating already-set secrets) is gated.
if [ -n "$force" ] && [ "$existing" -gt 0 ] && [ -z "$assume_yes" ]; then
  if [ -z "$interactive" ]; then
    printf 'ERROR: --force would rotate %d existing local secret(s); refusing without --yes in non-interactive mode.\n' "$existing" >&2
    exit 1
  fi
  printf '\n⚠  --force will ROTATE %d existing local secret(s) in %s.\n' "$existing" "$ENV_FILE" >&2
  printf '   An ALREADY-PROVISIONED host will BREAK until redeployed with the new values,\n' >&2
  printf '   and data encrypted under the old ENCRYPTION_KEY becomes unreadable.\n' >&2
  ans=""; read -r -p "   Type ROTATE to confirm, anything else to abort: " ans || true
  if [ "$ans" != ROTATE ]; then printf 'aborted — no changes made.\n' >&2; exit 1; fi
fi

gen_n=0; keep_n=0; rot_n=0
for k in "${LOCAL_SECRET_KEYS[@]}"; do
  cur="$(env_get "$ENV_FILE" "$k")"
  if [ -z "$cur" ]; then
    env_set "$ENV_FILE" "$k" "$(gen "$k")"; gen_n=$((gen_n+1)); printf '  + generated %s\n' "$k"
  elif [ -n "$force" ]; then
    env_set "$ENV_FILE" "$k" "$(gen "$k")"; rot_n=$((rot_n+1)); printf '  ~ rotated   %s\n' "$k"
  else
    keep_n=$((keep_n+1)); printf '  = kept      %s\n' "$k"
  fi
done
chmod 600 "$ENV_FILE"
printf 'local secrets: %d generated, %d rotated, %d kept  (%s, 0600)\n' "$gen_n" "$rot_n" "$keep_n" "$ENV_FILE"
printf 'provider keys are NOT generated — set them via make setup or by editing %s.\n' "$ENV_FILE"
