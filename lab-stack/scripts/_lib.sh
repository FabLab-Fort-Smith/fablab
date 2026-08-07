#!/usr/bin/env bash
# Shared helpers for lab-stack scripts. SOURCE this ( . scripts/_lib.sh ), don't execute.
# No secret VALUES are ever printed by these helpers.

# env_get FILE KEY -> prints the value (empty if file/key absent). Strips ONE matching pair of
# surrounding quotes, so a value written source-safe by shq/env_set (e.g. TOKEN='abc') reads back
# as the bare value (abc) — not with literal quotes that would break a Bearer header / URL path.
env_get() { [ -f "$1" ] || return 0; sed -n "s/^$2=//p" "$1" | head -n1 | sed "s/^\(['\"]\)\(.*\)\1\$/\2/"; }

# shq VAL -> single-quote VAL so `. FILE` (sourcing the .env) is safe for ANY chars (tokens with
# $ " | spaces, the Coolify id|secret, etc.). Embedded ' becomes '\''. Pairs with env_get above.
shq() { printf "'%s'" "${1//\'/\'\\\'\'}"; }

# env_set FILE KEY VAL -> upsert KEY=VAL. VAL is passed to awk via the environment (not argv,
# not a sed pattern) so arbitrary secret characters are safe and never appear in `ps`. Keeps the
# file mode at 0600.
env_set() {
  local f="$1" k="$2" v="$3" tmp; tmp="$(mktemp)"
  if [ -f "$f" ] && grep -q "^$k=" "$f"; then
    KVAL="$v" awk -v k="$k" 'BEGIN{FS="="} $1==k{print k"="ENVIRON["KVAL"];d=1;next} {print} END{if(!d)print k"="ENVIRON["KVAL"]}' "$f" > "$tmp"
  else
    [ -f "$f" ] && cat "$f" > "$tmp"
    printf '%s=%s\n' "$k" "$v" >> "$tmp"
  fi
  mv "$tmp" "$f"; chmod 600 "$f"
}

# rand_b64 NBYTES -> base64 of N cryptographically-random bytes (ASCII, no newline).
rand_b64() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -base64 "$1" | tr -d '\n'
  else head -c "$1" /dev/urandom | base64 | tr -d '\n'; fi
}

# rand_alnum NCHARS -> N URI-safe [A-Za-z0-9] chars (for passwords embedded in connection strings).
rand_alnum() { LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$1"; }

# --- key manifests (single source of truth; used by setup.sh + gen-secrets.sh) ---
# These are consumed by scripts that SOURCE this lib, so shellcheck can't see the use here.
# Local secrets we auto-generate (app secrets per src/lib/env.js + self-hosted MongoDB creds).
# shellcheck disable=SC2034  # used by sourcing scripts
LOCAL_SECRET_KEYS=(AUTH_SECRET JWT_SECRET ENCRYPTION_KEY INTERNAL_API_SECRET SOCKET_API_SECRET MONGO_ROOT_PASSWORD MONGO_APP_PASSWORD OBJSTORE_ADMIN_SECRET_KEY OBJSTORE_APP_SECRET_KEY OBJSTORE_BACKUP_SECRET_KEY)
# Provider keys REQUIRED to continue provisioning (can't be generated — .env or interactive).
# shellcheck disable=SC2034  # used by sourcing scripts
REQUIRED_PROVISION_KEYS=(LAB_VPS_HOST CLOUDFLARE_API_TOKEN COOLIFY_URL COOLIFY_TOKEN)
# Provider keys required before the APP boots — entered at the Coolify app step (MONGODB_URI is
# produced when the Coolify Mongo service is created), so NOT gated at connectivity setup.
# shellcheck disable=SC2034  # used by sourcing scripts
REQUIRED_APP_PROVIDER_KEYS=(MONGODB_URI SQUARE_ACCESS_TOKEN SQUARE_WEBHOOK_SIGNATURE_KEY)
