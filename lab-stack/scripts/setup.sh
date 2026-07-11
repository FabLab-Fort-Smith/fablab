#!/usr/bin/env bash
# Interactive, PROVIDER-AGNOSTIC setup of connectivity + config for the deploy platform.
# Prints the KEYS REQUIRED to continue up front, collects the VPS connection details + provider
# secrets (interactively, or from ../.env if already set), and REFUSES to continue until every
# required key is present. Then writes the git-ignored ansible/inventory.ini + ../.env, verifies
# SSH/Ansible reachability, and auto-generates the local app secrets. Works with ANY VPS reachable
# over SSH (ADR 0004): it talks to the host over SSH only, never a cloud provider's API.
#
# Re-runnable: existing values become the defaults (press Enter to keep). Secrets are read
# SILENTLY, never echoed or logged; ../.env is written mode 0600. inventory.ini is backed up.
#
# Usage:  make setup                 (or: bash scripts/setup.sh [--regenerate])
#   --regenerate/-r  also ROTATE the local secrets (gated confirmation; see gen-secrets.sh)
# Non-interactive (CI/testing): SETUP_NONINTERACTIVE=1 with values via env —
#   LAB_VPS_HOST SSH_PORT SSH_USER SSH_KEY CLOUDFLARE_API_TOKEN COOLIFY_URL COOLIFY_TOKEN
set -euo pipefail
IFS=$'\n\t'

cd "$(dirname "$0")/.." || exit 1          # -> lab-stack/
ANSIBLE_DIR="ansible"
INV="$ANSIBLE_DIR/inventory.ini"
GV="$ANSIBLE_DIR/group_vars/all.yml"
GV_EXAMPLE="$ANSIBLE_DIR/group_vars/all.example.yml"
ENV_FILE="../.env"
ENV_EXAMPLE="../.env.example"
noninteractive="${SETUP_NONINTERACTIVE:-}"

# shellcheck disable=SC1091  # _lib.sh is a sibling script, linted separately
. "scripts/_lib.sh"   # env_get, env_set, key manifests (shared with gen-secrets.sh)

regen=""
for a in "$@"; do
  case "$a" in
    --regenerate|-r) regen=1 ;;
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
    *) printf 'unknown arg: %s\n' "$a" >&2; exit 2 ;;
  esac
done

info() { printf '  %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# ask VAR "prompt" "default" — visible input; keeps default on empty (or env value if non-interactive)
ask() {
  local __var="$1" __prompt="$2" __def="${3:-}" __in=""
  if [ -n "$noninteractive" ]; then printf -v "$__var" '%s' "${!__var:-$__def}"; return 0; fi
  if [ -n "$__def" ]; then read -r -p "$__prompt [$__def]: " __in || true
  else read -r -p "$__prompt: " __in || true; fi
  printf -v "$__var" '%s' "${__in:-$__def}"
}

# ask_secret VAR "prompt" have(yes|no) — SILENT input; empty keeps existing (caller decides)
ask_secret() {
  local __var="$1" __prompt="$2" __has="${3:-no}" __in="" __hint=""
  if [ -n "$noninteractive" ]; then printf -v "$__var" '%s' "${!__var:-}"; return 0; fi
  if [ "$__has" = yes ]; then __hint=" [keep existing]"; fi
  read -r -s -p "$__prompt$__hint: " __in || true; printf '\n'
  printf -v "$__var" '%s' "$__in"
}

# yesno "prompt" -> returns 0 for yes (default No)
yesno() { local a=""; ask a "$1 (y/N)" "N"; case "$a" in [Yy]*) return 0;; *) return 1;; esac; }

inv_get() { [ -f "$INV" ] || return 0; awk -F= -v k="$1" '$1==k{sub(/[[:space:]].*/,"",$2);print $2;exit}' "$INV"; }

ssh_ok() {
  ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new \
      -p "$SSH_PORT" -i "$SSH_KEY" "$SSH_USER@$LAB_VPS_HOST" 'echo ok' 2>/dev/null | grep -q '^ok$'
}

# status line for a key in the manifest
kstat() { if [ -n "$(env_get "$ENV_FILE" "$1")" ]; then printf '%s' "$2"; else printf '%s' "$3"; fi; }

# --- 0. base files -----------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_EXAMPLE" ]; then cp "$ENV_EXAMPLE" "$ENV_FILE"; else : > "$ENV_FILE"; fi
  chmod 600 "$ENV_FILE"; info "created $ENV_FILE from example (git-ignored, 0600)"
fi
if [ ! -f "$GV" ] && [ -f "$GV_EXAMPLE" ]; then cp "$GV_EXAMPLE" "$GV"; info "created $GV from example"; fi

printf '== fablab deploy platform — connectivity & config setup ==\n'
printf 'Provider-agnostic: needs only SSH access to the box (ADR 0004).\n'
if [ -z "$regen" ] && [ -n "$(env_get "$ENV_FILE" AUTH_SECRET)" ]; then
  printf 'Existing configuration detected — NON-DESTRUCTIVE run (keeps secrets; use --regenerate to rotate).\n'
fi
printf '\n'

# --- 1. required-keys manifest (shown BEFORE any configuration) ---------------
printf 'Keys REQUIRED to continue (provisioning) — must be in %s or entered now:\n' "$ENV_FILE"
for k in "${REQUIRED_PROVISION_KEYS[@]}"; do printf '  %s %s\n' "$(kstat "$k" '[have]  ' '[needed]')" "$k"; done
printf 'Local secrets — AUTO-GENERATED for you (no action needed):\n'
for k in "${LOCAL_SECRET_KEYS[@]}"; do printf '  %s %s\n' "$(kstat "$k" '[have]  ' '[autogen]')" "$k"; done
printf 'Provider keys needed BEFORE app go-live — enter at the Coolify app step (MONGODB_URI is made then):\n'
for k in "${REQUIRED_APP_PROVIDER_KEYS[@]}"; do printf '  %s %s\n' "$(kstat "$k" '[have]  ' '[later] ')" "$k"; done
printf '\n'

# --- 2. collect connection details -------------------------------------------
ask LAB_VPS_HOST "VPS host / IP" "$(env_get "$ENV_FILE" LAB_VPS_HOST)"
case "$LAB_VPS_HOST" in ""|CHANGEME_VPS_IP) die "a real VPS host/IP is required to continue";; esac
env_set "$ENV_FILE" LAB_VPS_HOST "$LAB_VPS_HOST"
ask SSH_PORT "SSH port" "${SSH_PORT:-$(inv_get ansible_port)}"; SSH_PORT="${SSH_PORT:-22}"
ask SSH_USER "First-run SSH user (an EXISTING sudo user, e.g. b007ab1e / critter)" "${SSH_USER:-$(inv_get ansible_user)}"
SSH_USER="${SSH_USER:-b007ab1e}"
ask SSH_KEY  "SSH private key path" "${SSH_KEY:-$(inv_get ansible_ssh_private_key_file)}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"; SSH_KEY="${SSH_KEY/#\~/$HOME}"

# --- 3. collect provider secrets (interactive; kept from .env if present) -----
ask COOLIFY_URL "Coolify URL (e.g. https://deploy.fablabfortsmith.org)" "$(env_get "$ENV_FILE" COOLIFY_URL)"
if [ -n "$COOLIFY_URL" ]; then env_set "$ENV_FILE" COOLIFY_URL "$COOLIFY_URL"; fi
cf_has=no; if [ -n "$(env_get "$ENV_FILE" CLOUDFLARE_API_TOKEN)" ]; then cf_has=yes; fi
ask_secret CLOUDFLARE_API_TOKEN "Cloudflare API token (Zone:DNS:Edit)" "$cf_has"
if [ -n "$CLOUDFLARE_API_TOKEN" ]; then env_set "$ENV_FILE" CLOUDFLARE_API_TOKEN "$CLOUDFLARE_API_TOKEN"; fi
co_has=no; if [ -n "$(env_get "$ENV_FILE" COOLIFY_TOKEN)" ]; then co_has=yes; fi
ask_secret COOLIFY_TOKEN "Coolify API token" "$co_has"
if [ -n "$COOLIFY_TOKEN" ]; then env_set "$ENV_FILE" COOLIFY_TOKEN "$COOLIFY_TOKEN"; fi
unset CLOUDFLARE_API_TOKEN COOLIFY_TOKEN

# --- 4. GATE: do NOT continue until every required key is present -------------
missing=()
for k in "${REQUIRED_PROVISION_KEYS[@]}"; do
  if [ -z "$(env_get "$ENV_FILE" "$k")" ]; then missing+=("$k"); fi
done
if [ "${#missing[@]}" -gt 0 ]; then
  printf 'ERROR: cannot continue — required key(s) still unset (add to %s, or re-run and enter them):\n' "$ENV_FILE" >&2
  for k in "${missing[@]}"; do printf '  - %s\n' "$k" >&2; done
  exit 1
fi
info "all required provisioning keys present ✓"

# --- 5. write inventory.ini (backup existing) --------------------------------
[ -f "$INV" ] && cp -p "$INV" "$INV.bak"
cat > "$INV" <<INVEOF
# Generated by scripts/setup.sh (git-ignored). Re-run 'make setup' to update.
# After the FIRST converge you may switch ansible_user to 'deploy' (ADR 0008).
[lab_vps]
fablab-prod ansible_host=$LAB_VPS_HOST

[lab_vps:vars]
ansible_user=$SSH_USER
ansible_ssh_private_key_file=$SSH_KEY
ansible_port=$SSH_PORT
ansible_become=true
INVEOF
info "wrote $INV"

# --- 6. verify / establish connectivity --------------------------------------
if [ -z "$noninteractive" ]; then
  if [ ! -f "$SSH_KEY" ]; then
    if yesno "Key '$SSH_KEY' not found — generate a new ed25519 keypair?"; then
      ssh-keygen -t ed25519 -f "$SSH_KEY" -C "fablab-deploy"
    else
      warn "no key at $SSH_KEY — connectivity test will fail until one exists"
    fi
  fi
  printf '\nTesting SSH to %s@%s:%s …\n' "$SSH_USER" "$LAB_VPS_HOST" "$SSH_PORT"
  if ssh_ok; then
    info "✓ key-based SSH works"
  else
    warn "key-based SSH failed"
    if [ -f "$SSH_KEY.pub" ] && yesno "Install your public key on the box via ssh-copy-id (needs the account password once)?"; then
      ssh-copy-id -i "$SSH_KEY.pub" -p "$SSH_PORT" "$SSH_USER@$LAB_VPS_HOST" || warn "ssh-copy-id failed"
      if ssh_ok; then info "✓ SSH now works"; else warn "still cannot connect — fix access, then re-run"; fi
    fi
  fi
fi

# --- 7. local service/app secrets (auto-generated, non-destructive) ----------
printf '\n== local secrets (auto-generated; provider keys stay as entered) ==\n'
if [ -n "$regen" ]; then bash scripts/gen-secrets.sh --force; else bash scripts/gen-secrets.sh; fi

# --- 8. deploy_authorized_keys (optional, additive) --------------------------
if [ -z "$noninteractive" ]; then
  logins=""; ask logins "GitHub logins for deploy_authorized_keys (space-separated; blank to skip)" ""
  if [ -n "$logins" ]; then
    # shellcheck disable=SC2086
    bash scripts/collect-keys.sh --into "$GV" gh $logins || warn "collect-keys failed"
  fi
fi

# --- 9. verify with Ansible + next steps -------------------------------------
if command -v ansible >/dev/null 2>&1 && [ -z "$noninteractive" ]; then
  printf '\nVerifying with Ansible ping…\n'
  if (cd "$ANSIBLE_DIR" && ansible lab_vps -m ping) >/dev/null 2>&1; then info "✓ ansible ping ok"
  else warn "ansible ping failed — resolve SSH access above before converge"; fi
fi

cat <<'NEXT'

Setup complete. Review, then apply (converge is GATED — real infra):
  cd lab-stack
  make converge-check     # dry-run --diff, no changes
  make converge           # apply: hardening + Docker + Coolify + backups
  make dns                # Cloudflare DNS (staging/preview; apex stays on Vercel)
  make coolify            # validate Coolify API + print remaining one-time UI steps
Full guide: docs/runbooks/bootstrap-vps.md
NEXT
